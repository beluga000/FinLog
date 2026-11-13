"use client";

import { useEffect, useState } from "react";
import { LockKeyhole, LockKeyholeOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createLockCredential, isLockSupported, readLockConfig, verifyLock, writeLockConfig } from "../lock";

/** 설정 — 이 기기에서 앱 잠금 켜기·끄기 (기기마다 따로) */
export function AppLockToggle({ userId }: { userId: string }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void isLockSupported().then(setSupported);
    const c = readLockConfig();
    setOn(!!c && c.userId === userId);
  }, [userId]);

  const notify = () => window.dispatchEvent(new Event("finlog:app-lock"));

  async function enable() {
    setBusy(true);
    try {
      const credentialId = await createLockCredential(userId);
      writeLockConfig({ userId, credentialId });
      if (readLockConfig()?.credentialId !== credentialId) throw new Error("storage");
      setOn(true);
      notify();
      toast.success("이 기기에서 앱 잠금을 켰어요 · 다음에 열 때부터 물어봐요");
    } catch (e) {
      const cancelled = e instanceof DOMException && e.name === "NotAllowedError";
      toast.error(cancelled ? "취소했어요" : "이 기기에서 잠금을 켜지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    const c = readLockConfig();
    setBusy(true);
    // 끄기 전에도 본인 확인 — 잠금이 풀린 화면을 다른 사람이 들고 있을 수 있다
    const ok = c ? await verifyLock(c.credentialId) : true;
    setBusy(false);
    if (!ok) return void toast.error("확인하지 못해 잠금을 그대로 뒀어요");
    writeLockConfig(null);
    setOn(false);
    notify();
    toast.success("이 기기 앱 잠금을 껐어요");
  }

  if (supported === null) return null;
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        앱을 열 때와 다른 앱에 1분 넘게 있다 돌아올 때 Face ID·지문·기기 암호를 물어요. 기기마다 따로 켜요.
      </p>
      {!supported ? (
        <p className="text-sm text-muted-foreground">이 기기(브라우저)는 지문·얼굴·기기 암호 확인을 지원하지 않아요.</p>
      ) : on ? (
        <Button variant="outline" className="justify-self-start" disabled={busy} onClick={() => void disable()}>
          <LockKeyholeOpen /> 이 기기 앱 잠금 끄기
        </Button>
      ) : (
        <Button className="justify-self-start" disabled={busy} onClick={() => void enable()}>
          <LockKeyhole /> 이 기기에서 앱 잠금 켜기
        </Button>
      )}
    </div>
  );
}
