import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { TrashList } from "@/features/ledger/components/trash-list";
import { getDeletedTransactions, TRASH_DAYS } from "@/features/ledger/queries";
import { requireHousehold } from "@/lib/db/context";

export const metadata = { title: "최근 지운 기록" };

export default async function TrashPage() {
  const ctx = await requireHousehold();
  const now = new Date();
  const rows = await getDeletedTransactions(ctx, now);
  return (
    <div className="grid gap-5">
      <Link href="/settings" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> 설정
      </Link>
      <PageHeader
        title="최근 지운 기록"
        description={`지운 기록은 ${TRASH_DAYS}일 동안 여기 남아 있다가 완전히 지워져요.${ctx.isCouple ? " 배우자가 지운 공유 기록도 되살릴 수 있어요." : ""}`}
      />
      <TrashList rows={rows} trashDays={TRASH_DAYS} now={now.getTime()} />
    </div>
  );
}
