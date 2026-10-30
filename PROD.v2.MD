# [PRD v2] FINLOG - 부부/개인 맞춤형 가계부 & 자산 설계/예측 플랫폼

> **프로젝트 명**: FINLOG (Finance + Log)
> **문서 버전**: v2.0 (2026-10-06) · 이전 버전: `PROD.v1.MD`
> **목적**: 월별 지출·소비 모니터링, 부부/개인 맞춤형 자산 배분 가이드, 목표 자산 달성 시뮬레이션·예측을 제공하는 반응형 웹 서비스
> **핵심 가치**: "기록(Log)을 넘어 N년 뒤 자산 목표 달성을 가이드하는 스마트 파이낸스 파트너"

### v1 → v2 주요 변경
| 영역 | v1 | v2 |
|---|---|---|
| 부부 모드 | 데이터 공유 + 분담율 | 항목별 공개범위(공유/비공개/합계만), 초대·탈퇴 정책, 분담 정산 |
| 데이터 모델 | 거래 1종 | 계좌(Account) 중심 복식 구조: 수입/지출/**내부이체**/저축·투자 구분 → 이중 집계 방지 |
| 자산 | 총자산 숫자 | 계좌별 잔액 스냅샷 → 순자산(자산−부채) 추이 |
| 예측 | 단일 복리 공식 | 명목/실질, 납입 증가율, 세금, 시나리오(비관/기본/낙관) + 몬테카를로 달성 확률 |
| 포트폴리오 | 위험도 → 비중 | 투자성향 설문 점수화, 비상금·부채 우선 규칙, 목표 기간 기반 조정, 리밸런싱 알림 |
| 규제 | 없음 | 자본시장법(투자자문) 회피 설계, 개인정보보호법 대응 |
| 실행 계획 | 1단계 프롬프트 | MVP 단계 분할 + 수용 기준(AC) + 단계별 Claude Code 프롬프트 |

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

#### 2-6. 월 경계 설정 (P0)
- 가구 설정 "월 시작일": 1일(기본) 또는 급여일(예: 25일). 모든 월별 통계는 이 경계로 집계.
- 시간대: `Asia/Seoul` 고정. DB에는 날짜(`DATE`)로 저장하여 TZ 이슈 제거.

#### 2-7. 예산 (P1)
- 카테고리별 월 예산, 전체 생활비 예산. 80%/100% 도달 시 알림.
- 일할 페이스 표시: "오늘까지 권장 사용액 대비 +12%".

#### 2-8. 통계 대시보드 (P0)
| 위젯 | 내용 |
|---|---|
| 요약 카드 | 순자산, 이번 달 수입, 지출, 저축·투자액, **저축률** = (SAVE_INVEST + LOAN_REPAY) / INCOME |
| 50/30/20 비교 | 실제 NEEDS/WANTS/SAVINGS 비율 vs 기준선 (스택 바) |
| 카테고리 Top 5 | 금액 + 전월 대비 증감 |
| 월별 추이 | 최근 12개월 수입/지출/저축 (막대 + 저축률 선) |
| 순자산 추이 | 월말 스냅샷 기준 라인 차트 (자산/부채 분리) |
| 이상 지출 감지 (P2) | 카테고리 지출이 직전 3개월 평균 + 2σ 초과 시 하이라이트 |
| 부부 기여도 (P1) | 수입·공동지출·저축 기여 비율 (공개 범위 내에서만) |

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

#### 4-7. 월간 리포트 (P1)
- 매월 시작일에 지난달 요약 자동 생성: 저축률, 예산 준수, 목표 진척, 다음 달 액션 1~3개.
- 부부 모드: 두 사람에게 동일 리포트 (공개 범위 준수).

---

### ⑤ 멀티 디바이스 / Cross-Platform
- **Mobile-first 반응형** (P0): 하단 탭바(홈 / 가계부 / 자산 / 목표 / 더보기), 플로팅 [+] 빠른 입력 버튼.
- **PWA** (P1): 홈 화면 설치, 오프라인 입력 큐(온라인 복귀 시 동기화, 충돌 시 last-write-wins + 충돌 로그).
- **푸시 알림** (P2): 예산 초과, 정기 거래 확인, 월간 리포트, 배우자 공동 지출 등록.
- 데스크톱: 좌측 사이드바 + 다단 대시보드, 가계부 표 뷰(정렬·필터·일괄 편집).
- 다크 모드, 금액 표기 `₩1,234,567` / 축약 `123.4만`, 큰 글씨 대응(WCAG AA).

