import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { auth } from "@/lib/auth";

export default async function Landing() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-8 px-6 py-16">
      <div className="grid gap-3">
        <p className="text-sm font-semibold text-muted-foreground">FINLOG</p>
        <h1 className="text-3xl leading-tight font-black tracking-tight md:text-4xl">
          기록을 넘어,
          <br />
          N년 뒤 목표 자산까지.
        </h1>
        <p className="text-muted-foreground">
          부부가 함께 쓰는 가계부. 각자의 용돈은 지키고, 우리 돈의 흐름은 함께 보고, 목표까지 매달 얼마가 필요한지 계산해 드려요.
        </p>
      </div>
      <ul className="grid gap-2 text-sm">
        <li>· 카드값·저축 이체가 지출로 두 번 잡히지 않는 계좌 기반 가계부</li>
        <li>· 공유 / 합계만 / 비공개 — 항목별로 배우자에게 보이는 범위 선택</li>
        <li>· 목표 금액·날짜만 정하면 월 필요 저축액과 대안을 자동 계산</li>
      </ul>
      <div className="flex gap-2">
        <Link href="/signup" className={buttonVariants({ size: "lg" })}>
          시작하기
        </Link>
        <Link href="/login" className={buttonVariants({ size: "lg", variant: "outline" })}>
          로그인
        </Link>
      </div>
    </main>
  );
}
