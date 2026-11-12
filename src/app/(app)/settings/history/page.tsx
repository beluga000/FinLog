import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { getHouseholdHistory } from "@/features/household/history";
import { requireHousehold } from "@/lib/db/context";

export const metadata = { title: "변경 이력" };

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });

export default async function HistoryPage() {
  const ctx = await requireHousehold();
  const rows = await getHouseholdHistory(ctx);
  return (
    <div className="grid gap-5">
      <Link href="/settings" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> 설정
      </Link>
      <PageHeader
        title="변경 이력"
        description={ctx.isCouple ? "계좌·설정·카테고리를 누가 언제 바꿨는지 최근 100건까지 보여요. 배우자의 비공개 계좌에 관한 기록은 보이지 않아요." : "계좌·설정·카테고리를 바꾼 기록이에요. 최근 100건까지 보여요."}
      />
      {rows.length ? (
        <ol className="divide-y rounded-xl border bg-card">
          {rows.map((r) => (
            <li key={r.id} className="grid gap-0.5 px-3 py-2.5">
              <div className="text-sm">
                <span className="font-medium">{r.actor}</span> · {r.text}
              </div>
              <time dateTime={r.at} className="text-xs text-muted-foreground tabular">
                {fmt(r.at)}
              </time>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-xl border py-12 text-center text-sm text-muted-foreground">아직 바뀐 기록이 없어요.</p>
      )}
    </div>
  );
}
