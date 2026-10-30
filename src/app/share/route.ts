import { NextResponse } from "next/server";
import { SHARED_TEXT_COOKIE } from "@/features/ledger/shared-text";

/**
 * Android Web Share Target (manifest share_target, POST).
 * 공유된 문자 원문은 URL 에 싣지 않고 5분짜리 httpOnly 쿠키로 한 번만 넘긴다 (AC-22).
 * 인증 전이어도 받아 둔다 — 로그인 후 /dashboard 에서 꺼내 쓴다.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const text = [form?.get("title"), form?.get("text")]
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .join("\n")
    .slice(0, 1000);
  const res = NextResponse.redirect(new URL("/dashboard?add=shared", request.url), 303);
  if (text) {
    res.cookies.set(SHARED_TEXT_COOKIE, encodeURIComponent(text), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 300,
    });
  }
  return res;
}
