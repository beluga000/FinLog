"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendTestPush, subscribePush, unsubscribePush } from "../actions";

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

/** VAPID 공개 키(base64url) → 구독에 넘길 바이트 */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

/** 설정 — 이 기기에서 아침 알림 받기 (잔액 부족 예보·확인할 일) */
export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [pending, start] = useTransition();
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        // 아이폰은 홈 화면에 추가한 앱에서만 알림을 받을 수 있다
        return setState(isIOS() && !isStandalone() ? "ios-install" : "unsupported");
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  const enable = () =>
    start(async () => {
      if (!publicKey) return void toast.error("서버에 알림 설정이 아직 없어요.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      const r = await subscribePush(sub.toJSON());
      if (!r.ok) return void toast.error(r.error);
      setState("on");
      toast.success("이 기기에서 알림을 받아요");
    });

  const disable = () =>
    start(async () => {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribePush(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
      toast.success("이 기기 알림을 껐어요");
    });

  const test = () =>
    start(async () => {
      const r = await sendTestPush();
      if (!r.ok) toast.error(r.error);
      else toast.success("시험 알림을 보냈어요");
    });

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        아침 9시에 알려 드려요 — 통장이 3일 안에 모자랄 것 같을 때, 확인할 자동 기록, 카드값 나가기 이틀 전·당일, 쓸 수 있는 돈을 80%·100% 넘은 날, 목표가 25%씩 모였을 때. 월요일에는 지난주 지출 요약도 보내요.
      </p>
      {state === "on" ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={disable} disabled={pending}>
            <BellOff /> 이 기기 알림 끄기
          </Button>
          <Button variant="ghost" onClick={test} disabled={pending}>
            시험 알림 보내기
          </Button>
        </div>
      ) : state === "off" ? (
        <div>
          <Button onClick={enable} disabled={pending}>
            <Bell /> 이 기기에서 알림 받기
          </Button>
        </div>
      ) : (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm">
          {state === "loading"
            ? "확인하는 중…"
            : state === "ios-install"
              ? "아이폰은 Safari 공유 버튼 → '홈 화면에 추가'로 설치한 FINLOG 앱에서 알림을 켤 수 있어요."
              : state === "denied"
                ? "브라우저에서 FINLOG 알림을 막아 두었어요. 브라우저 사이트 설정에서 알림을 허용한 뒤 다시 열어 주세요."
                : "이 브라우저는 알림을 지원하지 않아요."}
        </p>
      )}
    </div>
  );
}
