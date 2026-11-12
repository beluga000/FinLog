# FINLOG

**목표까지 남은 거리를 매일 보여주는 부부·개인 가계부.**
기록에서 끝나지 않고 "그래서 목표까지 얼마나 남았나"로 이어지게 만든다 — 목표에서 거꾸로 계산한 "오늘 쓸 수 있는 돈"이 매일의 피드백이다.

- 운영: https://finlog-chi.vercel.app (가입 후 관리자 승인)
- 요구사항: [PROD.MD](./PROD.MD) (PRD v3, 이전 버전 PROD.v2.MD) · 운영 배포: [DEPLOY.md](./DEPLOY.md) · 새 기기 설정: [SETUP.md](./SETUP.md)
- 스택: Next.js 15 (App Router · Server Actions) · React 19 · Prisma 6 + Postgres (Neon) · Auth.js 5 · Tailwind 4 · Vitest · Vercel

## 목차

- [무엇을 하나](#무엇을-하나)
- [서버 올리기](#서버-올리기-한-줄)
- [처음 설정](#처음-설정)
- [테스트](#테스트)
- [배포](#배포-vercel--neon)
- [환경변수](#환경변수)
- [보안](#보안)
- [구조](#구조)
- [설계 메모](#설계-메모)

## 무엇을 하나

| 화면 | 하는 일 |
|---|---|
| **홈** | 오늘 쓸 수 있는 돈(목표 저축을 뺀 생활비 ÷ 남은 날), 대표 목표 진척과 페이스, 확인할 일(자동 기록·카드 결제 예정·통장 부족 예보·잔액 업데이트) |
| **가계부** | 6가지 거래 유형(수입·지출·이체·저축투자·대출상환·조정), 검색·주간 보기, 정기 거래, 중복 의심 표시, 신용카드 할부 |
| **빠른 기록** | [+] 입력 · 카드 문자 붙여넣기 · Android 공유받기 · iOS 단축어 · 결제내역 캡처 여러 장(기기 안 글자 인식) |
| **목표** | 우선순위대로 저축 가능액 배분, 목표마다 "만약에"(월 저축·수익률·목표일을 바꾸면 바로 다시 계산), **생활 변화**(출산·휴직·이사 등) 반영 |
| **자산** | 계좌·카드·대출·예적금(청년도약·미래적금), 잔액 맞추기, 통장 잔액 예보, 세제 혜택 계좌 한도(연금저축·IRP·ISA) |
| **리포트** | 월간 결산과 조정 제안, 이번 달 챌린지, **평소와 다른 지출**, 50/30/20, 12개월 추이, 순자산, **인쇄·PDF** |
| **정산** (부부) | 각자 낸 생활비를 반반·수입 비율·직접 비율로 맞추고 정산 완료 기록 |
| **설정** | 가구·월 시작일, 부부 연결과 공개범위, 카테고리(이름 바꾸기·합치기), 가맹점 규칙, 알림, 화면 테마(노을·숲·바다·저녁), 계정, 변경 이력 |

**부부 모드**: 한 가계부를 각자 계정으로 쓴다. 거래·계좌마다 공개범위를 `공개 / 합계만 / 비공개` 로 정하고, 상단에서 우리·나·배우자 보기를 바꾼다.

**알림** (설정 > 이 기기에서 알림 받기, 매일 아침 9시): 통장 부족 예보, 확인할 자동 기록, 카드값 결제 이틀 전·당일, 쓸 수 있는 돈 80%·100%를 처음 넘은 날, 목표 25% 단계 — 같은 알림을 매일 반복하지 않는다.

## 서버 올리기 (한 줄)

처음 설정(아래)을 한 번 마쳤다면, 이후에는 프로젝트 폴더에서 이 명령어 하나면 된다.

```bash
npm run dev -- -p 3001
```

- PC: http://localhost:3001 (이 PC 는 3000번을 다른 앱이 상시 쓰고 있어 3001 로 띄운다)
- 폰(같은 와이파이): 터미널에 뜨는 `Network: http://192.168.x.x:3001` 주소로 접속
- 끄기: 터미널에서 `Ctrl + C`
- 개발 모드는 각 페이지를 **처음 열 때** 컴파일하느라 1초 안팎 걸린다(두 번째부터는 빠름). 실제 속도를 보려면 `npm run build && npm start`
- 스키마를 바꾸거나 새 export 를 추가했으면 개발 서버를 껐다 켠다 (Prisma 클라이언트·모듈 캐시가 예전 것을 쥐고 있다)

## 처음 설정

처음 한 번만 하는 설정이다. 다른 기기(맥북 등)에서 저장소를 새로 받을 때는 [SETUP.md](SETUP.md) 순서대로.

```bash
npm install                 # postinstall 에서 prisma generate + 캡처 인식 파일 복사(public/ocr)
cp .env.example .env        # DATABASE_URL 에 로컬 Postgres 비밀번호 입력 (finlog DB 는 migrate 가 만든다)
npm run db:migrate          # 스키마 적용
npm run db:seed             # 데모 부부 가구 (minsu@demo.finlog / jiyoung@demo.finlog, 비밀번호 demo1234)
npm run dev -- -p 3001
```

### 모바일에서 지출 기록하기

| 방법 | 사용법 |
|---|---|
| 문자 붙여넣기 | [+] → [문자 붙여넣기]. 카드 승인 문자에서 금액·날짜·사용처·할부를 채우고, 같은 사용처의 최근 카테고리를 고른다. 취소 문자는 채우지 않는다 |
| Android 공유하기 | 홈 화면에 FINLOG 설치 → 문자 앱에서 [공유 → FINLOG]. 빠른 입력이 채워진 채 열린다 |
| iOS 단축어 | 자동화: "카드 승인" 문자 수신 → 텍스트 복사 → `/dashboard?add=paste` 열기 → [문자 붙여넣기] 한 번 |
| 결제내역 캡처 | 카드 앱 결제내역 캡처 여러 장 → 기기 안에서 인식 → 확인 화면에서 고른 건만 [N건 기록] |

같은 금액·±1일 지출이 이미 있으면 저장 전에 "이미 기록한 것 같아요"로 한 번 확인한다 (캡처는 같은 날만).

## 테스트

| 명령 | 내용 |
|---|---|
| `npm test` | 계산 로직 단위 테스트 — DB 없이 (`src/lib/finance/__tests__` 등) |
| `npm run test:db` | DB 통합 테스트 (`src/features/__tests__/*.db.test.ts`) — `TEST_DATABASE_URL` 이 있을 때만 돈다 |
| `npm run typecheck` / `npm run lint` / `npm run build` | 정적 검사·빌드 |

DB 테스트는 각자 만든 데이터만 지우므로 로컬 개발 DB 로 돌려도 된다.

```bash
# bash: .env 를 불러와 그 DB 로
set -a; . ./.env; set +a; TEST_DATABASE_URL="$DATABASE_URL" npm run test:db
```

DB 테스트가 다루는 것: 공개범위·가구 격리·정기 거래(AC-3/4/9), 온보딩(AC-10/11), 홈·쓸 수 있는 돈·확인할 일·결산(AC-13~16, 19),
카드 결제일·부부 계좌 관리(AC-25~26), 계좌 보관·삭제, 대출 계좌, 가맹점 규칙, 챌린지, 세제 혜택 한도, 시도 횟수 제한, 관리자,
부부 정산·변경 이력 공개범위·가구 나가기.

## 배포 (Vercel + Neon)

운영 DB 는 Neon Postgres(`neon.ts`, 싱가포르), 함수 리전은 `vercel.json` 의 `sin1`. 절차·롤백 전체는 [DEPLOY.md](DEPLOY.md).

```bash
npm run deploy:prod -- --check   # 1) 상태만 보기 — 적용할 마이그레이션 목록 (아무것도 바꾸지 않음)
npm run deploy:prod -- --yes     # 2) 운영 DB 마이그레이션 → 배포 → 접속 확인
npm run deploy:prod -- --skip-migrate   # 스키마 변경이 없을 때 배포만
```

- 커밋·푸시한 뒤에 배포한다. 마이그레이션이 실패하면 배포하지 않는다 (새 컬럼을 읽는 코드가 먼저 나가면 운영이 깨진다)
- 데이터를 지우는 마이그레이션(`DROP`·`DELETE`)이면 Neon 콘솔에서 브랜치(스냅샷)부터 만든다 — 스크립트가 알려 준다
- 적용한 마이그레이션은 [DEPLOY.md](DEPLOY.md) 이력 표에 한 줄씩 추가한다
- Prisma 는 Rust 엔진 없이 `@prisma/adapter-pg`(node-postgres)로 접속한다(`engineType = "client"`). 엔진 바이너리가 Vercel 번들에서 빠지는 문제 때문
- 로컬 `.env` 는 로컬 Postgres 만 가리킨다. `neon env pull`/`neon deploy` 는 `.env` 의 `DATABASE_URL` 을 운영 주소로 덮어쓰므로 쓰지 않는다
- 시드는 원격 DB 에서 실행되지 않는다(`ALLOW_REMOTE_SEED=1` 일 때만). 운영 데모 계정 비밀번호는 `demo1234` 가 아니다 — 로컬 `.env.demo.local`(커밋 제외)에만 있다
- 로컬에서 `npm start` 로 실서버 모드를 띄울 때는 `AUTH_TRUST_HOST=true` 가 필요하다(Vercel 에서는 자동)

### 크론 (`vercel.json`, `Authorization: Bearer $CRON_SECRET`)

| 경로 | 시각 (KST) | 하는 일 |
|---|---|---|
| `/api/cron/recurring` | 매일 01:00 | 정기 거래 생성 (확인할 일로 올라감) |
| `/api/cron/notify` | 매일 09:00 | 아침 알림 (웹 푸시) |

## 환경변수

| 이름 | 용도 | 없으면 |
|---|---|---|
| `DATABASE_URL` | 앱 쿼리 (운영은 Neon pooled `-pooler` 주소) | 실행 불가 |
| `DATABASE_URL_UNPOOLED` | 마이그레이션 (`directUrl`) | 마이그레이션이 로컬 DB 에 붙는다 |
| `AUTH_SECRET` | 세션 서명 | 실행 불가 |
| `ADMIN_EMAILS` | 서비스 관리자 이메일 (쉼표 구분) | 가입 승인할 사람이 없음 |
| `CRON_SECRET` | 크론 호출 확인 | 크론이 401 |
| `AUTH_KAKAO_ID`·`AUTH_KAKAO_SECRET`·`AUTH_GOOGLE_ID`·`AUTH_GOOGLE_SECRET` | 소셜 로그인 | 그 버튼이 안 보임 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`·`VAPID_PRIVATE_KEY`·`VAPID_SUBJECT` | 웹 푸시 (`npx web-push generate-vapid-keys`) | 알림을 보내지 않음 |

운영 값은 Vercel 에만 있다: `vercel env ls`. 추가는 `vercel env add <이름> production` 후 다시 배포.

## 보안

- **가입 승인**: 새 가입자는 승인 대기(`User.approvedAt = null`)로 만들어지고 로그인할 수 없다. 관리자가 [프로필 메뉴 → 가입 승인](`/admin`)에서 승인·거절·승인 취소.
  관리자 = `ADMIN_EMAILS` 의 이메일 — 이 이메일로 가입하면 즉시 승인된다. 승인 취소하면 기존 세션도 다음 요청부터 막힌다.
- **세션**: 로그인 후 24시간 절대 만료. "모든 기기에서 로그아웃"·비밀번호 변경은 세션 세대(`sessionVersion`)를 올려 다른 기기 로그인을 끊는다.
- **비밀번호 재설정**: 메일 발송 없이 관리자가 사용자 메뉴에서 **1회용 링크(24시간)** 를 발급해 직접 전달한다 → `/reset-password`. DB 에는 토큰의 SHA-256 만 저장.
- **가구 나가기·탈퇴** (설정 > 계정): 비밀번호(소셜 계정은 이메일)로 본인 확인. 내 비공개 계좌·거래는 지우고, 공개 계좌는 공동 명의로 배우자에게 남긴다.
  지워질 건수를 먼저 보여 준다. 서비스 관리자 계정은 탈퇴할 수 없다.
- **시도 횟수 제한** (`src/lib/security/rate-limit.ts`, DB `RateLimit` 테이블 — 서버리스 인스턴스끼리 공유):

  | 대상 | 한도 |
  |---|---|
  | 로그인 | 계정별 15분 5회 · IP별 15분 30회 |
  | 가입 | IP별 1시간 5회 |
  | 초대 코드 | 사용자별 1시간 10회 |
  | 비밀번호 확인 (변경·나가기·탈퇴) | 사용자별 15분 5회 |
  | 재설정 링크 | IP별 1시간 10회 |
  | 문자·캡처 점검, 여러 건 기록 | 사용자별 10분 30회 |
  | 가계부 검색 | 사용자별 1분 60회 |
  | 시험 알림 | 사용자별 1시간 5회 |

- **초대 코드**: 8자리(헷갈리는 I·O·0·1 제외 32글자, 약 1조 가지), 72시간·1회용
- **소셜 로그인**: 제공자가 인증한 이메일만 기존 계정에 연결(`isVerifiedEmail`)
- **변경 이력** (설정 > 변경 이력): 감사 로그를 문장으로 보여 준다. 바뀐 값은 보여 주지 않고, 배우자의 비공개 계좌·정기 거래에 관한 기록은 숨긴다.
- **보안 헤더** (`next.config.ts`): 다른 사이트에 끼워넣기 금지(`frame-ancestors 'none'`, `X-Frame-Options`), `nosniff`, Referrer·Permissions 정책

## 구조

```
src/
├─ app/(auth)              로그인 · 가입 · reset-password(재설정 링크)
├─ app/(app)               dashboard(홈) · ledger(+recurring) · goals(+[id] 만약에) · assets(+reconcile, savings)
│                          reports(+settle 정산) · settings(+couple, account, history) · admin(가입 승인·사용자)
│                          simulate → 대표 목표 상세, more → 홈 리다이렉트 (v3)
├─ app/onboarding          5단계: 목표 → 자산 → 월수입 → 고정비 → 월 시작일. 초대 코드 참여자는 바로 홈
├─ app/manifest.ts         PWA 설치 + Android 공유받기(share_target, POST)
├─ app/share               공유받은 문자 원문 → 5분짜리 httpOnly 쿠키 → /dashboard?add=shared
├─ app/offline             오프라인 안내 (public/sw.js)
├─ app/icons/[size]        앱 아이콘 (180·192·512, maskable)
├─ app/api/cron            recurring(정기 거래) · notify(아침 알림)
├─ features/<domain>       queries.ts(조회) · actions.ts(Server Actions) · components/
│   account · accounts · admin · appearance · dashboard · goals · household · ledger · notifications · reports
├─ lib/finance             순수 계산 함수 + 테스트 (아래 표)
├─ lib/db                  Prisma 클라이언트, 요청 단위 가구 컨텍스트(context.ts)
├─ lib/security            시도 횟수 제한
└─ generated/prisma        Prisma 생성물 (git 제외)
```

`src/lib/finance` — 화면·DB 와 떨어진 계산은 모두 여기 있고 단위 테스트가 붙어 있다.

| 영역 | 파일 |
|---|---|
| 돈·기간 | `money` (BigInt 원 단위) · `period` (월 시작일 경계) · `holidays` · `month-progress` |
| 매일 피드백 | `spendable` (쓸 수 있는 돈) · `daily-notice` (아침 알림·일이 생겼을 때 알림) · `forecast` (통장 잔액 예보) |
| 결산·분석 | `stats` · `closing` (결산 제안) · `challenge` · `unusual-spending` (평소와 다른 지출) · `settlement` (부부 정산) |
| 목표·예측 | `goals` · `projection` (복리·역산) · `life-events` (생활 변화) · `portfolio` (자산군 가정치) |
| 계좌 | `balance` · `reconcile` · `card-billing` · `installments` (할부) · `loan` · `savings` · `savings-products` · `tax-accounts` (세제 혜택 한도·연도별 세율 표) |
| 기록 입력 | `card-message` (승인 문자) · `card-capture`·`capture-import`·`merchant-match` (캡처) · `merchant-rules` · `recurring`·`recurring-detect` · `tx-search` · `tx-rules` · `visibility` (공개범위) |

## 설계 메모

**데이터·권한**
- **가구 격리**: 모든 조회·변경은 세션에서 얻은 `householdId` 로만. 클라이언트가 보낸 가구 ID 는 쓰지 않는다.
- **공개범위**: `PRIVATE` 는 DB 쿼리 단계에서 제외, `SUMMARY_ONLY` 는 id·메모·가맹점을 뺀 합계용 객체로만 내려간다.
- **이중 집계 방지**: 카드 사용 = 지출, 카드대금 = 이체(통계 제외), 증권 입금 = 저축·투자.
- **잔액**: 마지막 잔액 스냅샷(그날 마감) + 이후 거래 흐름. 부채는 음수로 저장.
- **세율·한도**: 연도별 표 `tax-accounts.ts` 한 곳에만 둔다 (DB 테이블 없음). 자산군 가정치는 `portfolio.ts`.

**매일 쓰는 숫자**
- **쓸 수 있는 돈**: 수입 − 고정비 − 목표 저축 − 변동 지출. 고정비는 활성 정기 규칙 금액을 월초부터 전액 차감하고,
  그 규칙이 만든 거래는 변동 지출에서 뺀다(이중 차감 방지). 직접 "고정" 체크한 거래는 규칙이 없으므로 변동 지출로 센다.
- **확인할 일**: 정기 규칙이 만든 거래는 `needsReview = true` 로 생성 → 홈에서 [맞아요]·금액 수정으로 확정.
  평가액 계좌(투자·연금·부동산·기타자산)는 마지막 잔액 입력이 30일 넘으면 잔액 업데이트로 나온다.
- **월간 결산**: 저장하지 않고 조회 시점에 계산. 목표 저축 계획값은 지금 목표 설정 기준이다.
- **평소와 다른 지출**: 대분류별로 직전 3달 평균보다 40%·5만 원 이상 많거나, 평소 없던 지출이 10만 원 이상이면 보여 준다 (최대 3개).
  진행 중인 달도 쓴다 — 지출은 늘기만 하므로 벌써 넘었다면 이미 많이 쓴 것이다.
- **신용카드 할부**: 가계부에는 산 날 전체 금액, 카드값 예보·결제 예정에는 회차별 금액.

**부부·목표**
- **정산**: 비공개가 아닌 지출만. 낸 사람 = 결제 계좌(카드 포함) 명의자, 공동 명의 계좌로 낸 것은 제외, 계좌 없으면 기록한 사람.
  수입 비율은 입금 계좌 명의자의 공개 수입. 비율은 만분율 정수로 계산해 두 사람 몫의 합이 정확히 맞는다.
  "정산 완료"는 그때 금액을 남기고, 이후 기록이 바뀌면 차이를 알린다.
- **생활 변화**: 매달 저축 변화(기간)와 시작 달에 한 번 나가는 돈을 목표 "만약에" 경로에 더해 달성 시점을 다시 계산한다. 끄고 켤 수 있다.
- **알림 중복 방지**: 상태 없이 매일 돌기 때문에 "그날만 해당하는 조건"(결제 이틀 전·당일, 어제 처음 넘은 선)으로 고른다.
  목표 진행률만 보낸 단계를 `AssetGoal.milestonePushed` 에 남긴다.

**기록 입력**
- **문자 원문**: 파싱은 클라이언트에서만. 원문은 URL·DB·로그에 남기지 않는다(공유받기는 POST + 1회용 쿠키).
- **결제내역 캡처**: 글자 인식은 기기 안에서만(tesseract.js). 엔진·언어 파일도 우리 서버 `/ocr` 에서만 받고,
  이미지와 인식한 줄은 서버로 보내지 않는다. 서버에는 확인 화면에서 고른 지출 건만 저장된다.
- **카테고리 지우기**: 기록·가맹점 규칙·정기 거래를 고른 카테고리로 옮긴 뒤 지운다(합치기). 소분류가 있는 대분류는 소분류부터.

**계좌**
- **적금 월 납입**: 납입액은 계좌가 아니라 자동이체 규칙에 둔다. 시작일은 내일(또는 가입일) — 시작 잔액에 지난 납입이 이미 들어 있다.
  청년도약·미래적금 정부기여금은 잔액에 넣지 않고 만기 예상액에 따로 더한다(기여금 이자는 무시). 정책 수치는 `savings-products.ts` 한 곳.
- **계좌 보관·삭제**: 보관 시 내가 만든 자동이체만 함께 멈출 수 있다(배우자 규칙은 만든 사람만 수정).
  삭제는 보관한 계좌 중 거래 0건만 — 거래까지 지우면 과거 리포트가 바뀐다. 배우자 자동이체가 걸려 있으면 거부.
- **대출 상환**: 상환 방식(만기일시·원리금균등·원금균등)·금리·만기일·납입일·이자/상환금 출금 계좌를 계좌에 둔다
  (납입일·출금 계좌는 카드 결제일·대금 출금 계좌와 같은 칸). 매달 낼 돈은 처음 원금이 아니라 현재 잔액과 남은 납입 횟수로 다시 계산 —
  중도상환해도 맞는다. 월 금리 = 연 금리/12 라 은행의 일할 이자와 몇백 원 다를 수 있다.
- **보증금 대출**: 전세·월세 보증금 대출(`depositLoan`)은 보증금으로 묶여 내가 쓰는 돈이 아니므로 순자산·부채 합계에서 뺀다.
  대신 보증금 자산에는 내 돈으로 낸 몫만 넣는다. 만기일시상환 대출은 매달 이자가 같아 계좌 추가 때 이자 지출(대출이자) 자동이체를 함께 만들어
  고정비로 잡는다 — 원리금·원금균등은 금액이 매달 바뀌어 만들지 않는다.

**화면**
- **테마**: 노을(기본)·숲·바다·저녁. 색·글꼴·모서리를 한 벌로 묶어 `<html data-palette>` 로 바꾸고, 밝게/어둡게와는 따로 고른다 (`globals.css`, `features/appearance`).
  노을은 주황을 대표 카드·목표 막대·버튼·선택 표시에만 쓰고, 주의(겨자)·위험(장미빛 빨강)은 주황과 헷갈리지 않게 따로 뺐다.
- **로고 '진척 F'**: F 의 윗획이 진행 막대, 끝의 점이 목표. 마크·앱 아이콘·파비콘이 같은 도형(`components/common/logo-mark.tsx`).
- **숫자 서체**: 숫자·구분자만 고정폭(`FinNum`, unicode-range), ₩·한글은 본문 서체 — 고정폭 서체에서 ₩가 W로 보이는 문제 방지.
- **인쇄·PDF**: 리포트의 [인쇄 · PDF] → 브라우저 인쇄 창에서 PDF 로 저장. 메뉴·탭·버튼은 인쇄에서 숨긴다(`@media print`).

**도구**
- **Prisma 생성기**: `prisma-client`(소스 생성)를 쓴다. 기존 `prisma-client-js` 는 Node 22가 한글이 들어간 경로에서
  package.json `imports`(`#main-entry-point`)를 해석하지 못해 런타임 오류가 난다.
