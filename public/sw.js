/*
 * FINLOG 서비스 워커 — 오프라인 안내 + 정적 파일 캐시.
 * 금융 데이터가 담긴 화면(HTML)·서버 응답은 기기에 저장하지 않는다. 연결이 끊기면 화면 대신 /offline 안내를 보여 준다.
 * 개발 서버(?dev=1)에서는 정적 파일을 캐시하지 않는다 — 고칠 때마다 바뀌는 파일이 옛것으로 남지 않게.
 */
const VERSION = "v1";
const SHELL = `finlog-shell-${VERSION}`;
const STATIC = `finlog-static-${VERSION}`;
const OFFLINE_URL = "/offline";
const DEV = new URL(self.location.href).searchParams.has("dev");

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll([OFFLINE_URL, "/icon.svg", "/icons/192"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("finlog-") && k !== SHELL && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 화면 이동: 늘 네트워크. 끊겼을 때만 오프라인 안내
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // 빌드 파일은 이름에 해시가 붙어 바뀌지 않는다 → 캐시 먼저
  if (!DEV && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
  }
});

// 푸시 알림 — 서버가 보낸 { title, body, url, tag }
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "FINLOG", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "FINLOG", {
      body: data.body || "",
      tag: data.tag || "finlog",
      icon: "/icons/192",
      badge: "/icons/192",
      lang: "ko",
      data: { url: data.url || "/dashboard" },
    }),
  );
});

// 알림을 누르면 열려 있는 FINLOG 창으로, 없으면 새 창으로
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/dashboard", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (win) return win.navigate(url).then((w) => (w || win).focus());
      return self.clients.openWindow(url);
    }),
  );
});