---

## 2. 화면 구조 (IA)

```
/ (랜딩)
/login, /signup, /onboarding           ← 온보딩: 모드 선택 → 계좌 등록 → 월급·고정비 → 첫 목표
/app
 ├─ /dashboard                         ← [우리|나|배우자] 뷰 토글, 요약/차트/목표 진척
 ├─ /ledger                            ← 월 캘린더 + 리스트, 필터(계좌/카테고리/작성자/공개범위)
 │   ├─ /ledger/new                    ← 빠른 입력 (모달 라우트)
 │   ├─ /ledger/import                 ← CSV 가져오기 (P1)
 │   └─ /ledger/recurring              ← 정기 거래 규칙
 ├─ /budget                            ← 예산 (P1)
 ├─ /assets                            ← 계좌 목록, 순자산 추이, 잔액 업데이트
 ├─ /portfolio                         ← 성향 진단 → 사전점검 → 모델 배분 → 커스텀/비교 (P1)
 ├─ /simulate                          ← 자유 시뮬레이터 (입력 슬라이더 ↔ 실시간 차트)
 ├─ /goals, /goals/[id]                ← 목표 목록, 상세(진척/역산/대안/연결 플랜)
 ├─ /reports/[yyyy-mm]                 ← 월간 리포트 (P1)
 ├─ /settlement                        ← 부부 정산 (P1)
 └─ /settings                          ← 가구·구성원·초대, 카테고리, 월 시작일, 분담 규칙, 데이터 내보내기/탈퇴
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
| `montecarlo.ts` | `simulate({…, runs, seed})` → `{p10[], p50[], p90[], successRate}` | Web Worker 실행 (P2) |
| `events.ts` | `applyLifeEvents(baseCashflow, events)` | 월별 현금흐름 배열 변환 (P2) |

**검증용 기준값 (테스트 케이스)**
- PV=0, PMT=1,000,000, R=0%, N=10 → FV = 120,000,000
- PV=10,000,000, PMT=0, R=5%, N=10 → FV ≈ 16,288,946
- Target=1,000,000,000, PV=100,000,000, R=6%, N=15 → 필요 PMT = 2,650,097원 (원 단위 올림 — 목표 미달 방지, 월 환산 r = 1.06^(1/12)−1, 기말 납입 / 엑셀 `PMT()`로 교차 검증)
- Target ≤ PV·(1+r)^n → 필요 PMT ≤ 0 → "이미 달성 가능"

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

### Phase 1 — MVP (P0)
범위: 인증, 가구(개인/부부 초대), 공개범위, 계좌, 거래 CRUD(6유형), 카테고리, 정기거래, 월 경계, 대시보드, 기본 시뮬레이터, 목표 + 역산.

**수용 기준 (AC)**
- AC-1: 카드로 5만원 지출 후 결제일에 통장→카드 TRANSFER 등록 시, 월 지출 통계는 5만원(1회)만 집계된다.
- AC-2: 통장→증권 SAVE_INVEST 100만원은 지출에 포함되지 않고 저축률에 반영된다.
- AC-3: A가 `PRIVATE`로 등록한 거래는 B의 어떤 API 응답(목록·합계·검색)에도 나타나지 않는다.
- AC-4: A가 `SUMMARY_ONLY`로 등록한 거래는 B에게 카테고리 합계로만 보이고 건별 금액·메모·가맹점은 응답에 포함되지 않는다.
- AC-5: 월 시작일 25일 설정 시, 10월 통계는 9/25~10/24 거래로 집계된다.
- AC-6: 시뮬레이터 결과가 4장 기준값 테스트와 일치한다 (원 단위 반올림 오차 ±1원).
- AC-7: 목표 필요 납입액 ≤ 0 이면 "이미 달성 가능"이, 저축 가능액 초과 시 대안 3종이 표시된다.
- AC-8: 375px 폭에서 모든 P0 화면이 가로 스크롤 없이 동작한다.
- AC-9: 다른 가구의 거래 ID로 직접 요청 시 404를 반환한다.

### Phase 2 — P1
성향 진단, 사전 점검, 모델 포트폴리오·커스텀·비교, 시나리오, 예산, CSV 가져오기, 자동 분류, 정산, 탈퇴 정책, 월간 리포트, PWA 설치.

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

## 9. 오픈 이슈 (결정 필요)
1. 인증: Auth.js vs Supabase Auth — Supabase 채택 시 RLS까지 일원화 가능.
2. 부부 모드에서 한 사람이 2개 이상 가구 소속(예: 부모님 가계 관리) 허용 여부 — MVP는 1개로 제한.
3. 수익률 가정치의 출처 및 갱신 주체.
4. 수익 모델: 무료 + 프리미엄(몬테카를로·라이프이벤트·리포트 PDF)? 광고 미도입 원칙?
5. 오프라인 동기화 충돌 정책을 last-write-wins로 충분한지.

---

## 10. Claude Code 실행 프롬프트 (단계별)

> 한 번에 전부 요청하지 말고 **Phase 단위로 나눠** 입력한다. 각 단계 완료 후 테스트 통과를 확인하고 다음으로.

### Step 1 — 프로젝트 셋업 & 스키마
```text
Read PROD.MD (FINLOG PRD v2) fully before starting. Implement Step 1 only.

