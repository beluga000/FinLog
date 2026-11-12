"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { changePassword, deleteMyAccount, getLeaveImpact, leaveHousehold, resetPassword, type LeaveImpact } from "../actions";

/** 설정 > 계정: 비밀번호 바꾸기 */
export function ChangePasswordForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="grid max-w-sm gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        if (fd.get("next") !== fd.get("again")) return setError("새 비밀번호가 서로 달라요.");
        setError(null);
        start(async () => {
          const r = await changePassword({ current: fd.get("current"), next: fd.get("next") });
          if (r && !r.ok) setError(r.error);
        });
      }}
    >
      <Field label="지금 비밀번호" htmlFor="pw-current">
        <Input id="pw-current" name="current" type="password" autoComplete="current-password" required className="h-10" />
      </Field>
      <Field label="새 비밀번호" htmlFor="pw-next" hint="8자 이상">
        <Input id="pw-next" name="next" type="password" autoComplete="new-password" required minLength={8} maxLength={72} className="h-10" />
      </Field>
      <Field label="새 비밀번호 한 번 더" htmlFor="pw-again">
        <Input id="pw-again" name="again" type="password" autoComplete="new-password" required minLength={8} maxLength={72} className="h-10" />
      </Field>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "바꾸는 중…" : "비밀번호 바꾸기"}
      </Button>
      <p className="text-xs text-muted-foreground">바꾸면 다른 기기의 로그인은 모두 끊겨요.</p>
    </form>
  );
}

/** 재설정 링크(/reset-password)로 새 비밀번호 정하기 */
export function ResetPasswordForm({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        if (fd.get("password") !== fd.get("again")) return setError("새 비밀번호가 서로 달라요.");
        setError(null);
        start(async () => {
          const r = await resetPassword({ token, password: fd.get("password") });
          if (r && !r.ok) setError(r.error);
        });
      }}
    >
      <Field label="새 비밀번호" htmlFor="password" hint="8자 이상">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} className="h-10" />
      </Field>
      <Field label="한 번 더" htmlFor="again">
        <Input id="again" name="again" type="password" autoComplete="new-password" required minLength={8} maxLength={72} className="h-10" />
      </Field>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "바꾸는 중…" : "비밀번호 정하기"}
      </Button>
    </form>
  );
}

type Mode = "leave" | "delete";

/** 가구 나가기 · 탈퇴 — 누르면 지워질 것을 먼저 읽어 와 보여 주고, 본인 확인 후 진행 */
export function LeaveOrDelete({ isCouple }: { isCouple: boolean }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [impact, setImpact] = useState<LeaveImpact | null>(null);
  const [confirm, setConfirm] = useState("");
  const [loading, startLoad] = useTransition();
  const [pending, start] = useTransition();

  function open(m: Mode) {
    setConfirm("");
    setImpact(null);
    setMode(m);
    startLoad(async () => {
      const r = await getLeaveImpact();
      if (!r.ok) return void toast.error(r.error);
      setImpact(r.data ?? null);
    });
  }

  function submit() {
    if (!mode) return;
    start(async () => {
      const r = mode === "leave" ? await leaveHousehold({ confirm }) : await deleteMyAccount({ confirm });
      if (r && !r.ok) toast.error(r.error);
    });
  }

  const partner = impact?.partnerName ?? "배우자";
  const lines: string[] = [];
  if (impact) {
    if (mode === "delete" && impact.solo) lines.push("혼자 쓰는 가구라 계좌·거래·정기 거래·목표가 모두 지워져요.");
    if (!impact.solo && impact.partnerName) {
      lines.push(
        impact.privateAccounts || impact.privateTx
          ? `내 비공개 계좌 ${impact.privateAccounts}개와 비공개 거래 ${impact.privateTx}건이 지워져요.`
          : "지워지는 비공개 데이터는 없어요.",
      );
      if (impact.ownAccounts) lines.push(`내 명의 공개 계좌 ${impact.ownAccounts}개는 공동 명의로 ${partner}님 가계부에 남아요.`);
      lines.push(`내가 기록한 공개 거래와 목표는 ${partner}님 가계부에 그대로 남아요.`);
      if (mode === "leave") lines.push("나가면 새 가계부를 처음부터 시작해요.");
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {isCouple ? (
          <Button variant="outline" onClick={() => open("leave")}>
            가구에서 나가기
          </Button>
        ) : null}
        <Button variant="outline" className="text-destructive" onClick={() => open("delete")}>
          탈퇴하기
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {isCouple ? "나가기는 계정은 두고 이 가계부에서만 빠져요. 탈퇴는 계정까지 지워요." : "탈퇴하면 계정과 가계부가 모두 지워져요."}
      </p>

      <Dialog open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{mode === "leave" ? "가구에서 나가기" : "탈퇴하기"}</DialogTitle>
            <DialogDescription>되돌릴 수 없어요.</DialogDescription>
          </DialogHeader>
          {loading || !impact ? (
            <p className="text-sm text-muted-foreground">확인하는 중…</p>
          ) : mode === "delete" && impact.isAdmin ? (
            <p className="text-sm">서비스 관리자 계정은 탈퇴할 수 없어요. ADMIN_EMAILS 에서 먼저 빼세요.</p>
          ) : (
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <ul className="grid list-disc gap-1 pl-5 text-sm">
                {lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              <Field label={impact.hasPassword ? "확인을 위해 비밀번호를 입력하세요" : "확인을 위해 이메일을 입력하세요"} htmlFor="leave-confirm">
                <Input
                  id="leave-confirm"
                  type={impact.hasPassword ? "password" : "text"}
                  autoComplete={impact.hasPassword ? "current-password" : "off"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="h-9"
                />
              </Field>
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setMode(null)} disabled={pending}>
                  취소
                </Button>
                <Button type="submit" variant="destructive" disabled={pending || !confirm}>
                  {mode === "leave" ? "나가기" : "탈퇴"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
