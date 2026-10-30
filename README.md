# FINLOG

부부·개인 가계부 + 목표 자산 시뮬레이션. 요구사항은 [PROD.MD](./PROD.MD) (PRD v3) 참고. 이전 버전은 PROD.v2.MD.

## 실행

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
