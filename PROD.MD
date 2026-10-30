# [PRD v3] FINLOG - 목표까지 남은 거리를 매일 보여주는 부부/개인 가계부

> **프로젝트 명**: FINLOG (Finance + Log)
> **문서 버전**: v3.0 (2026-10-30) · 이전 버전: `PROD.v2.MD`(v2, 2026-10-06), `PROD.v1.MD`
> **목적**: 월별 지출·소비 모니터링, 부부/개인 맞춤형 자산 배분 가이드, 목표 자산 달성 시뮬레이션·예측을 제공하는 반응형 웹 서비스
> **핵심 가치**: "기록(Log)을 넘어 N년 뒤 자산 목표 달성을 가이드하는 스마트 파이낸스 파트너"

### v2 → v3 주요 변경
v2 MVP는 기능(계좌·거래·공개범위·목표 역산)은 갖췄지만 화면끼리 이어지지 않았다. 가입 직후 빈 대시보드, 같은 무게의 위젯 10개, 기록과 목표의 단절이 문제였다.
v3는 **데이터 모델(§3)과 계산 규칙(§4)을 유지**하고, 사용 흐름을 "목표" 하나로 다시 꿴다.

| 영역 | v2 | v3 |
|---|---|---|
| 온보딩 | 가구 모드 선택 1단계 (나머지는 대시보드 체크리스트) | 5단계: 모드 → 첫 목표 → 현재 자산 → 수입·고정비 → 결과. 계좌·정기거래·목표를 한 번에 생성 (§1-7) |
| 홈 | 위젯 10개 동일 비중 | 대표 목표 → 쓸 수 있는 돈 → 이번 달 저축 → 확인할 일 → 최근 기록 (§2-8) |
| 예산 | 카테고리별 월 예산 (P1) | **쓸 수 있는 돈** = 수입 − 고정비 − 목표 저축 − 변동 지출. 목표에서 역산 (§2-7). 카테고리 예산은 보류 |
| 기록 피드백 | 저장 토스트 | 저장 후 쓸 수 있는 돈의 변화 표시 (§2-5) |
| 시뮬레이터 | 독립 화면 `/simulate` | 목표 상세의 "만약에" 패널, 결과를 목표에 반영 (§4-1) |
| 통계 차트 | 홈 | 리포트 탭 + 월간 결산 (§2-9, §4-7) |
| 탭 | 홈·가계부·자산·목표·더보기 | 홈·가계부·목표·자산·리포트 (§2) |

v1 → v2 변경 내역은 `PROD.v2.MD` 참고.

---

## 0. 사용자 & 문제 정의

### 0.1 타깃 페르소나
| 페르소나 | 상황 | 핵심 니즈 |
|---|---|---|
| **P1. 신혼 맞벌이 부부** (메인) | 각자 월급·카드, 생활비 일부만 공동 | "우리 돈이 한 달에 어디로 새는지", "누가 얼마 냈는지", "집 살 돈 언제 모이는지" |
| **P2. 사회초년생 1인** | 첫 월급, 적금·ETF 입문 | 소비 통제 + 투자 시작 가이드 |
| **P3. 자녀 계획 중인 부부** | 출산·육아휴직으로 소득 감소 예정 | 라이프 이벤트 반영 시뮬레이션 |

### 0.2 해결할 문제
1. 기존 가계부는 **기록에서 끝남** → "그래서 목표까지 얼마나 남았나"로 연결되지 않음.
2. 부부 가계부는 **전부 공유 or 전부 분리**의 양자택일 → 실제 부부는 "생활비는 공동, 용돈은 각자".
3. 이체(내 통장 → 내 증권계좌)가 지출로 잡혀 **통계가 왜곡**됨.
4. 투자 "추천"은 특정 상품 권유로 흐르기 쉬움 → 규제·신뢰 문제.

### 0.3 성공 지표 (KPI)
| 지표 | 목표 (출시 3개월) |
|---|---|
| 주간 활성 가구(WAH) 중 월 20건 이상 기록 가구 비율 | ≥ 40% |
| 부부 모드 초대 수락률 | ≥ 60% |
| 목표(Goal) 1개 이상 설정 가구 비율 | ≥ 50% |
| 4주 리텐션 | ≥ 35% |
| 대시보드 첫 로드 (P75, 4G 모바일) | ≤ 1.5s |

### 0.4 제품 원칙 (v3)
1. **모든 화면은 "목표까지 얼마나 남았나"에 답한다.** 홈의 첫 블록은 대표 목표의 진척과 페이스다. 통계는 리포트로 내려간다.
2. **예산은 목표에서 거꾸로 나온다.** 사용자가 예산을 따로 정하지 않는다. 지출을 기록할 때마다 "쓸 수 있는 돈"이 줄어드는 것이 매일의 피드백이다.
3. **빈 화면을 만들지 않는다.** 온보딩에서 숫자 4가지(목표, 현재 자산, 월수입, 고정비)만 받으면 홈이 의미 있게 채워진다. 계좌 세부 정보는 나중에 다듬는다.

### 0.5 핵심 루프
| 주기 | 행동 | 화면 | 다음 단계로 가는 장치 |
|---|---|---|---|
| 가입 1회 | 목표 세우기 | 온보딩 5단계 | 결과 화면 "홈으로" |
| 매일 | 기록하기 (10초) | [+] 빠른 입력 | 저장 후 쓸 수 있는 돈 변화 |
| 수시 | 페이스 확인 | 홈 | 확인할 일, 목표 카드 |
| 월 시작일 | 결산 | 리포트 상단 | 목표 조정 → 다음 달 쓸 수 있는 돈 재계산 |

---

## 1. 주요 요구사항 및 핵심 기능

> 우선순위: **P0** = MVP 필수 / **P1** = 출시 직후 / **P2** = 고도화 / **P3** = 장기

### ① 계정 · 가구(Household) · 모드

#### 1-1. 가구 모델
- 모든 데이터는 **가구(Household)** 소속. 개인 모드 = 구성원 1명인 가구. → 개인↔부부 전환 시 데이터 마이그레이션 불필요. **(P0)**
- 사용자는 동시에 1개 가구에만 소속(MVP). 가구 구성원 최대 2명(부부), 추후 확장 가능하게 스키마는 N명 허용.

#### 1-2. 부부 연결 (P0)
- 초대 방식: 초대 링크/6자리 코드 (유효기간 72시간, 1회용).
- 연결 시 **피초대자의 기존 개인 가구 데이터** 처리 선택: (a) 공동 가구로 병합 (b) 개인 데이터는 비공개로 가져오기 (c) 새로 시작.
- 역할: `OWNER`(가구 설정·구성원 관리) / `MEMBER`. 둘 다 거래 입력 가능.

#### 1-3. 항목별 공개범위 (P0) — v2 핵심
| Visibility | 배우자에게 보이는 것 | 예시 |
|---|---|---|
| `SHARED` | 전체 내역 | 생활비, 관리비, 공동 저축 |
| `SUMMARY_ONLY` | 카테고리 합계만 (건별 내역·메모 숨김) | 개인 용돈, 취미 |
| `PRIVATE` | 아무것도 안 보임 (가구 합산에서도 제외) | 비상금, 선물 준비 |
- 계좌(Account) 단위 기본값 + 거래 단위 override.
- 대시보드 뷰 토글: **[우리] / [나] / [배우자(공개분)]**.

#### 1-4. 분담 & 정산 (P1)
- 분담 규칙: 50:50 / 소득 비례(월 수입 기준 자동 계산) / 커스텀 비율. 카테고리별로 다르게 설정 가능.
- `SHARED` 지출에 대해 "실제 낸 사람" vs "분담해야 할 금액" 비교 → **월말 정산액** 산출 ("A가 B에게 128,000원").
- 정산 완료 처리 시 정산 이체 거래 자동 생성(내부이체, 통계 미반영).

