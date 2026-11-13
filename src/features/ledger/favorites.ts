"use server";

import { revalidatePath } from "next/cache";
import { requireHousehold } from "@/lib/db/context";
import { prisma } from "@/lib/db/prisma";
import { todayKST } from "@/lib/finance/period";
import { TX_TYPE_META } from "@/lib/finance/tx-rules";
import type { TxType, Visibility } from "@/lib/finance/types";
import { txAccess } from "@/lib/finance/visibility";
import { createTransaction, type SpendableChange } from "./actions";
import type { ActionResult } from "./schema";

/**
 * 자주 쓰는 기록 (즐겨찾기, PROD.MD §2-5) — 기록 창 맨 위 버튼 한 번으로 오늘 날짜에 바로 기록한다.
 * 사람마다 따로 (배우자 즐겨찾기는 보이지 않는다). 만들 때는 이미 저장한 기록에서 가져온다.
 */

/** 한 사람이 둘 수 있는 즐겨찾기 수 — 기록 창 한두 줄에 들어가는 만큼 */
const FAVORITE_MAX = 8;

export interface FavoriteTemplate {
  type: TxType;
  amount: string;
  fromAccountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  merchant: string | null;
  memo: string | null;
  /** null = 계좌 기본 공개범위 (배우자 기록에서 가져왔을 때) */
  visibility: Visibility | null;
}

export interface FavoriteRow {
  id: string;
  name: string;
  type: TxType;
  amount: string;
}

function done() {
  revalidatePath("/", "layout");
}

const sameTemplate = (a: FavoriteTemplate, b: FavoriteTemplate) =>
  a.type === b.type &&
  a.amount === b.amount &&
  a.fromAccountId === b.fromAccountId &&
  a.toAccountId === b.toAccountId &&
  a.categoryId === b.categoryId &&
  (a.merchant ?? "") === (b.merchant ?? "") &&
  (a.memo ?? "") === (b.memo ?? "");

export async function getFavorites(): Promise<FavoriteRow[]> {
  const ctx = await requireHousehold();
  const rows = await prisma.txFavorite.findMany({
    where: { householdId: ctx.householdId, userId: ctx.userId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => {
    const t = r.template as unknown as FavoriteTemplate;
    return { id: r.id, name: r.name, type: t.type, amount: t.amount };
  });
}

/** 저장한 기록을 즐겨찾기로 — 같은 내용이 이미 있으면 그대로 둔다 */
export async function addFavoriteFromTransaction(txId: string): Promise<ActionResult<{ id: string; existed: boolean }>> {
  const ctx = await requireHousehold();
  if (typeof txId !== "string" || !txId) return { ok: false, error: "기록을 찾을 수 없어요." };
  const tx = await prisma.transaction.findFirst({
    where: { id: txId, householdId: ctx.householdId, deletedAt: null },
    include: { category: { select: { name: true } } },
  });
  if (!tx || txAccess(tx, ctx.userId, "us") !== "full") return { ok: false, error: "기록을 찾을 수 없어요." };
  if (tx.type === "ADJUSTMENT") return { ok: false, error: "잔액 보정은 즐겨찾기로 둘 수 없어요." };

  const template: FavoriteTemplate = {
    type: tx.type,
    amount: tx.amount.toString(),
    fromAccountId: tx.fromAccountId,
    toAccountId: tx.toAccountId,
    categoryId: tx.categoryId,
    merchant: tx.merchant,
    memo: tx.memo,
    // 배우자 기록에서 가져오면 공개 범위는 내 계좌 기본값을 따른다 (다시 기록 copyDraft 와 같다)
    visibility: tx.createdByUserId === ctx.userId ? tx.visibility : null,
  };
  const mine = await prisma.txFavorite.findMany({ where: { householdId: ctx.householdId, userId: ctx.userId } });
  const same = mine.find((f) => sameTemplate(f.template as unknown as FavoriteTemplate, template));
  if (same) return { ok: true, data: { id: same.id, existed: true } };
  if (mine.length >= FAVORITE_MAX) return { ok: false, error: `즐겨찾기는 ${FAVORITE_MAX}개까지예요. 설정에서 안 쓰는 것을 지워 주세요.` };

  const name = (tx.merchant?.trim() || tx.category?.name || TX_TYPE_META[tx.type].label).slice(0, 30);
  const created = await prisma.txFavorite.create({
    data: { householdId: ctx.householdId, userId: ctx.userId, name, template: template as object },
  });
  done();
  return { ok: true, data: { id: created.id, existed: false } };
}

/**
 * 즐겨찾기로 오늘 기록 — 저장은 createTransaction 과 같은 검증을 거친다
 * (지운 계좌·카테고리면 기록하지 않고 그 이유를 돌려준다).
 */
export async function recordFavorite(id: string): Promise<ActionResult<{ id: string; spendable: SpendableChange | null }>> {
  const ctx = await requireHousehold();
  if (typeof id !== "string" || !id) return { ok: false, error: "즐겨찾기를 찾을 수 없어요." };
  const fav = await prisma.txFavorite.findFirst({ where: { id, householdId: ctx.householdId, userId: ctx.userId } });
  if (!fav) return { ok: false, error: "즐겨찾기를 찾을 수 없어요." };
  const t = fav.template as unknown as FavoriteTemplate;
  const result = await createTransaction({
    type: t.type,
    date: todayKST(),
    amount: t.amount,
    fromAccountId: t.fromAccountId,
    toAccountId: t.toAccountId,
    categoryId: t.categoryId,
    merchant: t.merchant,
    memo: t.memo,
    visibility: t.visibility,
    isFixed: false,
    installmentMonths: null,
  });
  if (!result.ok) return { ok: false, error: `${fav.name}: ${result.error} 설정에서 지우고 다시 만들어 주세요.` };
  return result;
}

export async function deleteFavorite(id: string): Promise<ActionResult> {
  const ctx = await requireHousehold();
  const r = await prisma.txFavorite.deleteMany({ where: { id: String(id), householdId: ctx.householdId, userId: ctx.userId } });
  if (!r.count) return { ok: false, error: "즐겨찾기를 찾을 수 없어요." };
  done();
  return { ok: true };
}
