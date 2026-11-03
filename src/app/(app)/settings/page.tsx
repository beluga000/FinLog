import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CategoryEditor,
  HouseholdSettingsForm,
  ThemeSelect,
} from "@/features/household/components/settings-forms";
import { getCategories } from "@/features/ledger/queries";
import { requireHousehold } from "@/lib/db/context";

export const metadata = { title: "설정" };

export default async function SettingsPage() {
  const ctx = await requireHousehold();
  const categories = await getCategories(ctx);
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

      <Link href="/settings/couple" className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Card className="transition-colors group-hover:bg-muted/40">
          <CardContent className="flex items-center gap-3">
            <Users className="size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">부부 설정</div>
              <div className="truncate text-sm text-muted-foreground">
                {ctx.isCouple ? `${ctx.partner?.name ?? "배우자"}님과 연결됨 · 공유범위 관리` : "배우자 초대·참여, 공유범위 관리"}
              </div>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

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
