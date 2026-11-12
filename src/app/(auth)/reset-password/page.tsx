import Link from "next/link";
import { ResetPasswordForm } from "@/features/account/components/account-forms";
import { isResetTokenShape } from "@/features/account/reset-token";

export const metadata = { title: "비밀번호 재설정" };

/** 관리자가 발급한 1회용 링크로 새 비밀번호 정하기 (로그인 전) */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-bold">비밀번호 재설정</h1>
      {isResetTokenShape(token) ? (
        <ResetPasswordForm token={token} />
      ) : (
        <p className="rounded-lg bg-muted px-4 py-3 text-sm">링크가 올바르지 않아요. 관리자에게 받은 링크를 그대로 열어 주세요.</p>
      )}
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-foreground underline">로그인으로</Link>
      </p>
    </div>
  );
}
