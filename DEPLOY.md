# 마이그레이션 · 운영 배포 가이드

운영 주소: https://finlog-chi.vercel.app
DB: Neon Postgres (싱가포르, `ap-southeast-1`) · 함수 리전: Vercel `sin1` (`vercel.json`)

> 한 줄 요약: **로컬에서 마이그레이션 생성 → 테스트 → 커밋 → 운영 DB 마이그레이션 → 배포 → 확인**.
> 순서를 지키는 이유: 새 컬럼을 읽는 코드가 먼저 배포되면 운영이 바로 깨진다. 컬럼 추가는 옛 코드와도 호환된다.

---

## 한 번에: 운영 DB 마이그레이션 + 운영 배포

커밋까지 끝났으면(2·3단계) 4~6단계는 스크립트 하나로 한다 — `scripts/deploy-prod.mjs`.

```bash
npm run deploy:prod -- --check          # 1) 먼저 상태만 본다 — 아무것도 바꾸지 않음
npm run deploy:prod                     # 2) 확인 질문 한 번 → 마이그레이션 → 배포 → 확인
```

| 옵션 | 하는 일 |
|---|---|
| (없음) | Git 확인 → 운영 DB 주소 받기 → 적용할 마이그레이션 표시 → **확인 질문** → `migrate deploy` → 배포 → 접속 확인 |
| `--check` | 3단계(적용할 마이그레이션 표시)까지만. 운영 DB·배포 모두 그대로 |
| `--yes` | 확인 질문 없이 진행 |
| `--skip-migrate` | 스키마 변경이 없을 때 배포만 |

스크립트가 막아 주는 것:

- 커밋 안 된 변경이 있으면 시작하지 않는다 (배포는 내 PC 파일 기준이라 커밋과 운영이 어긋난다).
- Prisma 가 실제로 **운영 호스트(`*.neon.tech`, direct)** 에 붙었는지 `Datasource` 줄로 확인한다.
- 마이그레이션이 실패하거나 적용 뒤 최신이 아니면 **배포하지 않는다**.
- 적용할 마이그레이션에 `DROP`·`DELETE`·`TRUNCATE` 가 있으면 Neon 브랜치(스냅샷)부터 만들라고 알려 준다.
- 접속 주소의 비밀번호는 출력에서 가린다.

Claude Code 안에서는 운영 작업이 자동 권한 검사에 막힐 수 있다. 그럴 땐 프롬프트 맨 앞에 `!` 를 붙여 직접 실행한다 (앞에 공백 없이).

```
! npm run deploy:prod -- --yes
```

> 직접 명령으로 할 때 주의: 마이그레이션은 `schema.prisma` 의 `directUrl = env("DATABASE_URL_UNPOOLED")` 로 붙는다.
> `DATABASE_URL` 만 운영 주소로 넘기면 `.env` 의 **로컬 DB** 에 붙어서 "No pending migrations to apply." 가 거짓으로 나온다.
> 아래 4단계처럼 두 변수를 **모두** 넘기고, 출력의 `Datasource` 줄이 `neon.tech` 인지 확인한다.

한 줄로 직접 할 때 (스크립트와 같은 순서):

`pipefail` 이 있어야 마이그레이션이 실패했을 때 배포로 넘어가지 않는다.

```bash
set -o pipefail; U="$(npx --no-install neon connection-string production --project-id soft-wildflower-68858737 --ssl verify-full)" \
  && DATABASE_URL="$U" DATABASE_URL_UNPOOLED="$U" npx prisma migrate deploy 2>&1 | sed -E 's#//[^@]*@#//***@#g' \
  && unset U && npx vercel deploy --prod --yes
```

---

## 0. 미리 알아둘 것

