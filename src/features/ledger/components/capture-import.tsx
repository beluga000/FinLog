"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronLeft, Images } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Money } from "@/components/common/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { mergeCaptureResults, mergeRejected, matchIssuerAccount } from "@/lib/finance/capture-import";
import type { CaptureResult } from "@/lib/finance/card-capture";
import { matchMerchant } from "@/lib/finance/merchant-match";
import { todayKST } from "@/lib/finance/period";
import { createTransactionsBulk, getMerchantSuggestions, inspectCapturedExpenses, type PastedExpenseInfo } from "../actions";
import type { CategoryRow, MerchantSuggestion } from "../queries";
import type { AccountOption } from "./tx-form";
import { readLastAccounts, rememberAccount, rememberCategory } from "./last-used";

/** 한 번에 고를 수 있는 캡처 수 · 한 번에 기록할 수 있는 건 수 (서버와 같게) */
const MAX_IMAGES = 5;
const MAX_ROWS = 50;

interface Row {
  key: number;
  checked: boolean;
  date: string;
  /** 인식한 가맹점 그대로 — 보정했을 때 "인식: …" 으로 보여 준다 */
  raw: string;
  merchant: string;
  amount: bigint;
  canceled: boolean;
  installment: number | null;
  accountId: string;
  categoryId: string;
  duplicate: PastedExpenseInfo["duplicate"];
}

type Phase = { kind: "pick" } | { kind: "working"; text: string } | { kind: "review" };

/**
 * 결제내역 캡처로 여러 건 기록 (§2-5 모바일 수집).
 * 캡처(카드 앱 결제내역·카드 문자 화면)를 이 기기 안에서 글자 인식 → 확인 화면 → 고른 건만 지출로 한 번에 저장.
 * 이미지와 인식한 줄은 서버로 보내지 않는다 — 서버에는 확정한 거래 값(날짜·금액·사용처·카테고리·결제 수단)만 간다.
 */
