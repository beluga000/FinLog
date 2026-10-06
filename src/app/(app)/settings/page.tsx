import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CategoryEditor,
  HouseholdSettingsForm,
  InvitePanel,
  JoinPanel,
  ThemeSelect,
} from "@/features/household/components/settings-forms";
import { getCategories } from "@/features/ledger/queries";
import { requireHousehold } from "@/lib/db/context";
import { prisma } from "@/lib/db/prisma";

export const metadata = { title: "설정" };

export default async function SettingsPage() {
  const ctx = await requireHousehold();
  const [categories, invite] = await Promise.all([
    getCategories(ctx),
    prisma.householdInvite.findFirst({
      where: { householdId: ctx.householdId, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: "desc" },
    }),
  ]);
  const expenseParents = categories
    .filter((c) => c.txType === "EXPENSE" && !c.parentId)
    .map((p) => ({ ...p, children: categories.filter((c) => c.parentId === p.id) }));

  return (
    <div className="grid gap-5">
      <PageHeader title="설정" />

      <Card>
        <CardHeader>
          <CardTitle>가구</CardTitle>
          <CardDescription>{ctx.isCouple ? "부부 모드" : "개인 모드"} · 구성원 {ctx.members.length}명</CardDescription>
        </CardHeader>
        <CardContent>
          <HouseholdSettingsForm initial={ctx.household} canEdit={ctx.role === "OWNER"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>구성원</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ul className="grid gap-2">
            {ctx.members.map((m) => (
              <li key={m.id} className="flex items-center gap-2 text-sm">
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
                연결 후에도 내가 &lsquo;비공개&rsquo;로 둔 계좌·거래는 배우자에게 보이지 않아요.
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
          <CardTitle>지출 카테고리</CardTitle>
          <CardDescription>필수(Needs) / 선택(Wants) 분류가 50/30/20 비교에 쓰여요.</CardDescription>
        </CardHeader>
        <CardContent>
          <CategoryEditor parents={expenseParents} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>화면</CardTitle>
        </CardHeader>
        <CardContent className="max-w-xs">
          <ThemeSelect />
        </CardContent>
      </Card>
    </div>
  );
}
