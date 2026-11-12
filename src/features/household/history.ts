import "server-only";
import type { HouseholdContext } from "@/lib/db/context";
import { prisma } from "@/lib/db/prisma";

/**
 * 설정 > 변경 이력 — 가구 감사 로그(AuditLog)를 사람이 읽을 문장으로.
 * 바뀐 값(diff)은 그대로 보여 주지 않는다 (비공개 계좌·금액이 섞여 있을 수 있다).
 * 배우자의 비공개 계좌·비공개 정기 거래에 관한 기록은 배우자 본인에게만 보인다.
 */

export interface HistoryRow {
  id: string;
  at: string;
  actor: string;
  text: string;
}

const LIMIT = 100;

const ACTION_TEXT: Record<string, (target: string) => string> = {
  ONBOARDING_COMPLETE: () => "가계부를 시작했어요",
  MEMBER_JOIN: () => "가구에 들어왔어요",
  MEMBER_LEAVE: () => "가구에서 나갔어요",
  MEMBER_DELETE_SELF: () => "탈퇴했어요",
  INVITE_CREATE: () => "배우자 초대 코드를 만들었어요",
  HOUSEHOLD_SETTINGS: () => "가구 설정(이름·월 시작일·비상금)을 바꿨어요",
  ACCOUNT_CREATE_FOR_OTHER: (t) => `${t}을(를) 대신 등록했어요`,
  ACCOUNT_UPDATE: (t) => `${t} 정보를 바꿨어요`,
  ACCOUNT_ARCHIVE: (t) => `${t}을(를) 보관했어요`,
  ACCOUNT_RESTORE: (t) => `${t}을(를) 다시 꺼냈어요`,
  ACCOUNT_DELETE: (t) => `${t}을(를) 지웠어요`,
  ACCOUNT_VISIBILITY: (t) => `${t} 공개범위를 바꿨어요`,
  RECURRING_UPDATE: (t) => `정기 거래 ${t}을(를) 바꿨어요`,
  CATEGORY_RENAME: (t) => `카테고리 이름을 바꿨어요 (${t})`,
  CATEGORY_DELETE: (t) => `카테고리 ${t}`,
  SETTLEMENT_DONE: (t) => `${t} 정산을 마쳤어요`,
  SETTLEMENT_UNDO: (t) => `${t} 정산 완료를 취소했어요`,
  SPLIT_RULE_UPDATE: () => "정산 나누는 방식을 바꿨어요",
  ADMIN_USER_DELETE: () => "서비스 관리자가 구성원 계정을 삭제했어요",
  ADMIN_OWNER_TRANSFER: () => "서비스 관리자가 가구 관리자를 바꿨어요",
};

const str = (v: unknown) => (typeof v === "string" ? v : null);

export async function getHouseholdHistory(ctx: Pick<HouseholdContext, "householdId" | "userId" | "members">): Promise<HistoryRow[]> {
  const logs = await prisma.auditLog.findMany({
    where: { householdId: ctx.householdId },
    orderBy: { at: "desc" },
    take: LIMIT,
  });
  const ids = (entity: string) => [...new Set(logs.filter((l) => l.entity === entity).map((l) => l.entityId))];
  const [accounts, rules, actors] = await Promise.all([
    prisma.account.findMany({
      where: { householdId: ctx.householdId, id: { in: ids("Account") } },
      select: { id: true, name: true, ownerUserId: true, defaultVisibility: true },
    }),
    prisma.recurringRule.findMany({ where: { householdId: ctx.householdId, id: { in: ids("RecurringRule") } }, select: { id: true, name: true, template: true } }),
    prisma.user.findMany({ where: { id: { in: [...new Set(logs.map((l) => l.userId))] } }, select: { id: true, name: true } }),
  ]);
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const ruleById = new Map(rules.map((r) => [r.id, r]));
  const memberIds = new Set(ctx.members.map((m) => m.id));
  const nameOf = new Map(actors.map((u) => [u.id, u.name]));

  const rows: HistoryRow[] = [];
  for (const l of logs) {
    const mine = l.userId === ctx.userId;
    const diff = (l.diff ?? {}) as Record<string, unknown>;
    let target = "";

    if (l.entity === "Account") {
      const a = accountById.get(l.entityId);
      if (a) {
        // 배우자 명의 비공개 계좌에 관한 기록은 숨긴다
        if (a.defaultVisibility === "PRIVATE" && a.ownerUserId !== ctx.userId) continue;
        target = `계좌 '${a.name}'`;
      } else {
        // 지워진 계좌: 이름은 지운 사람에게만
        target = mine && str(diff.name) ? `계좌 '${str(diff.name)}'` : "계좌";
      }
    } else if (l.entity === "RecurringRule") {
      const r = ruleById.get(l.entityId);
      const priv = (r?.template as { visibility?: string } | undefined)?.visibility === "PRIVATE";
      if (priv && !mine) continue;
      target = r ? `'${r.name}'` : "";
    } else if (l.action === "CATEGORY_RENAME") {
      target = `${str(diff.before) ?? ""} → ${str(diff.after) ?? ""}`;
    } else if (l.action === "CATEGORY_DELETE") {
      target = `'${str(diff.name) ?? ""}'을(를) '${str(diff.movedTo) ?? ""}'(으)로 합쳤어요`;
    } else if (l.entity === "Settlement") {
      target = str(diff.month) ? `${Number(str(diff.month)!.slice(5, 7))}월` : "";
    }

    const describe = ACTION_TEXT[l.action];
    const admin = l.action.startsWith("ADMIN_");
    rows.push({
      id: l.id,
      at: l.at.toISOString(),
      actor: admin ? "관리자" : mine ? "나" : memberIds.has(l.userId) ? nameOf.get(l.userId) ?? "배우자" : nameOf.get(l.userId) ?? "나간 구성원",
      text: describe ? describe(target) : l.action,
    });
  }
  return rows;
}
