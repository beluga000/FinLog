#!/usr/bin/env node
// 운영 DB 마이그레이션 + 운영 배포를 한 번에 — 자세한 설명은 DEPLOY.md
//
//   npm run deploy:prod                     확인 질문 1번 → 마이그레이션 → 배포 → 확인
//   npm run deploy:prod -- --check          상태만 보기 (아무것도 바꾸지 않음)
//   npm run deploy:prod -- --yes            확인 질문 없이 진행
//   npm run deploy:prod -- --skip-migrate   스키마 변경이 없을 때 배포만
//
// Node 로 쓴 이유: PowerShell 에서 `bash` 가 WSL 로 잡히면 export 한 환경변수가 Windows 의 npx 로 넘어가지 않아
// Prisma 가 .env 의 로컬 DB 에 붙는다. Node 는 자식 프로세스에 env 를 직접 넘기므로 셸과 무관하다.
// 순서: Git 확인 → 운영 DB 주소 받기 → 적용할 마이그레이션 확인 → 마이그레이션 → 배포 → 확인.
// 마이그레이션이 실패하면 배포하지 않는다 (새 컬럼을 읽는 코드가 먼저 나가면 운영이 깨진다).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_ID = "soft-wildflower-68858737";
const SITE = "https://finlog-chi.vercel.app";

const args = new Set(process.argv.slice(2));
for (const a of args) {
  if (!["--check", "--yes", "-y", "--skip-migrate", "--help", "-h"].includes(a)) {
    console.error(`알 수 없는 옵션: ${a} (--check, --yes, --skip-migrate)`);
    process.exit(2);
  }
}
if (args.has("--help") || args.has("-h")) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 8).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(0);
}
const CHECK_ONLY = args.has("--check");
const ASSUME_YES = args.has("--yes") || args.has("-y");
const SKIP_MIGRATE = args.has("--skip-migrate");

// 터미널일 때만 색 (Claude Code 의 ! 실행 등에서는 색 코드가 글자로 찍힌다)
const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const step = (s) => console.log(`\n${paint(1, `▶ ${s}`)}`);
const ok = (s) => console.log(`  ${paint(32, "✔")} ${s}`);
const warn = (s) => console.log(`  ${paint(33, "!")} ${s}`);
const fail = (s) => {
  console.error(`\n${paint(31, `✖ ${s}`)}`);
  process.exit(1);
};
/** 접속 주소의 아이디·비밀번호 가리기 */
const mask = (s) => s.replace(/\/\/[^@/\s]*@/g, "//***@");

/** 명령 실행 — Windows 의 npx 는 .cmd 라 셸을 거친다. env 는 여기서 직접 넘긴다. */
function run(cmd, cmdArgs, { env = {}, inherit = false } = {}) {
  const r = spawnSync(cmd, cmdArgs, {
    cwd: ROOT,
    shell: process.platform === "win32",
    encoding: "utf8",
    env: { ...process.env, ...env },
    stdio: inherit ? "inherit" : "pipe",
    maxBuffer: 64 * 1024 * 1024,
  });
  return { code: r.status ?? 1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}
const git = (...a) => run("git", a).out.trim();

async function confirm(question) {
  if (ASSUME_YES) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`  ${question} [y/N] `);
  rl.close();
  return /^y$/i.test(answer.trim());
}

const NOISE = /package\.json#prisma|pris\.ly\/prisma-config|Environment variables loaded|Prisma schema loaded|^\s*$/;
/** prisma 실행 — 출력은 가려서 보여 주고, 원문은 돌려준다 */
function prisma(prismaArgs, env, { quiet = false } = {}) {
  const r = run("npx", ["prisma", ...prismaArgs], { env });
  if (!quiet)
    for (const line of mask(r.out).split(/\r?\n/)) if (!NOISE.test(line)) console.log(`    ${line}`);
  return r;
}

// ── 1. Git ────────────────────────────────────────────────
step("1. Git 상태");
const dirty = git("status", "--porcelain");
if (dirty) {
  if (!CHECK_ONLY) fail("커밋 안 된 변경이 있어요. 커밋한 뒤 다시 실행하세요. (git status)");
  warn("커밋 안 된 변경이 있어요 — 배포 전에 커밋하세요.");
}
const branch = git("rev-parse", "--abbrev-ref", "HEAD");
const head = git("log", "-1", "--format=%h %s");
ok(`브랜치 ${branch} · ${head}`);
if (branch !== "master") {
  warn("master 가 아니에요.");
  if (!CHECK_ONLY && !(await confirm("그래도 이 브랜치를 운영에 배포할까요?"))) process.exit(1);
}
run("git", ["fetch", "-q", "origin", branch]);
const ahead = git("rev-list", "--count", `origin/${branch}..HEAD`) || "?";
if (ahead !== "0") warn(`원격에 안 올린 커밋 ${ahead}개 — 배포는 내 PC 파일 기준이라 진행은 되지만, 끝나고 git push 하세요.`);