#### 1-5. 가구 탈퇴/해제 (P1)
- 탈퇴자: 본인이 작성한 `PRIVATE`/`SUMMARY_ONLY` 데이터 + 본인 명의 계좌는 새 개인 가구로 이관.
- `SHARED` 데이터: 남은 구성원 가구에 유지, 탈퇴자에게는 CSV 사본 제공.
- 30일 유예 후 확정 (실수 방지).

#### 1-6. 인증 (P0)
- 이메일 + 소셜(카카오, 구글). 선택적 앱 잠금(PIN/생체 — PWA WebAuthn, P2).

#### 1-7. 온보딩 (P0) — v3 재설계
가입 → 5단계 → 홈. 초대 코드 참여자는 1단계에서 바로 홈으로 간다(이미 목표가 있는 가구에 합류).

| 단계 | 묻는 것 | 생성되는 데이터 |
|---|---|---|
| 1. 모드 | 부부로 시작 / 혼자 시작 / 초대 코드로 참여 | `Household`, `HouseholdMember(OWNER)` (참여 시 `MEMBER`) |
| 2. 첫 목표 | 템플릿(주택 자금·비상금·결혼/출산·직접 입력) + 금액 + 목표 월 | `AssetGoal(priority=1, expectedReturn=템플릿 기본값)` |
| 3. 현재 자산 | 입출금·예적금·투자 칸별 잔액, 대출(선택). **합계 1개 이상 필수**, 칸별은 선택 | 칸마다 `Account` 1개 + 오늘 날짜 `AccountSnapshot`. 자산 계좌는 목표의 `linkedAccountIds`에 연결 |
| 4. 수입·고정비 | 월급(세후)·입금일, 고정 지출 N줄(이름·금액·출금일) | 줄마다 `RecurringRule`. 월급일 ≠ 1일이면 "월 시작일을 N일로 할까요?" → `Household.monthStartDay` |
| 5. 결과 | 월 필요 저축액, 쓸 수 있는 돈 분해, 부족 시 대안 1개 | 없음 (계산만) |

- 목표 템플릿 기본값 (금액·기간·수익률): 주택 자금 2억·5년·3%, 비상금 1,000만·1년·2%, 결혼·출산 5,000만·3년·3%, 직접 입력 3년·3%. 고정비는 2단계 뒤(4단계)에 받으므로 비상금을 고정비 배수로 제안하는 것은 v3 이후.
- 3단계 각 자산 칸에 "목표에 포함" 체크(기본: 예적금·투자 켬, 입출금 끔). 입출금 통장을 입력하지 않으면 월급·고정비 규칙용 통장을 잔액 0으로 만든다.
- 4단계 월급일이 2~28일이면 "한 달을 월급날부터 세기" 체크(기본 끔). 부부 모드는 "배우자 월급" 줄을 추가할 수 있다(규칙 작성자는 입력한 사람).
- **저장 시점**: 5단계 "홈으로"를 누를 때 서버 액션 1회, DB 트랜잭션 1개로 전부 생성. 중간 이탈 시 DB에는 아무것도 남지 않는다. 입력 중 값은 클라이언트(`sessionStorage`)에만 보관.
- 1단계에서 가구를 만들지 않으므로 별도의 "온보딩 완료" 플래그가 필요 없다. 멤버십이 있으면 완료 상태다.
- 각 단계 하단에 "나중에 바꿀 수 있어요" 안내. 뒤로 가기로 값을 유지한 채 이전 단계로 이동.

---

### ② 월별 자산 흐름 & 지출 통계

#### 2-1. 계좌(Account) 중심 구조 (P0)
모든 돈의 움직임은 계좌 사이의 흐름으로 표현한다.

| AccountType | 예 | 순자산 반영 |
|---|---|---|
| `CASH` / `CHECKING` | 입출금 통장, 현금 | 자산 |
| `SAVINGS` | 예금·적금·파킹통장 | 자산 |
| `INVESTMENT` | 증권(ISA·일반), 코인 | 자산 (평가액) |
| `PENSION` | 연금저축, IRP, DC | 자산 |
| `REAL_ESTATE` / `OTHER_ASSET` | 주택, 전세보증금, 자동차 | 자산 (수동 평가) |
| `CREDIT_CARD` | 신용카드 | 부채 (결제 전 사용액) |
| `LOAN` | 주담대, 신용대출, 학자금 | 부채 |

#### 2-2. 거래 유형 (P0) — 이중 집계 방지
| TxType | 의미 | 수입/지출 통계 | 저축·투자 통계 |
|---|---|---|---|
| `INCOME` | 외부 → 내 계좌 | 수입 ✅ | — |
| `EXPENSE` | 내 계좌 → 외부 | 지출 ✅ | — |
| `TRANSFER` | 내 계좌 ↔ 내 계좌 (예: 통장→카드대금) | ❌ | ❌ |
| `SAVE_INVEST` | 내 계좌 → 내 자산형 계좌 (적금 납입, 증권 이체) | ❌ | ✅ |
| `LOAN_REPAY` | 원금 상환 (이자는 EXPENSE로 분리) | ❌ | ✅ (부채 감소) |
| `ADJUSTMENT` | 평가손익·잔액 보정 | ❌ | 순자산만 반영 |

- **카드 결제 처리 원칙**: 카드 사용 시점에 `EXPENSE`(카드계좌), 결제일 통장 출금은 `TRANSFER`. → 지출은 사용일 기준으로 한 번만 집계.

#### 2-3. 수입 관리 (P0)
- 정기 급여(세후 실수령액 기준), 상여, 부수입, 이자·배당, 기타.
- 급여 세전 입력 시 실수령액 간이 계산(4대보험·소득세 간이세액표) — **P2**.

#### 2-4. 지출 카테고리 (P0)
- 2단계 카테고리 (대분류 > 소분류). 기본 제공 + 가구별 커스텀.
- 각 카테고리에 **50/30/20 버킷** 매핑: `NEEDS`(필수) / `WANTS`(선택) / `SAVINGS`.
- 기본 대분류: 식비, 주거·관리비, 통신, 교통·차량, 생활용품, 의료·건강, 보험, 교육, 문화·여가, 쇼핑·의류, 경조사, 용돈, 육아, 반려동물, 이자·수수료, 기타.
- 고정/변동 플래그: 정기 거래 규칙에서 생성된 지출 = 고정비.

#### 2-5. 입력 편의 (P0~P1)
- **빠른 입력** (P0): 금액 → 카테고리 → 저장 3탭. 최근 사용 카테고리·가맹점 자동완성.
- **정기 거래 규칙** (P0): 월급, 월세, 통신비, 적금 자동 생성 (매월 N일 / 말일 / 영업일 보정).
- **CSV/Excel 가져오기** (P1): 주요 카드사·은행 내보내기 포맷 프리셋 + 컬럼 매핑 UI. 중복 판별 해시 `(accountId, date, amount, merchant)`.
- **자동 분류 규칙** (P1): "가맹점명 포함 '스타벅스' → 식비/카페". 수동 수정 시 규칙 생성 제안.
- **마이데이터/오픈뱅킹 연동** (P3): 본인신용정보관리업 라이선스 또는 제휴 필요 → 장기 과제.
- **모바일 수집 (P0, v3.1)** — 주 사용 환경이 모바일이므로 CSV보다 **카드 승인 문자·알림**을 1차 수집 경로로 둔다. 웹/PWA로 가능한 범위부터:
  - 빠른 입력의 [문자 붙여넣기]: 승인 문자를 붙여넣으면 금액·날짜·가맹점·카드사를 채운다. 취소 문자는 인식만 하고 자동 입력하지 않는다. 파싱은 클라이언트 순수 함수(`card-message.ts`)로, 원문은 서버에 저장하지 않는다.
  - Android 공유하기(Web Share Target, `POST`): 문자 앱에서 [공유 → FINLOG] → 빠른 입력이 채워진 채 열린다. 원문은 URL에 싣지 않고 5분짜리 httpOnly 쿠키로 한 번만 넘긴다(로그인을 거쳐도 남도록).
  - iOS 단축어: "카드 승인 문자 수신 → 텍스트 복사 → FINLOG `/dashboard?add=paste` 열기" 안내. 앱은 빠른 입력을 붙여넣기 단계로 연다(iOS는 클립보드 자동 읽기 불가 → 버튼 1회).
  - 중복 경고: 붙여넣기·공유로 채운 지출을 저장할 때, 같은 금액·±1일의 기존 지출이 있으면 "이미 기록한 것 같아요"로 확인 후 저장.
  - 네이티브 껍데기(Capacitor)로 Android 알림 자동 수집 → `needsReview` 거래로 생성 후 확인할 일에서 확정하는 방식은 P2.

