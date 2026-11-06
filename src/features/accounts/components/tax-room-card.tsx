import { Money } from "@/components/common/money";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { IsaRoom, PensionRoom, TaxYearRule } from "@/lib/finance/tax-accounts";
import type { TaxRoom } from "../tax";

/** 막대 너비(%) — 0~100으로 자른다 */
const pct = (num: number, den: number) => (den > 0 ? Math.min(100, Math.max(0, (num / den) * 100)) : 0);

function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const p = pct(value, max);
  return (
    <div className="h-2 rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-2 rounded-full" style={{ width: `${p}%`, background: "var(--brand)" }} />
    </div>
  );
}

function PensionLine({ p, rule }: { p: PensionRoom; rule: TaxYearRule }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">연금저축 + IRP</span>
        <span className="text-xs text-muted-foreground tabular">
          <Money value={p.credited} compact /> / <Money value={rule.pensionTotalCap} compact />
        </span>
      </div>
      <Meter value={p.credited} max={rule.pensionTotalCap} label="연금 세액공제 한도 사용" />
      {p.room > 0 ? (
        <p className="text-xs text-muted-foreground">
          남은 <Money value={p.room} compact className="font-medium text-foreground" />을 채우면 연말정산에서{" "}
          <Money value={p.roomRefund[0]} compact className="font-medium text-foreground" />~
          <Money value={p.roomRefund[1]} compact className="font-medium text-foreground" /> 더 돌려받아요.
          {p.irpOnly ? " 연금저축은 한도를 다 채워서 남은 한도는 IRP로 채울 수 있어요." : ""}
        </p>
      ) : (
        <p className="text-xs text-good">올해 공제 한도를 다 채웠어요.</p>
      )}
      {p.credited > 0 ? (
        <p className="text-xs text-muted-foreground">
          지금까지 넣은 돈으로 <Money value={p.creditedRefund[0]} compact />~<Money value={p.creditedRefund[1]} compact /> 돌려받아요.
        </p>
      ) : null}
    </div>
  );
}

function IsaLine({ i, rule }: { i: IsaRoom; rule: TaxYearRule }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">ISA</span>
        <span className="text-xs text-muted-foreground tabular">
          <Money value={i.paid} compact /> / 연 <Money value={rule.isaAnnualCap} compact />
        </span>
      </div>
      <Meter value={i.paid} max={rule.isaAnnualCap} label="ISA 연간 납입 한도 사용" />
      <p className="text-xs text-muted-foreground">
        {i.room > 0 ? (
          <>
            올해 <Money value={i.room} compact className="font-medium text-foreground" /> 더 넣을 수 있어요. 못 채운 한도는 다음 해로 넘어가요.
          </>
        ) : (
          "올해 납입 한도를 다 채웠어요."
        )}
      </p>
    </div>
  );
}

/**
 * 자산 화면 — 올해 절세 한도. 세제 혜택 계좌별 올해 납입액과 남은 한도, 채우면 돌려받는 세액 (참고용 계산).
 * 상품을 권하지 않고 계좌 종류별 한도만 보여 준다.
 */
export function TaxRoomCard({ room, showOwner }: { room: TaxRoom; showOwner: boolean }) {
  const { rule } = room;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{room.year}년 절세 한도</CardTitle>
        <CardDescription>12월 31일까지 {room.daysLeft}일 · 올해 가계부에 기록한 납입 기준</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-5 md:grid-cols-2">
          {room.rows.map((r) => (
            <section key={r.ownerUserId ?? "none"} className="grid content-start gap-4" aria-label={`${r.ownerLabel} 절세 한도`}>
              {showOwner ? <h3 className="text-sm font-semibold">{r.ownerLabel}</h3> : null}
              {r.pension ? <PensionLine p={r.pension} rule={rule} /> : null}
              {r.isa ? <IsaLine i={r.isa} rule={rule} /> : null}
            </section>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          참고용 계산이에요. 세액공제율은 총급여 {Math.round(rule.highRateMaxSalary / 1e4).toLocaleString("ko-KR")}만원 이하{" "}
          {(rule.creditRateHigh * 100).toFixed(1)}%, 초과 {(rule.creditRateLow * 100).toFixed(1)}%(지방소득세 포함)로 계산했고, 실제 공제는 소득과 가입 조건에 따라 달라요.
          {room.assumed ? ` ${room.year}년 기준이 아직 없어 ${rule.year}년 한도로 계산했어요.` : ""}
        </p>
      </CardContent>
    </Card>
  );
}
