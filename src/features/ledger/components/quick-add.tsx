"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CategoryRow } from "../queries";
import { TxFormDialog, type AccountOption } from "./tx-form";

interface Props {
  accounts: AccountOption[];
  categories: CategoryRow[];
  viewerId: string;
  isCouple: boolean;
}

/** 데스크톱: 헤더 버튼 / 모바일: 하단 탭바 위 플로팅 버튼 */
export function QuickAdd(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="hidden md:inline-flex" size="lg">
        <Plus /> 기록하기
      </Button>
      <button
        type="button"
        aria-label="거래 기록하기"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95 md:hidden"
      >
        <Plus className="size-6" />
      </button>
      <TxFormDialog open={open} onOpenChange={setOpen} {...props} />
    </>
  );
}