- **저장 후 피드백** (P0, v3): 빠른 입력 저장 결과 화면에 "오늘 쓸 수 있는 돈 16.6만 → 11.2만", 해당 카테고리의 이번 달 누계·전월 대비를 표시. 서버 액션이 변경 전후 값을 함께 돌려준다.

#### 2-6. 월 경계 설정 (P0)
- 가구 설정 "월 시작일": 1일(기본) 또는 급여일(예: 25일). 모든 월별 통계는 이 경계로 집계.
- 시간대: `Asia/Seoul` 고정. DB에는 날짜(`DATE`)로 저장하여 TZ 이슈 제거.

#### 2-7. 쓸 수 있는 돈 (P0) — v3 신규, 카테고리 예산 대체
```
쓸 수 있는 돈 = 수입 − 고정비 − 목표 저축 − 변동 지출
하루 권장액  = max(쓸 수 있는 돈, 0) / 이번 달 남은 일수(오늘 포함)
```
| 항목 | 정의 |
|---|---|
| 수입 | max(활성 정기 `INCOME` 규칙 합, 이번 달 실제 `INCOME` 합) |
| 고정비 | 활성 정기 `EXPENSE` 규칙 합. 월초부터 전액 차감 (실현 여부 무관) |
| 목표 저축 | `ACTIVE` 목표별 `monthlyCommit ?? max(필요 납입액, 0)` 합 |
| 변동 지출 | 이번 달 `EXPENSE` 합. 단, 고정비로 잡힌 정기 규칙이 생성한 거래는 제외 |

- 활성 정기 규칙이 생성한 지출(`recurringRuleId`가 그 규칙)은 고정비로 이미 빠졌으므로 **변동 지출에 다시 넣지 않는다** (이중 차감 금지). 사용자가 직접 "고정" 체크한 거래는 규칙이 없으므로 변동 지출로 센다.
- 고정비·수입 규칙은 이번 달 범위에 걸치는 것만 센다 (`startDate < 월 끝`, `endDate` 없음 또는 `≥ 월 시작`).
- 이번 달 저축 진행 = 이번 달 (`SAVE_INVEST` + `LOAN_REPAY`) / 목표 저축.
- 값이 음수면 "N원 초과" 상태(경고색)로 표시하고 하루 권장액은 0.
- 범위: `우리` 뷰는 가구 공개 데이터 전체 + 목표 저축 차감. `나`/`배우자` 뷰는 해당 사람의 수입·정기거래·지출만 쓰고 목표 저축은 차감하지 않는다(목표는 가구 공동). `PRIVATE`는 다른 뷰처럼 상대 화면에서 제외.
- 카테고리별 예산(v2 P1)은 보류. 필요해지면 쓸 수 있는 돈의 하위 항목으로 추가한다.

#### 2-8. 홈 (P0) — v3 재설계
위에서 아래 순서 고정. 데스크톱은 2단(왼쪽: 목표·최근 기록 / 오른쪽: 쓸 수 있는 돈·확인할 일).

| 순서 | 블록 | 내용 |
|---|---|---|
| 1 | 대표 목표 | `ACTIVE` 목표 중 priority 1위. 현재액/목표액, 진척 바, "N개월 앞섬/뒤처짐" 칩, 예상 달성 월. 다른 목표는 한 줄 요약 |
| 2 | 쓸 수 있는 돈 | §2-7 값, 남은 일수, 하루 권장액, 생활비 사용 바 |
| 3 | 이번 달 저축 | 실제 저축 / 목표 저축 진행 바 |
| 4 | 확인할 일 | §2-10. 0건이면 블록 숨김 |
| 5 | 최근 기록 | 최근 5건 (공개범위 적용), "가계부에서 보기" |

- `SUMMARY_ONLY` 합산 안내, 뷰 토글 [우리/나/배우자]는 v2와 같다.
- 목표가 없는 가구(v2 기존 사용자 등)는 1번 자리에 "첫 목표 정하기" 카드를 보여준다.

#### 2-9. 리포트 (P0) — v2 대시보드 차트 이동
| 위젯 | 내용 |
|---|---|
| 월간 결산 | §4-7. 리포트 탭 최상단 |
| 요약 카드 | 순자산, 수입, 지출, 저축·투자액, 저축률 = (SAVE_INVEST + LOAN_REPAY) / INCOME |
| 50/30/20 비교 | 실제 NEEDS/WANTS/SAVINGS 비율 vs 기준선 |
| 카테고리 Top 5 | 금액 + 전월 대비 증감 |
| 월별 추이 | 최근 12개월 수입/지출/저축 |
| 순자산 추이 | 월말 스냅샷 기준 (자산/부채 분리) |
| 이상 지출 감지 (P2) | 직전 3개월 평균 + 2σ 초과 하이라이트 |
| 부부 기여도 (P1) | 공개 범위 내 수입·공동지출·저축 기여 비율 |

#### 2-10. 확인할 일 (P0) — v3 신규
- **정기거래 확인**: 정기 규칙으로 자동 생성된 거래는 `needsReview = true`로 만든다. 홈에서 "보험 70만 빠져나갔나요?" → [맞아요]는 플래그 해제, [금액 수정]은 거래 편집. 확인 전에도 통계에는 포함된다.
- **잔액 업데이트**: 자산 계좌 중 마지막 스냅샷이 30일 넘은 계좌. → 잔액 입력 다이얼로그.
- 최대 3건, 오래된 순.

---

### ③ 자산 배분 가이드 (Portfolio Guide)

> ⚖️ **규제 설계 원칙**: 특정 금융상품·종목을 개인에게 권유하면 자본시장법상 **투자자문업** 등록 이슈가 생길 수 있다.
> FINLOG는 **자산군(Asset Class) 단위의 교육·시뮬레이션용 모델 배분**만 제공하고, 개별 종목/상품명은 노출하지 않는다.
> 모든 화면에 "투자 권유가 아닌 참고용 시뮬레이션이며, 과거 수익률이 미래 수익을 보장하지 않습니다" 고지. (출시 전 법률 검토 필수)

#### 3-1. 투자성향 진단 (P1)
- 7~10문항 설문 (투자 기간, 손실 감내 수준, 투자 경험, 소득 안정성, 금융자산 비중, 목적 등) → 점수 합산 → 5단계:
  `안정형` / `안정추구형` / `위험중립형` / `적극투자형` / `공격투자형`
- 부부 모드: 각자 진단 → 가구 성향은 **더 보수적인 쪽** 기본값, 수동 변경 가능.
- 진단 유효기간 1년 → 만료 시 재진단 유도.

#### 3-2. 사전 점검 규칙 (Pre-check) — 배분 전에 먼저 (P1)
추천 엔진은 아래 순서로 판단하고, 앞 단계 미충족 시 해당 액션을 1순위로 제시한다.
1. **비상금**: 유동성 자산 ≥ 월 지출 평균 × N개월 (맞벌이 3개월, 외벌이·프리랜서 6개월).
2. **고금리 부채**: 대출 금리 > 기대수익률(기본형 기준) 인 부채 → 상환 우선 권고.
3. **세제 혜택 계좌 한도**: ISA, 연금저축, IRP 납입 여력 안내 (세액공제 한도는 연도별 설정값으로 관리).
4. **단기 목표 자금**: 3년 이내 사용 예정 금액은 원금보장형으로 분리.

