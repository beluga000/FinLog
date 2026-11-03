import { LoginForm, SocialButtons } from "@/features/household/components/auth-forms";
import { socialProviders } from "@/lib/auth";
import { LOGIN_NOTICE } from "@/lib/auth/messages";

export const metadata = { title: "로그인" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-bold">로그인</h1>
      {/* ?error=pending(승인 대기·취소) · expired(24시간 만료) · revoked(모든 기기 로그아웃) */}
      {error && LOGIN_NOTICE[error] ? (
        <p role="status" className="rounded-lg bg-muted px-4 py-3 text-sm">
          {LOGIN_NOTICE[error]}
        </p>
      ) : null}
      <SocialButtons providers={socialProviders} callbackUrl={callbackUrl} />
      <LoginForm callbackUrl={callbackUrl} />
    </div>
  );
}
