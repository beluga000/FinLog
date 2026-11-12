"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** 인쇄 · PDF로 저장 — 브라우저 인쇄 창에서 "PDF로 저장"을 고르면 된다 (globals.css @media print 가 메뉴를 숨긴다) */
export function PrintButton({ label = "인쇄 · PDF" }: { label?: string }) {
  return (
    <Button variant="outline" size="sm" data-print="hide" onClick={() => window.print()}>
      <Printer /> {label}
    </Button>
  );
}