| 항목 | 위치 |
|---|---|
| 로컬 DB 주소 | `.env` 의 `DATABASE_URL` / `DATABASE_URL_UNPOOLED` — **로컬 Postgres 만** 가리킨다 |
| 운영 환경변수 | Vercel 에만 있다 (`npx vercel env ls`) — `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `AUTH_SECRET`, `CRON_SECRET`, `ADMIN_EMAILS` |
| 운영 DB 주소 | 필요할 때 Neon CLI 로 받아 **그 명령에만** 넘긴다 (파일에 저장하지 않는다) |

하지 말 것:

- `neon env pull` / `neon deploy` — `.env` 의 `DATABASE_URL` 을 운영 주소로 덮어쓴다. 이후 `npm run db:seed`·`prisma migrate dev` 가 운영 DB 에 실행될 수 있다.
- 운영 DB 에 `prisma migrate dev` — 개발용 명령이라 스키마 차이를 보면 **DB 초기화(reset)를 제안**한다. 운영은 항상 `migrate deploy`.
- 운영 DB 주소를 `echo` 하거나 파일·로그·채팅에 남기기.
- 운영 DB 에 시드 — `prisma/seed.ts` 가 원격 DB 를 막아 두었다 (`ALLOW_REMOTE_SEED=1` 일 때만 실행).

`DATABASE_URL`(pooled, `-pooler` 주소)은 앱 쿼리용, `DATABASE_URL_UNPOOLED`(direct)는 마이그레이션용이다. PgBouncer(pooled)로 마이그레이션하면 prepared statement 오류가 난다.

---

## 1. 스키마 변경 → 로컬 마이그레이션 생성

```bash
# prisma/schema.prisma 수정 후
npx prisma migrate dev --name <변경_이름>     # 예: card_billing
```

- `prisma/migrations/<타임스탬프>_<이름>/migration.sql` 이 생기고 로컬 DB 에 적용된다.
- 생성된 SQL 을 꼭 열어 본다. 특히 아래는 운영 데이터에 영향이 있다.
  - `DROP COLUMN` / `DROP TABLE` — 데이터 삭제
  - `NOT NULL` 컬럼 추가 — 기존 행이 있으면 실패. 기본값을 주거나, nullable 로 추가 → 데이터 채움 → NOT NULL 순으로 나눈다
  - 컬럼 이름 변경 — Prisma 는 DROP + ADD 로 만든다. 직접 `ALTER TABLE ... RENAME COLUMN` 으로 고친다
- 기존 데이터를 채워야 하면 같은 `migration.sql` 아래에 `UPDATE` 를 직접 덧붙인다 (예: `20261103021325_user_approval`).

## 2. 검증

```bash
npx tsc --noEmit
npm run lint
npm test                                                      # 단위 테스트
TEST_DATABASE_URL="<로컬 DATABASE_URL>" DATABASE_URL="<로컬 DATABASE_URL>" npm run test:db   # DB 통합 테스트 (각자 만든 데이터만 지운다)
npm run build                                                 # 선택: 배포 빌드 확인
```

## 3. 커밋

마이그레이션 폴더(`prisma/migrations/...`)를 **반드시 함께 커밋**한다. 빠지면 다른 환경에서 스키마가 어긋난다.

```bash
git add -A
git commit -m "feat: ..."
```

## 4. 운영 DB 마이그레이션

Neon CLI 로 운영 **direct** 주소를 받아 변수에만 담고, 그 명령에만 넘긴다.

```bash
URL=$(npx neon connection-string production --ssl verify-full | tail -1)

# 4-1. 호스트만 확인 (주소 전체는 출력하지 않는다). -pooler 가 없어야 direct
echo "$URL" | sed -E 's#.*@([^/:?]+).*#\1#'

# 4-2. 적용 전 상태 — 적용 안 된 마이그레이션 목록 확인
DATABASE_URL="$URL" DATABASE_URL_UNPOOLED="$URL" npx prisma migrate status

# 4-3. 적용
DATABASE_URL="$URL" DATABASE_URL_UNPOOLED="$URL" npx prisma migrate deploy

# 4-4. 확인 — "Database schema is up to date!"
DATABASE_URL="$URL" DATABASE_URL_UNPOOLED="$URL" npx prisma migrate status

unset URL
```

- 4-2 목록이 **이번에 만든 것만**인지 본다. 예상 밖의 마이그레이션이 있으면 멈추고 원인부터 확인한다.
- 데이터 삭제·대량 변경이 있는 마이그레이션이면 먼저 Neon 콘솔에서 브랜치(스냅샷)를 만들어 둔다.
- 스키마 변경이 없는 배포면 이 단계는 건너뛴다.

## 5. 배포

```bash
npx vercel deploy --prod --yes
```

배포 상태 확인:

```bash
npx vercel inspect <출력된 배포 주소>        # target production · status Ready · Aliases 에 finlog-chi.vercel.app
```

## 6. 배포 후 확인

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://finlog-chi.vercel.app/login      # 200
curl -s -o /dev/null -w "%{http_code}\n" https://finlog-chi.vercel.app/assets     # 307 (로그인으로)
```

