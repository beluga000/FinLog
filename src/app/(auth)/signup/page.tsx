import { SignupForm, SocialButtons } from "@/features/household/components/auth-forms";
import { socialProviders } from "@/lib/auth";

export const metadata = { title: "가입하기" };

export default function SignupPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold">가입하기</h1>
        <p className="mt-1 text-sm text-muted-foreground">실명·주민번호·계좌번호는 받지 않아요.</p>
      </div>
      <SocialButtons providers={socialProviders} />
      <SignupForm />
    </div>
  );
}