#### 3-3. 모델 포트폴리오 (P1)
자산군 기준 배분. 수익률·변동성 가정은 **관리자 설정값**(연 1회 갱신)이며 사용자에게 가정치임을 명시.

| 자산군 | 기대수익률(연, 명목) | 변동성(σ) | 안정형 | 안정추구 | 위험중립 | 적극 | 공격 |
|---|---|---|---|---|---|---|---|
| 현금성·예적금 | 3.0% | 0.5% | 60 | 35 | 20 | 10 | 5 |
| 국내 채권 | 3.5% | 4% | 25 | 25 | 20 | 10 | 5 |
| 해외 채권(환헤지) | 4.0% | 5% | 10 | 15 | 15 | 10 | 5 |
| 국내 주식 지수 | 6.0% | 18% | 0 | 5 | 10 | 15 | 15 |
| 해외(미국) 주식 지수 | 7.5% | 16% | 5 | 15 | 25 | 40 | 50 |
| 배당·인컴 주식 | 6.5% | 14% | 0 | 5 | 5 | 10 | 10 |
| 리츠(REITs) | 5.5% | 18% | 0 | 0 | 5 | 5 | 5 |
| 금·원자재 | 4.0% | 15% | 0 | 0 | 0 | 0 | 5 |
| **합계** | | | 100 | 100 | 100 | 100 | 100 |

> 위 수치는 설계용 초기값(placeholder)이며 실제 서비스 전 출처 있는 장기 가정치로 교체한다.

- **포트폴리오 기대수익률** = Σ(wᵢ·μᵢ), **변동성** = √(wᵀΣw) (상관행렬 Σ는 설정값, MVP는 단순화 가능).
- **기간 조정 (Glide Path)**: 목표까지 남은 기간 < 5년이면 주식 비중 상한을 단계적으로 축소 (예: 5년 60%, 3년 40%, 1년 15%).

#### 3-4. 커스텀 & 비교 (P1)
- 추천안 복제 → 슬라이더로 비중 조정 (합계 100% 강제, 자동 정규화 옵션).
- 추천안 vs 내 커스텀 vs 현재 실제 보유 비중을 **나란히 비교** (기대수익률, 변동성, 최악 연도 예상 손실 −2σ).
- 저장한 플랜을 목표(Goal)에 연결.

#### 3-5. 현재 보유 비중 & 리밸런싱 (P2)
- 투자 계좌의 보유 내역을 자산군 태그로 분류 (수동 입력).
- 목표 비중 대비 ±5%p 이탈 시 리밸런싱 알림 + "신규 납입금으로 맞추기" 안내 (매도 없이 조정).

---

### ④ 자산 예측 & 시뮬레이션

#### 4-1. 기본 시뮬레이션 (P0)
> v3: 독립 화면 대신 **목표 상세의 "만약에" 패널**로 제공한다. 입력 기본값은 해당 목표의 현재액·납입액·수익률·목표일. "이 계획으로 바꾸기"로 `monthlyCommit`, `expectedReturn`, `targetDate`를 저장. `/simulate`는 대표 목표 상세로 리다이렉트(목표가 없으면 목표 만들기).

입력: 현재 자산(PV), 월 납입액(PMT), 연 기대수익률(R), 기간(N년), 기대 물가상승률(π, 기본 2.5%), **납입액 연 증가율(g, 기본 0%)**.

**계산 규칙**
- 월 수익률: `r = (1 + R)^(1/12) − 1` (연 복리를 월로 환산; 단순 R/12 아님)
- 기말 납입 기준 미래가치:
  `FV = PV·(1+r)^n + PMT·[((1+r)^n − 1) / r]`, n = 12N (r = 0 이면 `PV + PMT·n`)
- 납입액 증가(g) 적용 시: 연 단위 루프로 매년 PMT ← PMT·(1+g) 갱신 (닫힌 식 대신 반복 계산 → 차트 데이터와 동일 로직 사용)
- 실질가치: `FV_real = FV / (1+π)^N` (화면에서 명목/실질 토글, **기본 표시는 실질** — "오늘 돈 가치로")
- 누적 수익률: `(FV − 총납입원금) / 총납입원금`, 연환산 수익률(IRR)도 함께 표시
- 출력: 연도별 `{year, contributed, balance, balanceReal, gain}` 배열 → 누적 영역 차트(원금 vs 수익)

#### 4-2. 시나리오 비교 (P1)
- 비관 / 기본 / 낙관 = μ − σ/2, μ, μ + σ/2 (포트폴리오 기준) → 세 곡선 동시 표시.

#### 4-3. 세금 반영 (P2)
- 계좌 유형별 과세 단순 모델: 일반 과세(이자·배당 15.4%), ISA(비과세 한도 후 9.9% 분리과세), 연금(연금소득세 3.3~5.5%).
- 세율·한도는 **연도별 설정 테이블**로 관리 (하드코딩 금지).

#### 4-4. 몬테카를로 시뮬레이션 (P2)
- 월 수익률 ~ 로그정규분포(포트폴리오 μ, σ 기반), 1,000~5,000회 시행 (Web Worker에서 실행, UI 블로킹 금지).
- 출력: P10 / P50 / P90 밴드 차트, **목표 달성 확률(%)**.
- 시드 고정 옵션 → 같은 입력 = 같은 결과 (테스트·공유 재현성).

#### 4-5. 라이프 이벤트 (P2)
- 타임라인에 이벤트 추가: 결혼(일시 지출), 주택 구입(일시 지출 + 대출 발생), 출산·육아휴직(N개월 수입 감소 + 고정비 증가), 차량 구입, 은퇴(납입 중단 → 인출 시작).
- 이벤트는 현금흐름 시계열을 수정하는 함수로 구현 → 시뮬레이션 엔진은 "월별 현금흐름 배열"만 입력받도록 일반화.

#### 4-6. 목표 자산 (Goal Tracking) (P0)
- 목표 복수 등록 (예: 비상금 1,000만 / 주택자금 3억 / 은퇴자금 10억), **우선순위** 지정.
- 필드: 이름, 목표 금액(실질 기준 여부 선택), 목표일, 연결 계좌(들), 연결 포트폴리오 플랜.
- **월 필요 납입액 역산**:
  `PMT = (Target − PV·(1+r)^n) · r / ((1+r)^n − 1)`
  - 결과 ≤ 0 → "현재 자산만으로 달성 가능" 표시
  - 결과 > 현재 월 저축 가능액(최근 3개월 평균 저축액) → **대안 3종 자동 제시**:
    (a) 목표일 연장 시 필요한 기간, (b) 목표 금액 하향 시 달성 가능 금액, (c) 더 높은 성향 포트폴리오 적용 시 필요액 (+리스크 경고)
- 목표 기간 역산: 현재 납입액 유지 시 달성 시점 (`n = log((FV·r + PMT)/(PV·r + PMT)) / log(1+r)`).
- **진척도**: 연결 계좌 현재 잔액 / 목표액 + "계획 대비 앞섬/뒤처짐 N개월" 표시.
- 여러 목표의 필요 납입액 합 > 저축 가능액이면 우선순위 순으로 배정 시뮬레이션.

- **대표 목표** (v3): `ACTIVE` 중 priority가 가장 작은 목표. 목표 목록에서 순서를 바꾸면 홈 대표 목표가 바뀐다.

#### 4-7. 월간 결산 (P0, v3 축소판)
- 월 시작일 이후 리포트 탭 최상단에 **지난달** 결산을 표시. 조회 시점 계산, 저장하지 않는다.
- 내용: 저축률, 목표 저축 달성(실제/계획), 쓸 수 있는 돈 결과(N원 남김 / N원 초과), 대표 목표 앞섬·뒤처짐의 전월 대비 변화.
- 다음 달 조정 제안 최대 3개 (규칙 기반):
  - 초과 시: 전월 대비 가장 많이 늘어난 카테고리 → "외식 +12만"
  - 목표 저축 미달 2개월 연속: 목표 조정 대안(기간 연장/금액 하향) → 목표 상세 "만약에"로 이동
  - 잔액 스냅샷 30일 초과 계좌 → 잔액 업데이트
