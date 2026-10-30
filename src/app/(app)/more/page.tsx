import { redirect } from "next/navigation";

/** v3: 더보기 탭 제거 — 설정·정기 거래는 헤더 프로필 메뉴로 이동 (AC-17) */
export default function MorePage() {
  redirect("/dashboard");
}
