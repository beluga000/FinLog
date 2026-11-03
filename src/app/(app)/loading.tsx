import { Skeleton } from "@/components/ui/skeleton";

// 탭 이동 시 서버 응답을 기다리는 동안 즉시 보여줄 뼈대 화면.
// 레이아웃(헤더·탭바)은 유지되고 본문 자리만 바뀐다.
export default function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="불러오는 중">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
