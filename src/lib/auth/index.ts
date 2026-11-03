import bcrypt from "bcryptjs";
import NextAuth, { CredentialsSignin } from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Kakao from "next-auth/providers/kakao";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { clientIp, consumeRateLimit, LIMITS, resetRateLimit } from "@/lib/security/rate-limit";
import { isAdminEmail } from "./admin";
import { authConfig } from "./config";

/** 제공자 프로필에서 이메일 인증 여부 확인 (Google: email_verified, Kakao: kakao_account.is_email_verified·is_email_valid) */
export function isVerifiedEmail(provider: string, profile: unknown): boolean {
  const p = (profile ?? {}) as {
    email_verified?: unknown;
    kakao_account?: { is_email_verified?: unknown; is_email_valid?: unknown };
  };
  if (provider === "google") return p.email_verified === true;
  if (provider === "kakao") return p.kakao_account?.is_email_verified === true && p.kakao_account?.is_email_valid === true;
  return false;
}

/** 시도 횟수 초과 — login 액션이 code 로 구분해 안내한다 */
export class RateLimited extends CredentialsSignin {
  code = "rate_limited";
}

/** 비밀번호는 맞지만 관리자 승인 전 */
export class PendingApproval extends CredentialsSignin {
  code = "pending_approval";
}

/**
 * OAuth 로그인 → 내부 사용자 연결/생성 (어댑터 없이 JWT 세션). signIn·jwt 콜백이 같이 쓴다(upsert 라 두 번 불려도 같다).
 * 제공자가 인증했다고 확인한 이메일만 기존 계정에 연결한다 — 미인증 이메일로 남의 계정을 차지하는 것 방지.
 * 미인증이면 제공자 계정 고유 주소로 별도 사용자를 만든다. 새 사용자는 관리자 승인 대기로 만든다.
 */
async function upsertOAuthUser(
  account: { provider: string; providerAccountId: string },
  user: { email?: string | null; name?: string | null },
  profile: unknown,
) {
  const verified = isVerifiedEmail(account.provider, profile);
  const email = (verified && user.email ? user.email : `${account.provider}_${account.providerAccountId}@oauth.finlog`).toLowerCase();
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: user.name ?? "사용자", approvedAt: verified && isAdminEmail(email) ? new Date() : null },
  });
}

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

const providers: Provider[] = [
  Credentials({
    credentials: { email: {}, password: {} },
    async authorize(raw, request) {
      const parsed = credentialsSchema.safeParse(raw);
      if (!parsed.success) return null;
      const email = parsed.data.email.toLowerCase();
      // 비밀번호 대입 방지: 계정별 + IP별 제한 (/api/auth/callback 직접 호출도 여기를 지난다)
      const emailKey = `login:email:${email}`;
      const okEmail = await consumeRateLimit(emailKey, LIMITS.loginEmail.limit, LIMITS.loginEmail.windowMs);
      const okIp = await consumeRateLimit(`login:ip:${clientIp(request.headers)}`, LIMITS.loginIp.limit, LIMITS.loginIp.windowMs);
      if (!okEmail || !okIp) throw new RateLimited();

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user?.passwordHash) return null;
      const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
      if (!ok) return null;
      await resetRateLimit(emailKey);
      // 승인 대기 여부는 비밀번호가 맞은 뒤에만 알려 준다 (남의 가입 상태를 떠보지 못하게)
      if (!user.approvedAt) throw new PendingApproval();
      return { id: user.id, email: user.email, name: user.name };
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
    async signIn({ user, account, profile }) {
      if (!account || account.provider === "credentials") return true; // 비밀번호 로그인은 authorize 에서 확인
      const dbUser = await upsertOAuthUser(account, user, profile);
      return dbUser.approvedAt ? true : "/login?error=pending";
    },
    async jwt({ token, user, account, profile }) {
      if (account && user) {
        if (account.provider === "credentials") {
          token.uid = user.id;
        } else {
          const dbUser = await upsertOAuthUser(account, user, profile);
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
