import Link from "next/link";
import { ChevronRight, History, UserRound, Users, type LucideIcon } from "lucide-react";
import { Field } from "@/components/common/field";
import { PageHeader } from "@/components/common/page-header";
import { PalettePicker } from "@/features/appearance/components/palette-picker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryEditor } from "@/features/household/components/category-editor";
import { HouseholdSettingsForm, ThemeSelect } from "@/features/household/components/settings-forms";
import { MerchantRuleList } from "@/features/ledger/components/merchant-rule-list";
import { PushToggle } from "@/features/notifications/components/push-toggle";
import { getCategories, queryMerchantRules } from "@/features/ledger/queries";
import { requireHousehold } from "@/lib/db/context";

export const metadata = { title: "설정" };

export default async function SettingsPage() {
  const ctx = await requireHousehold();
  const [categories, rules] = await Promise.all([getCategories(ctx), queryMerchantRules(ctx)]);
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
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
          <CardTitle>알림</CardTitle>
        </CardHeader>
        <CardContent>
          <PushToggle />
        </CardContent>
      </Card>

      <LinkCard
        href="/settings/couple"
        icon={Users}
        title="부부 설정"
        desc={ctx.isCouple ? `${ctx.partner?.name ?? "배우자"}님과 연결됨 · 공유범위 관리` : "배우자 초대·참여, 공유범위 관리"}
      />
      <LinkCard href="/settings/account" icon={UserRound} title="계정" desc="비밀번호 바꾸기 · 가구 나가기 · 탈퇴" />
      <LinkCard href="/settings/history" icon={History} title="변경 이력" desc="계좌·설정·카테고리를 누가 언제 바꿨는지" />

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
          <CardTitle>가맹점 규칙</CardTitle>
          <CardDescription>이 사용처는 이 카테고리로 — 우리 가구 기록 창과 캡처 가져오기에 함께 적용돼요.</CardDescription>
        </CardHeader>
        <CardContent>
          <MerchantRuleList rules={rules.map((r) => ({ id: r.id, merchant: r.merchant, categoryName: categoryName.get(r.categoryId) ?? "" }))} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>화면</CardTitle>
          <CardDescription>테마는 내 계정에만 적용돼요. 배우자는 따로 고를 수 있어요.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <PalettePicker initial={ctx.user.palette} />
          <Field label="밝기" htmlFor="theme-mode" className="max-w-xs">
            <ThemeSelect />
          </Field>
        </CardContent>
      </Card>
    </div>
  );
}

function LinkCard({ href, icon: Icon, title, desc }: { href: string; icon: LucideIcon; title: string; desc: string }) {
  return (
    <Link href={href} className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card className="transition-colors group-hover:bg-muted/40">
        <CardContent className="flex items-center gap-3">
          <Icon className="size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{title}</div>
            <div className="truncate text-sm text-muted-foreground">{desc}</div>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </CardContent>
      </Card>
    </Link>
  );
}