export function CaptureImport({
  accounts,
  categories,
  onBack,
  onDone,
}: {
  accounts: AccountOption[];
  categories: CategoryRow[];
  onBack: () => void;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "pick" });
  const [rows, setRows] = useState<Row[]>([]);
  const [rejected, setRejected] = useState<CaptureResult["rejected"]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const suggestions = useRef<Promise<MerchantSuggestion[]> | null>(null);

  const payAccounts = useMemo(() => accounts.filter((a) => a.type !== "LOAN"), [accounts]);
  const expenseCategories = useMemo(() => categories.filter((c) => c.txType === "EXPENSE"), [categories]);

  useEffect(() => {
    // 사용처 보정에 쓸 과거 기록 — 인식이 끝나기 전에 미리 받아 둔다
    suggestions.current = getMerchantSuggestions("EXPENSE").catch(() => []);
    // 인식 엔진은 무거우니 화면을 닫으면 내린다
    return () => {
      void import("../capture/ocr").then((m) => m.disposeOcr());
    };
  }, []);

  async function recognize(files: File[]) {
    setError(null);
    setNotice(files.length > MAX_IMAGES ? `한 번에 ${MAX_IMAGES}장까지 읽어요. 앞의 ${MAX_IMAGES}장만 읽었어요.` : null);
    const picked = files.slice(0, MAX_IMAGES);
    const results: CaptureResult[] = [];
    try {
      // tesseract.js 는 이 기능을 쓸 때만 불러온다
      const { recognizeCapture, progressLabel } = await import("../capture/ocr");
      const today = todayKST();
      for (const [i, file] of picked.entries()) {
        const head = picked.length > 1 ? `${i + 1}/${picked.length}장 · ` : "";
        setPhase({ kind: "working", text: `${head}인식 준비 중…` });
        const r = await recognizeCapture(file, { today, onProgress: (p) => setPhase({ kind: "working", text: head + progressLabel(p) }) });
        // 인식한 줄·이미지는 여기서 버리고 해석 결과만 남긴다
        results.push(r.result);
      }
    } catch (e) {
      console.error("[capture]", e);
      setPhase({ kind: "pick" });
      setError("글자를 읽지 못했어요. 잠시 뒤 다시 해 보거나 직접 입력해 주세요.");
      return;
    }

    setPhase({ kind: "working", text: "기록과 맞춰 보는 중…" });
    let items = mergeCaptureResults(results).filter((it) => it.date && it.merchant);
    if (items.length > MAX_ROWS) {
      setNotice(`한 번에 ${MAX_ROWS}건까지 기록할 수 있어 앞의 ${MAX_ROWS}건만 보여 줘요.`);
      items = items.slice(0, MAX_ROWS);
    }
    const history = (await suggestions.current ?? []).map((s) => s.merchant);
    const named = items.map((it) => ({ it, name: matchMerchant(it.merchant!, history).name }));
    let info: PastedExpenseInfo[] = [];
    try {
      info = await inspectCapturedExpenses(named.map(({ it, name }) => ({ amount: it.amount.toString(), date: it.date!, merchant: name })));
    } catch {
      /* 점검을 못 해도 확인 화면은 보여 준다 */
    }
    const lastAccount = readLastAccounts()["EXPENSE:from"];
    const fallbackAccount = payAccounts.find((a) => a.id === lastAccount)?.id ?? payAccounts[0]?.id ?? "";
    const known = new Set(expenseCategories.map((c) => c.id));
    const sugCategory = new Map((await suggestions.current ?? []).map((s) => [s.merchant, s.categoryId]));

    setRows(
      named.map(({ it, name }, k) => {
        const dup = info[k]?.duplicate ?? null;
        const category = info[k]?.categoryId ?? sugCategory.get(name) ?? null;
        return {
          key: k,
          // 취소된 결제·이미 기록한 것 같은 건은 처음엔 빼 둔다
          checked: it.status !== "canceled" && !dup,
          date: it.date!,
          raw: it.merchant!,
          merchant: name,
          amount: it.amount,
          canceled: it.status === "canceled",
          installment: it.installment,
          accountId: matchIssuerAccount(it.issuer, payAccounts) ?? fallbackAccount,
          categoryId: category && known.has(category) ? category : "",
          duplicate: dup,
        };
      }),
    );
    setRejected(mergeRejected(results));
    setPhase({ kind: "review" });
  }

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const selected = rows.filter((r) => r.checked);
  const missingCategory = rows.filter((r) => r.checked && !r.categoryId);

  function save() {
    setError(null);
    if (!selected.length) return setError("기록할 건을 골라 주세요.");
    if (selected.some((r) => !r.accountId)) return setError("결제 수단을 골라 주세요.");
    if (missingCategory.length) return setError(`카테고리가 빈 ${missingCategory.length}건이 있어요.`);
    startSaving(async () => {
      const result = await createTransactionsBulk(
        selected.map((r) => ({
          date: r.date,
          amount: r.amount.toString(),
          merchant: r.merchant.trim() || null,
          categoryId: r.categoryId,
          fromAccountId: r.accountId,
          // 할부도 문자 붙여넣기처럼 결제한 날 전체 금액으로 기록하고, 메모로 남긴다
          memo: r.installment && r.installment > 1 ? `${r.installment}개월 할부` : null,
        })),
      );
      if (!result.ok) return setError(result.error);
      const { created, skipped } = result.data!;
      rememberAccount("EXPENSE:from", selected[selected.length - 1].accountId);
      // 최근 카테고리: 가장 위(최신) 건이 맨 앞에 오도록 뒤에서부터
      for (const r of [...selected].reverse()) rememberCategory("EXPENSE", r.categoryId);
      toast.success(skipped ? `${created}건 기록, ${skipped}건은 이미 있어 건너뜀` : `${created}건 기록했어요`);
      onDone();
    });
  }

  if (!payAccounts.length) {
    return (
      <p className="text-sm text-muted-foreground">
        먼저 <a className="font-medium text-foreground underline" href="/assets">자산</a>에서 카드·통장을 등록하세요.
      </p>
    );
  }

  if (phase.kind !== "review") {
    const working = phase.kind === "working";
    return (
      <div className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          카드 앱의 결제내역이나 카드 문자 화면을 캡처해 골라 주세요 (최대 {MAX_IMAGES}장). 글자는 이 기기 안에서만 읽고, 이미지는 어디에도 보내거나
          저장하지 않아요.
        </p>
        <label
          className={cn(
            "flex h-12 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground active:scale-[0.99]",
            working && "pointer-events-none opacity-60",
          )}
        >
          <Images className="size-4" />
          {working ? phase.text : "캡처 고르기"}
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={working}
            className="sr-only"
            onChange={(e) => {
              // FileList 는 입력값을 비우면 사라지므로 먼저 배열로 옮기고, 끝난 뒤에 비운다 (같은 캡처 다시 고르기)
              const input = e.currentTarget;
              const files = Array.from(input.files ?? []);
              if (!files.length) return;
              void recognize(files).finally(() => {
                input.value = "";
              });
            }}
          />
        </label>
        {working ? <p className="text-xs text-muted-foreground" role="status">처음 한 번은 인식 파일을 내려받느라 조금 걸려요.</p> : null}
        {notice ? <p className="text-xs text-warning">{notice}</p> : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="button" variant="ghost" onClick={onBack} disabled={working} className="justify-self-start">
          <ChevronLeft /> 직접 입력
        </Button>
      </div>
    );
  }

  const parents = expenseCategories.filter((c) => !c.parentId);
  const categoryOptions = parents.map((p) => {
    const children = expenseCategories.filter((c) => c.parentId === p.id);
    if (!children.length)
      return (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      );
    return (
      <optgroup key={p.id} label={p.name}>
        <option value={p.id}>{p.name} (전체)</option>
        {children.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </optgroup>
    );
  });

  return (
    <div className="grid gap-3">
      {rows.length ? (
        <p className="text-sm text-muted-foreground">
          {rows.length}건을 찾았어요. 맞는지 보고 기록할 건만 골라 주세요.
        </p>
      ) : (
        <p className="text-sm text-warning">기록할 결제 건을 찾지 못했어요. 결제내역 목록이 보이게 다시 캡처해 보세요.</p>
      )}
      {notice ? <p className="text-xs text-warning">{notice}</p> : null}

      {missingCategory.length > 1 ? (
        // 처음 보는 사용처가 많을 때 — 빈 카테고리를 한 번에 채운다
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="shrink-0">카테고리 빈 {missingCategory.length}건</span>
          <NativeSelect
            value=""
            aria-label="빈 카테고리 한 번에 채우기"
            onChange={(e) => {
              const id = e.target.value;
              if (id) setRows((rs) => rs.map((r) => (r.checked && !r.categoryId ? { ...r, categoryId: id } : r)));
            }}
            className="h-8"
          >
            <option value="">한 번에 고르기</option>
            {categoryOptions}
          </NativeSelect>
        </label>
      ) : null}

      <ul className="grid gap-2">
        {rows.map((r) => (
          <li
            key={r.key}
            className={cn(
              "grid gap-2 rounded-lg border p-3",
              // 중복 건은 체크가 꺼져 있어도 흐리게 두지 않고 강조색 칸으로 띄운다
              r.duplicate ? "border-2 border-brand bg-brand-soft/60" : !r.checked && "bg-muted/40",
            )}
          >
            <label className="flex items-center gap-2">
              <Checkbox checked={r.checked} onChange={(e) => update(r.key, { checked: e.target.checked })} />
              <span className="text-sm tabular text-muted-foreground">{shortDate(r.date)}</span>
              {/* 공용 배지 — 모서리는 테마를 따른다. 취소는 경고 주황 테두리, 중복은 테마 강조색 바탕 */}
              {r.canceled ? (
                <Badge variant="outline" className="border-warning/60 text-warning">
                  취소
                </Badge>
              ) : null}
              {r.duplicate ? <Badge className="bg-brand font-semibold text-background">중복</Badge> : null}
              {r.installment && r.installment > 1 ? <span className="text-xs text-muted-foreground">{r.installment}개월 할부</span> : null}
              <Money value={r.amount} className={cn("ml-auto font-semibold", r.canceled && "line-through")} />
            </label>
            <div className="grid gap-1">
              <Input
                value={r.merchant}
                maxLength={100}
                aria-label="사용처"
                autoComplete="off"
                onChange={(e) => update(r.key, { merchant: e.target.value })}
                className="h-9"
              />
              {r.merchant !== r.raw ? <span className="text-xs text-muted-foreground">인식: {r.raw}</span> : null}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NativeSelect
                value={r.categoryId}
                aria-label="카테고리"
                onChange={(e) => update(r.key, { categoryId: e.target.value })}
                className={cn("h-9", r.checked && !r.categoryId && "border-warning")}
              >
                <option value="">카테고리</option>
                {categoryOptions}
              </NativeSelect>
              <NativeSelect value={r.accountId} aria-label="결제 수단" onChange={(e) => update(r.key, { accountId: e.target.value })} className="h-9">
                {payAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {r.duplicate ? (
              // 캡처는 같은 날·같은 금액만 걸리므로 날짜·금액은 다시 쓰지 않는다
              <p className="text-xs font-medium text-brand">
                {r.duplicate.merchant === r.merchant.trim()
                  ? "이미 가계부에 있는 결제예요. 따로 결제했다면 체크하세요."
                  : `같은 날 같은 금액 지출(${r.duplicate.merchant ?? "사용처 없음"})이 가계부에 있어요. 다른 결제라면 체크하세요.`}
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      {rejected.length ? (
        <details className="rounded-lg border border-dashed px-3 py-2 text-sm">
          <summary className="cursor-pointer text-muted-foreground">등록 안 함 {rejected.length}건</summary>
          <p className="mt-2 text-xs text-muted-foreground">글자가 잘렸거나 흐려서 확실하지 않은 건이에요. 필요하면 직접 입력해 주세요.</p>
          <ul className="mt-1 grid gap-1 text-xs">
            {rejected.map((x, k) => (
              <li key={k} className="text-muted-foreground">
                {x.item.date ? shortDate(x.item.date) : "날짜?"} · {x.item.merchant ?? "가맹점?"} · <Money value={x.item.amount} /> —{" "}
                <span className="text-warning">{x.reasons.join(", ")}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="sticky bottom-0 -mx-1 flex gap-2 bg-background px-1 pt-2 pb-1">
        <Button type="button" variant="outline" onClick={() => setPhase({ kind: "pick" })} disabled={saving}>
          다시 고르기
        </Button>
        <Button type="button" size="lg" onClick={save} disabled={saving || !selected.length} className="flex-1">
          {saving ? "기록 중…" : `${selected.length}건 기록`}
        </Button>
      </div>
    </div>
  );
}

function shortDate(date: string) {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}