- 부부 모드: 두 사람에게 동일 결산(공개 범위 준수). PDF·푸시 알림은 P2.

---

### ⑤ 멀티 디바이스 / Cross-Platform
- **Mobile-first 반응형** (P0): 하단 탭바(홈 / 가계부 / 목표 / 자산 / 리포트), 플로팅 [+] 빠른 입력 버튼. 설정은 상단 프로필 메뉴.
- **PWA**: 홈 화면 설치·공유받기 (P0, v3.1 G단계), 오프라인 입력 큐 (P1)(온라인 복귀 시 동기화, 충돌 시 last-write-wins + 충돌 로그).
- **푸시 알림** (P2): 예산 초과, 정기 거래 확인, 월간 리포트, 배우자 공동 지출 등록.
- 데스크톱: 좌측 사이드바 + 다단 대시보드, 가계부 표 뷰(정렬·필터·일괄 편집).
- 다크 모드, 금액 표기 `₩1,234,567` / 축약 `123.4만`, 큰 글씨 대응(WCAG AA).

---

## 2. 화면 구조 (IA)

```
/ (랜딩)
/login, /signup
/onboarding                            ← 5단계 (§1-7). 멤버십 없으면 (app) 접근 시 여기로
/(app)
 ├─ /dashboard        [탭: 홈]          ← 대표 목표 · 쓸 수 있는 돈 · 저축 · 확인할 일 · 최근 기록 (§2-8)
 ├─ /ledger           [탭: 가계부]      ← 월 캘린더 + 리스트, 필터
 │   ├─ /ledger/recurring              ← 가계부 내 "고정" 탭 (정기 거래 규칙)
 │   └─ /ledger/import                 ← CSV 가져오기 (P1)
 ├─ /goals            [탭: 목표]        ← 목표 목록(우선순위 순서 변경)
 │   └─ /goals/[id]                    ← 진척·역산·대안 + "만약에" 시뮬레이터 패널
 ├─ /assets           [탭: 자산]        ← 계좌 목록, 순자산, 잔액 업데이트
 ├─ /reports          [탭: 리포트]      ← 월간 결산 + 통계 차트 (§2-9), ?month=yyyy-mm
 ├─ /settings                          ← 상단 프로필 메뉴에서 진입. 가구·구성원·초대, 카테고리, 월 시작일
 ├─ /portfolio, /settlement            ← P1 (보류)
 └─ (제거) /simulate → /goals/[대표 목표], /more → /dashboard 리다이렉트
```

---

## 3. 데이터 모델 (Prisma 초안)

**설계 원칙**
- 금액은 **원 단위 정수 `BigInt`** (부동소수 금지). 수익률·비율은 `Decimal(9,6)`.
- 모든 도메인 테이블에 `householdId` → 쿼리 레이어에서 가구 격리 강제.
- 소프트 삭제(`deletedAt`) + 감사 로그.
- 날짜는 `@db.Date` (거래일), 생성/수정 시각은 `timestamptz`.

```prisma
enum Role            { OWNER MEMBER }
enum Visibility      { SHARED SUMMARY_ONLY PRIVATE }
enum AccountType     { CASH CHECKING SAVINGS INVESTMENT PENSION REAL_ESTATE OTHER_ASSET CREDIT_CARD LOAN }
enum TxType          { INCOME EXPENSE TRANSFER SAVE_INVEST LOAN_REPAY ADJUSTMENT }
enum BudgetBucket    { NEEDS WANTS SAVINGS }
enum RiskProfile     { STABLE STABLE_SEEKING NEUTRAL ACTIVE AGGRESSIVE }
enum SplitMethod     { EQUAL INCOME_RATIO CUSTOM }
enum PlanSource      { RECOMMENDED CUSTOM }

model User {
  id            String   @id @default(cuid())
  email         String   @unique
  name          String
  createdAt     DateTime @default(now())
  memberships   HouseholdMember[]
  riskAssessments RiskAssessment[]
}

model Household {
  id               String   @id @default(cuid())
  name             String
  monthStartDay    Int      @default(1)          // 1~28, 급여일 기준 월 경계
  emergencyMonths  Int      @default(3)
  createdAt        DateTime @default(now())
  members          HouseholdMember[]
  accounts         Account[]
  categories       Category[]
  transactions     Transaction[]
  goals            AssetGoal[]
  plans            PortfolioPlan[]
  invites          HouseholdInvite[]
  splitRules       SplitRule[]
}

model HouseholdMember {
  id          String    @id @default(cuid())
  householdId String
  userId      String
  role        Role
  joinedAt    DateTime  @default(now())
  leftAt      DateTime?
  household   Household @relation(fields: [householdId], references: [id])
  user        User      @relation(fields: [userId], references: [id])
  @@unique([householdId, userId])
}

model HouseholdInvite {
  id          String    @id @default(cuid())
  householdId String
  code        String    @unique                // 6자리
  expiresAt   DateTime
  usedAt      DateTime?
  household   Household @relation(fields: [householdId], references: [id])
}

model Account {
  id                String      @id @default(cuid())
  householdId       String
  ownerUserId       String?                    // null = 공동 명의
  name              String
  type              AccountType
  institution       String?
  defaultVisibility Visibility  @default(SHARED)
  assetClassTag     String?                    // 투자계좌의 대표 자산군 (P2: 보유내역 단위로 분리)
  isArchived        Boolean     @default(false)
  household         Household   @relation(fields: [householdId], references: [id])
  snapshots         AccountSnapshot[]
  @@index([householdId])
}

model AccountSnapshot {                        // 월말(또는 수동) 잔액/평가액
  id        String   @id @default(cuid())
  accountId String
  asOf      DateTime @db.Date
  balance   BigInt                             // 부채는 음수
  account   Account  @relation(fields: [accountId], references: [id])
  @@unique([accountId, asOf])
}

model Category {
  id          String       @id @default(cuid())
  householdId String
  parentId    String?
  name        String
  txType      TxType                           // INCOME / EXPENSE 등
  bucket      BudgetBucket?
  icon        String?
  sortOrder   Int          @default(0)
  household   Household    @relation(fields: [householdId], references: [id])
  @@index([householdId, txType])
}

model Transaction {
  id              String     @id @default(cuid())
  householdId     String
  createdByUserId String
  paidByUserId    String?                      // 정산용 "실제 낸 사람"
  type            TxType
  date            DateTime   @db.Date
  amount          BigInt                       // 항상 양수, 방향은 type + 계좌로 표현
  fromAccountId   String?
  toAccountId     String?
  categoryId      String?
  merchant        String?
  memo            String?
  visibility      Visibility
  isFixed         Boolean    @default(false)
  recurringRuleId String?
  importHash      String?                      // CSV 중복 방지
  settlementId    String?
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt
  deletedAt       DateTime?
  household       Household  @relation(fields: [householdId], references: [id])
  @@index([householdId, date])
  @@index([householdId, categoryId, date])
  @@unique([householdId, importHash])
}

model RecurringRule {
  id           String   @id @default(cuid())
  householdId  String
  template     Json                            // Transaction 생성 템플릿
  dayOfMonth   Int                             // 0 = 말일
  businessDayAdjust String @default("NONE")    // NONE | PREV | NEXT
  startDate    DateTime @db.Date
  endDate      DateTime? @db.Date
  lastRunOn    DateTime? @db.Date
}

model Budget {
  id          String   @id @default(cuid())
  householdId String
  categoryId  String?                          // null = 전체
  month       String                           // "2026-10", null 대신 기본값 행으로 템플릿 관리
  amount      BigInt
  @@unique([householdId, categoryId, month])
}

model SplitRule {
  id          String      @id @default(cuid())
  householdId String
  categoryId  String?                          // null = 기본 규칙
  method      SplitMethod
  ratios      Json?                            // { userId: 0.6, ... } CUSTOM 전용
  household   Household   @relation(fields: [householdId], references: [id])
}

model Settlement {
  id          String    @id @default(cuid())
  householdId String
  month       String
  fromUserId  String
  toUserId    String
  amount      BigInt
  settledAt   DateTime?
}

model RiskAssessment {
  id         String      @id @default(cuid())
  userId     String
  answers    Json
  score      Int
  profile    RiskProfile
  takenAt    DateTime    @default(now())
  expiresAt  DateTime
  user       User        @relation(fields: [userId], references: [id])
}

model AssetClassAssumption {                   // 관리자 설정: 기대수익률/변동성
  id             String  @id                     // "US_EQUITY" 등
  label          String
  expectedReturn Decimal @db.Decimal(9, 6)
  volatility     Decimal @db.Decimal(9, 6)
  effectiveFrom  DateTime @db.Date
}

model PortfolioPlan {
  id           String     @id @default(cuid())
  householdId  String
  name         String
  source       PlanSource
  baseProfile  RiskProfile?
  allocations  Json                            // [{ assetClassId, weight }] 합계 1.0
  expectedReturn Decimal  @db.Decimal(9, 6)    // 저장 시점 계산값 (캐시)
  volatility     Decimal  @db.Decimal(9, 6)
  createdAt    DateTime   @default(now())
  household    Household  @relation(fields: [householdId], references: [id])
}

model AssetGoal {
  id             String    @id @default(cuid())
  householdId    String
  name           String
  targetAmount   BigInt
  targetIsReal   Boolean   @default(true)       // 오늘 가치 기준 여부
  targetDate     DateTime  @db.Date
  priority       Int
  planId         String?
  linkedAccountIds String[]
  monthlyCommit  BigInt?                        // 사용자가 확정한 월 납입액
  status         String    @default("ACTIVE")   // ACTIVE | ACHIEVED | PAUSED
  household      Household @relation(fields: [householdId], references: [id])
}

model LifeEvent {                               // P2
  id          String   @id @default(cuid())
  householdId String
  kind        String                             // MARRIAGE | HOUSE | CHILD | CAR | RETIRE | CUSTOM
  startMonth  String
  params      Json                               // 이벤트별 파라미터
}

model TaxRuleSet {                              // P2: 연도별 세율·한도
  year   Int    @id
  rules  Json
}

model AuditLog {
  id          String   @id @default(cuid())
  householdId String
  userId      String
  action      String
  entity      String
  entityId    String
  diff        Json?
  at          DateTime @default(now())
  @@index([householdId, at])
}
```

