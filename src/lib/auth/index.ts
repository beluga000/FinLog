import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Kakao from "next-auth/providers/kakao";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { authConfig } from "./config";

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

const providers: Provider[] = [
  Credentials({
    credentials: { email: {}, password: {} },
    async authorize(raw) {
      const parsed = credentialsSchema.safeParse(raw);
      if (!parsed.success) return null;
      const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
      if (!user?.passwordHash) return null;
      const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
      return ok ? { id: user.id, email: user.email, name: user.name } : null;
    },
  }),
];

// 소셜 로그인은 환경변수가 있을 때만 활성화
if (process.env.AUTH_KAKAO_ID && process.env.AUTH_KAKAO_SECRET) providers.push(Kakao);
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) providers.push(Google);

export const socialProviders = providers
  .map((p) => (typeof p === "function" ? p() : p))
  .filter((p) => p.id !== "credentials")
  .map((p) => ({ id: p.id, name: p.name }));

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, account }) {
      if (account && user) {
        if (account.provider === "credentials") {
          token.uid = user.id;
        } else {
          // OAuth: 이메일 기준으로 내부 사용자 연결/생성 (어댑터 없이 JWT 세션)
          const email = (user.email ?? `${account.provider}_${account.providerAccountId}@oauth.finlog`).toLowerCase();
          const dbUser = await prisma.user.upsert({
            where: { email },
            update: {},
            create: { email, name: user.name ?? "사용자" },
          });
          token.uid = dbUser.id;
          token.name = dbUser.name;
        }
      }
      return token;
    },
    session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string;
      return session;
    },
  },
});
