"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { consumeSharedText } from "../actions";
import type { CategoryRow } from "../queries";
import { TxFormDialog, type AccountOption } from "./tx-form";

interface Props {
  accounts: AccountOption[];
  categories: CategoryRow[];
  viewerId: string;
  isCouple: boolean;
  /** Android 공유받기로 넘어온 문자 원문 (쿠키 → 레이아웃) */
  sharedText?: string;
}

/**
 * 데스크톱: 헤더 버튼 / 모바일: 하단 탭바 위 플로팅 버튼.
 * 모바일 수집 진입 (§2-5): ?add=shared — 공유받은 문자로 채운 채 열기, ?add=paste — iOS 단축어용 붙여넣기 단계로 열기
 */
export function QuickAdd({ sharedText, ...props }: Props) {
  const [open, setOpen] = useState(false);
  const [paste, setPaste] = useState<{ text?: string; expanded?: boolean } | undefined>();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const add = url.searchParams.get("add");
    if (!add) return;
    url.searchParams.delete("add");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    if (add === "shared" && sharedText) {
      setPaste({ text: sharedText });
      setOpen(true);
      void consumeSharedText();
    } else if (add === "paste") {
      setPaste({ expanded: true });
      setOpen(true);
    }
  }, [sharedText]);

  const change = (o: boolean) => {
    setOpen(o);
    if (!o) setPaste(undefined);
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} className="hidden md:inline-flex" size="lg">
        <Plus /> 기록하기
      </Button>
      {/* 헤더의 backdrop-blur 가 fixed 의 기준 상자가 되므로 body 로 포털해야 화면 기준으로 뜬다 */}
      {mounted &&
        createPortal(
          <button
            type="button"
            aria-label="거래 기록하기"
            onClick={() => setOpen(true)}
            className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95 md:hidden"
          >
            <Plus className="size-6" />
          </button>,
          document.body,
        )}
      <TxFormDialog open={open} onOpenChange={change} paste={paste} {...props} />
    </>
  );
}
