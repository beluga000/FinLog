/**
 * 데모 데이터: 부부 가구(민수·지영) + 계좌 + 최근 4개월 거래(6가지 유형 모두) + 정기거래 + 목표.
 * v3 온보딩을 마친 가구 모양: 월급·고정비는 모두 정기 규칙이 만든 거래, 대표 목표(priority 1) = 내 집 마련.
 * 로그인: minsu@demo.finlog / jiyoung@demo.finlog, 비밀번호 demo1234
 * 실행: npm run db:seed (기존 데모 사용자는 지우고 다시 만든다)
 */
import { PrismaClient, type TxType, type Visibility } from "../src/generated/prisma/client";
import bcrypt from "bcryptjs";
import { createHouseholdWithDefaults } from "../src/features/household/setup";
import { DEFAULT_ASSET_CLASSES } from "../src/lib/finance/portfolio";
import { addDays, todayKST, toDateStr } from "../src/lib/finance/period";

const prisma = new PrismaClient();
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function main() {
  // 자산군 가정치 (PROD.MD §3-3)
  for (const c of DEFAULT_ASSET_CLASSES) {
    await prisma.assetClassAssumption.upsert({
      where: { id: c.id },
      update: { label: c.label, expectedReturn: c.expectedReturn, volatility: c.volatility },
      create: { id: c.id, label: c.label, expectedReturn: c.expectedReturn, volatility: c.volatility, effectiveFrom: d("2026-01-01") },
    });
  }

  const emails = ["minsu@demo.finlog", "jiyoung@demo.finlog"];
  const old = await prisma.householdMember.findMany({ where: { user: { email: { in: emails } } }, select: { householdId: true } });
  await prisma.household.deleteMany({ where: { id: { in: old.map((o) => o.householdId) } } });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });

  const passwordHash = await bcrypt.hash("demo1234", 10);
  const minsu = await prisma.user.create({ data: { email: emails[0], name: "민수", passwordHash } });
  const jiyoung = await prisma.user.create({ data: { email: emails[1], name: "지영", passwordHash } });

  const household = await prisma.$transaction((db) => createHouseholdWithDefaults(db, { name: "민수·지영네", ownerUserId: minsu.id }), {
    timeout: 30_000,
  });
  await prisma.householdMember.create({ data: { householdId: household.id, userId: jiyoung.id, role: "MEMBER" } });
  const hid = household.id;

  const cats = await prisma.category.findMany({ where: { householdId: hid } });
  const cat = (name: string) => {
    const c = cats.find((x) => x.name === name);
    if (!c) throw new Error(`category ${name}`);
    return c.id;
  };

  const today = todayKST();
  const [ty, tm] = today.split("-").map(Number);
  const start = toDateStr(ty, tm - 4, 1);
  const openingDate = addDays(start, -1);

  async function account(
    name: string,
    type: Parameters<typeof prisma.account.create>[0]["data"]["type"],
    owner: string | null,
    opening: bigint,
    visibility: Visibility = "SHARED",
    institution?: string,
  ) {
    return prisma.account.create({
      data: {
        householdId: hid,
        name,
        type,
        ownerUserId: owner,
        defaultVisibility: visibility,
        institution,
        snapshots: { create: { asOf: d(openingDate), balance: opening } },
      },
    });
  }

  const joint = await account("생활비 통장", "CHECKING", null, 3_200_000n, "SHARED", "국민은행");
  const minsuBank = await account("민수 급여통장", "CHECKING", minsu.id, 1_800_000n, "SHARED", "신한은행");
  const jiyoungBank = await account("지영 급여통장", "CHECKING", jiyoung.id, 2_400_000n, "SHARED", "우리은행");
  const card = await account("생활비 카드", "CREDIT_CARD", null, 0n, "SHARED", "현대카드");
  const jiyoungCard = await account("지영 개인카드", "CREDIT_CARD", jiyoung.id, 0n, "SUMMARY_ONLY", "삼성카드");
  const savings = await account("주택청약", "SAVINGS", null, 12_000_000n, "SHARED", "국민은행");
  const isa = await account("ISA 계좌", "INVESTMENT", minsu.id, 18_500_000n, "SHARED", "미래에셋");
  const secret = await account("지영 비상금", "SAVINGS", jiyoung.id, 5_000_000n, "PRIVATE", "토스뱅크");
  const loan = await account("전세자금대출", "LOAN", null, -80_000_000n, "SHARED", "국민은행");
  await prisma.account.create({
    data: {
      householdId: hid,
      name: "전세보증금",
      type: "REAL_ESTATE",
      ownerUserId: null,
      defaultVisibility: "SHARED",
      snapshots: { create: { asOf: d(openingDate), balance: 250_000_000n } },
    },
  });

  // 월급·고정비 = 정기 규칙 (PROD.MD §1-7 4단계). 지난 회차 거래도 이 규칙이 만든 것으로 연결한다.
  const FIXED: {
    key: string;
    by: string;
    name: string;
    type: TxType;
    day: number;
    amount: number;
    from?: string;
    to?: string;
    category: string;
    merchant?: string;
  }[] = [
    { key: "minsuPay", by: minsu.id, name: "민수 월급", type: "INCOME", day: 25, amount: 3_850_000, to: minsuBank.id, category: "정기급여", merchant: "(주)민수회사" },
    { key: "jiyoungPay", by: jiyoung.id, name: "지영 월급", type: "INCOME", day: 25, amount: 3_420_000, to: jiyoungBank.id, category: "정기급여", merchant: "지영회사" },
    { key: "mgmt", by: minsu.id, name: "관리비", type: "EXPENSE", day: 5, amount: 245_000, from: joint.id, category: "관리비", merchant: "아파트관리사무소" },
    { key: "interest", by: minsu.id, name: "전세대출 이자", type: "EXPENSE", day: 5, amount: 230_000, from: joint.id, category: "대출이자", merchant: "국민은행" },
    { key: "phone", by: minsu.id, name: "휴대폰", type: "EXPENSE", day: 15, amount: 125_000, from: joint.id, category: "휴대폰" },
    { key: "subs", by: minsu.id, name: "구독", type: "EXPENSE", day: 15, amount: 32_000, from: card.id, category: "구독서비스", merchant: "넷플릭스·유튜브" },
    { key: "insurance", by: minsu.id, name: "보험", type: "EXPENSE", day: 15, amount: 180_000, from: joint.id, category: "보험" },
    { key: "internet", by: minsu.id, name: "인터넷·TV", type: "EXPENSE", day: 15, amount: 38_000, from: card.id, category: "인터넷·TV" },
    { key: "car", by: minsu.id, name: "자동차 할부", type: "EXPENSE", day: 10, amount: 420_000, from: joint.id, category: "차량유지", merchant: "현대캐피탈" },
    { key: "parents", by: jiyoung.id, name: "부모님 용돈", type: "EXPENSE", day: 1, amount: 400_000, from: jiyoungBank.id, category: "용돈" },
  ];
  const ruleIds = new Map<string, string>();
  for (const f of FIXED) {
    const rule = await prisma.recurringRule.create({
      data: {
        householdId: hid,
        createdByUserId: f.by,
        name: f.name,
        template: {
          type: f.type,
          amount: String(f.amount),
          fromAccountId: f.from ?? null,
          toAccountId: f.to ?? null,
          categoryId: cat(f.category),
          merchant: f.merchant ?? null,
          memo: null,
          visibility: "SHARED",
        },
        dayOfMonth: f.day,
        businessDayAdjust: "NONE",
        startDate: d(start),
        lastRunOn: d(today),
      },
    });
    ruleIds.set(f.key, rule.id);
  }

  type Row = {
    by: string;
    type: TxType;
    date: string;
    amount: number;
    from?: string;
    to?: string;
    category?: string;
    merchant?: string;
    visibility?: Visibility;
    fixed?: boolean;
    rule?: string;
  };
  const rows: Row[] = [];
  let seed = 7;
  const rand = (min: number, max: number) => {
    seed = (seed * 9301 + 49297) % 233280;
    return Math.round((min + (seed / 233280) * (max - min)) / 100) * 100;
  };

  for (let i = 4; i >= 0; i--) {
    const y = ty;
    const m = tm - i;
    const day = (n: number) => toDateStr(y, m, n);
    const lastDay = i === 0 ? Number(today.slice(8)) : 28;
    const inMonth = (n: number) => n <= lastDay;

    for (const f of FIXED) {
      if (!inMonth(f.day)) continue;
      rows.push({ by: f.by, type: f.type, date: day(f.day), amount: f.amount, from: f.from, to: f.to, category: f.category, merchant: f.merchant, fixed: f.type === "EXPENSE", rule: f.key });
    }
    if (inMonth(25)) {
      rows.push({ by: minsu.id, type: "TRANSFER", date: day(25), amount: 2_000_000, from: minsuBank.id, to: joint.id });
      rows.push({ by: jiyoung.id, type: "TRANSFER", date: day(25), amount: 1_800_000, from: jiyoungBank.id, to: joint.id });
      rows.push({ by: minsu.id, type: "SAVE_INVEST", date: day(26), amount: 1_000_000, from: minsuBank.id, to: isa.id, merchant: "ISA 적립" });
      rows.push({ by: jiyoung.id, type: "SAVE_INVEST", date: day(26), amount: 300_000, from: jiyoungBank.id, to: secret.id, visibility: "PRIVATE" });
    }
    if (inMonth(5)) {
      rows.push({ by: minsu.id, type: "LOAN_REPAY", date: day(5), amount: 300_000, from: joint.id, to: loan.id, merchant: "전세대출 원금" });
      rows.push({ by: minsu.id, type: "SAVE_INVEST", date: day(5), amount: 250_000, from: joint.id, to: savings.id, merchant: "청약 납입" });
    }
    // 카드값 결제(이체) — 지난달 카드 사용분
    if (inMonth(14) && i < 4) {
      rows.push({ by: minsu.id, type: "TRANSFER", date: day(14), amount: 0, from: joint.id, to: card.id, merchant: "카드대금" });
    }
    // 변동 지출: 부부 2인 기준 월 330만 안팎 — 쓸 수 있는 돈이 월말에 빠듯하게 남는 규모
    for (let n = 1; n <= lastDay; n += 2) {
      rows.push({ by: n % 4 === 1 ? minsu.id : jiyoung.id, type: "EXPENSE", date: day(n), amount: rand(40_000, 140_000), from: card.id, category: "장보기", merchant: "이마트" });
      if (n % 3 === 0) rows.push({ by: minsu.id, type: "EXPENSE", date: day(n), amount: rand(4_500, 12_000), from: card.id, category: "카페·간식", merchant: "스타벅스" });
      if (n % 3 === 0) rows.push({ by: jiyoung.id, type: "EXPENSE", date: day(n), amount: rand(30_000, 130_000), from: card.id, category: "외식", merchant: "동네 식당" });
      if (n % 4 === 1) rows.push({ by: minsu.id, type: "EXPENSE", date: day(n), amount: rand(18_000, 40_000), from: card.id, category: "배달", merchant: "배달앱" });
      if (n % 5 === 0) rows.push({ by: jiyoung.id, type: "EXPENSE", date: day(n), amount: rand(40_000, 200_000), from: jiyoungCard.id, category: "쇼핑·의류", merchant: "온라인몰", visibility: "SUMMARY_ONLY" });
      if (n % 7 === 0) rows.push({ by: minsu.id, type: "EXPENSE", date: day(n), amount: rand(40_000, 80_000), from: card.id, category: "주유" });
    }
    if (inMonth(10)) rows.push({ by: jiyoung.id, type: "EXPENSE", date: day(10), amount: rand(50_000, 150_000), from: card.id, category: "생활용품", merchant: "다이소·쿠팡" });
    if (inMonth(18)) rows.push({ by: minsu.id, type: "EXPENSE", date: day(18), amount: rand(20_000, 90_000), from: card.id, category: "병원·약국" });
    if (inMonth(22)) rows.push({ by: minsu.id, type: "EXPENSE", date: day(22), amount: 100_000, from: joint.id, category: "경조사", merchant: "축의금" });
    if (inMonth(20)) {
      rows.push({ by: jiyoung.id, type: "EXPENSE", date: day(20), amount: 200_000, from: jiyoungCard.id, category: "용돈", merchant: "깜짝 선물", visibility: "PRIVATE" });
      rows.push({ by: minsu.id, type: "EXPENSE", date: day(20), amount: rand(40_000, 120_000), from: card.id, category: "공연·영화" });
    }
    if (inMonth(28) && i > 0) {
      rows.push({ by: minsu.id, type: "ADJUSTMENT", date: day(28), amount: rand(50_000, 400_000), to: isa.id, merchant: "ISA 평가이익" });
      rows.push({ by: jiyoung.id, type: "INCOME", date: day(28), amount: 12_340, to: secret.id, category: "이자", visibility: "PRIVATE" });
    }
  }

  // 카드대금 = 직전 달 카드 사용액 합계
  for (const r of rows.filter((r) => r.type === "TRANSFER" && r.to === card.id)) {
    const [y, m] = r.date.split("-").map(Number);
    const prevStart = toDateStr(y, m - 1, 1);
    const prevEnd = toDateStr(y, m, 1);
    r.amount = rows
      .filter((x) => x.type === "EXPENSE" && x.from === card.id && x.date >= prevStart && x.date < prevEnd)
      .reduce((s, x) => s + x.amount, 0);
  }

  const reviewFrom = addDays(today, -10);
  await prisma.transaction.createMany({
    data: rows
      .filter((r) => r.amount > 0 && r.date >= start && r.date <= today)
      .map((r) => ({
        householdId: hid,
        createdByUserId: r.by,
        paidByUserId: r.by,
        type: r.type,
        date: d(r.date),
        amount: BigInt(r.amount),
        fromAccountId: r.from ?? null,
        toAccountId: r.to ?? null,
        categoryId: r.category ? cat(r.category) : null,
        merchant: r.merchant ?? null,
        visibility: r.visibility ?? "SHARED",
        isFixed: r.fixed ?? false,
        recurringRuleId: r.rule ? ruleIds.get(r.rule) : null,
        // 최근 10일 안에 규칙이 만든 거래는 홈 "확인할 일"에 뜬다 (PROD.MD §2-10)
        needsReview: Boolean(r.rule) && r.date >= reviewFrom,
      })),
  });

  await prisma.assetGoal.createMany({
    data: [
      // 대표 목표: 매달 ISA 100만 + 청약 25만 자동이체를 확정 납입액으로 → 필요액보다 적어 "뒤처짐"과 대안이 보인다
      { householdId: hid, name: "내 집 마련", targetAmount: 300_000_000n, targetIsReal: true, targetDate: d(toDateStr(ty + 7, tm, 1)), priority: 1, expectedReturn: 0.05, linkedAccountIds: [isa.id, savings.id], monthlyCommit: 1_250_000n },
      { householdId: hid, name: "비상금", targetAmount: 15_000_000n, targetIsReal: false, targetDate: d(toDateStr(ty + 1, tm, 1)), priority: 2, expectedReturn: 0.02, linkedAccountIds: [savings.id] },
      { householdId: hid, name: "은퇴자금", targetAmount: 1_000_000_000n, targetIsReal: true, targetDate: d(toDateStr(ty + 25, tm, 1)), priority: 3, expectedReturn: 0.06, linkedAccountIds: [], monthlyCommit: 0n },
    ],
  });

  const count = await prisma.transaction.count({ where: { householdId: hid } });
  console.log(`✔ 데모 가구 생성: ${household.name} (거래 ${count}건)`);
  console.log("  로그인: minsu@demo.finlog / jiyoung@demo.finlog · 비밀번호 demo1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