**집계 성능**: `MonthlySummary(householdId, month, viewerScope, payload Json)` 캐시 테이블 — 거래 변경 시 해당 월만 무효화·재계산. (MVP는 실시간 집계로 시작, 거래 1만 건 초과 가구 생기면 도입)

### v3 스키마 변경
v3는 스키마를 거의 바꾸지 않는다. 목표 우선순위(`AssetGoal.priority`)와 확정 납입액(`AssetGoal.monthlyCommit`)은 이미 있다.

| 변경 | 내용 | 용도 |
|---|---|---|
| `Transaction.needsReview Boolean @default(false)` | 정기 규칙으로 생성 시 `true` | §2-10 확인할 일 |

`Budget` 모델은 유지하되 v3에서는 사용하지 않는다.

---

## 4. 도메인 로직 모듈 (순수 함수, `src/lib/finance`)

> 전부 **side-effect 없는 순수 함수** + 단위 테스트 100% 커버. UI·서버 양쪽에서 동일 코드 사용.

| 모듈 | 함수 | 비고 |
|---|---|---|
| `money.ts` | `formatKRW`, `toManwon`, `sumBigInt` | BigInt ↔ 표시 변환 |
| `period.ts` | `getMonthRange(date, monthStartDay)` | 급여일 기준 월 경계 |
| `stats.ts` | `calculateMonthlyStats(txs, categories, viewer)` | 수입/지출/저축/저축률/버킷비율/Top5, **공개범위 필터 적용** |
| `stats.ts` | `compareMonths(cur, prev)` | 증감액·증감률 |
| `settlement.ts` | `calculateSettlement(sharedTxs, splitRules, incomes)` | 정산액 (누가 누구에게 얼마) |
| `risk.ts` | `scoreRiskAssessment(answers)` → `RiskProfile` | 문항 가중치 설정 기반 |
| `portfolio.ts` | `runPreChecks(householdState)` | 비상금·고금리부채·단기자금 액션 리스트 |
| `portfolio.ts` | `recommendPortfolio(profile, horizonYears, assumptions)` | 모델 배분 + glide path 조정 |
| `portfolio.ts` | `portfolioMetrics(allocations, assumptions)` | 기대수익률·변동성 |
| `projection.ts` | `toMonthlyRate(annual)` | `(1+R)^(1/12)−1` |
| `projection.ts` | `predictAssetGrowth({pv, pmt, annualReturn, years, inflation, pmtGrowth, cashflowOverrides?})` | 연도별 시계열 (명목/실질) |
| `projection.ts` | `calculateRequiredInvestment({target, pv, years, annualReturn, targetIsReal, inflation})` | 역산, ≤0 처리 |
| `projection.ts` | `calculateMonthsToGoal({target, pv, pmt, annualReturn})` | 달성 시점 역산, 불가 시 `null` |
| `projection.ts` | `suggestAlternatives(goal, capacity)` | 기간 연장/금액 하향/성향 상향 대안 |
| `spendable.ts` | `calculateSpendable({income, fixed, goalSaving, variableExpense, daysLeft})` | v3 §2-7. 남은 돈·하루 권장액·초과 여부 |
| `spendable.ts` | `summarizeSpendableInputs(rules, txs, goals)` | 정기 규칙·거래·목표 → 위 입력값 (이중 차감 방지) |
| `review.ts` | `buildMonthlyReview(prev, prevPrev, goals, snapshots)` | v3 §4-7 결산 + 조정 제안 |
| `montecarlo.ts` | `simulate({…, runs, seed})` → `{p10[], p50[], p90[], successRate}` | Web Worker 실행 (P2) |
| `events.ts` | `applyLifeEvents(baseCashflow, events)` | 월별 현금흐름 배열 변환 (P2) |

**검증용 기준값 (테스트 케이스)**
- PV=0, PMT=1,000,000, R=0%, N=10 → FV = 120,000,000
- PV=10,000,000, PMT=0, R=5%, N=10 → FV ≈ 16,288,946
- Target=1,000,000,000, PV=100,000,000, R=6%, N=15 → 필요 PMT = 2,650,097원 (원 단위 올림 — 목표 미달 방지, 월 환산 r = 1.06^(1/12)−1, 기말 납입 / 엑셀 `PMT()`로 교차 검증)
- Target ≤ PV·(1+r)^n → 필요 PMT ≤ 0 → "이미 달성 가능"
- 쓸 수 있는 돈: 수입 8,200,000, 고정비 2,150,000, 목표 저축 1,980,000, 변동 지출 2,410,000, 남은 10일 → 1,660,000원, 하루 166,000원
- 같은 조건에 변동 지출 54,000 추가 → 1,606,000원 / 오늘 권장 166,000 → 112,000

---

## 5. 비기능 요구사항

### 5.1 보안 · 개인정보
- **가구 격리**: 모든 Repository 함수가 `householdId`를 필수 인자로 받고, 세션의 멤버십과 대조. (Supabase 사용 시 RLS 정책 병행)
- **공개범위 강제는 서버에서**: `PRIVATE`/`SUMMARY_ONLY` 필터링을 클라이언트에 맡기지 않는다. 배우자 조회 시 응답 DTO에서 건별 필드 제거.
- 전송 TLS, 저장 암호화(DB at-rest), 메모 필드는 애플리케이션 레벨 암호화 검토(P2).
- **개인정보보호법**: 수집 항목 최소화(실명·주민번호·계좌번호 전체 수집 안 함, 계좌는 별칭 + 끝 4자리), 개인정보 처리방침, 회원 탈퇴 시 30일 후 완전 삭제, 데이터 내보내기(CSV/JSON).
- 감사 로그: 가구 설정 변경, 구성원 변경, 대량 삭제, 데이터 내보내기.
- Rate limit: 로그인·초대코드 검증 (브루트포스 방지).

