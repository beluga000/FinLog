import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordForm, LeaveOrDelete } from "@/features/account/components/account-forms";
import { requireHousehold } from "@/lib/db/context";
import { prisma } from "@/lib/db/prisma";

export const metadata = { title: "계정" };

export default async function AccountSettingsPage({ searchParams }: { searchParams: Promise<{ changed?: string }> }) {
  const ctx = await requireHousehold();
  const { changed } = await searchParams;
  const u = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { passwordHash: true, createdAt: true } });
  const social = ctx.user.email.endsWith("@oauth.finlog");

  return (
    <div className="grid gap-5">
      <Link href="/settings" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> 설정
      </Link>
      <PageHeader title="계정" />

      {changed ? (
        <p role="status" className="rounded-lg bg-muted px-4 py-3 text-sm">
          비밀번호를 바꿨어요. 다른 기기에서는 새 비밀번호로 다시 로그인해 주세요.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>내 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[5rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">이름</dt>
            <dd>{ctx.user.name}</dd>
            <dt className="text-muted-foreground">이메일</dt>
            <dd className="break-all">{social ? "소셜 로그인" : ctx.user.email}</dd>
            {u ? (
              <>
                <dt className="text-muted-foreground">가입일</dt>
                <dd>{u.createdAt.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}</dd>
              </>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>비밀번호</CardTitle>
          {u?.passwordHash ? null : <CardDescription>소셜 로그인으로 가입해 비밀번호가 없어요.</CardDescription>}
        </CardHeader>
        {u?.passwordHash ? (
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{ctx.isCouple ? "가구 나가기 · 탈퇴" : "탈퇴"}</CardTitle>
          <CardDescription>누르면 지워질 것을 먼저 보여 드려요.</CardDescription>
        </CardHeader>
        <CardContent>
          <LeaveOrDelete isCouple={ctx.isCouple} />
        </CardContent>
      </Card>
    </div>
  );
}
