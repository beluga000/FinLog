"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { transferHouseholdOwner } from "../actions";
import type { AdminHouseholdRow } from "../queries";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });

export function HouseholdAdminList({ rows }: { rows: AdminHouseholdRow[] }) {
  const [pending, start] = useTransition();
  if (rows.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">아직 가구가 없어요.</p>;
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {rows.map((h) => (
        <li key={h.id} className="grid gap-2 px-3 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              {h.name}
              <Badge variant="outline">{h.members.length > 1 ? "부부" : h.members.length === 1 ? "개인" : "구성원 없음"}</Badge>
            </span>
            <span className="text-xs text-muted-foreground">
              {fmtDate(h.createdAt)} 생성 · 기록 {h.txCount.toLocaleString("ko-KR")}건
              {h.lastTxAt ? ` · 마지막 기록 ${fmtDate(h.lastTxAt)}` : ""}
            </span>
          </div>
          <ul className="grid gap-1">
            {h.members.map((m) => (
              <li key={m.userId} className="flex items-center gap-2 text-xs">
                <span className="font-medium">{m.name}</span>
                <span className="min-w-0 truncate text-muted-foreground">{m.email}</span>
                {m.role === "OWNER" ? (
                  <Badge variant="secondary">가구 관리자</Badge>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto h-7"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const r = await transferHouseholdOwner({ householdId: h.id, userId: m.userId });
                        if (!r.ok) toast.error(r.error);
                        else toast.success(`${m.name}님이 '${h.name}'의 가구 관리자가 됐어요`);
                      })
                    }
                  >
                    관리자로 지정
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