### 5.2 성능
- 대시보드 TTFB ≤ 500ms (서버 컴포넌트에서 집계 → 스트리밍).
- 시뮬레이터 슬라이더 조작 → 차트 갱신 ≤ 50ms (클라이언트 순수 함수 계산, 서버 왕복 없음).
- 몬테카를로 5,000회 ≤ 1.5s (Web Worker).

### 5.3 품질
- 단위 테스트: `lib/finance` 커버리지 100%, 금액 계산 경계값(0원, 0%, 음수 수익률, 1개월).
- E2E (Playwright): 온보딩 → 거래 입력 → 대시보드 반영 / 부부 초대 → 공개범위 검증 / 목표 역산.
- 접근성: WCAG 2.1 AA, 차트는 표 대체 뷰 제공.
- 관측성: 에러 트래킹(Sentry), 핵심 이벤트 분석(거래 입력, 목표 생성, 초대 수락).

### 5.4 디자인 (v3)
- shadcn/ui 무채색 기반을 유지하고 **액센트 색 1개**(저축·목표 진척을 뜻하는 짙은 초록)와 **숫자 전용 서체**(고정폭, `tabular-nums`)만 추가한다. 라이트/다크 모두 정의.
- 상태 색은 액센트와 분리: 앞섬·달성 = 액센트, 주의(쓸 수 있는 돈 80% 이상 사용) = 주황, 초과·뒤처짐 = 빨강.
- 빈 상태는 차트 대신 다음 행동 1개를 안내한다 (예: "첫 지출을 기록해 보세요").

---

## 6. 권장 기술 스택 (v2 구체화)

| 영역 | 선택 | 이유 |
|---|---|---|
| Framework | **Next.js 15 (App Router)**, TypeScript strict | RSC로 대시보드 집계 서버 처리 |
| UI | Tailwind CSS, shadcn/ui, Lucide React | |
| Chart | Recharts | 반응형·선언적. 몬테카를로 밴드는 Area 조합 |
| Server | Server Actions(변경) + Route Handlers(조회 API/PWA 동기화) | |
| Validation | **Zod** (폼·서버 액션 입력 공용 스키마) | |
| DB/ORM | PostgreSQL (Supabase) + Prisma | |
| Auth | Auth.js (Kakao, Google, Email) 또는 Supabase Auth | |
| State | TanStack Query (서버 상태), Zustand (뷰 토글·입력 드래프트 등 UI 상태만) | |
| 수치 | 금액 BigInt, 비율 `decimal.js` | 부동소수 오차 방지 |
| PWA | Serwist (next-pwa 후속) | |
| Test | Vitest, Playwright | |
| 배포 | Vercel + Supabase, Cron(정기 거래 생성·월간 리포트) | |

### 폴더 구조 (기능 단위)
```
src/
├─ app/                      # 라우트 (IA 2장 참고), (auth)/(app) 라우트 그룹
├─ features/
│  ├─ household/             # 초대, 멤버, 공개범위, 정산
│  ├─ ledger/                # 거래, 정기거래, 가져오기, 분류규칙
│  ├─ accounts/              # 계좌, 스냅샷, 순자산
│  ├─ budget/
│  ├─ portfolio/             # 성향진단, 사전점검, 배분, 비교
│  ├─ simulation/            # 시뮬레이터, 몬테카를로 워커, 라이프 이벤트
│  └─ goals/
│     └─ (각 feature 내부: components/ actions.ts queries.ts schema.ts)
├─ lib/
│  ├─ finance/               # 4장 순수 함수 + __tests__
│  ├─ db/                    # prisma client, household-scoped repository 헬퍼
│  └─ auth/
├─ components/
│  ├─ ui/                    # shadcn
│  ├─ charts/
│  └─ layout/                # AppShell, BottomTabBar, Sidebar, ViewScopeToggle
└─ types/
prisma/
├─ schema.prisma
└─ seed.ts                   # 기본 카테고리, 자산군 가정치, 데모 부부 가구
```

---

## 7. 릴리즈 로드맵 & 수용 기준

### Phase 1 — MVP (P0) · v2에서 구현 완료
범위: 인증, 가구(개인/부부 초대), 공개범위, 계좌, 거래 CRUD(6유형), 카테고리, 정기거래, 월 경계, 대시보드, 기본 시뮬레이터, 목표 + 역산.

**수용 기준 (유지, 회귀 테스트 대상)**
- AC-1: 카드로 5만원 지출 후 결제일에 통장→카드 TRANSFER 등록 시, 월 지출 통계는 5만원(1회)만 집계된다.
- AC-2: 통장→증권 SAVE_INVEST 100만원은 지출에 포함되지 않고 저축률에 반영된다.
- AC-3: A가 `PRIVATE`로 등록한 거래는 B의 어떤 API 응답(목록·합계·검색)에도 나타나지 않는다.
- AC-4: A가 `SUMMARY_ONLY`로 등록한 거래는 B에게 카테고리 합계로만 보이고 건별 금액·메모·가맹점은 응답에 포함되지 않는다.
- AC-5: 월 시작일 25일 설정 시, 10월 통계는 9/25~10/24 거래로 집계된다.
- AC-6: 시뮬레이터 결과가 4장 기준값 테스트와 일치한다 (원 단위 반올림 오차 ±1원).
- AC-7: 목표 필요 납입액 ≤ 0 이면 "이미 달성 가능"이, 저축 가능액 초과 시 대안 3종이 표시된다.
- AC-8: 375px 폭에서 모든 P0 화면이 가로 스크롤 없이 동작한다.
- AC-9: 다른 가구의 거래 ID로 직접 요청 시 404를 반환한다.

### Phase 1.5 — v3 흐름 재설계 (P0)
범위: 온보딩 5단계(§1-7), 쓸 수 있는 돈(§2-7), 홈(§2-8), 리포트 탭(§2-9), 확인할 일(§2-10), 목표+시뮬레이터 통합(§4-1), 월간 결산(§4-7), 탭 구조(§2), 디자인 토큰(§5.4).

| 단계 | 내용 | AC |
|---|---|---|
| A | 로컬 DB 준비, 시드를 v3 온보딩 결과 모양으로 갱신, `needsReview` 마이그레이션 | AC-1~9 회귀 통과 |
| B | `spendable.ts` 순수 함수 + 테스트 | AC-12, AC-14 |
| C | 온보딩 5단계 | AC-10, AC-11, AC-18 |
| D | 홈 + 기록 피드백 + 확인할 일 | AC-13, AC-19 |
| E | 탭 구조, 리포트 탭, 목표+시뮬레이터 통합 | AC-15, AC-17 |
| F | 월간 결산 | AC-16 |

**수용 기준 (v3 추가)**
- AC-10: 신규 가입자가 온보딩 5단계를 마치면 홈 첫 화면에 대표 목표와 쓸 수 있는 돈이 실제 값으로 표시되고, 빈 차트가 없다.
- AC-11: 온보딩 완료 시 입력한 자산 칸마다 계좌 1개와 오늘 날짜 잔액 스냅샷, 수입·고정비 줄마다 정기 규칙 1개, priority 1 목표 1개가 생성된다. 5단계 전에 이탈하면 DB에 아무것도 생성되지 않는다.
- AC-12: §4 쓸 수 있는 돈 기준값 테스트를 통과한다 (1,660,000원 / 하루 166,000원).
- AC-13: 변동 지출 저장 응답에 변경 전후 쓸 수 있는 돈이 포함되고, 저장 결과 화면에 표시된다.
- AC-14: 정기 규칙으로 생성된 고정 지출이 실현돼도 쓸 수 있는 돈은 다시 줄지 않는다.
- AC-15: 목표 상세 "만약에"에서 월 저축을 바꾸면 서버 왕복 없이 달성 시점이 갱신되고, "이 계획으로 바꾸기" 시 `monthlyCommit`이 저장되어 홈 목표 저축에 반영된다.
- AC-16: 월 시작일이 지난 뒤 리포트 탭 최상단에 지난달 결산과 조정 제안(최대 3개)이 표시된다.
- AC-17: 모바일 하단 탭이 홈·가계부·목표·자산·리포트이고, `/simulate`와 `/more`는 리다이렉트된다.
- AC-18: 초대 코드로 참여한 사용자는 온보딩 2~5단계 없이 홈으로 이동한다.
- AC-19: 정기 규칙으로 생성된 거래가 홈 확인할 일에 나타나고, [맞아요]를 누르면 사라진다.

