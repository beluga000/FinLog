"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { login, signup, socialLogin } from "../actions";

const SOCIAL_LABEL: Record<string, string> = { kakao: "카카오로 계속하기", google: "Google로 계속하기" };

export function SocialButtons({ providers }: { providers: { id: string; name: string }[] }) {
  if (!providers.length) return null;
  return (
    <div className="grid gap-2">
      {providers.map((p) => (
        <form key={p.id} action={socialLogin.bind(null, p.id)}>
          <Button type="submit" variant="outline" size="lg" className="w-full">
            {SOCIAL_LABEL[p.id] ?? `${p.name}로 계속하기`}
          </Button>
        </form>
      ))}
      <div className="my-1 text-center text-xs text-muted-foreground">또는 이메일로</div>
    </div>
  );
}

export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          const r = await login({ email: fd.get("email"), password: fd.get("password"), callbackUrl });
          if (r && !r.ok) setError(r.error);
        });
      }}
    >
      <Field label="이메일" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required className="h-10" />
      </Field>
      <Field label="비밀번호" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-10" />
      </Field>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "확인 중…" : "로그인"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        처음이신가요? <Link href="/signup" className="font-medium text-foreground underline">가입하기</Link>
      </p>
    </form>
  );
}

export function SignupForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          const r = await signup({ name: fd.get("name"), email: fd.get("email"), password: fd.get("password") });
          if (r && !r.ok) setError(r.error);
        });
      }}
    >
      <Field label="이름(별명)" htmlFor="name" hint="배우자에게 이 이름으로 보여요">
        <Input id="name" name="name" required maxLength={20} className="h-10" />
      </Field>
      <Field label="이메일" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required className="h-10" />
      </Field>
      <Field label="비밀번호" htmlFor="password" hint="8자 이상">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className="h-10" />
      </Field>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "가입 중…" : "가입하기"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        이미 계정이 있나요? <Link href="/login" className="font-medium text-foreground underline">로그인</Link>
      </p>
    </form>
  );
}