1. Initialize Next.js 15 (App Router, TypeScript strict, src/ dir), Tailwind, shadcn/ui, Prisma (PostgreSQL), Zod, TanStack Query, Zustand, Recharts, decimal.js, Vitest.
2. Create the feature-based folder structure in PRD §6.
3. Write prisma/schema.prisma from PRD §3 (money = BigInt in KRW, rates = Decimal, transaction date = @db.Date).
4. Write prisma/seed.ts: default 2-level categories with 50/30/20 buckets (PRD §2-4), AssetClassAssumption rows (PRD §3-3 table), and one demo couple household with 3 months of realistic transactions covering all 6 TxTypes.
5. Add a household-scoped repository helper in src/lib/db that requires householdId + viewer userId on every query and applies Visibility rules (PRD §1-3) server-side.
Do not build UI yet. Report the files created and any PRD ambiguities you hit.
```

### Step 2 — 금융 계산 순수 함수
```text
Implement src/lib/finance per PRD §4 (Phase 1 functions only: money, period, stats, projection incl. suggestAlternatives).
- Pure functions, no I/O. BigInt for money, decimal.js for rates.
- Monthly rate = (1+R)^(1/12)-1, end-of-month contributions, handle r=0.
- stats must exclude TRANSFER from income/expense and count SAVE_INVEST + LOAN_REPAY toward savings rate (PRD §2-2).
- Write Vitest tests including every reference value in PRD §4 and edge cases (0 amount, 0%, negative return, 1 month, already-achieved goal).
Run the tests and show results.
```

### Step 3 — 인증 · 가구 · 가계부
```text
Implement Phase 1 household + ledger features (PRD §1-1~1-3, §1-6, §2-1~2-6):
- Auth (Kakao, Google, Email), onboarding flow (mode → accounts → salary/fixed costs → first goal).
- Household invite by 6-digit code (72h, single-use), roles.
- Accounts CRUD, transactions CRUD for all TxTypes with quick-input modal, recurring rules (with Vercel Cron route), month-start-day setting.
- Ledger page: monthly calendar + list, filters.
Verify AC-1 through AC-5 and AC-9 from PRD §7 with tests (Vitest for server actions, Playwright for one E2E flow).
```

### Step 4 — 대시보드 · 시뮬레이터 · 목표
```text
Implement PRD §2-8 dashboard (P0 widgets), §4-1 simulator, §4-6 goals.
- Mobile-first AppShell: bottom tab bar on mobile, sidebar on desktop, [우리|나|배우자] view-scope toggle (Zustand) that re-queries server data.
- Dashboard: summary cards, 50/30/20 stacked bar, Top 5 categories with MoM delta, 12-month trend, net worth line.
- /simulate: sliders update the chart client-side using lib/finance (no server round-trip); nominal/real toggle (default real); stacked area of principal vs gain.
- /goals: multiple goals with priority, required monthly contribution, months-to-goal, ahead/behind indicator, 3 alternatives when unaffordable.
Verify AC-6, AC-7, AC-8. Run a final lint + typecheck + test pass.
```

### Step 5 이후
Phase 2(P1) 기능은 Step 1~4 완료 후 PRD §7 Phase 2 목록을 기준으로 기능 단위 프롬프트를 새로 작성한다.
