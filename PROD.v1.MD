# [PRD] FINLOG - 부부/개인 맞춤형 가계부 & 자산 설계/예측 플랫폼

> **프로젝트 명**: FINLOG (Finance + Log)
> **목적**: 월별 지출·소비 모니터링, 부부/개인 맞춤형 자산 포트폴리오 추천, 목표 자산 달성 시뮬레이션 및 예측을 제공하는 반응형 웹 서비스 개발
> **핵심 가치**: "기록(Log)을 넘어 N년 뒤 자산 목표 달성을 가이드하는 스마트 파이낸스 파트너"

---

## 1. 주요 요구사항 및 핵심 기능 (Key Features)

### ① 계정 및 사용자 유형 (Account & Mode)
- **듀얼 모드 지원**: 
  - **부부(커플) 모드 (메인)**: 공동 가계부/통합 자산 관리, 수입/지출/투자의 합산 및 비율 분석.
  - **개인 모드**: 단독 계정 기준의 가계부 및 자산 관리.
- **권한 및 데이터 연동**: 부부 모드 시 계정 간 데이터 공유 및 커스텀 분담율 설정 지원.

### ② 월별 자산 흐름 & 지출 통계 (Cash Flow & Statistics)
- **월 수입/급여 입력**: 정기 급여, 비정기 수입(상여/부수입) 등록.
- **고정/변동 지출 관리**: 소비 지출 내역 범주화(식비, 주거, 교통, 문화 등).
- **이체/저축/투자 모니터링**: 예·적금 납입, 증권/코인/부동산 이체 건별 분류.
- **월별 지출 통계 대시보드**:
  - 수입 대비 소비/투자 비율 차트 (예: 50/30/20 법칙 기준 비교 분석).
  - 전월 대비 지출 변동성 추이 및 카테고리별 지출 Top 5 visualizer.

### ③ 스마트 포트폴리오 추천 서비스 (Investment Recommendation)
- **투자 성향 및 조건 입력**: 투자 가능 금액, 위험 선호도(안정형~공격투자형), 목표 기간.
- **맞춤형 포트폴리오 추천 Engine**:
  - 자산 배분 비중 제안 (예: 예적금 N% / 미국 배당주 N% / 지수 ETF N% / 채권 N%).
  - 사용자가 추천 포트폴리오를 **직접 선택, 수정 및 커스텀 조정** 가능.

### ④ 자산 예측 및 시뮬레이션 (Asset Prediction Engine)
- **N년 후 자산 시뮬레이션**:
  - 현재 월 저축/투자금 + 복리 수익률 + 기대 물가상승률 적용.
  - **결과 산출**: N년 후 예상 수익률(%), 예상 자산 총규모(원), 자산 증대 곡선 그래프.
- **목표 자산(Goal Tracking) 설정 & 가이드**:
  - 목표 금액(예: 10억 원) 및 목표 기간 설정.
  - 목표 달성을 위한 **월 필요 저축/투자금 역산 계산기**.
  - 목표 달성을 위한 추천 플랜 선택/수정 기능.

### ⑤ 멀티 디바이스 / Cross-Platform
- **반응형 Web & Mobile View**: Mobile-first Web UI design (PWA 연동 고려).

---

## 2. 권장 기술 스택 (Tech Stack)

- **Frontend**: Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, Recharts (또는 Chart.js), Lucide React
- **Backend**: Next.js API Routes (Server Actions) 또는 Node.js (NestJS / Express)
- **Database**: PostgreSQL (or Supabase) / Prisma ORM
- **State & Query**: TanStack Query (React Query), Zustand

---

## 3. Claude Code 실행 및 초안 작성 요청 프롬프트 (Prompt for Claude Code)

아래 박스 전체를 복사하여 **Claude Code CLI**에 입력하세요.

```text
Hello Claude! Please help me initialize and build the core architecture for project "FINLOG" based on the following requirements:

### Project Overview
FINLOG is a personal/couples financial ledger & portfolio prediction web app.
Key Target: Supports both "Couple Mode" (default/main) and "Individual Mode".

### Core Requirements
1. **Couples & Solo Account Context**:
   - Ability to aggregate income/expenses for couples or keep them single.
2. **Monthly Cash Flow & Statistics**:
   - Income/Salary, Living Expenses, Savings & Investment Transfers.
   - Monthly statistical visual charts (Income vs Expense vs Investment ratio).
3. **Investment Portfolio Recommendation Engine**:
   - Risk appetite & investment capacity inputs.
   - Recommends asset allocation (e.g., ETFs, Savings, Stocks) with editable/customizable options.
4. **N-Year Asset Growth Prediction & Goal Tracking**:
   - Compound interest simulation showing predicted net worth & return rate % over N years.
   - Goal asset setting (e.g. $1M / 10억) with reverse calculation on required monthly savings/investments.
5. **Responsive UI**:
   - Mobile-first Web layout accessible across all devices (Desktop, Tablet, Mobile).

---

### Step 1: Project Setup & Architecture
1. Initialize a **Next.js (App Router)** project with **TypeScript**, **Tailwind CSS**, **Prisma**, and **shadcn/ui**.
2. Propose a clean, modular folder structure under `/src`:
   - `/app` (pages & routes: dashboard, ledger, portfolio, prediction, settings)
   - `/components` (ui, common, layout, charts, forms)
   - `/lib` (calculation utils for compound interest, portfolio algorithms, prisma client)
   - `/types` (domain entities: User, LedgerItem, Portfolio, AssetGoal)
   - `/prisma` (schema definitions)

---

### Step 2: Database Schema (`prisma/schema.prisma`)
Create models for:
- `User` & `Household` (for Couple Mode linking)
- `Transaction` (Income, Expense, Investment Transfer, date, category, amount)
- `PortfolioPlan` (Recommended / Customized asset allocation percentages)
- `AssetGoal` (Target amount, target date, selected strategy)

---

### Step 3: Core Calculation Utility Modules (`/lib/calculations`)
Write clean TypeScript utilities for:
1. `calculateMonthlyStats(transactions)`: Aggregates income, expense, and investment totals & ratios.
2. `recommendPortfolio(riskLevel, monthlyBudget)`: Returns recommended portfolio distribution.
3. `predictAssetGrowth(currentAsset, monthlyInvestment, annualReturnRate, years)`: Returns yearly asset projection data for charting.
4. `calculateRequiredInvestment(targetAmount, currentAsset, years, expectedReturnRate)`: Reverse calculates required monthly contribution.

---

### Step 4: UI Prototype Layout & Dashboard Page (`/app/dashboard/page.tsx`)
Create a responsive dashboard featuring:
- **Header**: Mode switcher (Couple Mode / Individual Mode)
- **Top Metrics Cards**: Total Assets, Monthly Income, Monthly Expense, Monthly Investment Ratio.
- **Charts**:
  - Monthly Cash Flow Breakdown (Donut/Pie Chart)
  - N-Year Asset Growth Prediction Curve (Line Chart)
- **Goal Progress Bar**: Target Asset Progress & Recommended Actions.

Please start by setting up the project structure, Prisma schema, math calculation utilities, and the basic responsive Dashboard page component.