### Phase 1.6 — 모바일 수집 (P0, v3.1)
| 단계 | 내용 | AC |
|---|---|---|
| G | PWA 설치(manifest·아이콘), 승인 문자 파서 + [문자 붙여넣기], Android 공유받기, iOS 단축어 진입, 중복 경고 | AC-20~23 |

- AC-20: 홈 화면에 설치할 수 있는 manifest(이름·아이콘·standalone·시작 URL `/dashboard`)가 제공된다.
- AC-21: 주요 카드사 승인 문자 예시를 붙여넣으면 금액·날짜·가맹점이 채워지고, 취소 문자는 "취소 문자예요"로 안내하고 채우지 않는다.
- AC-22: Android에서 문자를 FINLOG로 공유하면 빠른 입력이 채워진 채 열리고, 원문이 URL·DB에 남지 않는다.
- AC-23: 붙여넣기·공유로 채운 지출을 저장할 때 같은 금액·±1일 지출이 있으면 확인을 거친다.

### Phase 2 — P1
성향 진단, 사전 점검, 모델 포트폴리오·커스텀·비교, 시나리오, 카테고리 예산(필요 시), CSV 가져오기(데스크톱 보조), 자동 분류, 정산, 탈퇴 정책, 월간 결산 PDF, PWA 오프라인 입력 큐.

### Phase 3 — P2
몬테카를로, 라이프 이벤트, 세금 반영, 리밸런싱, 이상 지출 감지, 푸시, 세전→세후 계산, 앱 잠금.

### Phase 4 — P3
마이데이터/오픈뱅킹 연동, AI 소비 인사이트(자연어 질의 "지난달 외식비 왜 늘었어?"), 3인 이상 가구.

---

## 8. 리스크 & 대응

| 리스크 | 영향 | 대응 |
|---|---|---|
| 투자 "추천"이 투자자문업으로 해석 | 서비스 중단·제재 | 자산군 단위 교육용 배분만, 상품명 미노출, 고지문, 출시 전 법률 자문 |
| 수기 입력 피로 → 이탈 | 리텐션 저하 | 정기거래·빠른입력·CSV·자동분류, 장기적으로 마이데이터 |
| 부부 간 프라이버시 갈등 | 초대 거절·탈퇴 | 3단계 공개범위, 기본값 명확 안내, "배우자에게 보이는 화면" 미리보기 |
| 수익률 가정이 과도하게 낙관적 | 신뢰 하락 | 기본 표시를 실질가치로, 시나리오·확률 밴드 병행, 가정치 출처 명시 |
| 금액 계산 오류 | 치명적 신뢰 손상 | BigInt/decimal, 순수함수 100% 테스트, 엑셀 교차검증 |
| 세율·한도 변경 | 계산 부정확 | 연도별 설정 테이블, 하드코딩 금지 |

---

## 9. 오픈 이슈

### v3에서 결정됨 (2026-10-30)
| 질문 | 결정 |
|---|---|
| 목표가 여러 개일 때 홈 대표 목표 | priority 1위 하나. 나머지는 한 줄 요약 |
| 카테고리 예산 | 쓸 수 있는 돈 총액으로 대체. 카테고리 예산은 보류 |
| 부부 모드에서 쓸 수 있는 돈 기준 | 기본 "우리", 상단 토글로 나·배우자 전환 (§2-7 범위 규칙) |
| 온보딩 현재 자산 입력 | 합계 1개 이상 필수, 칸별 세부는 선택 |
| 디자인 톤 | 액센트 색 1개 + 숫자 서체만 이번에 정한다 (§5.4) |
| 인증 | Auth.js 유지 (v2 구현) |

### 남은 이슈
1. 부부 모드에서 한 사람이 2개 이상 가구 소속(예: 부모님 가계 관리) 허용 여부 — MVP는 1개로 제한.
2. 수익률 가정치의 출처 및 갱신 주체 (목표 템플릿 기본값 2~3% 포함).
3. 수익 모델: 무료 + 프리미엄(몬테카를로·라이프이벤트·리포트 PDF)? 광고 미도입 원칙?
4. 오프라인 동기화 충돌 정책을 last-write-wins로 충분한지.
5. 기존 v2 사용자(목표 없는 가구)에게 온보딩 2~5단계를 다시 보여줄지 — 현재안은 홈의 "첫 목표 정하기" 카드로 유도.

---

## 10. Claude Code 실행 프롬프트 (v3 단계별)

> Phase 1(v2) 단계별 프롬프트는 `PROD.v2.MD` §10 참고. v3는 §7 Phase 1.5의 A~F 단계로 나눠 진행하고, 단계마다 `npm test`·`typecheck`·`lint`를 통과시킨 뒤 다음으로 간다.

### A — 환경 · 스키마
```text
Read PROD.MD (v3). Add Transaction.needsReview (default false) with a migration; set it true in materializeRecurring.
Update prisma/seed.ts so the demo couple looks like a finished v3 onboarding: priority-1 goal, asset accounts linked to it with snapshots, salary + fixed-cost recurring rules.
Run migrate + seed locally and confirm AC-1~9 tests still pass.
```

### B — 쓸 수 있는 돈
```text
Add src/lib/finance/spendable.ts per PROD.MD §2-7 and §4 (calculateSpendable, summarizeSpendableInputs).
Fixed expenses come from active recurring EXPENSE rules; transactions generated by those rules must not be subtracted again (manual isFixed transactions still count).
Write Vitest tests with the §4 reference values and edge cases (overspent, 0 days left, no goals, me/partner scope without goal saving).
```

### C — 온보딩
```text
Rebuild /onboarding as the 5 steps in PROD.MD §1-7. Keep draft state client-side; create household, accounts, snapshots, recurring rules and goal in one server action inside one DB transaction on the final step.
Invite-code joiners go straight to /dashboard. Verify AC-10, AC-11, AC-18.
```

### D — 홈
```text
Rebuild /dashboard per PROD.MD §2-8: primary goal, spendable, this month's saving, review items (§2-10), recent 5 transactions.
Quick-add returns before/after spendable and shows it after save. Empty states suggest one next action. Verify AC-13, AC-19, AC-8.
```

### E — 탭 · 리포트 · 목표 통합
```text
Mobile tabs: 홈·가계부·목표·자산·리포트; settings via header profile menu. Move v2 dashboard charts to /reports.
Embed the simulator as a "만약에" panel in /goals/[id] with "이 계획으로 바꾸기" saving monthlyCommit/expectedReturn/targetDate.
Redirect /simulate and /more. Apply the §5.4 accent and numeric font tokens. Verify AC-15, AC-17.
```

### F — 월간 결산
```text
Add src/lib/finance/review.ts (buildMonthlyReview) with tests, and render last month's review at the top of /reports per PROD.MD §4-7. Verify AC-16.
```

### G — 모바일 수집 (웹/PWA)
```text
Add app/manifest.ts with icons and a POST share_target. Add src/lib/finance/card-message.ts (parseCardMessage) with tests for major issuers' approval/cancel formats.
Quick-add gets a [문자 붙여넣기] step; shared text arrives via a 5-minute httpOnly cookie, never the URL. Warn on likely duplicates before saving. Verify AC-20~23.
```
