const FALLBACK = "/dashboard";

/**
 * 로그인 후 돌아갈 주소를 같은 사이트의 경로로만 좁힌다 (오픈 리다이렉트 방지).
 * 미들웨어는 callbackUrl 을 절대 주소(http://호스트/dashboard?add=shared)로 넘기므로,
 * 호스트가 같으면 경로+쿼리만 남기고 다른 호스트·이상한 값은 /dashboard 로 보낸다.
 */
export function safeCallback(url: string | undefined | null, host: string | undefined | null): string {
  if (!url || !host) return FALLBACK;
  let parsed: URL;
  try {
    parsed = new URL(url, `http://${host}`);
  } catch {
    return FALLBACK;
  }
  if (parsed.host !== host) return FALLBACK;
  const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/login")) return FALLBACK;
  return path;
}
