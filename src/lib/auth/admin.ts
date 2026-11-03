/**
 * 서비스 관리자 = 환경변수 ADMIN_EMAILS(쉼표 구분)에 적힌 이메일.
 * 관리자는 가입 즉시 승인되고, /admin 에서 다른 사람의 가입을 승인·거절한다.
 */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && adminEmails().includes(email.toLowerCase());
}
