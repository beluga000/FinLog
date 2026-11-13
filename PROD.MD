# [PRD v3] FINLOG - 목표까지 남은 거리를 매일 보여주는 부부/개인 가계부

> **프로젝트 명**: FINLOG (Finance + Log)
> **문서 버전**: v3.5 (2026-11-12, v3.0 2026-10-30) · 이전 버전: `PROD.v2.MD`(v2, 2026-10-06), `PROD.v1.MD` · v3.0 이후 바뀐 점은 바로 아래 "v3.0 이후 변경 이력"
> **목적**: 월별 지출·소비 모니터링, 부부/개인 맞춤형 자산 배분 가이드, 목표 자산 달성 시뮬레이션·예측을 제공하는 반응형 웹 서비스
> **핵심 가치**: "기록(Log)을 넘어 N년 뒤 자산 목표 달성을 가이드하는 스마트 파이낸스 파트너"

### v2 → v3 주요 변경
v2 MVP는 기능(계좌·거래·공개범위·목표 역산)은 갖췄지만 화면끼리 이어지지 않았다. 가입 직후 빈 대시보드, 같은 무게의 위젯 10개, 기록과 목표의 단절이 문제였다.
v3는 **데이터 모델(§3)과 계산 규칙(§4)을 유지**하고, 사용 흐름을 "목표" 하나로 다시 꿴다.

| 영역 | v2 | v3 |
|---|---|---|
| 온보딩 | 가구 모드 선택 1단계 (나머지는 대시보드 체크리스트) | 5단계: 모드 → 첫 목표 → 현재 자산 → 수입·고정비 → 결과. 계좌·정기거래·목표를 한 번에 생성 (§1-7) |
| 홈 | 위젯 10개 동일 비중 | 대표 목표 → 쓸 수 있는 돈 → 이번 달 저축 → 확인할 일 → 최근 기록 (§2-8) |
| 예산 | 카테고리별 월 예산 (P1) | **쓸 수 있는 돈** = 수입 − 고정비 − 고정 저축 − 목표 저축 − 변동 지출. 목표에서 역산 (§2-7). 카테고리 예산은 보류 |
| 기록 피드백 | 저장 토스트 | 저장 후 쓸 수 있는 돈의 변화 표시 (§2-5) |
| 시뮬레이터 | 독립 화면 `/simulate` | 목표 상세의 "만약에" 패널, 결과를 목표에 반영 (§4-1) |
| 통계 차트 | 홈 | 리포트 탭 + 월간 결산 (§2-9, §4-7) |
| 탭 | 홈·가계부·자산·목표·더보기 | 홈·가계부·목표·자산·리포트 (§2) |

v1 → v2 변경 내역은 `PROD.v2.MD` 참고.

### v3.0 이후 변경 이력 (2026-11-03 ~ 2026-11-12)
v3.0(2026-10-30) 문서 이후 구현하면서 추가·변경된 내용이다. 날짜는 커밋일, "관련 절"은 본문에서 더 자세히 다루는 곳이다.
**본문과 이 이력이 다르면 이 이력이 최신이다.** 운영 DB 적용 이력은 `DEPLOY.md` "기록 — 마이그레이션 이력", 구현 메모는 `README.md` "설계 메모" 참고.

