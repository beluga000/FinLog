# FINLOG

부부·개인 가계부 + 목표 자산 시뮬레이션. 요구사항은 [PROD.MD](./PROD.MD) (PRD v2) 참고.

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
| `TEST_DATABASE_URL=... DATABASE_URL=... npm run test:db` | 공개범위·가구 격리·정기거래 DB 통합 테스트 (AC-3/4/9) |
| `npm run typecheck` / `npm run lint` / `npm run build` | 정적 검사·빌드 |

## 구조

```
src/
├─ app/(auth)            로그인·가입
├─ app/(app)             dashboard · ledger(+recurring) · assets · goals(+[id]) · simulate · settings · more
├─ app/onboarding        혼자/부부 시작, 초대코드 참여
├─ app/api/cron/recurring  정기 거래 생성 (Vercel Cron, Bearer CRON_SECRET)
├─ features/<domain>     queries.ts(조회) · actions.ts(Server Actions) · components/
├─ lib/finance           순수 계산 함수 + 테스트 (금액 BigInt, 월 복리, 공개범위, 월 경계, 목표 역산)
├─ lib/db                Prisma 클라이언트, 요청 단위 가구 컨텍스트
└─ generated/prisma      Prisma 생성물 (git 제외)
```

## 설계 메모

- **가구 격리**: 모든 조회·변경은 세션에서 얻은 `householdId` 로만. 클라이언트가 보낸 가구 ID는 쓰지 않는다.
- **공개범위**: `PRIVATE` 는 DB 쿼리 단계에서 제외, `SUMMARY_ONLY` 는 id·메모·가맹점을 뺀 합계용 객체로만 내려간다.
- **이중 집계 방지**: 카드 사용 = 지출, 카드대금 = 이체(통계 제외), 증권 입금 = 저축·투자.
- **잔액**: 마지막 잔액 스냅샷(그날 마감) + 이후 거래 흐름. 부채는 음수로 저장.
- **Prisma 생성기**: `prisma-client`(소스 생성)를 쓴다. 기존 `prisma-client-js` 는 Node 22가 한글이 들어간 경로에서
  package.json `imports`(`#main-entry-point`)를 해석하지 못해 런타임 오류가 난다.
