#!/usr/bin/env bash
# 운영 DB 마이그레이션 + 운영 배포를 한 번에 — 자세한 설명은 DEPLOY.md
#
#   npm run deploy:prod                 # 확인 질문 1번 → 마이그레이션 → 배포 → 확인
#   npm run deploy:prod -- --check      # 상태만 보기 (아무것도 바꾸지 않음)
#   npm run deploy:prod -- --yes        # 확인 질문 없이 진행
#   npm run deploy:prod -- --skip-migrate   # 스키마 변경이 없을 때 배포만
#
# 순서: Git 확인 → 운영 DB 주소 받기 → 적용할 마이그레이션 확인 → 마이그레이션 → 배포 → 확인
# 마이그레이션이 실패하면 배포하지 않는다 (새 컬럼을 읽는 코드가 먼저 나가면 운영이 깨진다).
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT_ID="soft-wildflower-68858737"
SITE="https://finlog-chi.vercel.app"

ASSUME_YES=0
SKIP_MIGRATE=0
CHECK_ONLY=0
for arg in "$@"; do
  case "$arg" in
    -y | --yes) ASSUME_YES=1 ;;
    --skip-migrate) SKIP_MIGRATE=1 ;;
    --check) CHECK_ONLY=1 ;;
    -h | --help)
      sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "알 수 없는 옵션: $arg (--check, --yes, --skip-migrate)" >&2
      exit 2
      ;;
  esac
done

# 터미널일 때만 색을 쓴다 (Claude Code 의 ! 실행 등에서는 색 코드가 글자로 찍힌다)
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  B=$'\033[1m' G=$'\033[32m' Y=$'\033[33m' R=$'\033[31m' N=$'\033[0m'
else
  B='' G='' Y='' R='' N=''
fi
bold() { printf '\n%s▶ %s%s\n' "$B" "$*" "$N"; }
ok() { printf '  %s✔%s %s\n' "$G" "$N" "$*"; }
warn() { printf '  %s!%s %s\n' "$Y" "$N" "$*"; }
fail() {
  printf '\n%s✖ %s%s\n' "$R" "$*" "$N" >&2
  exit 1
}
# 접속 주소의 아이디·비밀번호 가리기
mask() { sed -E 's#//[^@/]*@#//***@#g'; }
confirm() {
  [ "$ASSUME_YES" = 1 ] && return 0
  local answer
  read -r -p "  $1 [y/N] " answer
  [[ "$answer" =~ ^[yY]$ ]]
}
# prisma 실행 — 출력은 가려서 보여 주고, prisma 의 종료 코드를 돌려준다
run_prisma() {
  local out rc=0
  out=$(npx prisma "$@" 2>&1) || rc=$?
  printf '%s\n' "$out" | mask |
    { grep -v -E 'package\.json#prisma|pris\.ly/prisma-config|Environment variables loaded|Prisma schema loaded|^\s*$' || true; } |
    sed 's/^/    /'
  PRISMA_OUT="$out"
  return $rc
}

# ── 1. Git ────────────────────────────────────────────────
bold "1. Git 상태"
if [ -n "$(git status --porcelain)" ]; then
  [ "$CHECK_ONLY" = 1 ] || fail "커밋 안 된 변경이 있어요. 커밋한 뒤 다시 실행하세요. (git status)"
  warn "커밋 안 된 변경이 있어요 — 배포 전에 커밋하세요."
fi
branch=$(git rev-parse --abbrev-ref HEAD)
ok "브랜치 $branch · $(git log -1 --format='%h %s')"
if [ "$branch" != "master" ]; then
  warn "master 가 아니에요."
  [ "$CHECK_ONLY" = 1 ] || confirm "그래도 이 브랜치를 운영에 배포할까요?" || exit 1
fi
git fetch -q origin "$branch" 2>/dev/null || true
ahead=$(git rev-list --count "origin/$branch..HEAD" 2>/dev/null || echo "?")
if [ "$ahead" != "0" ]; then
  warn "원격에 안 올린 커밋 ${ahead}개 — 배포는 내 PC 파일 기준이라 진행은 되지만, 끝나고 git push 하세요."
fi

