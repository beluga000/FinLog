"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/features/ledger/schema";
import { approveUser, deleteUser, forceLogoutUser, revokeUser } from "../actions";
import type { AdminUserRow } from "../queries";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });

export function UserAdminList({ rows, viewerId }: { rows: AdminUserRow[]; viewerId: string }) {
  const [pending, start] = useTransition();
  const [deleting, setDeleting] = useState<AdminUserRow | null>(null);
  const [confirm, setConfirm] = useState("");

  const run = (fn: () => Promise<ActionResult<unknown>>, msg: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(msg);
      after?.();
    });

  if (rows.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">찾는 사용자가 없어요.</p>;

  const deleteEffect = (u: AdminUserRow) =>
    !u.household
      ? "가구에 속하지 않은 계정이라 계정만 지워져요."
      : u.household.members <= 1
        ? `혼자 쓰던 가구 '${u.household.name}'와 그 안의 계좌·거래·정기 거래·목표가 모두 지워져요.`
        : `가구 '${u.household.name}'에서 빠져요. 배우자에게 보이던 기록은 가구에 남고, 공개 계좌는 공동 명의로, 정기 거래는 배우자에게 넘어가요. 비공개 계좌·거래는 지워져요.${u.household.role === "OWNER" ? " 가구 관리자는 배우자가 이어받아요." : ""}`;

  return (
    <>
      <ul className="divide-y rounded-xl border bg-card">
        {rows.map((u) => {
          const self = u.id === viewerId;
          return (
            <li key={u.id} className="flex items-center gap-2 py-2.5 pr-1 pl-3">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{u.name}</span>
                  {u.isAdmin ? <Badge variant="secondary">관리자</Badge> : null}
                  {u.approvedAt ? null : <Badge variant="destructive">승인 대기</Badge>}
                  {self ? <Badge variant="outline">나</Badge> : null}
                </div>
                <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {[
                    `${fmtDate(u.createdAt)} 가입`,
                    u.household
                      ? `${u.household.name} · ${u.household.members > 1 ? "부부" : "개인"}${u.household.role === "OWNER" ? " · 가구 관리자" : ""}`
                      : "가구 없음",
                  ].join(" · ")}
                </div>
              </div>
              {self ? (
                <span className="w-9 shrink-0" aria-hidden />
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`${u.name} 메뉴`} disabled={pending} />}>
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-44">
                    {u.approvedAt ? (
                      !u.isAdmin ? (
                        <DropdownMenuItem onClick={() => run(() => revokeUser(u.id), `${u.name}님의 승인을 취소했어요`)}>승인 취소 (접속 막기)</DropdownMenuItem>
                      ) : null
                    ) : (
                      <DropdownMenuItem onClick={() => run(() => approveUser(u.id), `${u.name}님을 승인했어요`)}>승인</DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => run(() => forceLogoutUser(u.id), `${u.name}님의 모든 기기 로그인을 끊었어요`)}>
                      모든 기기에서 로그아웃
                    </DropdownMenuItem>
                    {!u.isAdmin ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => {
                            setConfirm("");
                            setDeleting(u);
                          }}
                        >
                          계정 삭제
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          );
        })}
      </ul>

      <Dialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{deleting?.name}님 계정 삭제</DialogTitle>
            <DialogDescription>{deleting ? deleteEffect(deleting) : ""} 되돌릴 수 없어요.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!deleting) return;
              run(() => deleteUser({ id: deleting.id, confirmEmail: confirm }), `${deleting.name}님 계정을 삭제했어요`, () => setDeleting(null));
            }}
          >
            <label className="grid gap-1.5 text-sm">
              <span>
                확인을 위해 이메일 <span className="font-semibold">{deleting?.email}</span> 을 입력하세요
              </span>
              <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" spellCheck={false} className="h-9" />
            </label>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setDeleting(null)} disabled={pending}>
                취소
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={pending || !deleting || confirm.trim().toLowerCase() !== deleting.email.toLowerCase()}
              >
                영구 삭제
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
