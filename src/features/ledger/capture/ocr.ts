import type { Worker as OcrWorker } from "tesseract.js";
import { looksLikeMisreadKorean, parseCardCapture, type CaptureResult, type OcrLine } from "@/lib/finance/card-capture";
import type { DateStr } from "@/lib/finance/types";

/**
 * 결제내역 캡처 → 기기 안 글자 인식 (PROD.MD §2-5 모바일 수집).
 * tesseract.js 는 쓸 때만 동적으로 불러오고, 엔진·언어 파일은 우리 서버(/ocr)에서만 받는다.
 * 이미지와 인식한 줄은 브라우저 밖으로 나가지 않는다 — 호출한 쪽도 lines 를 서버로 보내면 안 된다.
 */

export type OcrLang = "kor+eng" | "kor";

export type CaptureProgress =
  | { phase: "loading" }
  | { phase: "preparing" }
  | { phase: "recognizing"; percent: number }
  | { phase: "reread-ko"; count: number }
  | { phase: "gaps"; count: number };

export interface RecognizeOptions {
  today: DateStr;
  onProgress?: (p: CaptureProgress) => void;
  /** 아래는 시험대(capture-lab)용 — 본 기능은 기본값 */
  lang?: OcrLang;
  /** 배치 방식 (기본 4: 한 단 목록) */
  psm?: string;
  /** 폭 1000px 미만 이미지 2배 확대 (기본 켬) */
  upscale?: boolean;
}

export interface RecognizedCapture {
  result: CaptureResult;
  /** 인식한 줄 — 화면 확인용. 서버로 보내지 않는다 */
  lines: OcrLine[];
  /** 인식에 쓴 이미지 (회색조·반전·확대 후) — 시험대 표시용 */
  canvas: HTMLCanvasElement;
  inverted: boolean;
  /** 전체 인식 신뢰도 0~100 */
  confidence: number;
  ms: number;
  /** 2차 인식으로 되살린 건 수 */
  recovered: number;
  /** 한국어로 다시 읽어 고친 줄 수 */
  rereadKo: number;
}

const WORKER_OPTIONS = {
  workerPath: "/ocr/worker.min.js",
  corePath: "/ocr/core",
  langPath: "/ocr/lang",
  gzip: true,
  workerBlobURL: false,
} as const;

/** 지금 인식 중인 호출의 진행 알림 — 인식기는 한 번 만들어 여러 번 쓰므로 logger 는 이 변수로 이어 준다 */
let report: ((p: CaptureProgress) => void) | null = null;
let main: { lang: OcrLang; worker: Promise<OcrWorker> } | null = null;
let korOnly: Promise<OcrWorker> | null = null;
/** 인식기는 설정(배치 방식)을 바꿔 가며 쓰므로 한 번에 한 장씩만 */
let queue: Promise<unknown> = Promise.resolve();

async function getWorker(lang: OcrLang): Promise<OcrWorker> {
  if (main?.lang === lang) return main.worker;
  if (main) void main.worker.then((w) => w.terminate()).catch(() => {});
  report?.({ phase: "loading" });
  const worker = import("tesseract.js").then(({ createWorker }) =>
    createWorker(lang.split("+"), 1, {
      ...WORKER_OPTIONS,
      errorHandler: (e) => console.error("[ocr] worker", e),
      logger: (m) => {
        if (m.status === "recognizing text") report?.({ phase: "recognizing", percent: Math.round(m.progress * 100) });
      },
    }),
  );
  main = { lang, worker };
  worker.catch(() => {
    if (main?.worker === worker) main = null;
  });
  return worker;
}

/** 한글 줄을 영문 찌꺼기로 읽었을 때 다시 읽는 한국어 전용 인식기 (한 줄 모드) */
async function getKorWorker(): Promise<OcrWorker> {
  if (korOnly) return korOnly;
  const worker = import("tesseract.js").then(async ({ createWorker }) => {
    const w = await createWorker(["kor"], 1, { ...WORKER_OPTIONS });
    await w.setParameters({ tessedit_pageseg_mode: "7" as never });
    return w;
  });
  korOnly = worker;
  worker.catch(() => {
    if (korOnly === worker) korOnly = null;
  });
  return worker;
}

/** 인식기를 내려 메모리를 돌려준다 (화면을 닫을 때) */
export async function disposeOcr(): Promise<void> {
  const ws = [main?.worker, korOnly];
  main = null;
  korOnly = null;
  await Promise.all(ws.map((w) => w?.then((x) => x.terminate()).catch(() => {})));
}

/** 캡처 한 장 인식 → 여러 건 후보. 놓친 줄 다시 읽기 + 한글 줄 다시 읽기까지 한다 */
export function recognizeCapture(file: Blob, opts: RecognizeOptions): Promise<RecognizedCapture> {
  const run = queue.then(() => recognizeOne(file, opts));
  queue = run.catch(() => {});
  return run;
}

