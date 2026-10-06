import type { NextAuthConfig } from "next-auth";

/** Edge(미들웨어)에서도 import 가능한 설정 — Prisma·bcrypt 금지 */
export const PUBLIC_PATHS = ["/", "/login", "/signup"];

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (PUBLIC_PATHS.includes(pathname)) return true;
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;
