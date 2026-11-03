# 새 기기 개발 환경 설정

다른 컴퓨터(집 맥북 등)에서 저장소를 처음 받아 개발할 때 한 번만 하는 설정이다.
매일 쓰는 실행 명령은 [README](README.md#서버-올리기-한-줄), 운영 배포는 [DEPLOY.md](DEPLOY.md).

> git 에 없는 것: `.env*`(비밀값), `node_modules`, `src/generated`(Prisma 클라이언트), `.vercel`·`.neon`(CLI 연결 정보), 로컬 DB 데이터.
> 아래 순서대로 기기마다 다시 만든다.

## 0. 떠나기 전 (기존 기기)

- 작업을 모두 커밋하고 `git push` — `git status` 가 깨끗하고 `master` 가 `origin/master` 와 같은지 확인
- **배포만 하고 커밋을 빠뜨리면 다른 기기에 그 코드가 없다**

## 1. 도구 설치 (macOS)

```bash
# Homebrew 가 없으면 https://brew.sh 안내대로 먼저 설치
brew install node@22 git
brew install postgresql@16 && brew services start postgresql@16
node -v      # v22.x
```

- Node 는 **22.x** 를 쓴다 (기존 개발 기기와 같은 메이저 버전).
- Windows 라면 Node 22 LTS 와 PostgreSQL 16 설치 프로그램을 쓰면 된다.

## 2. 코드 받기

```bash
git clone https://github.com/beluga000/FinLog.git
cd FinLog
npm install          # postinstall 에서 prisma generate 까지 실행
```

줄바꿈은 `.gitattributes` 가 LF 로 통일하므로 기기별 `core.autocrlf` 설정은 신경 쓰지 않아도 된다.

## 3. `.env` 만들기

```bash
cp .env.example .env
```

| 변수 | 로컬 값 |
|---|---|
| `DATABASE_URL` | `postgresql://<맥 사용자>@localhost:5432/finlog` — `<맥 사용자>` 는 `whoami` 결과. brew Postgres 는 비밀번호 없음 |
| `DATABASE_URL_UNPOOLED` | `DATABASE_URL` 과 같은 값 |
| `AUTH_SECRET` | `openssl rand -base64 32` 결과 (기기마다 달라도 된다) |
| `CRON_SECRET` | 아무 값 (예: `local`) |
| `ADMIN_EMAILS` | 로컬 관리자 화면을 보려면 `minsu@demo.finlog` |
| `AUTH_KAKAO_*`, `AUTH_GOOGLE_*` | 소셜 로그인을 시험할 때만 |

> ⚠ **운영(Neon) 주소를 `.env` 에 넣지 않는다.** `prisma migrate dev`·`npm run db:seed` 가 운영 DB 에서 실행될 수 있다.
> 운영 DB 작업은 DEPLOY.md 처럼 명령 한 줄에만 주소를 넘긴다.

## 4. DB 스키마·데모 데이터

```bash
npm run db:migrate   # finlog DB 생성 + 마이그레이션 전체 적용
npm run db:seed      # 데모 부부 가구 (minsu@demo.finlog / jiyoung@demo.finlog, 비밀번호는 README 참고)
```

## 5. 실행·확인

```bash
npm run dev                     # http://localhost:3000
npm test                        # 단위 테스트 (DB 불필요)
npm run typecheck && npm run lint
TEST_DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)" npm run test:db   # DB 통합 테스트 (로컬 DB)
```

DB 테스트는 각자 만든 데이터만 지우므로 로컬 개발 DB 로 돌려도 된다.

## 6. (선택) 배포·운영 DB 작업까지 이 기기에서 할 때

```bash
npx vercel login
npx vercel link      # 기존 프로젝트 supersun/finlog 선택
npx neon auth        # 운영 DB 마이그레이션용 Neon CLI 로그인
```

- 운영 환경변수는 Vercel 에만 있으므로 옮길 필요 없다 (`npx vercel env ls` 로 확인).
- 절차는 DEPLOY.md 그대로 — 순서는 항상 **운영 DB 마이그레이션 → 배포**.

## 기기를 오가며 작업할 때

| 언제 | 할 일 |
|---|---|
| 작업 시작 | `git pull` |
| 남이 만든(다른 기기에서 만든) 마이그레이션을 받았을 때 | `npm run db:migrate` — 로컬 DB 에 적용 |
| `package.json` 이 바뀌었을 때 | `npm install` |
| 작업 끝 | 커밋 → `git push` |

## 문제 해결

| 증상 | 해결 |
|---|---|
| `PrismaClientValidationError` · 새 컬럼을 모른다고 함 | `npx prisma generate` 후 개발 서버 재시작 (이미 켜진 서버는 옛 클라이언트를 들고 있다) |
| `role "..." does not exist` / 접속 거부 | `.env` 의 사용자 이름을 `whoami` 결과로, `brew services list` 로 Postgres 실행 확인 |
| 3000번 포트 사용 중 | `npm run dev -- -p 3001` |
| 로그인 직후 계속 로그인 화면 | `AUTH_SECRET` 을 바꿨다면 브라우저 쿠키 삭제 후 다시 로그인 |