#### v3.1 — 운영 배포 · 보안 · 관리자 (2026-11-03)
| 기능 | 내용 | 관련 절 |
|---|---|---|
| 운영 배포 | Vercel(리전 `sin1`) + Neon Postgres. 앱 쿼리는 pooled, 마이그레이션은 direct 주소(`DATABASE_URL_UNPOOLED`). Prisma pg 드라이버 어댑터(`engineType = "client"`) | §6 |
| 가입 승인 | 새 가입자는 승인 대기(`User.approvedAt = null`), 승인 전 로그인·세션 차단. `ADMIN_EMAILS` 이메일은 즉시 승인 | §1-6 |
| 관리자 화면 `/admin` | 탭 3개 — 현황·가입 승인(전체·7일 가입·대기·부부/개인·30일 활성 가구) / 사용자(검색·승인·승인 취소·모든 기기 로그아웃·계정 삭제) / 가구(구성원·기록 수·마지막 기록일·가구 관리자 넘기기). 건수·날짜만 보고 금액·거래 내용은 읽지 않는다. 비관리자는 404 | — |
| 계정 삭제(관리자) | 이메일을 직접 입력해야 실행. 혼자 쓰던 가구는 가구째 삭제. 부부 가구는 그 사람만 빠짐 — 비공개 계좌·거래·정기 거래 삭제, 공개 계좌는 공동 명의로, 정기 거래는 배우자에게, 가구 관리자 승계 | §1-5 |
| 보안 강화 | 보안 헤더(CSP `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, Referrer·Permissions 정책). 시도 횟수 제한(`RateLimit` 테이블, 로그인·가입·초대 코드). 소셜 로그인은 제공자가 인증한 이메일만 기존 계정에 연결 | §5.1 |
| 초대 코드 | 6자리 숫자 → **8자리 영숫자**(헷갈리는 I·O·0·1 제외 32글자), 72시간·1회용 | §1-2 |
| 세션 | 로그인 시각 기준 **24시간 절대 만료**(써도 연장 안 됨). "모든 기기에서 로그아웃" = `User.sessionVersion` +1. 만료·강제 로그아웃은 로그인 화면에 안내. 로그인 뒤 원래 보던 화면(공유받기·단축어 주소 포함)으로 돌아감 | §1-6 |
| 카드 결제일·출금 계좌 · 부부 계좌 대신 등록 | Phase 1.7 (AC-24~26) | §7 |
| 정기 거래 화면 개편 | 상단에 매달 남는 돈(수입 − 지출 − 저축·상환)과 비율 막대, 묶음(수입/지출/저축·투자·상환/이체)별 월 합계, 다음 생성일 순·D-day, 중지·종료 규칙은 접어 둠. 규칙 수정은 다음 회차부터(이미 만든 거래는 그대로, 감사 로그). 배우자 규칙은 이름 배지, 수정·중지·삭제는 등록한 사람만 | §2-5 |
| 고정 저축 관리 `/assets/savings` | 예적금 가입일·만기일·연 금리(`Account.openedOn`·`maturityDate`·`interestRate`), 만기 예상액(단리, 이자소득세 15.4%), 그 계좌로 가는 자동이체 추가·수정·중지, 만기 지난 뒤 계속 이체되면 경고. 쓸 수 있는 돈에 "고정 저축" 항목 추가 | §2-7 |
| 부부 설정 `/settings/couple` | 연결 상태, 공개범위별 내 기록 수, 내 명의·공동 계좌 기본 공개범위 변경(공동은 비공개 불가), "지난 기록도 함께" 바꾸기(이전 기본값 그대로인 내 기록만), 배우자가 보여 주는 계좌 목록(읽기 전용) | §1-3 |
| 달력 공휴일 | 가계부 달력에 일요일·공휴일(대체공휴일 포함) 빨간 날짜 | — |

#### v3.2 — 화면 테마 · 입력 간소화 · 캡처 · 계좌 확장 (2026-11-04 ~ 11-06)
| 기능 | 내용 | 관련 절 |
|---|---|---|
| 화면 테마 | 색·글꼴·모양을 한 벌로 묶은 테마를 사용자마다(`User.palette`, 배우자와 따로) 고르고, 밝게/어둡게는 따로 고른다. 처음 숲·바다·저녁 3종 → v3.4에서 노을 추가·기본. 화면마다 대표 요약 카드를 테마색으로 채움 | §5.4 |
| 새 로고 '진척 F' | F의 윗획 = 진행 막대, 끝의 점 = 목표. 헤더·로그인·앱 아이콘(maskable)·SVG 파비콘 공통 | §5.4 |
| 거래 입력 간소화 | 유형은 지출·수입·저축투자 먼저(나머지는 펼침), 카테고리 버튼 8개(최근 쓴 것 먼저), 날짜·메모·고정·공개범위는 접고 요약, 날짜 빠른 버튼(오늘·어제·그제), 수정 창에 "오늘 다시 기록" | §2-5 |
| 사용처 자동완성 | 최근 400건에서 자주 쓴 사용처 40개, 고르면 지난번 카테고리·결제 수단 채움. 배우자 거래는 공개분만 | §2-5 |
| 금융사 선택 | 계좌 추가 시 은행·카드사·증권사·보험사·간편결제 목록(계좌 종류에 맞는 묶음 먼저), 직접 입력 가능 | §2-1 |
| PWA 바로가기 | 앱 아이콘 길게 누르기 → 지출 기록·카드 문자로 기록·캡처로 기록·가계부 | §⑤ |
| 결산 조정 제안 확장 | 큰 지출 한 건·남은 돈 옮기기·사용처 집중·확인 안 한 정기 거래 추가, 우선순위 순 최대 3개 | §4-7 |
| 목표 대안 (d)·원인 안내 | 우선순위 한 칸 올리기 대안, 배정 0원이면 원인 안내, 29~31일 기간 연장 오차 수정 | §4-6, AC-7 |
| 결제내역 캡처로 여러 건 기록 | Phase 1.6 AC-23a. 간편결제·쇼핑몰처럼 이름만으로 모르는 사용처는 "무엇을 샀나요?" 메모 칸을 먼저 펼침, 가계부 목록에 메모 표시. 가맹점 앞 브랜드 첫 글자 빠짐 보정(GS25 등) | §2-5 |
| 목표 입력 창 개편 | 저장 버튼 위 실시간 계산("N년 동안 매달 ₩X"), 세 묶음(무엇을·언제까지·어떻게), 템플릿, 연결 계좌 잔액 표시, 기대수익률 버튼 6개 + 배분 설명, "매달 넣을 금액" + "필요한 금액에 맞추기" | §4-6 |
| 홈 대표 목표 금액 가리기 | 지금 모인 돈은 가려 두고 누르면 보임 (목표 금액·진척률은 그대로) | §2-8 |
| 적금 월 납입 · 정책형 적금 | 적금 계좌 추가 시 월 납입액·납입일·출금 계좌 → 자동이체 함께 생성(만기일 종료). **청년도약계좌·청년미래적금** 기여금 구간 선택, 만기 예상액에 정부기여금·이자 비과세 반영(`Account.savingsProduct`·`savingsTier`, 수치는 `savings-products.ts`) | §2-7 |
| 계좌 보관·삭제 | 보관 시 이 계좌로 오가는 내 자동이체 함께 중지, 자산 화면 "보관한 계좌" 묶음, 거래 0건인 보관 계좌만 삭제(배우자 자동이체가 걸려 있으면 거부) | §2-1 |
| 대출 상환 | 상환 방식(만기일시·원리금균등·원금균등)·금리·대출일+기간·납입일·이자/상환금 출금 계좌(`Account.loanRepayment`). 다음 납입 원금/이자·남은 횟수는 현재 잔액 기준 재계산(중도상환해도 맞음). 만기일시 대출은 이자 자동이체를 함께 만들어 고정비로 | §2-1 |
| 보증금 대출 | 전세·월세 보증금 대출(`Account.depositLoan`)은 순자산·부채 합계에서 제외 | §2-1 |
| 목표 시작 금액·진척 | 목표를 만들 때 연결 계좌 잔액을 통째로 세지 않고 "이미 모은 돈"(`AssetGoal.startAmount`)을 정함. 모인 돈 = 시작 금액 + (지금 잔액 − 기준 잔액 `baseBalance`). 계좌 보관·복원 시 기준 재설정. 다른 목표와 같은 계좌를 겹쳐 잡으면 알림 | §4-6 |
| 목표 자동이체 등록 | 매달 모을 금액을 바로 자동이체로(보내는 계좌 = 수입이 가장 많은 계좌, 이체일 = 월급날 다음 날) | §4-6 |
| 진행률 알림·계획 대비 차트 | 홈에 목표 25·50·75·100% 카드(닫은 단계는 다시 안 띄움, 100%는 바로 달성 처리 — `milestoneSeen`), 목표 상세에 기준일부터 계획선 vs 실제 차트 | §4-6 |
| 목표 상태 문구 | "N개월 늦어요" → 원인과 모자란 금액("앞 순위에 밀려 배분 0원"·"월 X 모자라요"·"지금 속도면 YYYY년 M월"). 결산 문구도 같은 기준 | §4-6, §4-7 |
| 곧 끝나는 목표 먼저 배분 | 남은 금액이 저축 가능액 3달 치 이하인 목표를 우선순위보다 먼저 채움 | §4-6 |
| 리포트 같은 기간 비교 | 진행 중인 달은 지난달 같은 기간과 비교, 남은 정기 수입·저축은 "예정"으로 표시 | §2-9 |
| 남은 돈 목표로 옮기기 | 목표 화면 평균 남는 돈 자동이체, 홈 월말 카드·결산 제안에서 목표 계좌로 옮기기 기록 | §4-7 |
| 홈 상단 개편 | 휴대폰에서 **오늘 쓸 수 있는 돈**(하루 몫 큰 숫자)을 맨 위로, **어제 아낀(더 쓴) 돈**. 이번 달 저축에 남은 자동이체를 점선으로 | §2-8 |
| 세제 혜택 계좌·절세 한도 | 계좌에 연금저축·IRP·ISA 표시(`Account.taxWrapper`), 자산 화면 "올해 절세 한도" 카드(명의별 납입·남은 한도·돌려받는 세액, 참고용). 총급여 구간(`User.salaryBand`)을 고르면 환급액 한 숫자. 12월 1~7일·20~31일 연금 공제 한도가 남으면 확인할 일. 세율·한도는 `tax-accounts.ts` 연도별 표 한 곳 | §3-2, §4-3 |
| 잔액 한 번에 맞추기 | 계좌 여러 개를 한 화면에서 맞추고, 그대로인 계좌도 확인 날짜 기록. 거의 안 바뀌는 계좌는 1년에 한 번 확인(`Account.balanceCheckYearly`, 부동산 기본). 낡은 계좌 여럿이면 확인할 일 한 줄 | §2-10 |
| 가맹점 → 카테고리 규칙 | 가구 공유 규칙(`MerchantCategoryRule`, 지점명 포함 매칭)·브랜드 사전. 기록 창 "앞으로 이 사용처는…" + 지난 기록 일괄 변경, 설정에서 관리. 캡처 점검에서 규칙 우선 | §2-5 (자동 분류 규칙) |
| 통장 잔액 30일 예보 | 정기 거래·카드 대금·하루 평균 변동 지출로 30일 잔액 예측, 2주 안 부족하면 확인할 일 + 미리 옮기기 기록 | §2-10 |
| 이번 달 챌린지 | 결산 "사용처 집중" 제안을 "이번 달 절반까지" 챌린지로(`Challenge`), 홈 진행 칩, 다음 결산에서 결과 | §4-7 |
| 성능 | 요청 단위 캐시로 중복 조회 제거, 여러 날짜 잔액 한 번에 계산, 인덱스(`Transaction(householdId, needsReview, date)`·`(fromAccountId, date)`·`(toAccountId, date)`, `RecurringRule(householdId)`), 입력 창·차트 지연 로딩, 가계부 필터 즉시 반영 | §5.2 |
| 운영 배포 스크립트 | `npm run deploy:prod` — Git 확인 → 적용할 마이그레이션 표시 → 확인 → `migrate deploy` → 배포 → 접속 확인. 마이그레이션 실패 시 배포 안 함 | `DEPLOY.md` |

#### v3.3 — 기록 편의 · 예보 · 할부 · 계정 관리 (2026-11-10 ~ 11-12)
| 기능 | 내용 | 관련 절 |
|---|---|---|
| 기록 창 금액 입력 | 빠른 버튼(+1천·5천·1만·5만), 유형별 최근 금액 칩(이 브라우저), 저장 버튼 하단 고정 | §2-5 |
| 색 규칙 | 빨강은 고쳐야 할 때만(초과·부족·닿지 않음). 전월 증감·50/30/20·저축 달성률·만기 지남·순자산 감소 등은 주황. 경고 끝에 다음 행동 링크(초과 → 지출, 고정비 > 수입 → 정기 거래) | §5.4 |
| 요약 금액 만원 단위 | 홈 목표·월말 남은 돈·이번 달 저축, 리포트 Top 5·초과 문구는 만원 단위 (상세·입력은 원 단위) | §⑤ |
| 같은 결제 의심 배지 | 가계부 목록에 같은 결제로 보이는 기록 표시, "다른 결제예요"를 누르면 다시 의심 안 함(`Transaction.notDuplicate`) | §2-5 |
| 간편결제 메모로 카테고리 | 네이버페이·쿠팡처럼 이름만으로 모르는 결제는 메모로 카테고리 고르기(지난 메모 → 브랜드 → 품목 낱말) | §2-5 |
| 잔액 맞춘 뒤 목표 변화 | 잔액 맞추기 저장 뒤 목표에 모인 돈이 어떻게 바뀌었는지 보여 줌 | §2-10 |
| 결산 "왜 넘겼는지 보기" | 쓸 수 있는 돈 계산식과 전월 대비 늘거나 준 지출 | §4-7 |
| 월급날 먼저 저축 | 통장 예보에서 다음 수입 전까지 여유를 남기고 옮겨도 되는 금액 권유 | §2-10 |
| 놀고 있는 돈 | 30일 내내 쓰이지 않는 돈을 같은 목표의 예적금으로 옮기라고 권유 | §2-10 |
| 매달 반복되는 기록 찾기 | 정기 거래 화면에서 매달 반복된 기록을 찾아 등록 권유(이름·금액·날짜 채워 열기). "아니에요"는 가구 공통으로 기억(`Household.dismissedRecurring`) | §2-5 |
| 목표 상세 정리 | 관리 버튼을 ⋯ 메뉴로, 연결 계좌마다 성격 안내(생활비 통장은 잔액이 출렁인다는 안내) | §4-6 |
| 가계부 검색·주간 보기 | 이번 달은 입력 즉시 거름(사용처·메모·카테고리·금액), 지난 기록은 "전체 기간에서 찾기"(서버, 최근 50건). 달력 오른쪽 주별 지출 합계, 월/주 보기 전환(기기마다 기억) | §2-9 |
| PWA 오프라인 | 서비스 워커가 앱 기본 파일을 미리 받아 두고, 연결이 끊기면 오프라인 안내 화면 (오프라인 입력 큐는 아직 없음) | §⑤ |
| 아침 9시 알림 | 설정에서 기기별로 켜기·끄기·시험 알림(`PushSubscription`). 매일 09:00(KST) 웹 푸시 — 통장 3일 내 부족 예보, 확인할 자동 기록. v3.3 후반에 카드값·쓸 수 있는 돈·목표 단계로 확장(§7 v3.3 구현 표) | §⑤ |
| **신용카드 할부** | 지출에 할부 개월(`Transaction.installmentMonths`, 신용카드 지출만, 2~60개월, 입력 폼 선택지 2~12·18·24·36). 문자 붙여넣기·캡처가 읽은 개월도 이 칸에 저장(기존 캡처 메모 "N개월 할부"는 칸으로 옮김). **가계부는 산 날 전체 금액**, 통장 예보·카드 결제 예정은 결제일마다 한 회차(아직 청구 안 된 원금 제외), 하루 평균 지출에서 할부 제외. 자산 화면 신용카드에 남은 할부·다음 결제분 | §2-5 |
| 계정 관리·정산·생활 변화 등 | 비밀번호 변경·재설정 링크, 가구 나가기·탈퇴, 카테고리 정리, 부부 정산, 결산 인쇄·PDF, 평소와 다른 지출, 생활 변화, 푸시 확장, 변경 이력, 시도 횟수 제한 확대 → §7 "v3.3 구현" 표 | §7 |
| 스키마 정리 | 쓰지 않던 `Budget`·`RiskAssessment`·`PortfolioPlan`·`AssetClassAssumption`·`TaxRuleSet` 삭제 → §3 "v3.3 스키마 정리" | §3 |

#### v3.4 — 노을 테마 (2026-11-12)
| 기능 | 내용 | 관련 절 |
|---|---|---|
| 노을 테마 추가·기본 | 따뜻한 흰 바탕에 주황 하나. 주황은 대표 카드·목표 막대·버튼·선택 표시에만 쓰고, 주의(겨자)·위험(장미빛 빨강)은 주황과 헷갈리지 않게 따로. 테마 4종: 노을(기본)·숲·바다·저녁. 앱 아이콘·파비콘도 주황. 기존 숲 사용자는 노을로 옮김(`User.palette` 기본값 `sunset`) | §5.4 |
| 로그인 화면 재설정 안내 | 비밀번호를 잊었으면 관리자에게 재설정 링크를 요청하라는 안내 (메일 발송 없음) | §1-6 |

#### v3.5 — 쓰기 편하게 (2026-11-12)
| 기능 | 내용 | 관련 절 |
|---|---|---|
| 즐겨찾기 (자주 쓰는 기록) | 기록 창 맨 위 버튼을 누르면 오늘 날짜로 바로 기록(`TxFavorite`, 사람마다 따로, 8개까지) | §2-5, AC-27 |
| 저장·삭제 되돌리기 | 저장 결과 화면 [방금 기록 취소], 삭제 알림 [되돌리기] | §2-5, AC-28 |
| 최근 지운 기록 (휴지통) | 설정 > 최근 지운 기록에서 30일 안에 되살리기, 지난 것은 매일 새벽 완전 삭제 | §2-5, AC-29 |
| 주간 요약 알림 | 월요일 아침 9시 — 지난주 변동 지출·평소 대비·가장 늘어난 대분류·이번 주 하루 쓸 수 있는 돈 | §⑤, AC-30 |
| 앱 잠금 | 기기마다 Face ID·지문·기기 암호(WebAuthn)로 화면 열기 | §1-6, AC-31 |

#### v3.0 이후 스키마 추가 요약
| 모델 | 추가된 칸·테이블 |
|---|---|
| `User` | `approvedAt` · `sessionVersion` · `palette` · `salaryBand` · `passwordResetHash` · `passwordResetExp` |
| `Household` | `dismissedRecurring` |
| `Account` | `billingDay` · `paymentAccountId` · `openedOn` · `maturityDate` · `interestRate` · `savingsProduct` · `savingsTier` · `loanRepayment` · `depositLoan` · `taxWrapper` · `balanceCheckYearly` |
| `Transaction` | `notDuplicate` · `installmentMonths` (+ 인덱스 4개 — v3.5 `(householdId, deletedAt)` 휴지통) |
| `AssetGoal` | `startAmount` · `baseBalance` · `baseSetOn` · `milestoneSeen` · `milestonePushed` (`planId` 삭제) |
| 새 테이블 | `RateLimit` · `MerchantCategoryRule` · `Challenge` · `PushSubscription` · `TxFavorite`(v3.5) |
| 삭제 | `Budget` · `RiskAssessment` · `PortfolioPlan` · `AssetClassAssumption` · `TaxRuleSet` |

실제 스키마는 `prisma/schema.prisma`가 기준이다. §3의 Prisma 초안은 v2 설계 당시 모양이다.

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
- **앱 잠금 (v3.5)**: 설정 > 앱 잠금에서 **기기마다** 켠다. 앱을 열 때와 다른 앱에 1분 넘게 있다 돌아올 때 Face ID·지문·기기 암호(WebAuthn 플랫폼 인증기, `userVerification: required`)를 묻는다. 다른 앱으로 가는 순간 내용을 가려 앱 전환 화면에도 보이지 않게 한다.
  - 범위: 잠금이 풀린 휴대폰을 남이 잠깐 집었을 때를 막는 **화면 가리개**다. 서버 세션과는 별개이고 서버가 서명을 검증하지 않는다. 설정은 그 기기 브라우저 저장소에 `{ userId, credentialId }`로만 둔다 — 같은 기기에서 다른 사람이 로그인하면 걸리지 않는다.
  - 첫 화면 깜빡임 방지: `<head>` 스크립트가 잠금 설정이 있으면 `html[data-locked]`로 앱 화면(`[data-slot="app-shell"]`)을 그리기 전에 가린다.
  - 풀 수 없을 때: 잠금 화면 [열 수 없나요? 로그아웃하고 다시 로그인] — 이 기기 잠금을 끄고 로그아웃한다(비밀번호 로그인이 본인 확인). 설정에서 끌 때도 한 번 더 확인한다.

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
  - [결제내역 캡처로 채우기] (`?add=capture`, 앱 바로가기 "캡처로 기록"): 카드 앱 결제내역·문자 화면 캡처(최대 5장)를 **기기 안에서** 글자 인식(Tesseract.js, 엔진·언어 파일은 자체 서버 `/ocr`) → 여러 건 확인 화면(건별 체크·사용처 보정·카테고리·결제 수단) → 고른 건만 지출로 한 번에 저장. 겹친 캡처의 같은 건은 한 번만, 취소·이미 기록된 것 같은 건(같은 금액·±1일)은 기본 해제, 불확실한 건은 "등록 안 함 N건"으로 사유만 보여 준다. 할부는 산 날 전체 금액으로 기록하고 개월은 `installmentMonths` 칸에 저장한다(v3.3, 이전에는 메모 "N개월 할부"). 이미지·인식 원문은 서버로 보내지도 저장하지도 않고, `importHash`(가구·날짜·금액·사용처·계좌·순번의 해시)로 같은 캡처를 다시 가져와도 중복 저장하지 않는다.
  - 네이티브 껍데기(Capacitor)로 Android 알림 자동 수집 → `needsReview` 거래로 생성 후 확인할 일에서 확정하는 방식은 P2.

- **저장 후 피드백** (P0, v3): 빠른 입력 저장 결과 화면에 "오늘 쓸 수 있는 돈 16.6만 → 11.2만", 해당 카테고리의 이번 달 누계·전월 대비를 표시. 서버 액션이 변경 전후 값을 함께 돌려준다.
- **즐겨찾기 (v3.5)**: 자주 쓰는 기록(예: "김밥천국 9천 · 카드")을 기록 창 맨 위 버튼으로 둔다. 누르면 확인 없이 **오늘 날짜로 바로 기록**하고 저장 결과 화면을 보여 준다(여기서 바로 취소 가능).
  - 만들기: 저장 결과 화면 [즐겨찾기에 추가], 또는 기존 기록 수정 창 [이 기록을 즐겨찾기에 추가]. 유형·금액·계좌·카테고리·사용처·메모·공개범위를 그대로 담는다(할부·고정 지출·날짜는 담지 않는다). 같은 내용은 하나만, 한 사람 8개까지.
  - 사람마다 따로(`TxFavorite.userId`) — 배우자 즐겨찾기는 보이지 않는다. 배우자의 공유 기록으로 만들면 공개범위는 내 계좌 기본값을 따른다. 배우자의 합계만·비공개 기록으로는 만들 수 없다.
  - 기록할 때마다 계좌·카테고리를 다시 검증한다. 지운 계좌·카테고리면 기록하지 않고 "설정에서 지우고 다시 만들어 주세요"로 알린다. 관리는 설정 > 즐겨찾기(지우기).
  - 가구를 나가거나 계정을 지우면 그 가구의 내 즐겨찾기도 지운다.
- **되돌리기 (v3.5)**: 저장 결과 화면 [방금 기록 취소], 쓸 수 있는 돈이 바뀌지 않는 기록(지난달·이체 등)은 저장 알림의 [취소]. 지우면 알림에 [되돌리기](6초).
- **최근 지운 기록 (v3.5)**: 거래 삭제는 원래 `deletedAt` 소프트 삭제다. 설정 > 최근 지운 기록에서 **30일** 안의 기록을 되살린다(남은 날 표시). 보이는 범위는 지울 수 있던 기록과 같다 — 내 기록 + 배우자의 공유 기록(합계만·비공개는 원래 건별로 안 보이므로 제외).
  - 매일 새벽 1시 크론(`/api/cron/recurring`)이 지운 지 30일 지난 기록을 **완전히 지운다**(되돌릴 수 없음). 거래를 가리키는 다른 테이블은 없다.
  - 지울 때 캡처 가져오기 열쇠(`importHash`)를 비우므로, 되살린 뒤 같은 캡처를 다시 가져오면 한 번 더 기록될 수 있다(중복 경고는 그대로 뜬다).

#### 2-6. 월 경계 설정 (P0)
- 가구 설정 "월 시작일": 1일(기본) 또는 급여일(예: 25일). 모든 월별 통계는 이 경계로 집계.
- 시간대: `Asia/Seoul` 고정. DB에는 날짜(`DATE`)로 저장하여 TZ 이슈 제거.

#### 2-7. 쓸 수 있는 돈 (P0) — v3 신규, 카테고리 예산 대체
```
쓸 수 있는 돈 = 수입 − 고정비 − 고정 저축 − 목표 저축 − 변동 지출
하루 권장액  = max(쓸 수 있는 돈, 0) / 이번 달 남은 일수(오늘 포함)
```
| 항목 | 정의 |
|---|---|
| 수입 | max(활성 정기 `INCOME` 규칙 합, 이번 달 실제 `INCOME` 합) |
| 고정비 | 활성 정기 `EXPENSE` 규칙 합. 월초부터 전액 차감 (실현 여부 무관) |
| 고정 저축 | 활성 정기 `SAVE_INVEST`·`LOAN_REPAY` 규칙 합. 월초부터 전액 차감 |
| 목표 저축 | `ACTIVE` 목표별 `max(monthlyCommit ?? 필요 납입액 − 그 목표 연결 계좌로 들어가는 고정 저축, 0)` 합. 한 규칙은 우선순위가 앞선 목표 하나에만 쓴다 (이중 차감 금지) |
| 변동 지출 | 이번 달 `EXPENSE` 합. 단, 고정비로 잡힌 정기 규칙이 생성한 거래는 제외 |

- 활성 정기 규칙이 생성한 지출(`recurringRuleId`가 그 규칙)은 고정비로 이미 빠졌으므로 **변동 지출에 다시 넣지 않는다** (이중 차감 금지). 사용자가 직접 "고정" 체크한 거래는 규칙이 없으므로 변동 지출로 센다.
- 고정비·수입 규칙은 이번 달 범위에 걸치는 것만 센다 (`startDate < 월 끝`, `endDate` 없음 또는 `≥ 월 시작`).
- 이번 달 저축 진행 = 이번 달 (`SAVE_INVEST` + `LOAN_REPAY`) / 계획 저축(고정 저축 + 목표 저축).
- 고정 저축 화면(`/assets/savings`): 예적금 계좌(가입일·만기일·연 금리)와 그 계좌로 들어가는 정기 저축을 묶어 보여준다. 만기 예상액 = 현재 잔액 + 만기 전 남은 납입액 + 단리 이자(적금 `월 납입 × 금리/12 × N(N+1)/2`, 월 납입으로 설명되지 않는 목돈은 예금 단리) − 이자소득세 15.4%.
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
  - 결과 > 이 목표의 **배정액** → **대안 자동 제시**. 배정액 = 월 납입 확정액, 없으면 저축 가능액(최근 3개월 평균 저축액)을 우선순위 순으로 나눈 몫.
    (a) 목표일 연장 시 필요한 기간, (b) 목표 금액 하향 시 달성 가능 금액, (c) 더 높은 성향 포트폴리오 적용 시 필요액 (+리스크 경고, 적용해도 배정액으로 모자라면 "월 N 부족" 표시)
    (d) 우선순위에 밀려 부족할 때(앞 순위 목표가 저축 가능액을 먼저 씀): 한 칸 올리면 늘어나는 배정액과 대신 줄어드는 목표·금액. 올려도 모자라면 "월 N 부족" 표시
  - 배정액이 0이면 대안 대신 원인 안내: 저축 기록이 없음(월 납입액 확정 / "만약에"로) · 확정액이 0원 · 우선순위에 밀림(맨 위가 아니면 (d) 올리기)
- 목표 기간 역산: 현재 납입액 유지 시 달성 시점 (`n = log((FV·r + PMT)/(PV·r + PMT)) / log(1+r)`).
- **진척도**: 연결 계좌 현재 잔액 / 목표액 + "계획 대비 앞섬/뒤처짐 N개월" 표시.
- 여러 목표의 필요 납입액 합 > 저축 가능액이면 우선순위 순으로 배정 시뮬레이션.

- **대표 목표** (v3): `ACTIVE` 중 priority가 가장 작은 목표. 목표 목록에서 순서를 바꾸면 홈 대표 목표가 바뀐다.

#### 4-7. 월간 결산 (P0, v3 축소판)
- 월 시작일 이후 리포트 탭 최상단에 **지난달** 결산을 표시. 조회 시점 계산, 저장하지 않는다.
- 내용: 저축률, 목표 저축 달성(실제/계획), 쓸 수 있는 돈 결과(N원 남김 / N원 초과), 대표 목표 앞섬·뒤처짐의 전월 대비 변화.
- 다음 달 조정 제안 최대 3개 (규칙 기반, 우선순위 순으로 3개):
  1. 큰 지출 한 건 (초과 시): 고정·정기가 아닌 한 건이 월 지출의 20% 이상·30만 이상 → "하이마트 120만 한 건이 지난달 지출의 40%예요"
  2. 남은 돈 옮기기 (초과 안 한 달): 쓸 수 있는 돈 10만 이상 남김 → 대표 목표 연결 계좌로 (당겨지는 개월 표시). 연결 계좌 없는 목표면 자산 화면으로
  3. 초과 시: 전월 대비 가장 많이 늘어난 카테고리 → "외식 +12만" (큰 지출 한 건은 증감에서 뺀다)
  4. 목표 저축 미달 2개월 연속: 목표 조정 대안(기간 연장/금액 하향) → 목표 상세 "만약에"로 이동
  5. 사용처 집중: 고정·정기·필요(NEEDS) 지출이 아닌 같은 사용처 한 달 8번 이상 (구분 없는 카테고리는 센다) → "스타벅스 14번, 8.4만 — 절반으로 줄이면 4.2만"
  6. 결산 달까지 확인 안 한 정기 거래 → 홈 "확인할 일"
  7. 잔액 스냅샷 30일 초과 계좌 → 잔액 업데이트
  - 큰 지출·사용처 판단은 내용까지 볼 수 있는 거래만 쓴다 (요약 공개 거래는 사용처가 없다).
- 부부 모드: 두 사람에게 동일 결산(공개 범위 준수). PDF·푸시 알림은 P2.

---

### ⑤ 멀티 디바이스 / Cross-Platform
- **Mobile-first 반응형** (P0): 하단 탭바(홈 / 가계부 / 목표 / 자산 / 리포트), 플로팅 [+] 빠른 입력 버튼. 설정은 상단 프로필 메뉴.
- **PWA**: 홈 화면 설치·공유받기 (P0, v3.1 G단계), 오프라인 입력 큐 (P1)(온라인 복귀 시 동기화, 충돌 시 last-write-wins + 충돌 로그).
- **푸시 알림** (P2): 예산 초과, 정기 거래 확인, 월간 리포트, 배우자 공동 지출 등록. → v3.3 아침 9시 알림으로 구현(§7 v3.3 구현 표).
- **주간 요약 알림 (v3.5)**: 월요일 아침 9시 알림에 한 건 더 — "지난주 32만 썼어요 / 평소보다 4만 더 썼어요 · 식비 +4만 · 이번 주 하루 4.1만씩 쓸 수 있어요". 누르면 가계부.
  - 지난주 = 지난 월~일, **변동 지출만**(정기 거래·고정 체크 지출 제외). 범위는 "우리" 화면과 같다(배우자 비공개 제외, 합계만 공개는 금액에 포함).
  - 평소 = 그 전 4주 중 변동 지출이 있었던 주의 평균. 그런 주가 2주 미만이면 비교하지 않는다. 차이가 1만 원 미만이거나 평소의 10% 미만이면 "평소와 비슷해요".
  - 늘어난 대분류: 소분류는 대분류로 묶어, 평소보다 2만 원 이상·1.3배 이상 늘어난 것 중 가장 큰 하나.
  - 이번 주: 이번 달 쓸 수 있는 돈의 하루 몫(넘었으면 "이번 달 쓸 수 있는 돈을 넘었어요", 생활비 계획이 없으면 생략). 지난주 지출도 비교할 주도 없으면 보내지 않는다. 계산은 `lib/finance/weekly-summary.ts`.
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

### v3.3 스키마 정리 (2026-11-12)
| 변경 | 내용 |
|---|---|
| 삭제 | 쓰지 않던 `Budget`·`RiskAssessment`·`PortfolioPlan`(+`AssetGoal.planId`)·`AssetClassAssumption`·`TaxRuleSet`, enum `RiskProfile`·`PlanSource`. 자산군 가정치는 `src/lib/finance/portfolio.ts`, 세율·한도는 `src/lib/finance/tax-accounts.ts` 연도별 표가 유일한 출처 (§8 "하드코딩 금지"는 이 표 한 곳에 두는 것으로 충족) |
| 사용 시작 | `SplitRule`(가구 정산 방식) · `Settlement`(달마다 정산 완료, `@@unique([householdId, month])`) · `LifeEvent`(생활 변화 — `params = { label, monthly, months, oneTime }`) |
| 추가 | `User.passwordResetHash`·`passwordResetExp` (관리자가 발급하는 1회용 재설정 링크, 해시만 저장) · `AssetGoal.milestonePushed` (아침 알림으로 보낸 진행률 단계) |

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
- **화면 테마 (v3.2~v3.4)**: 위 "액센트 1개" 원칙은 테마마다 지킨다. 테마 = 색·글꼴·모양 한 벌, 사용자별(`User.palette`), 밝게/어둡게와 따로 선택. 노을(기본, 주황)·숲(초록)·바다(청록)·저녁(남보라). 상태 색은 테마 액센트와 겹치지 않게 테마마다 따로 정하고, 빨강은 고쳐야 할 때(초과·부족)만 쓴다.

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
- AC-7: 목표 필요 납입액 ≤ 0 이면 "이미 달성 가능"이, 배정액 초과 시 대안이 표시된다 (배정액 0이면 원인 안내, 우선순위에 밀렸으면 한 칸 올리기 대안).
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
| G | PWA 설치(manifest·아이콘), 승인 문자 파서 + [문자 붙여넣기], Android 공유받기, iOS 단축어 진입, 중복 경고, 결제내역 캡처로 여러 건 기록 | AC-20~23a |

- AC-20: 홈 화면에 설치할 수 있는 manifest(이름·아이콘·standalone·시작 URL `/dashboard`)가 제공된다.
- AC-21: 주요 카드사 승인 문자 예시를 붙여넣으면 금액·날짜·가맹점이 채워지고, 취소 문자는 "취소 문자예요"로 안내하고 채우지 않는다.
- AC-22: Android에서 문자를 FINLOG로 공유하면 빠른 입력이 채워진 채 열리고, 원문이 URL·DB에 남지 않는다.
- AC-23: 붙여넣기·공유로 채운 지출을 저장할 때 같은 금액·±1일 지출이 있으면 확인을 거친다.
- AC-23a: 결제내역 캡처 여러 장을 고르면 기기 안에서 인식한 건들이 확인 화면에 나오고, [N건 기록]으로 고른 건만 지출로 저장된다. 같은 캡처를 다시 기록하면 "N건은 이미 있어 건너뜀"으로 중복 저장되지 않으며, 같은 날·같은 금액 지출이 이미 있는 건은 체크를 끈 채 "이미 기록됨?"으로 보여 준다(문자 붙여넣기와 달리 ±1일은 보지 않는다). 이미지·인식 원문은 네트워크로 나가지 않는다.

### Phase 1.7 — 계좌·카드 관리 (P0, v3.2)
| 단계 | 내용 | AC |
|---|---|---|
| H | 카드 결제일·출금 계좌, 결제 예정 알림(확인할 일), 부부 계좌 대신 등록·공동 관리 | AC-24~26 |

- AC-24: 신용카드에 결제일(1~31, 짧은 달은 말일)과 출금 계좌(입출금·저축·현금)를 지정할 수 있고, 자산 목록에 "매월 N일 결제 · 출금 계좌"로 표시된다. 계좌번호는 저장하지 않는다.
- AC-25: 결제일 5일 전 ~ 2일 뒤에 미결제 사용액이 있는 카드는 확인할 일 맨 앞에 대금·출금 계좌 잔액(부족분)과 함께 나오고, [결제 기록]은 출금 계좌→카드 이체를 미리 채워 연다. 결제일 10일 전 이후 카드로 들어온 이체가 있으면 나오지 않는다.
- AC-26: 부부는 명의를 "내 명의 / 배우자 명의 / 공동"으로 골라 서로의 계좌를 대신 등록하고, 보이는 계좌는 둘 다 수정·잔액 맞추기·보관할 수 있다. 비공개는 원래 내 명의인 계좌만 설정할 수 있다(배우자·공동 계좌를 숨길 수 없음). 다른 사람 명의 계좌의 등록·수정은 감사 로그에 남는다.

### Phase 2 — P1
성향 진단, 사전 점검, 모델 포트폴리오·커스텀·비교, 시나리오, 카테고리 예산(필요 시), CSV 가져오기(데스크톱 보조), 자동 분류, 정산, 탈퇴 정책, 월간 결산 PDF, PWA 오프라인 입력 큐.

### Phase 3 — P2
몬테카를로, 라이프 이벤트, 세금 반영, 리밸런싱, 이상 지출 감지, 푸시, 세전→세후 계산, 앱 잠금.

### v3.3 구현 (2026-11-12) — Phase 2·3 중 일부
| 기능 | 화면 | 정책 |
|---|---|---|
| 비밀번호 변경 | 설정 > 계정 | 현재 비밀번호 확인, 바꾸면 다른 기기 로그인 끊김 |
| 비밀번호 재설정 | 관리자 > 사용자 ⋯ > 재설정 링크 → `/reset-password` | 메일 발송이 없어 관리자가 링크를 직접 전달. 24시간·1회용 |
| 가구 나가기 · 탈퇴 (탈퇴 정책) | 설정 > 계정 | 정리 규칙은 관리자 계정 삭제와 같다 — 내 비공개 계좌·거래는 삭제, 공개 계좌는 공동 명의로 배우자에게, 정기 거래는 배우자에게. 지워질 건수를 먼저 보여 주고 비밀번호(소셜은 이메일)로 확인. 배우자를 내보내는 기능은 두지 않는다(상대의 비공개 데이터를 지우게 되므로) |
| 카테고리 이름 바꾸기·지우기(합치기) | 설정 > 지출 카테고리 ⋯ | 지울 때 기록·가맹점 규칙·정기 거래를 고른 카테고리로 옮긴다. 소분류가 있는 대분류는 소분류부터 |
| 정산 | 리포트 > 정산 (`/reports/settle`) | 비공개가 아닌 지출만. 낸 사람 = 결제 계좌 명의자(공동 명의 계좌는 제외), 계좌 없으면 기록한 사람. 반반·수입 비율(공개 수입)·직접 비율. "정산 완료"는 금액을 남기고, 이후 기록이 바뀌면 차이를 알린다 |
| 월간 결산 PDF | 리포트 "인쇄 · PDF" | 브라우저 인쇄 → PDF 저장 (메뉴·탭은 인쇄에서 숨김) |
| 이상 지출 감지 | 리포트 "평소와 다른 지출" | 대분류별로 직전 3달 평균보다 40%·5만 원 이상 많거나, 평소 없던 지출 10만 원 이상. 최대 3개 |
| 라이프 이벤트 | 목표 > 생활 변화, 목표 상세 "만약에" | 매달 저축 변화(기간)·한 번에 나가는 돈. 만약에 그래프와 달성 시점에 반영(끄고 켤 수 있음) |
| 푸시 확장 | 아침 9시 알림 | 카드값 결제 이틀 전·당일, 쓸 수 있는 돈 80%·100%를 처음 넘은 날, 목표 25% 단계 (같은 알림을 매일 반복하지 않음) |
| 변경 이력 | 설정 > 변경 이력 | 감사 로그를 문장으로. 바뀐 값은 보여 주지 않고, 배우자의 비공개 계좌·정기 거래에 관한 기록은 숨긴다 |
| 시도 횟수 제한 확대 | — | 비밀번호 확인, 재설정 링크, 문자·캡처 점검과 여러 건 기록, 가계부 검색, 시험 알림 |

### v3.5 구현 (2026-11-12) — 쓰기 편하게
| 기능 | 화면 | 정책 |
|---|---|---|
| 즐겨찾기 | 기록 창 맨 위 · 설정 > 즐겨찾기 | §2-5 |
| 되돌리기 | 저장 결과 화면 · 삭제 알림 | §2-5 |
| 최근 지운 기록 | 설정 > 최근 지운 기록 (`/settings/trash`) | §2-5, 30일 뒤 크론이 완전 삭제 |
| 주간 요약 | 월요일 아침 9시 알림 | §⑤ |
| 앱 잠금 | 설정 > 앱 잠금 (기기마다) | §1-6 |

- AC-27: 즐겨찾기 버튼을 누르면 오늘 날짜로 같은 유형·금액·계좌·카테고리·사용처·메모의 기록이 생긴다. 배우자는 내 즐겨찾기를 보거나 쓰거나 지울 수 없고, 지운 계좌·카테고리를 쓰는 즐겨찾기는 기록하지 않는다.
- AC-28: 기록을 지우면 알림의 [되돌리기]로 그대로 되살아나고, 저장 결과 화면의 [방금 기록 취소]는 방금 기록을 지운다.
- AC-29: 최근 지운 기록에는 30일 안에 지운 내 기록과 배우자의 공유 기록만 나오고 되살릴 수 있다. 배우자의 합계만·비공개 기록과 30일 지난 기록은 되살릴 수 없으며, 30일 지난 기록은 크론이 완전히 지운다.
- AC-30: 월요일 알림에 지난주 변동 지출 합계가 나오고, 비교할 주가 2주 이상이면 평소 대비 문구가 붙는다. 다른 요일에는 보내지 않는다.
- AC-31: 앱 잠금을 켠 기기에서 앱을 다시 열면 Face ID·지문·기기 암호를 확인하기 전까지 가계부 내용이 보이지 않는다. 같은 기기에서 다른 사람이 로그인하면 걸리지 않는다.

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

### H — 계좌·카드 관리
```text
Add Account.billingDay / paymentAccountId (self-relation, SetNull). Owner choice me|partner|joint (features/accounts/rules.ts); PRIVATE only for accounts already owned by the viewer.
Card due items (lib/finance/card-billing.ts) lead the review list; [결제 기록] opens a TRANSFER draft. Verify AC-24~26.
```