- 휴대폰으로 로그인해 이번에 바꾼 화면을 직접 한 번 써 본다.
- 에러가 보이면 `npx vercel logs https://finlog-chi.vercel.app` 로 함수 로그를 본다.
- 운영 데모 계정 비밀번호는 `demo1234` 가 아니다 — 로컬 `.env.demo.local`(커밋 제외)에만 있다.

---

## 롤백

| 상황 | 방법 |
|---|---|
| 코드만 문제 | `npx vercel rollback` (직전 운영 배포로 되돌림) 또는 Vercel 대시보드 → Deployments → 이전 배포 **Promote to Production** |
| 마이그레이션이 실패해 중간에 멈춤 | `prisma migrate status` 로 실패 항목 확인 → 원인 수정 후 `npx prisma migrate resolve --rolled-back <이름>` → 다시 `migrate deploy` |
| 적용된 스키마를 되돌려야 함 | Prisma 는 down 마이그레이션이 없다. 되돌리는 **새 마이그레이션**을 만들어 배포하거나, 4단계 전에 만든 Neon 브랜치로 복원 |

코드를 롤백해도 DB 스키마는 그대로다. 그래서 컬럼 **추가**는 롤백에 안전하고, 컬럼 **삭제**는 그 컬럼을 쓰는 코드가 운영에서 모두 사라진 다음 배포에서 한다.

## 환경변수 변경

```bash
npx vercel env ls
npx vercel env add <이름> production      # 값은 프롬프트에 입력 (명령줄에 쓰지 않는다)
npx vercel deploy --prod --yes            # 환경변수는 새 배포부터 적용된다
```

---

## 기록 — 마이그레이션 이력

| 마이그레이션 | 내용 | 운영 적용 |
|---|---|---|
| `20261006062748_init` | 초기 스키마 | 최초 배포 시 |
| `20261030090000_v3_needs_review` | v3 확인할 일 (`needsReview`) | 최초 배포 시 |
| `20261103015920_rate_limit` | `RateLimit` 테이블 (시도 횟수 제한) | 2026-11-03 |
| `20261103021325_user_approval` | `User.approvedAt` + 기존 사용자 승인 처리 | 2026-11-03 |
| `20261103023712_card_billing` | `Account.billingDay`·`paymentAccountId` | 2026-11-03 |
| `20261103042458_session_version` | `User.sessionVersion` (모든 기기에서 로그아웃) | 2026-11-03 |
| `20261103062424_savings_product` | `Account.openedOn`·`maturityDate`·`interestRate` (예적금 가입일·만기일·금리) | 2026-11-03 |
| `20261104004039_user_palette` | `User.palette` (화면 테마: 숲·바다·저녁, 사용자별) | 2026-11-04 |
| `20261105042551_youth_savings_product` | `Account.savingsProduct`·`savingsTier` (청년도약·미래적금) | 2026-11-05 |
| `20261106000000_loan_repayment` | `Account.loanRepayment` (대출 상환 방식) | 2026-11-06 |
| `20261106010000_deposit_loan` | `Account.depositLoan` (보증금 대출 순자산 제외) | 2026-11-06 |
| `20261106020000_goal_start_amount` | `AssetGoal.startAmount`·`baseBalance` (목표 시작 금액·기준 잔액) | 2026-11-06 |
| `20261106030000_goal_progress` | `AssetGoal.baseSetOn`·`milestoneSeen` (기준일·진행률 알림) | 2026-11-06 |
| `20261106040000_perf_indexes` | `Transaction(householdId, needsReview, date)`·`(fromAccountId, date)`·`(toAccountId, date)`, `RecurringRule(householdId)` 인덱스 (성능) | 2026-11-06 |
| `20261106050000_tax_wrapper` | `Account.taxWrapper` (연금저축·IRP·ISA) + 계좌 이름으로 기존 계좌 채움 | 2026-11-06 |
| `20261106081359_reconcile_merchant_rules_challenges` | `Account.balanceCheckYearly` (부동산은 true로 채움), `MerchantCategoryRule`, `Challenge` 테이블 | 2026-11-06 |
| `20261106084227_user_salary_band` | `User.salaryBand` (총급여 구간 — 연금 세액공제율) | 2026-11-06 |
| `20261110113000_tx_not_duplicate` | `Transaction.notDuplicate` (가계부 "같은 결제일까요?"에 "다른 결제예요") | 2026-11-10 |

새 마이그레이션을 운영에 적용하면 이 표에 한 줄 추가한다.
