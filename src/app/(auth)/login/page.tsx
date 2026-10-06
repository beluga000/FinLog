import { LoginForm, SocialButtons } from "@/features/household/components/auth-forms";
import { socialProviders } from "@/lib/auth";

export const metadata = { title: "로그인" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams;
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-bold">로그인</h1>
      <SocialButtons providers={socialProviders} />
      <LoginForm callbackUrl={callbackUrl} />
    </div>
  );
}