async function recognizeOne(file: Blob, opts: RecognizeOptions): Promise<RecognizedCapture> {
  const { today, lang = "kor+eng", psm = "4", upscale = true } = opts;
  report = opts.onProgress ?? null;
  try {
    const w = await getWorker(lang);
    await w.setParameters({ tessedit_pageseg_mode: psm as never, preserve_interword_spaces: "1" });
    report?.({ phase: "preparing" });
    const prepared = await prepare(file, upscale);
    const started = performance.now();
    const { data } = await w.recognize(prepared.canvas, {}, { text: true, blocks: true });
    const lines = toLines(data);

    // 한글 줄을 영문 찌꺼기로 읽은 줄은 한국어로만 다시 읽는다 ("ElelEEnRetE" → "탕화쿵푸마라탕")
    const suspects = lines.filter(looksLikeMisreadKorean);
    let rereadKo = 0;
    if (suspects.length) {
      report?.({ phase: "reread-ko", count: suspects.length });
      const kw = await getKorWorker();
      for (const l of suspects) {
        const b = l.bbox!;
        const pad = 6;
        const left = Math.max(0, b.x0 - pad);
        const top = Math.max(0, b.y0 - pad);
        const again = await kw.recognize(prepared.canvas, {
          rectangle: { left, top, width: Math.min(prepared.canvas.width - left, b.x1 - b.x0 + pad * 2), height: b.y1 - b.y0 + pad * 2 },
        });
        const text = again.data.text.replace(/\s+/g, " ").trim();
        if ((text.match(/[가-힣]/g) ?? []).length >= 2) {
          l.text = text;
          l.confidence = Math.round(again.data.confidence); // 다시 읽은 결과의 신뢰도로 판단
          rereadKo++;
        }
      }
    }

    let result = parseCardCapture(lines, today);
    // 2차: 놓친 줄이 있어 보이는 구간만 다시 인식해 보탠다
    let recovered = 0;
    if (result.gaps.length) {
      report?.({ phase: "gaps", count: result.gaps.length });
      await w.setParameters({ tessedit_pageseg_mode: "6" as never });
      try {
        for (const g of result.gaps) {
          const again = await w.recognize(
            prepared.canvas,
            { rectangle: { left: g.x0, top: g.y0, width: g.x1 - g.x0, height: g.y1 - g.y0 } },
            { blocks: true },
          );
          lines.push(...toLines(again.data));
        }
      } finally {
        await w.setParameters({ tessedit_pageseg_mode: psm as never });
      }
      const before = result.items.length;
      result = parseCardCapture(lines, today);
      recovered = result.items.length - before;
    }

    return {
      result,
      lines,
      canvas: prepared.canvas,
      inverted: prepared.inverted,
      confidence: Math.round(data.confidence),
      ms: Math.round(performance.now() - started),
      recovered,
      rereadKo,
    };
  } finally {
    report = null;
  }
}

type RecognizeData = Awaited<ReturnType<OcrWorker["recognize"]>>["data"];

function toLines(d: RecognizeData): OcrLine[] {
  return (d.blocks ?? []).flatMap((b) =>
    b.paragraphs.flatMap((p) => p.lines.map((l) => ({ text: l.text.trim(), bbox: l.bbox, confidence: Math.round(l.confidence) }))),
  );
}

/** 회색조 + 어두운 화면이면 반전(밝은 바탕·어두운 글자가 인식이 잘 됨) + 작으면 2배 확대 */
async function prepare(file: Blob, upscale: boolean): Promise<{ canvas: HTMLCanvasElement; inverted: boolean }> {
  const bitmap = await createImageBitmap(file);
  const scale = upscale && bitmap.width < 1000 ? 2 : 1;
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width * scale;
  canvas.height = bitmap.height * scale;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = img.data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) {
    const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    px[i] = px[i + 1] = px[i + 2] = g;
    sum += g;
  }
  const inverted = sum / (px.length / 4) < 110;
  if (inverted) for (let i = 0; i < px.length; i += 4) px[i] = px[i + 1] = px[i + 2] = 255 - px[i];
  ctx.putImageData(img, 0, 0);
  return { canvas, inverted };
}

/** 진행 표시 문구 */
export function progressLabel(p: CaptureProgress): string {
  switch (p.phase) {
    case "loading":
      return "인식 엔진 준비 중… (처음 한 번 내려받아요)";
    case "preparing":
      return "이미지 준비 중…";
    case "recognizing":
      return `인식 중 ${p.percent}%`;
    case "reread-ko":
      return `한글 줄 ${p.count}개 다시 읽는 중…`;
    case "gaps":
      return "빠진 줄 다시 읽는 중…";
  }
}
