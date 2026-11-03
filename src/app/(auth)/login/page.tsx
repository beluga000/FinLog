import { LoginForm, SocialButtons } from "@/features/household/components/auth-forms";
import { socialProviders } from "@/lib/auth";
import { PENDING_MESSAGE } from "@/lib/auth/messages";

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
      {/* 소셜 로그인 승인 대기 · 승인 취소된 세션 → ?error=pending */}
      {error === "pending" ? (
        <p role="status" className="rounded-lg bg-muted px-4 py-3 text-sm">
          {PENDING_MESSAGE}
        </p>
      ) : null}
      <SocialButtons providers={socialProviders} />
      <LoginForm callbackUrl={callbackUrl} />
    </div>
  );
}
