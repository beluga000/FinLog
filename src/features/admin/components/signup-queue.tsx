"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActionResult } from "@/features/ledger/schema";
import { approveUser, rejectUser, revokeUser } from "../actions";

type Pending = { id: string; name: string; email: string; createdAt: string };
type Approved = { id: string; name: string; email: string; approvedAt: string };

const fmt = (iso: string) => new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });

export function SignupQueue({ pending, approved }: { pending: Pending[]; approved: Approved[] }) {
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>승인 대기 {pending.length}명</CardTitle>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">기다리는 가입이 없어요.</p>
          ) : (
            <ul className="divide-y">
              {pending.map((u) => (
                <UserRow key={u.id} name={u.name} email={u.email} sub={`${fmt(u.createdAt)} 가입 신청`}>
                  <ConfirmAction label="거절" confirmLabel="거절 확정" variant="outline" run={() => rejectUser(u.id)} done="거절했어요" />
                  <ActionButton label="승인" run={() => approveUser(u.id)} done={`${u.name}님을 승인했어요`} />
                </UserRow>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>승인된 사용자</CardTitle>
        </CardHeader>
        <CardContent>
          {approved.length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 없어요.</p>
          ) : (
            <ul className="divide-y">
              {approved.map((u) => (
                <UserRow key={u.id} name={u.name} email={u.email} sub={`${fmt(u.approvedAt)} 승인`}>
                  <ConfirmAction label="승인 취소" confirmLabel="취소 확정" variant="ghost" run={() => revokeUser(u.id)} done="승인을 취소했어요" />
                </UserRow>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">승인을 취소하면 데이터는 남고, 다음 화면 이동부터 접속이 막혀요.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function UserRow({ name, email, sub, children }: { name: string; email: string; sub: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {email} · {sub}
        </div>
      </div>
      <div className="flex gap-2">{children}</div>
    </li>
  );
}

function useAction(run: () => Promise<ActionResult>, done: string) {
  const [pending, start] = useTransition();
  const go = () =>
    start(async () => {
      const r = await run();
      if (r.ok) toast.success(done);
      else toast.error(r.error);
    });
  return [pending, go] as const;
}

function ActionButton({ label, run, done }: { label: string; run: () => Promise<ActionResult>; done: string }) {
  const [pending, go] = useAction(run, done);
  return (
    <Button size="sm" disabled={pending} onClick={go}>
      {label}
    </Button>
  );
}

/** 되돌리기 어려운 동작은 한 번 더 눌러 확정 (브라우저 confirm 대신) */
function ConfirmAction({
  label,
  confirmLabel,
  variant,
  run,
  done,
}: {
  label: string;
  confirmLabel: string;
  variant: "outline" | "ghost";
  run: () => Promise<ActionResult>;
  done: string;
}) {
  const [armed, setArmed] = useState(false);
  const [pending, go] = useAction(run, done);
  if (!armed) {
    return (
      <Button size="sm" variant={variant} onClick={() => setArmed(true)}>
        {label}
      </Button>
    );
  }
  return (
    <>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setArmed(false)}>
        그만두기
      </Button>
      <Button size="sm" variant="destructive" disabled={pending} onClick={go}>
        {confirmLabel}
      </Button>
    </>
  );
}
