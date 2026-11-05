"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { disposeOcr, progressLabel, recognizeCapture, type OcrLang } from "@/features/ledger/capture/ocr";
import { parseCardCapture, type CaptureResult, type OcrLine } from "@/lib/finance/card-capture";
import { matchMerchant } from "@/lib/finance/merchant-match";
import { todayKST } from "@/lib/finance/period";

type Lang = OcrLang;
type Psm = "3" | "4" | "6" | "11";

interface ImageResult {
  name: string;
  url: string;
  width: number;
  height: number;
  inverted: boolean;
  ms: number;
  confidence: number;
  lines: OcrLine[];
  parsed: CaptureResult;
  /** 2차 인식으로 되살린 건 수 */
  recovered: number;
  /** 한국어로 다시 읽어 고친 줄 수 */
  rereadKo: number;
}

const PSM_LABEL: Record<Psm, string> = {
  "3": "3 자동",
  "4": "4 한 단 (목록)",
  "6": "6 한 덩어리",
  "11": "11 흩어진 글자",
};

/**
 * 결제내역 캡처 → 기기 안 글자 인식 → 여러 건 해석 시험대.
 * 인식 파일은 /ocr (우리 서버) 에서만 받는다. 이미지는 브라우저 밖으로 나가지 않는다.
 */
