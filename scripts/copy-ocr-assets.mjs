// 캡처 글자 인식(Tesseract.js) 파일을 public/ocr 로 복사한다 — 외부 CDN 없이 우리 서버에서만 받게 하려고.
// npm install 후 자동 실행(postinstall). 결과물은 node_modules 에서 다시 만들 수 있어 git 에 넣지 않는다.
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const out = join(root, "public", "ocr");
const nm = (...p) => join(root, "node_modules", ...p);

if (!existsSync(nm("tesseract.js"))) {
  console.log("[ocr] tesseract.js 미설치 — 건너뜀");
  process.exit(0);
}

mkdirSync(join(out, "core"), { recursive: true });
mkdirSync(join(out, "lang"), { recursive: true });

cpSync(nm("tesseract.js", "dist", "worker.min.js"), join(out, "worker.min.js"));

// LSTM 전용 코어만 (wasm 이 .wasm.js 안에 들어 있다). 브라우저 지원에 따라 하나를 고른다
for (const f of readdirSync(nm("tesseract.js-core"))) {
  if (/-lstm\.wasm\.js$/.test(f)) cpSync(nm("tesseract.js-core", f), join(out, "core", f));
}

for (const lang of ["kor", "eng"]) {
  const src = nm("@tesseract.js-data", lang, "4.0.0_best_int", `${lang}.traineddata.gz`);
  if (existsSync(src)) cpSync(src, join(out, "lang", `${lang}.traineddata.gz`));
}

console.log("[ocr] public/ocr 준비 완료");
