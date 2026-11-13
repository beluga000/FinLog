"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LockKeyhole } from "lucide-react";
import { Logo } from "@/components/common/logo-mark";
import { Button } from "@/components/ui/button";
import { logout } from "@/features/household/actions";
import { LOCK_AFTER_MS, readLockConfig, setCovered, verifyLock, writeLockConfig, type AppLockConfig } from "../lock";

/**
 * 앱 잠금 화면 — 앱을 열 때와 다른 앱에 1분 넘게 있다 돌아올 때 Face ID·지문·기기 암호를 묻는다.
 * 다른 앱으로 가는 순간 내용을 가려 앱 전환 화면에도 가계부가 보이지 않게 한다.
 */
export function AppLock({ userId }: { userId: string }) {
  const [config, setConfig] = useState<AppLockConfig | null>(null);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const hiddenAt = useRef<number | null>(null);

  // silent: 앱이 뜰 때 저절로 묻는 것 — 기기가 버튼 누름 없이는 막는 경우가 있어 실패해도 오류로 보이지 않는다
  const unlock = useCallback(async (c: AppLockConfig, silent = false) => {
    setBusy(true);
    const ok = await verifyLock(c.credentialId);
    setBusy(false);
    if (ok) {
      setLocked(false);
      setFailed(false);
      setCovered(false);
    } else if (!silent) setFailed(true);
  }, []);

  // 처음 뜰 때: 이 사람이 이 기기에서 잠금을 쓰면 잠그고 바로 물어본다 (기기가 막으면 버튼으로)
  useEffect(() => {
    const c = readLockConfig();
    if (!c || c.userId !== userId) {
      setCovered(false);
      return;
    }
    setConfig(c);
    setLocked(true);
    void unlock(c, true);
  }, [userId, unlock]);

  // 설정에서 켜고 끌 때 (같은 탭) — app-lock-toggle 이 알린다
  useEffect(() => {
    const sync = () => {
      const c = readLockConfig();
      setConfig(c && c.userId === userId ? c : null);
    };
    window.addEventListener("finlog:app-lock", sync);
    return () => window.removeEventListener("finlog:app-lock", sync);
  }, [userId]);

  useEffect(() => {
    if (!config) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        setCovered(true);
        return;
      }
      const away = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
      hiddenAt.current = null;
      if (away > LOCK_AFTER_MS) {
        setLocked(true);
        void unlock(config, true);
      } else if (!locked) setCovered(false);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [config, locked, unlock]);

  if (!locked || !config) return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-lock-title"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-background px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-center"
    >
      <Logo />
      <div className="grid justify-items-center gap-2">
        <LockKeyhole className="size-8 text-muted-foreground" aria-hidden />
        <h1 id="app-lock-title" className="text-lg font-semibold">
          잠겨 있어요
        </h1>
        <p className="text-sm text-muted-foreground">Face ID·지문·기기 암호로 열어 주세요.</p>
        {failed ? <p className="text-sm text-critical">확인하지 못했어요. 다시 시도해 주세요.</p> : null}
      </div>
      <Button size="lg" className="min-w-40" disabled={busy} onClick={() => void unlock(config)}>
        {busy ? "확인 중…" : "잠금 풀기"}
      </Button>
      <button
        type="button"
        className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        onClick={() => {
          // 풀 수 없을 때의 출구 — 비밀번호로 다시 로그인하면 된다 (이 기기 잠금은 꺼진다)
          writeLockConfig(null);
          void logout();
        }}
      >
        열 수 없나요? 로그아웃하고 다시 로그인
      </button>
    </div>,
    document.body,
  );
}