export function CaptureLab() {
  const [lang, setLang] = useState<Lang>("kor+eng");
  const [psm, setPsm] = useState<Psm>("4");
  const [upscale, setUpscale] = useState(true);
  const [progress, setProgress] = useState<string | null>(null);
  const [results, setResults] = useState<ImageResult[]>([]);
  const [pasted, setPasted] = useState("");
  /** 과거에 기록한 가맹점 (본 기능에서는 가계부 기록에서 가져온다) */
  const [historyText, setHistoryText] = useState("");
  const history = historyText
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  // 인식기는 공용 모듈(features/ledger/capture/ocr)이 만들고 다시 쓴다 — 화면을 떠나면 내린다
  useEffect(() => () => void disposeOcr(), []);

  async function run(files: FileList | null) {
    if (!files?.length) return;
    try {
      await recognizeAll(Array.from(files));
    } catch (e) {
      console.error("[capture-lab]", e);
      setProgress(`오류: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function recognizeAll(files: File[]) {
    const out: ImageResult[] = [];
    for (const file of files) {
      const r = await recognizeCapture(file, {
        today: todayKST(),
        lang,
        psm,
        upscale,
        onProgress: (p) => setProgress(`${file.name} ${progressLabel(p)}`),
      });
      out.push({
        name: file.name,
        url: r.canvas.toDataURL("image/jpeg", 0.7),
        width: r.canvas.width,
        height: r.canvas.height,
        inverted: r.inverted,
        ms: r.ms,
        confidence: r.confidence,
        lines: r.lines,
        parsed: r.result,
        recovered: r.recovered,
        rereadKo: r.rereadKo,
      });
    }
    setProgress(null);
    setResults(out);
  }

  const pastedResult = pasted.trim() ? parseCardCapture(pasted, todayKST()) : null;

  return (
    <div className="grid gap-6 pb-16">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold">캡처 인식 시험대</h1>
        <p className="text-sm text-muted-foreground">
          개발 전용입니다. 이미지는 이 브라우저 안에서만 읽고, 인식 파일도 이 서버(/ocr)에서만 받습니다. 개발자 도구 네트워크 탭에서 외부 요청이
          없는지 확인할 수 있어요.
        </p>
      </div>

      <section className="grid gap-3 rounded-lg border p-4">
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            언어
            <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} className="rounded border bg-transparent px-2 py-1">
              <option value="kor+eng">한국어+영어</option>
              <option value="kor">한국어만</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            배치 방식
            <select value={psm} onChange={(e) => setPsm(e.target.value as Psm)} className="rounded border bg-transparent px-2 py-1">
              {(Object.keys(PSM_LABEL) as Psm[]).map((k) => (
                <option key={k} value={k}>
                  {PSM_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={upscale} onChange={(e) => setUpscale(e.target.checked)} />
            작은 이미지 2배 확대
          </label>
        </div>
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={!!progress && !progress.startsWith("오류")}
          onChange={(e) => {
            const files = e.target.files;
            run(files).finally(() => {
              e.target.value = "";
            });
          }}
          className="text-sm"
        />
        {progress ? <p className="text-sm text-muted-foreground">{progress}</p> : null}
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">과거에 기록한 가맹점 (줄마다 하나, 보정 시험용 — 비워 두면 자주 쓰는 가맹점 목록만 씀)</span>
          <textarea
            value={historyText}
            onChange={(e) => setHistoryText(e.target.value)}
            rows={3}
            placeholder={"KFC코엑스MALL\nKFC강남구청역"}
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
          />
        </label>
      </section>

      {results.map((r) => (
        <section key={r.name + r.ms} className="grid gap-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-medium">{r.name}</h2>
            <span className="text-xs text-muted-foreground">
              {r.width}×{r.height} · {(r.ms / 1000).toFixed(1)}초 · 전체 신뢰도 {r.confidence}
              {r.inverted ? " · 어두운 화면 → 반전함" : ""} · 카드사 {r.parsed.issuer ?? "모름"}
              {r.recovered > 0 ? ` · 다시 읽어 ${r.recovered}건 되살림` : ""}
              {r.rereadKo > 0 ? ` · 한글로 다시 읽은 줄 ${r.rereadKo}개` : ""}
            </span>
          </div>
          <ParsedTable result={r.parsed} history={history} />
          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground">인식된 줄 {r.lines.length}개 · 위치 표시</summary>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.url} alt="" className="w-full" />
                <svg viewBox={`0 0 ${r.width} ${r.height}`} className="absolute inset-0 h-full w-full">
                  {r.lines.map((l, i) =>
                    l.bbox ? (
                      <rect
                        key={i}
                        x={l.bbox.x0}
                        y={l.bbox.y0}
                        width={l.bbox.x1 - l.bbox.x0}
                        height={l.bbox.y1 - l.bbox.y0}
                        fill="none"
                        stroke={(l.confidence ?? 0) < 70 ? "red" : "lime"}
                        strokeWidth={Math.max(2, r.width / 400)}
                      />
                    ) : null,
                  )}
                </svg>
              </div>
              <ol className="grid content-start gap-1 text-xs">
                {r.lines.map((l, i) => (
                  <li key={i} className={(l.confidence ?? 0) < 70 ? "text-warning" : ""}>
                    <span className="tabular-nums text-muted-foreground">{l.confidence} </span>
                    {l.text}
                  </li>
                ))}
              </ol>
            </div>
          </details>
        </section>
      ))}

      <section className="grid gap-3 rounded-lg border p-4">
        <h2 className="font-medium">복사한 글자 붙여넣기 (라이브 텍스트·텍스트 추출)</h2>
        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={6}
          placeholder="캡처에서 복사한 글자를 붙여넣으세요"
          className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
        />
        {pastedResult ? <ParsedTable result={pastedResult} history={history} /> : null}
        {pasted ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setPasted("")} className="justify-self-start">
            지우기
          </Button>
        ) : null}
      </section>
    </div>
  );
}

function ParsedTable({ result, history }: { result: CaptureResult; history: string[] }) {
  const rejected = result.rejected.length ? (
    <div className="mt-2 grid gap-1 text-xs">
      <p className="font-medium text-warning">등록 안 함 {result.rejected.length}건 (빠졌거나 불확실한 값이 있어요)</p>
      {result.rejected.map((x, k) => (
        <p key={k} className="text-muted-foreground">
          {x.item.date ?? "날짜?"} · {x.item.merchant ?? "가맹점?"} · {x.item.amount.toLocaleString("ko-KR")}원 —{" "}
          <span className="text-warning">{x.reasons.join(", ")}</span>
        </p>
      ))}
    </div>
  ) : null;
  if (!result.items.length)
    return (
      <div>
        <p className="text-sm text-warning">등록할 결제 건이 없어요.</p>
        {rejected}
      </div>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th className="py-1 pr-3">날짜</th>
            <th className="py-1 pr-3">가맹점</th>
            <th className="py-1 pr-3 text-right">금액</th>
            <th className="py-1 pr-3">상태</th>
            <th className="py-1 pr-3">할부</th>
            <th className="py-1 pr-3">신뢰도</th>
            <th className="py-1">원래 줄</th>
          </tr>
        </thead>
        <tbody>
          {result.items.map((i, k) => (
            <tr key={k} className="border-t align-top">
              <td className="py-1 pr-3 tabular-nums">{i.date ?? "?"}</td>
              <td className="py-1 pr-3">
                <MerchantCell raw={i.merchant} history={history} />
              </td>
              <td className="py-1 pr-3 text-right tabular-nums">{i.amount.toLocaleString("ko-KR")}</td>
              <td className={`py-1 pr-3 ${i.status === "canceled" ? "text-warning" : ""}`}>{i.status === "canceled" ? "취소" : "승인"}</td>
              <td className="py-1 pr-3">{i.installment === null ? "" : i.installment === 1 ? "일시불" : `${i.installment}개월`}</td>
              <td className="py-1 pr-3 tabular-nums">{i.confidence ?? ""}</td>
              <td className="py-1 text-xs text-muted-foreground">{i.lines.join(" / ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rejected}
      {result.skipped.length ? <p className="mt-2 text-xs text-muted-foreground">건으로 안 본 줄: {result.skipped.join(" / ")}</p> : null}
    </div>
  );
}

/** 보정한 가맹점 + 원래 인식 결과 */
function MerchantCell({ raw, history }: { raw: string | null; history: string[] }) {
  if (!raw) return <span className="text-warning">?</span>;
  const m = matchMerchant(raw, history);
  if (!m.matched) return <>{m.name}</>;
  return (
    <span className="grid">
      <span className="text-good">{m.name}</span>
      <span className="text-xs text-muted-foreground">
        인식 {raw} · {m.matched.source === "history" ? "과거 기록" : "자주 쓰는 곳"} {Math.round(m.matched.score * 100)}%
      </span>
    </span>
  );
}
