import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCoupleSharing } from "@/features/household/couple";
import { SharingList } from "@/features/household/components/couple-settings";
import { InvitePanel, JoinPanel } from "@/features/household/components/settings-forms";
import { requireHousehold } from "@/lib/db/context";
import { prisma } from "@/lib/db/prisma";
import { ACCOUNT_TYPE_LABEL, VISIBILITY_HINT, VISIBILITY_LABEL } from "@/lib/labels";

export const metadata = { title: "부부 설정" };

const LEVELS = ["SHARED", "SUMMARY_ONLY", "PRIVATE"] as const;

export default async function CoupleSettingsPage() {
  const ctx = await requireHousehold();
  const [sharing, invite] = await Promise.all([
    ctx.isCouple ? getCoupleSharing(ctx) : null,
    !ctx.isCouple && ctx.role === "OWNER"
      ? prisma.householdInvite.findFirst({
          where: { householdId: ctx.householdId, usedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { expiresAt: "desc" },
        })
      : null,
  ]);
  const partnerName = ctx.partner?.name ?? "배우자";
  const txTotal = sharing ? LEVELS.reduce((s, v) => s + sharing.myTxByVisibility[v], 0) : 0;

  return (
    <div className="grid gap-5">
      <Link href="/settings" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> 설정
      </Link>
      <PageHeader title="부부 설정" description="배우자와 가계부를 연결하고, 무엇을 얼마나 보여줄지 정해요." />

      <Card>
        <CardHeader>
          <CardTitle>연결</CardTitle>
          <CardDescription>
            {ctx.isCouple ? `${partnerName}님과 한 가계부를 쓰고 있어요. 각자 자기 계정으로 들어와 같은 가계부를 봐요.` : "아직 혼자 쓰고 있어요."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ul className="grid gap-2">
            {ctx.members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{m.name}</span>
                <span className="text-muted-foreground">{m.email}</span>
                {m.role === "OWNER" ? <Badge variant="secondary">관리자</Badge> : null}
                {m.id === ctx.userId ? <Badge variant="outline">나</Badge> : null}
              </li>
            ))}
          </ul>
          {!ctx.isCouple && ctx.role === "OWNER" ? (
            <div className="grid gap-2 border-t pt-4">
              <h3 className="text-sm font-semibold">배우자 초대</h3>
              <p className="text-xs text-muted-foreground">
                코드를 받은 배우자가 자기 계정으로 가입해 입력하면 연결돼요. 연결 후에도 내가 &lsquo;비공개&rsquo;로 둔 계좌·거래는 보이지 않아요.
              </p>
              <InvitePanel activeInvite={invite ? { code: invite.code, expiresAt: invite.expiresAt.toISOString() } : null} />
            </div>
          ) : null}
          {!ctx.isCouple ? (
            <div className="grid gap-2 border-t pt-4">
              <h3 className="text-sm font-semibold">배우자 가구에 참여</h3>
              <JoinPanel />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{partnerName}님에게 보이는 범위</CardTitle>
          <CardDescription>계좌마다 기본 공개범위를 정하면, 그 계좌로 기록하는 거래에 자동으로 적용돼요. 거래마다 따로 바꿀 수도 있어요.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <dl className="grid gap-2 sm:grid-cols-3">
            {LEVELS.map((v) => (
              <div key={v} className="rounded-lg bg-muted/60 px-3 py-2">
                <dt className="flex items-baseline justify-between gap-2 text-sm font-semibold">
                  {VISIBILITY_LABEL[v]}
                  {sharing ? <span className="text-xs font-normal text-muted-foreground tabular">내 기록 {sharing.myTxByVisibility[v]}건</span> : null}
                </dt>
                <dd className="text-xs text-muted-foreground">{VISIBILITY_HINT[v]}</dd>
              </div>
            ))}
          </dl>

          {!sharing ? (
            <p className="text-sm text-muted-foreground">배우자와 연결하면 여기서 계좌별 공개범위를 정할 수 있어요.</p>
          ) : (
            <>
              <section className="grid gap-2">
                <h3 className="px-1 text-sm font-semibold">내 계좌와 공동 계좌</h3>
                {sharing.editable.length ? (
                  <SharingList
                    partnerName={partnerName}
                    rows={sharing.editable.map((a) => ({
                      id: a.id,
                      name: a.name,
                      type: a.type,
                      joint: a.ownerUserId === null,
                      visibility: a.defaultVisibility,
                      myTxCount: a.myTxCount,
                      customTxCount: a.customTxCount,
                      registeredByPartner: a.registeredByPartner,
                    }))}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">아직 내 명의나 공동 계좌가 없어요.</p>
                )}
                <p className="px-1 text-xs text-muted-foreground">
                  공동 계좌는 둘 다 쓰는 돈이라 비공개로 둘 수 없어요. 비공개 거래는 &lsquo;우리&rsquo; 합계에서도 빠져요.
                  {txTotal ? ` 지금까지 내가 기록한 거래 ${txTotal}건 기준이에요.` : ""}
                </p>
              </section>

              <section className="grid gap-2">
                <h3 className="px-1 text-sm font-semibold">{partnerName}님이 보여주는 계좌</h3>
                {sharing.partnerAccounts.length ? (
                  <ul className="divide-y rounded-xl border">
                    {sharing.partnerAccounts.map((a) => (
                      <li key={a.id} className="flex items-center gap-2 px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{a.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{ACCOUNT_TYPE_LABEL[a.type]}</div>
                        </div>
                        <Badge variant="outline">{VISIBILITY_LABEL[a.defaultVisibility]}</Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-1 text-sm text-muted-foreground">{partnerName}님 명의 계좌 중 공개된 것이 없어요.</p>
                )}
                <p className="px-1 text-xs text-muted-foreground">
                  {partnerName}님 계좌의 공개범위는 {partnerName}님이 정해요. 비공개 계좌는 여기에도 나오지 않아요.
                </p>
              </section>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
