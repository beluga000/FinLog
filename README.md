# FINLOG

부부·개인 가계부 + 목표 자산 시뮬레이션. 요구사항은 [PROD.MD](./PROD.MD) (PRD v3) 참고. 이전 버전은 PROD.v2.MD.

## 서버 올리기 (한 줄)

처음 설정(아래 [실행](#실행))을 한 번 마쳤다면, 이후에는 프로젝트 폴더에서 이 명령어 하나면 된다.

```bash
npm run dev
```

- PC: http://localhost:3000
- 폰(같은 와이파이): 터미널에 뜨는 `Network: http://192.168.x.x:3000` 주소로 접속
- 3000번 포트를 다른 앱이 쓰고 있으면 포트를 바꿔서 띄운다: `npm run dev -- -p 3001`
- 끄기: 터미널에서 `Ctrl + C`
- 개발 모드는 각 페이지를 **처음 열 때** 컴파일하느라 1초 안팎 걸린다(두 번째부터는 빠름). 실제 속도를 보려면 `npm run build && npm start`

## 배포 (Vercel + Neon)

운영 주소: https://finlog-chi.vercel.app — DB는 Neon Postgres(`neon.ts`, 싱가포르), 함수 리전은 `vercel.json` 의 `sin1`.

```bash
npx prisma migrate deploy   # 스키마 변경이 있을 때만. directUrl(DATABASE_URL_UNPOOLED)로 적용된다
vercel deploy --prod        # 배포
```

- 운영 환경변수(`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `AUTH_SECRET`, `CRON_SECRET`)는 Vercel에만 있다: `vercel env ls`
- Prisma 는 Rust 엔진 없이 `@prisma/adapter-pg`(node-postgres)로 접속한다(`engineType = "client"`). 엔진 바이너리가 Vercel 번들에서 빠지는 문제 때문
- 로컬에서 `npm start` 로 실서버 모드를 띄울 때는 `AUTH_TRUST_HOST=true` 가 필요하다(Vercel 에서는 자동)
- 로컬 `.env` 는 로컬 Postgres 만 가리킨다. `neon env pull`/`neon deploy` 는 `.env` 의 `DATABASE_URL` 을 운영 주소로 덮어쓰므로 쓰지 않는다.
  운영 마이그레이션은 `neon connection-string production --ssl verify-full` 로 받은 direct 주소를 그 명령에만 넘긴다
- 시드는 원격 DB 에서 실행되지 않는다(`ALLOW_REMOTE_SEED=1` 일 때만)
- 운영 데모 계정 비밀번호는 `demo1234` 가 아니다 — 로컬 `.env.demo.local`(커밋 제외)에만 있다

## 보안

- **가입 승인**: 새 가입자는 승인 대기(`User.approvedAt = null`)로 만들어지고 로그인할 수 없다. 관리자가 [프로필 메뉴 → 가입 승인](`/admin`)에서 승인·거절·승인 취소.
  관리자 = 환경변수 `ADMIN_EMAILS`(쉼표 구분)의 이메일 — 이 이메일로 가입하면 즉시 승인된다. 승인 취소하면 기존 세션도 다음 요청부터 막힌다.
  운영 설정: `vercel env add ADMIN_EMAILS production` 후 `vercel deploy --prod`
- **시도 횟수 제한** (`src/lib/security/rate-limit.ts`, DB `RateLimit` 테이블): 로그인 계정별 15분 5회·IP별 15분 30회, 가입 IP별 1시간 5회, 초대 코드 사용자별 1시간 10회
- **초대 코드**: 8자리(헷갈리는 I·O·0·1 제외 32글자, 약 1조 가지), 72시간·1회용
- **소셜 로그인**: 제공자가 인증한 이메일만 기존 계정에 연결(`isVerifiedEmail`)
- **보안 헤더** (`next.config.ts`): 다른 사이트에 끼워넣기 금지(`frame-ancestors 'none'`, `X-Frame-Options`), `nosniff`, Referrer·Permissions 정책

## 실행

처음 한 번만 하는 설정이다.

```bash
npm install                 # postinstall 에서 prisma generate 실행
# .env 의 DATABASE_URL 에 Postgres 비밀번호 입력 (finlog DB는 migrate 가 생성)
npm run db:migrate          # 스키마 적용
npm run db:seed             # 데모 부부 가구 (minsu@demo.finlog / jiyoung@demo.finlog, 비밀번호 demo1234)
npm run dev                 # http://localhost:3000
```

| 스크립트 | 내용 |
|---|---|
| `npm test` | 계산 로직 단위 테스트 (DB 불필요) |
| `TEST_DATABASE_URL=... DATABASE_URL=... npm run test:db` | DB 통합 테스트 — 공개범위·가구 격리·정기거래(AC-3/4/9), 온보딩(AC-10/11), 홈·쓸 수 있는 돈·확인할 일·결산(AC-13~16, 19) |
| `npm run typecheck` / `npm run lint` / `npm run build` | 정적 검사·빌드 |

DB 테스트는 각자 만든 데이터만 지우므로 로컬 개발 DB로 돌려도 된다 (`TEST_DATABASE_URL=$DATABASE_URL`).

### 모바일에서 지출 기록하기

| 방법 | 사용법 |
|---|---|
| 문자 붙여넣기 | [+] → [문자 붙여넣기]. 카드 승인 문자에서 금액·날짜·사용처를 채우고, 같은 사용처의 최근 카테고리를 고른다. 취소 문자는 채우지 않는다 |
| Android 공유하기 | 홈 화면에 FINLOG 설치 → 문자 앱에서 [공유 → FINLOG]. 빠른 입력이 채워진 채 열린다 |
| iOS 단축어 | 자동화: "카드 승인" 문자 수신 → 텍스트 복사 → `/dashboard?add=paste` 열기 → [문자 붙여넣기] 한 번 |

같은 금액·±1일 지출이 이미 있으면 저장 전에 "이미 기록한 것 같아요"로 한 번 확인한다.

## 구조

```
src/
├─ app/(auth)            로그인·가입
├─ app/(app)             dashboard(홈) · ledger(+recurring) · goals(+[id] 만약에 패널) · assets · reports(결산·통계) · settings
│                        simulate → 대표 목표 상세, more → 홈 리다이렉트 (v3)
├─ app/onboarding        5단계: 목표 → 자산 → 월수입 → 고정비 → 월 시작일. 초대코드 참여자는 바로 홈
├─ app/manifest.ts       PWA 설치 + Android 공유받기(share_target, POST)
├─ app/share             공유받은 문자 원문 → 5분짜리 httpOnly 쿠키 → /dashboard?add=shared
├─ app/icons/[size]      앱 아이콘 (180·192·512, maskable)
├─ app/api/cron/recurring  정기 거래 생성 (Vercel Cron, Bearer CRON_SECRET)
├─ features/<domain>     queries.ts(조회) · actions.ts(Server Actions) · components/
├─ lib/finance           순수 계산 함수 + 테스트 (금액 BigInt, 월 복리, 공개범위, 월 경계, 목표 역산,
│                        쓸 수 있는 돈 spendable · 월간 결산 제안 closing · 카드 문자 파서 card-message)
├─ lib/db                Prisma 클라이언트, 요청 단위 가구 컨텍스트
└─ generated/prisma      Prisma 생성물 (git 제외)
```

## 설계 메모

- **가구 격리**: 모든 조회·변경은 세션에서 얻은 `householdId` 로만. 클라이언트가 보낸 가구 ID는 쓰지 않는다.
- **공개범위**: `PRIVATE` 는 DB 쿼리 단계에서 제외, `SUMMARY_ONLY` 는 id·메모·가맹점을 뺀 합계용 객체로만 내려간다.
- **이중 집계 방지**: 카드 사용 = 지출, 카드대금 = 이체(통계 제외), 증권 입금 = 저축·투자.
- **잔액**: 마지막 잔액 스냅샷(그날 마감) + 이후 거래 흐름. 부채는 음수로 저장.
- **쓸 수 있는 돈**: 수입 − 고정비 − 목표 저축 − 변동 지출. 고정비는 활성 정기 규칙 금액을 월초부터 전액 차감하고,
  그 규칙이 만든 거래는 변동 지출에서 뺀다(이중 차감 방지). 직접 "고정" 체크한 거래는 규칙이 없으므로 변동 지출로 센다.
- **확인할 일**: 정기 규칙이 만든 거래는 `needsReview = true` 로 생성 → 홈에서 [맞아요]·금액 수정으로 확정.
  평가액 계좌(투자·연금·부동산·기타자산)는 마지막 잔액 입력이 30일 넘으면 잔액 업데이트로 나온다.
- **월간 결산**: 저장하지 않고 조회 시점에 계산. 목표 저축 계획값은 지금 목표 설정 기준이다.
- **문자 원문**: 파싱은 클라이언트에서만. 원문은 URL·DB·로그에 남기지 않는다(공유받기는 POST + 1회용 쿠키).
- **숫자 서체**: 숫자·구분자만 고정폭(`FinNum`, unicode-range), ₩·한글은 본문 서체 — 고정폭 서체에서 ₩가 W로 보이는 문제 방지.
- **Prisma 생성기**: `prisma-client`(소스 생성)를 쓴다. 기존 `prisma-client-js` 는 Node 22가 한글이 들어간 경로에서
  package.json `imports`(`#main-entry-point`)를 해석하지 못해 런타임 오류가 난다.
