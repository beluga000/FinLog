/** 승인 대기 안내 — 로그인 실패·소셜 로그인 리다이렉트·가입 완료 화면이 같은 문구를 쓴다 */
export const PENDING_MESSAGE = "관리자 승인을 기다리고 있어요. 승인되면 로그인할 수 있어요.";

/** 로그인 화면 ?error= 안내 — 미들웨어(만료)·getViewer(세대 불일치)·모든 기기 로그아웃이 붙인다 */
export const LOGIN_NOTICE: Record<string, string> = {
  pending: PENDING_MESSAGE,
  expired: "로그인 후 24시간이 지나 다시 로그인이 필요해요.",
  revoked: "모든 기기에서 로그아웃됐어요. 다시 로그인해 주세요.",
  reset: "비밀번호를 바꿨어요. 새 비밀번호로 로그인해 주세요.",
  deleted: "탈퇴했어요. 그동안 FINLOG를 써 주셔서 고마워요.",
};