# ── 2~3. 운영 DB 마이그레이션 확인 ──────────────────────────
pending=()
if [ "$SKIP_MIGRATE" = 0 ]; then
  bold "2. 운영 DB 주소 받기 (Neon)"
  URL="$(npx --no-install neon connection-string production --project-id "$PROJECT_ID" --ssl verify-full 2>/dev/null | tail -1 || true)"
  [[ "$URL" == postgres* ]] || fail "Neon 주소를 못 받았어요. 'npx neon me' 로 로그인 상태를 확인하세요."
  host=$(printf '%s' "$URL" | sed -E 's#.*@([^/:?]+).*#\1#')
  [[ "$host" == *.neon.tech ]] || fail "운영 호스트가 아니에요: $host"
  [[ "$host" != *-pooler* ]] || fail "pooled 주소예요. 마이그레이션은 direct 주소로 해야 해요."
  ok "호스트 $host (direct)"

  # 마이그레이션은 schema 의 directUrl(DATABASE_URL_UNPOOLED)로 붙는다.
  # 둘 다 넘기지 않으면 .env 의 로컬 DB 에 붙어 "No pending migrations" 가 거짓으로 나온다.
  export DATABASE_URL="$URL" DATABASE_URL_UNPOOLED="$URL"
  unset URL
  trap 'unset DATABASE_URL DATABASE_URL_UNPOOLED' EXIT

  bold "3. 적용할 마이그레이션"
  run_prisma migrate status || true
  grep -q "$host" <<<"$PRISMA_OUT" || fail "Prisma 가 운영 DB 에 붙지 않았어요 (위 Datasource 줄 확인)."
  if grep -q "Database schema is up to date" <<<"$PRISMA_OUT"; then
    ok "적용할 마이그레이션 없음"
  else
    mapfile -t pending < <(grep -oE '^[0-9]{14}_[A-Za-z0-9_]+' <<<"$PRISMA_OUT" | sort -u)
    [ "${#pending[@]}" -gt 0 ] || fail "마이그레이션 상태를 읽지 못했어요. 위 출력을 확인하세요."
    warn "운영에 아직 없는 마이그레이션 ${#pending[@]}개: ${pending[*]}"
    if grep -l -i -E 'DROP (COLUMN|TABLE)|DELETE FROM|TRUNCATE' \
      $(printf 'prisma/migrations/%s/migration.sql ' "${pending[@]}") 2>/dev/null; then
      warn "위 파일에 데이터를 지우는 SQL 이 있어요. Neon 콘솔에서 브랜치(스냅샷)를 먼저 만들어 두세요."
    fi
  fi
fi

if [ "$CHECK_ONLY" = 1 ]; then
  bold "확인만 했어요 (--check). 바뀐 것은 없습니다."
  exit 0
fi

# ── 확인 질문 (한 번) ─────────────────────────────────────
bold "진행할 내용"
echo "  - 커밋: $(git log -1 --format='%h %s')"
if [ "$SKIP_MIGRATE" = 1 ]; then
  echo "  - 운영 DB 마이그레이션: 건너뜀 (--skip-migrate)"
else
  echo "  - 운영 DB 마이그레이션: ${#pending[@]}개"
fi
echo "  - 운영 배포: $SITE"
confirm "진행할까요?" || {
  echo "  취소했어요."
  exit 1
}

# ── 4. 마이그레이션 적용 ──────────────────────────────────
if [ "${#pending[@]}" -gt 0 ]; then
  bold "4. 운영 DB 마이그레이션 적용"
  run_prisma migrate deploy || fail "마이그레이션 실패 — 배포하지 않았어요. DEPLOY.md '롤백' 을 보세요."
  run_prisma migrate status >/dev/null || true
  grep -q "Database schema is up to date" <<<"$PRISMA_OUT" || fail "적용 뒤 상태가 최신이 아니에요 — 배포하지 않았어요."
  ok "운영 DB 최신"
else
  bold "4. 운영 DB 마이그레이션 — 할 것 없음"
fi
# 배포에는 운영 DB 주소가 필요 없다
unset DATABASE_URL DATABASE_URL_UNPOOLED

# ── 5. 배포 ──────────────────────────────────────────────
bold "5. 운영 배포 (Vercel) — 몇 분 걸려요"
deploy_out=$(npx vercel deploy --prod --yes 2>&1) || {
  printf '%s\n' "$deploy_out" | tail -20 | mask
  fail "배포 실패. 운영 DB 마이그레이션은 이미 적용됐어요 (컬럼 추가라면 옛 코드와도 호환)."
}
deploy_url=$(grep -oE 'https://finlog-[a-z0-9]+-[a-z0-9-]+\.vercel\.app' <<<"$deploy_out" | head -1 || true)
if [ -n "$deploy_url" ]; then
  inspect=$(npx vercel inspect "$deploy_url" 2>&1 || true)
  grep -q "Ready" <<<"$inspect" && ok "배포 완료 $deploy_url (Ready)" || warn "배포 상태가 Ready 가 아니에요: npx vercel inspect $deploy_url"
else
  warn "배포 주소를 찾지 못했어요. 'npx vercel ls' 로 확인하세요."
fi

# ── 6. 확인 ──────────────────────────────────────────────
bold "6. 배포 후 확인"
check() {
  local path=$1 want=$2 got
  got=$(curl -s -o /dev/null -w '%{http_code}' "$SITE$path" || echo "000")
  [ "$got" = "$want" ] && ok "$path → $got" || warn "$path → $got (예상 $want)"
}
check /login 200
check /assets 307

bold "끝났어요."
[ "${#pending[@]}" -gt 0 ] && echo "  DEPLOY.md 마이그레이션 이력 표에 ${pending[*]} 을 추가하세요."
[ "$ahead" != "0" ] && echo "  git push 를 잊지 마세요."
exit 0
