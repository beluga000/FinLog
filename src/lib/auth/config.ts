import type { NextAuthConfig } from "next-auth";
import type { JWT } from "next-auth/jwt";

/** Edge(미들웨어)에서도 import 가능한 설정 — Prisma·bcrypt 금지 */
/** /share: 공유받기 POST — 로그인 전이어도 원문을 받아 쿠키에 담는다 */
export const PUBLIC_PATHS = ["/", "/login", "/signup", "/share"];

/** 로그인 유지 최대 시간: 로그인 시각부터 24시간. 그 안에 계속 써도 연장되지 않는다(절대 만료). */
export const SESSION_MAX_AGE_SEC = 24 * 60 * 60;

/** 로그인 시각(ms)이 없거나 24시간이 지났으면 만료 — loginAt 이 없는 예전 토큰도 만료로 본다 */
export function isLoginExpired(loginAt: unknown, now = Date.now()): boolean {
  return typeof loginAt !== "number" || now - loginAt >= SESSION_MAX_AGE_SEC * 1000;
}

/**
 * 새 로그인이면 로그인 시각을 찍고, 만료된 토큰이면 null(→ Auth.js 가 세션 쿠키를 지운다).
 * 미들웨어와 서버(auth()) 의 jwt 콜백이 같이 쓴다.
 */
export function applyLoginWindow(token: JWT, isNewLogin: boolean): JWT | null {
  if (isNewLogin) token.loginAt = Date.now();
  return isLoginExpired(token.loginAt) ? null : token;
}

/** Auth.js 세션 쿠키 이름 (https 는 __Secure- 접두, 큰 토큰은 .0 .1 로 쪼개짐) */
const SESSION_COOKIE_RE = /^(__Secure-)?authjs\.session-token(\.\d+)?$/;

export const authConfig = {
  pages: { signIn: "/login" },
  // 세션 쿠키·JWT 수명도 24시간 (요청마다 재발급되지만 loginAt 기준 절대 만료가 우선)
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SEC },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname, search } = request.nextUrl;
      if (PUBLIC_PATHS.includes(pathname)) return true;
      if (auth?.user) return true;
      // 세션 쿠키는 있는데 세션이 없다 = 24시간이 지나 만료(또는 깨진 토큰) → 이유를 알려 주며 로그인으로
      const hadSession = request.cookies.getAll().some((c) => SESSION_COOKIE_RE.test(c.name));
      if (!hadSession) return false; // 기본 동작: /login?callbackUrl=...
      const url = new URL("/login", request.nextUrl);
      url.searchParams.set("error", "expired");
      url.searchParams.set("callbackUrl", `${pathname}${search}`);
      return Response.redirect(url);
    },
    jwt({ token, user }) {
      return applyLoginWindow(token, !!user);
    },
  },
} satisfies NextAuthConfig;
