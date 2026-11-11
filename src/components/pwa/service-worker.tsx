"use client";

import { useEffect } from "react";

/** 서비스 워커 등록 (오프라인 안내·정적 파일 캐시). 개발 서버는 ?dev=1 — 정적 파일을 캐시하지 않는다 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const url = process.env.NODE_ENV === "production" ? "/sw.js" : "/sw.js?dev=1";
    navigator.serviceWorker.register(url, { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
