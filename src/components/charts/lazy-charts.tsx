"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { CashflowTrendChart as CashflowType, NetWorthChart as NetWorthType } from "@/features/dashboard/components/charts";
import type { GoalHistoryChart as GoalHistoryType } from "@/features/goals/components/goal-history";
import type { GoalProjectionChart as GoalProjectionType } from "@/features/goals/components/goal-chart";

/*
 * 차트 라이브러리(recharts)는 크고, 서버에서 그려도 크기 0으로 나와 이득이 없다.
 * 그래서 차트만 브라우저에서 따로 받아 그리고, 그동안 같은 높이의 자리만 잡아 둔다 —
 * 숫자·카드는 차트 코드를 기다리지 않고 먼저 보인다.
 */

const placeholder = (className: string) => {
  const Loading = () => <Skeleton className={className} aria-hidden />;
  return Loading;
};

const CashflowImpl = dynamic(() => import("@/features/dashboard/components/charts").then((m) => m.CashflowTrendChart), {
  ssr: false,
  loading: placeholder("h-64 w-full"),
});
const NetWorthImpl = dynamic(() => import("@/features/dashboard/components/charts").then((m) => m.NetWorthChart), {
  ssr: false,
  loading: placeholder("h-full w-full"),
});
const GoalHistoryImpl = dynamic(() => import("@/features/goals/components/goal-history").then((m) => m.GoalHistoryChart), {
  ssr: false,
  loading: placeholder("h-64 w-full"),
});
const GoalProjectionImpl = dynamic(() => import("@/features/goals/components/goal-chart").then((m) => m.GoalProjectionChart), {
  ssr: false,
  loading: placeholder("h-68 w-full"),
});

export function CashflowTrendChart(props: ComponentProps<typeof CashflowType>) {
  return <CashflowImpl {...props} />;
}

export function NetWorthChart(props: ComponentProps<typeof NetWorthType>) {
  // 높이가 props 로 정해지므로 바깥에서 자리를 잡는다
  return (
    <div className="grid" style={{ minHeight: props.height ?? 200 }}>
      <NetWorthImpl {...props} />
    </div>
  );
}

export function GoalHistoryChart(props: ComponentProps<typeof GoalHistoryType>) {
  return <GoalHistoryImpl {...props} />;
}

export function GoalProjectionChart(props: ComponentProps<typeof GoalProjectionType>) {
  return <GoalProjectionImpl {...props} />;
}
