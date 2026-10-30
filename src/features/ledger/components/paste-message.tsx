"use client";

import { useEffect, useState } from "react";
import { ClipboardPaste } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseCardMessage, type ParsedCardMessage } from "@/lib/finance/card-message";
import { todayKST } from "@/lib/finance/period";

/**
 * 빠른 입력의 [문자 붙여넣기] (§2-5 모바일 수집, AC-21).
 * 클립보드를 읽을 수 있으면 바로, 막히면(권한·브라우저) 입력칸에 직접 붙여넣는다.
 * 원문은 이 컴포넌트 밖으로 나가지 않는다 — 파싱 결과만 넘긴다.
 */
export function PasteMessage({
  initialText,
  expanded,
  onParsed,
}: {
  /** Android 공유받기로 넘어온 원문 */
  initialText?: string;
  /** iOS 단축어 진입(?add=paste) — 입력칸을 펼친 채 시작 */
  expanded?: boolean;
  onParsed: (parsed: ParsedCardMessage) => void;
}) {
  const [manual, setManual] = useState(!!expanded);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  function apply(raw: string) {
    const parsed = parseCardMessage(raw, todayKST());
    if (parsed.kind === "cancel") {
      setStatus({ tone: "warn", text: "취소 문자예요. 가계부에서 원래 기록을 찾아 삭제해 주세요." });
      return;
    }
    if (parsed.kind === "unknown" || parsed.amount === null) {
      setStatus({ tone: "warn", text: "카드 승인 문자를 찾지 못했어요. 금액을 직접 입력해 주세요." });
      setManual(true);
      return;
    }
    setStatus({
      tone: "ok",
      text: `${parsed.issuer ?? "카드"} 승인 문자에서 채웠어요.${parsed.merchant ? "" : " 사용처는 직접 입력해 주세요."}`,
    });
    setManual(false);
    setText("");
    onParsed(parsed);
  }

  // 공유받기로 열린 경우 한 번만 자동 적용
  useEffect(() => {
    if (initialText) apply(initialText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialText]);

  async function fromClipboard() {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip.trim()) return apply(clip);
    } catch {
      /* 권한 거부·미지원 → 직접 붙여넣기 */
    }
    setManual(true);
  }

  return (
    <div className="grid gap-2 rounded-lg border border-dashed p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">카드 승인 문자로 채우기</span>
        <Button type="button" size="sm" variant="outline" onClick={fromClipboard}>
          <ClipboardPaste /> 문자 붙여넣기
        </Button>
      </div>
      {manual ? (
        <div className="grid gap-2">
          <textarea
            aria-label="카드 승인 문자"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData("text");
              if (pasted.trim()) {
                e.preventDefault();
                apply(pasted);
              }
            }}
            rows={3}
            placeholder="여기를 길게 눌러 붙여넣기"
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
          />
          {text.trim() ? (
            <Button type="button" size="sm" onClick={() => apply(text)}>
              채우기
            </Button>
          ) : null}
        </div>
      ) : null}
      {status ? (
        <p role="status" className={status.tone === "ok" ? "text-xs text-good" : "text-xs text-warning"}>
          {status.text}
        </p>
      ) : null}
    </div>
  );
}
