"use client";

import { useState, useTransition } from "react";
import { Heart, User, Users } from "lucide-react";
import { cn } from "cn";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createHousehold, joinHousehold } from "../actions";

type Choice = "solo" | "couple" | "join";

export function Onboarding({ userName }: { userName: string }) {
  const [choice, setChoice] = useState<Choice>("couple");
  const [name, setName] = useState(`${userName}네`);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const options: { id: Choice; title: string; desc: string; icon: typeof User }[] = [
    { id: "couple", title: "부부로 시작", desc: "가구를 만들고 배우자를 초대해요", icon: Heart },
    { id: "solo", title: "혼자 시작", desc: "나중에 언제든 배우자를 초대할 수 있어요", icon: User },
    { id: "join", title: "초대 코드로 참여", desc: "배우자가 보낸 6자리 코드가 있어요", icon: Users },
  ];

  function submit() {
    setError(null);
    start(async () => {
      const r = choice === "join" ? await joinHousehold({ code, dataMode: "fresh" }) : await createHousehold({ name });
      if (r && !r.ok) setError(r.error);
    });
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-2" role="radiogroup">
        {options.map(({ id, title, desc, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={choice === id}
            onClick={() => setChoice(id)}
            className={cn(
              "flex items-center gap-3 rounded-xl border p-4 text-left transition-colors",
              choice === id ? "border-foreground ring-1 ring-foreground" : "hover:bg-muted/50",
            )}
          >
            <Icon className="size-5 shrink-0 text-muted-foreground" />
            <div>
              <div className="font-semibold">{title}</div>
              <div className="text-xs text-muted-foreground">{desc}</div>
            </div>
          </button>
        ))}
      </div>

      {choice === "join" ? (
        <Field label="초대 코드" htmlFor="code">
          <Input
            id="code"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="h-11 text-center text-xl tracking-[0.4em] tabular"
            placeholder="000000"
          />
        </Field>
      ) : (
        <Field label="가구 이름" htmlFor="hname">
          <Input id="hname" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} className="h-10" />
        </Field>
      )}

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button size="lg" onClick={submit} disabled={pending || (choice === "join" ? code.length !== 6 : !name.trim())}>
        {pending ? "준비 중…" : choice === "join" ? "참여하기" : "시작하기"}
      </Button>
      {choice === "couple" ? (
        <p className="text-xs text-muted-foreground">시작 후 설정 화면에서 초대 코드를 만들 수 있어요.</p>
      ) : null}
    </div>
  );
}
