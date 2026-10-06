"use client";

import { useState, useTransition } from "react";
import { useTheme } from "next-themes";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { BUCKET_LABEL } from "@/lib/labels";
import { addCategory, createInvite, joinHousehold, setCategoryBucket, updateHouseholdSettings } from "../actions";

export function HouseholdSettingsForm({
  initial,
  canEdit,
}: {
  initial: { name: string; monthStartDay: number; emergencyMonths: number };
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const [name, setName] = useState(initial.name);
  const [day, setDay] = useState(initial.monthStartDay);
  const [emergency, setEmergency] = useState(initial.emergencyMonths);
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await updateHouseholdSettings({ name, monthStartDay: day, emergencyMonths: emergency });
          if (!r.ok) toast.error(r.error);
          else toast.success("저장했어요");
        });
      }}
    >
      <fieldset disabled={!canEdit || pending} className="grid gap-4">
        <Field label="가구 이름" htmlFor="h-name">
          <Input id="h-name" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} className="h-9" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="월 시작일" htmlFor="h-day" hint="급여일로 맞추면 '이번 달'이 월급날부터 시작해요">
            <NativeSelect id="h-day" value={day} onChange={(e) => setDay(Number(e.target.value))}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{d === 1 ? "1일 (기본)" : `${d}일`}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="비상금 기준" htmlFor="h-em" hint="월 지출의 몇 개월분">
            <NativeSelect id="h-em" value={emergency} onChange={(e) => setEmergency(Number(e.target.value))}>
              {[3, 4, 6, 9, 12].map((m) => (
                <option key={m} value={m}>{m}개월</option>
              ))}
            </NativeSelect>
          </Field>
        </div>
      </fieldset>
      {canEdit ? (
        <div>
          <Button type="submit" disabled={pending}>{pending ? "저장 중…" : "저장"}</Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">가구 관리자만 변경할 수 있어요.</p>
      )}
    </form>
  );
}

export function InvitePanel({ activeInvite }: { activeInvite: { code: string; expiresAt: string } | null }) {
  const [pending, start] = useTransition();
  const [invite, setInvite] = useState(activeInvite);
  return (
    <div className="grid gap-3">
      {invite ? (
        <div className="grid gap-1 rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">배우자에게 이 코드를 알려주세요</div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black tracking-[0.3em] tabular">{invite.code}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="코드 복사"
              onClick={() => {
                navigator.clipboard?.writeText(invite.code).then(
                  () => toast.success("복사했어요"),
                  () => toast.error("복사하지 못했어요"),
                );
              }}
            >
              <Copy />
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            {new Date(invite.expiresAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}까지 · 1회용
          </div>
        </div>
      ) : null}
      <div>
        <Button
          variant={invite ? "outline" : "default"}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await createInvite();
              if (!r.ok) toast.error(r.error);
              else if (r.data) setInvite(r.data);
            })
          }
        >
          {invite ? "새 코드 만들기" : "초대 코드 만들기"}
        </Button>
      </div>
    </div>
  );
}

export function JoinPanel() {
  const [pending, start] = useTransition();
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<"keep" | "private" | "fresh">("private");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await joinHousehold({ code, dataMode: mode });
          if (r && !r.ok) setError(r.error);
        });
      }}
    >
      <Field label="초대 코드" htmlFor="join-code">
        <Input
          id="join-code"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className="h-10 tracking-[0.3em] tabular"
          placeholder="000000"
        />
      </Field>
      <Field label="지금까지 기록한 데이터는?">
        <NativeSelect value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
          <option value="private">비공개로 가져가기 (추천)</option>
          <option value="keep">그대로 가져가기 (계좌 공개범위 유지)</option>
          <option value="fresh">가져가지 않고 새로 시작</option>
        </NativeSelect>
      </Field>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div>
        <Button type="submit" disabled={pending || code.length !== 6}>{pending ? "연결 중…" : "배우자 가구에 참여"}</Button>
      </div>
    </form>
  );
}

interface Cat {
  id: string;
  name: string;
  bucket: "NEEDS" | "WANTS" | "SAVINGS" | null;
  children: { id: string; name: string; bucket: "NEEDS" | "WANTS" | "SAVINGS" | null }[];
}

export function CategoryEditor({ parents }: { parents: Cat[] }) {
  const [pending, start] = useTransition();
  const [parentId, setParentId] = useState(parents[0]?.id ?? "");
  const [name, setName] = useState("");
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg?: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
      else if (msg) toast.success(msg);
    });
  return (
    <div className="grid gap-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-1.5 font-medium">카테고리</th>
              <th className="w-32 font-medium">50/30/20</th>
            </tr>
          </thead>
          <tbody>
            {parents.flatMap((p) => [
              <tr key={p.id} className="border-b">
                <td className="py-1.5 font-medium">{p.name}</td>
                <td>
                  <BucketSelect value={p.bucket} allowInherit={false} disabled={pending} onChange={(b) => run(() => setCategoryBucket(p.id, b))} />
                </td>
              </tr>,
              ...p.children.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="py-1.5 pl-4 text-muted-foreground">└ {c.name}</td>
                  <td>
                    <BucketSelect value={c.bucket} allowInherit disabled={pending} onChange={(b) => run(() => setCategoryBucket(c.id, b))} />
                  </td>
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const r = await addCategory({ parentId, name });
            if (r.ok) setName("");
            return r;
          }, "추가했어요");
        }}
      >
        <Field label="소분류 추가" className="min-w-36 flex-1">
          <NativeSelect value={parentId} onChange={(e) => setParentId(e.target.value)}>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </NativeSelect>
        </Field>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="이름" className="h-9 w-36" />
        <Button type="submit" disabled={pending || !name.trim()}>추가</Button>
      </form>
    </div>
  );
}

function BucketSelect({
  value,
  allowInherit,
  disabled,
  onChange,
}: {
  value: "NEEDS" | "WANTS" | "SAVINGS" | null;
  allowInherit: boolean;
  disabled: boolean;
  onChange: (b: "NEEDS" | "WANTS" | null) => void;
}) {
  return (
    <NativeSelect
      value={value ?? ""}
      disabled={disabled}
      className="h-8"
      onChange={(e) => onChange((e.target.value || null) as "NEEDS" | "WANTS" | null)}
    >
      {allowInherit ? <option value="">상위 따름</option> : null}
      <option value="NEEDS">{BUCKET_LABEL.NEEDS}</option>
      <option value="WANTS">{BUCKET_LABEL.WANTS}</option>
    </NativeSelect>
  );
}

export function ThemeSelect() {
  const { theme, setTheme } = useTheme();
  return (
    <NativeSelect value={theme ?? "system"} onChange={(e) => setTheme(e.target.value)} aria-label="화면 테마">
      <option value="system">시스템 설정</option>
      <option value="light">라이트</option>
      <option value="dark">다크</option>
    </NativeSelect>
  );
}