// ── 2~3. 운영 DB 마이그레이션 확인 ──────────────────────────
let pending = [];
let dbEnv = null;
if (!SKIP_MIGRATE) {
  step("2. 운영 DB 주소 받기 (Neon)");
  const r = run("npx", ["--no-install", "neon", "connection-string", "production", "--project-id", PROJECT_ID, "--ssl", "verify-full"]);
  const url = r.out.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith("postgres")).pop();
  if (!url) fail("Neon 주소를 못 받았어요. 'npx neon me' 로 로그인 상태를 확인하세요.");
  const host = url.replace(/^.*@([^/:?]+).*$/, "$1");
  if (!host.endsWith(".neon.tech")) fail(`운영 호스트가 아니에요: ${host}`);
  if (host.includes("-pooler")) fail("pooled 주소예요. 마이그레이션은 direct 주소로 해야 해요.");
  ok(`호스트 ${host} (direct)`);
  // 마이그레이션은 schema 의 directUrl(DATABASE_URL_UNPOOLED)로 붙는다 — 둘 다 넘기지 않으면 .env 의 로컬 DB 에 붙는다
  dbEnv = { DATABASE_URL: url, DATABASE_URL_UNPOOLED: url };

  step("3. 적용할 마이그레이션");
  const status = prisma(["migrate", "status"], dbEnv);
  if (!status.out.includes(host)) fail("Prisma 가 운영 DB 에 붙지 않았어요 (위 Datasource 줄 확인). 아무것도 바꾸지 않았어요.");
  if (status.out.includes("Database schema is up to date")) {
    ok("적용할 마이그레이션 없음");
  } else {
    pending = [...new Set(status.out.match(/^\s*\d{14}_[A-Za-z0-9_]+/gm)?.map((s) => s.trim()) ?? [])];
    if (!pending.length) fail("마이그레이션 상태를 읽지 못했어요. 위 출력을 확인하세요.");
    warn(`운영에 아직 없는 마이그레이션 ${pending.length}개: ${pending.join(", ")}`);
    const risky = pending.filter((m) =>
      /DROP (COLUMN|TABLE)|DELETE FROM|TRUNCATE/i.test(readFileSync(join(ROOT, "prisma", "migrations", m, "migration.sql"), "utf8")),
    );
    if (risky.length) warn(`${risky.join(", ")} 에 데이터를 지우는 SQL 이 있어요. Neon 콘솔에서 브랜치(스냅샷)를 먼저 만들어 두세요.`);
  }
}

if (CHECK_ONLY) {
  step("확인만 했어요 (--check). 바뀐 것은 없습니다.");
  process.exit(0);
}

// ── 확인 질문 (한 번) ─────────────────────────────────────
step("진행할 내용");
console.log(`  - 커밋: ${head}`);
console.log(`  - 운영 DB 마이그레이션: ${SKIP_MIGRATE ? "건너뜀 (--skip-migrate)" : `${pending.length}개`}`);
console.log(`  - 운영 배포: ${SITE}`);
if (!(await confirm("진행할까요?"))) {
  console.log("  취소했어요.");
  process.exit(1);
}

// ── 4. 마이그레이션 적용 ──────────────────────────────────
if (pending.length) {
  step("4. 운영 DB 마이그레이션 적용");
  if (prisma(["migrate", "deploy"], dbEnv).code !== 0) fail("마이그레이션 실패 — 배포하지 않았어요. DEPLOY.md '롤백' 을 보세요.");
  if (!prisma(["migrate", "status"], dbEnv, { quiet: true }).out.includes("Database schema is up to date"))
    fail("적용 뒤 상태가 최신이 아니에요 — 배포하지 않았어요.");
  ok("운영 DB 최신");
} else {
  step("4. 운영 DB 마이그레이션 — 할 것 없음");
}

// ── 5. 배포 (운영 DB 주소는 넘기지 않는다) ─────────────────
step("5. 운영 배포 (Vercel) — 몇 분 걸려요");
const deploy = run("npx", ["vercel", "deploy", "--prod", "--yes"]);
if (deploy.code !== 0) {
  console.log(mask(deploy.out.split(/\r?\n/).slice(-20).join("\n")));
  fail("배포 실패. 운영 DB 마이그레이션은 이미 적용됐어요 (컬럼·인덱스 추가라면 옛 코드와도 호환).");
}
const deployUrl = deploy.out.match(/https:\/\/finlog-[a-z0-9]+-[a-z0-9-]+\.vercel\.app/)?.[0];
if (deployUrl) {
  const inspect = run("npx", ["vercel", "inspect", deployUrl]).out;
  if (/Ready/.test(inspect)) ok(`배포 완료 ${deployUrl} (Ready)`);
  else warn(`배포 상태가 Ready 가 아니에요: npx vercel inspect ${deployUrl}`);
} else {
  warn("배포 주소를 찾지 못했어요. 'npx vercel ls' 로 확인하세요.");
}

// ── 6. 확인 ──────────────────────────────────────────────
step("6. 배포 후 확인");
for (const [path, want] of [
  ["/login", 200],
  ["/assets", 307],
]) {
  const got = await fetch(SITE + path, { redirect: "manual" }).then((r) => r.status, () => 0);
  if (got === want) ok(`${path} → ${got}`);
  else warn(`${path} → ${got} (예상 ${want})`);
}

step("끝났어요.");
if (pending.length) console.log(`  DEPLOY.md 마이그레이션 이력 표에 ${pending.join(", ")} 을 추가하세요.`);
if (ahead !== "0") console.log("  git push 를 잊지 마세요.");
