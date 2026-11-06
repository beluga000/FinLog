import "server-only";
import { getAccounts } from "@/features/ledger/queries";
import type { HouseholdContext } from "@/lib/db/context";
import { prisma, toDbDate } from "@/lib/db/prisma";
import {
  isTaxWrapper,
  summarizeTaxRoom,
  taxRuleFor,
  type IsaRoom,
  type PensionRoom,
  type TaxWrapper,
  type TaxYearRule,
} from "@/lib/finance/tax-accounts";
import type { DateStr } from "@/lib/finance/types";
import { txAccess } from "@/lib/finance/visibility";

type Ctx = Pick<HouseholdContext, "householdId" | "userId" | "user" | "partner" | "isCouple">;

export interface TaxRoomRow {
  /** 명의 — 한도는 사람마다 따로 */
  ownerUserId: string | null;
  ownerLabel: string;
  pension: PensionRoom | null;
  isa: IsaRoom | null;
}

export interface TaxRoom {
  year: number;
  rule: TaxYearRule;
  /** 올해 규칙이 아직 없어 이전 해 값으로 계산했는지 */
  assumed: boolean;
  /** 12월 31일까지 남은 날 (오늘 포함) */
  daysLeft: number;
  rows: TaxRoomRow[];
}

/**
 * 올해 절세 한도 — 세제 혜택 계좌(연금저축·IRP·ISA)로 올해 들어간 저축·이체를 명의별로 합친다.
 * 가계부에 기록한 납입만 센다 (계좌를 만들 때 넣은 시작 잔액·평가이익은 납입이 아니다).
 * 보이는 거래만 — 배우자 비공개 계좌·거래는 빠진다. 세제 혜택 계좌가 없으면 null.
 */
export async function getTaxRoom(ctx: Ctx, opts: { today: DateStr }): Promise<TaxRoom | null> {
  const accounts = (await getAccounts(ctx, "us")).filter((a) => isTaxWrapper(a.taxWrapper));
  if (!accounts.length) return null;
  const year = Number(opts.today.slice(0, 4));
  const { rule, assumed } = taxRuleFor(year);
  const wrapperOf = new Map(accounts.map((a) => [a.id, a.taxWrapper as TaxWrapper]));
  const ownerOf = new Map(accounts.map((a) => [a.id, a.ownerUserId]));

  const txs = await prisma.transaction.findMany({
    where: {
      householdId: ctx.householdId,
      deletedAt: null,
      type: { in: ["SAVE_INVEST", "TRANSFER"] },
      toAccountId: { in: accounts.map((a) => a.id) },
      date: { gte: toDbDate(`${year}-01-01`), lt: toDbDate(`${year + 1}-01-01`) },
    },
    select: { amount: true, toAccountId: true, createdByUserId: true, visibility: true },
  });
  const paid = txs
    .filter((t) => txAccess(t, ctx.userId, "us") !== "none")
    .map((t) => ({ accountId: t.toAccountId!, wrapper: wrapperOf.get(t.toAccountId!)!, amount: Number(t.amount) }));

  const owners = [...new Set(accounts.map((a) => a.ownerUserId))].sort((a, b) => rank(ctx, a) - rank(ctx, b));
  const rows = owners.map((owner) => {
    const mine = accounts.filter((a) => a.ownerUserId === owner);
    const ids = new Set(mine.map((a) => a.id));
    const room = summarizeTaxRoom(
      paid.filter((p) => ids.has(p.accountId) && ownerOf.get(p.accountId) === owner),
      rule,
      {
        pension: mine.some((a) => a.taxWrapper === "PENSION_SAVINGS" || a.taxWrapper === "IRP"),
        isa: mine.some((a) => a.taxWrapper === "ISA"),
      },
    );
    return { ownerUserId: owner, ownerLabel: ownerLabel(ctx, owner), ...room };
  });

  const msLeft = Date.parse(`${year + 1}-01-01T00:00:00Z`) - Date.parse(`${opts.today}T00:00:00Z`);
  return { year, rule, assumed, daysLeft: Math.round(msLeft / 86_400_000), rows };
}

function rank(ctx: Ctx, owner: string | null) {
  return owner === ctx.userId ? 0 : owner === null ? 2 : 1;
}

function ownerLabel(ctx: Ctx, owner: string | null) {
  if (owner === ctx.userId) return ctx.user.name ?? "나";
  if (owner && owner === ctx.partner?.id) return ctx.partner.name ?? "배우자";
  return "명의 미지정";
}
