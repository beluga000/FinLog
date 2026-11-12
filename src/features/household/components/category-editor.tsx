"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { BUCKET_LABEL } from "@/lib/labels";
import { addCategory, deleteCategory, getCategoryUsage, renameCategory, setCategoryBucket } from "../actions";

type Bucket = "NEEDS" | "WANTS" | "SAVINGS" | null;

export interface CategoryEditorParent {
  id: string;
  name: string;
  bucket: Bucket;
  children: { id: string; name: string; bucket: Bucket }[];
}

type CatRef = { id: string; name: string };
type CatUsage = { tx: number; rules: number; recurring: number; children: number };

/** 설정 > 지출 카테고리: 50/30/20 분류, 소분류 추가, 이름 바꾸기, 지우기(다른 카테고리로 합치기) */
export function CategoryEditor({ parents }: { parents: CategoryEditorParent[] }) {
  const [pending, start] = useTransition();
  const [parentId, setParentId] = useState(parents[0]?.id ?? "");
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<CatRef | null>(null);
  const [newName, setNewName] = useState("");
  const [removing, setRemoving] = useState<CatRef | null>(null);
  const [usage, setUsage] = useState<CatUsage | null>(null);
  const [moveTo, setMoveTo] = useState("");

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg?: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      if (msg) toast.success(msg);
      after?.();
    });

  // 옮길 곳 후보: 지우는 카테고리 자신을 뺀 모든 지출 카테고리
  const targets = removing
    ? parents.flatMap((p) => [
        ...(p.id === removing.id ? [] : [{ id: p.id, label: p.name }]),
        ...p.children.filter((c) => c.id !== removing.id).map((c) => ({ id: c.id, label: `${p.name} › ${c.name}` })),
      ])
    : [];

  function openRemove(c: CatRef) {
    setUsage(null);
    setRemoving(c);
    // 소분류는 기본으로 그 대분류에 합친다
    setMoveTo(parents.find((p) => p.children.some((ch) => ch.id === c.id))?.id ?? "");
    start(async () => {
      const r = await getCategoryUsage(c.id);
      if (!r.ok) return void toast.error(r.error);
      setUsage(r.data ?? null);
    });
  }

  const menu = (c: CatRef) => (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-8" aria-label={`${c.name} 메뉴`} disabled={pending} />}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuItem
          onClick={() => {
            setNewName(c.name);
            setRenaming(c);
          }}
        >
          이름 바꾸기
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={() => openRemove(c)}>
          지우기 · 합치기
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="grid gap-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-1.5 font-medium">카테고리</th>
              <th className="w-32 font-medium">50/30/20</th>
              <th className="w-10">
                <span className="sr-only">관리</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {parents.flatMap((p) => [
              <tr key={p.id} className="border-b">
                <td className="py-1.5 font-medium">{p.name}</td>
                <td>
                  <BucketSelect value={p.bucket} allowInherit={false} disabled={pending} onChange={(b) => run(() => setCategoryBucket(p.id, b))} />
                </td>
                <td className="text-right">{menu(p)}</td>
              </tr>,
              ...p.children.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="py-1.5 pl-4 text-muted-foreground">└ {c.name}</td>
                  <td>
                    <BucketSelect value={c.bucket} allowInherit disabled={pending} onChange={(b) => run(() => setCategoryBucket(c.id, b))} />
                  </td>
                  <td className="text-right">{menu(c)}</td>
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
          run(() => addCategory({ parentId, name }), "추가했어요", () => setName(""));
        }}
      >
        <Field label="소분류 추가" className="min-w-36 flex-1">
          <NativeSelect value={parentId} onChange={(e) => setParentId(e.target.value)}>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="이름" className="h-9 w-36" />
        <Button type="submit" disabled={pending || !name.trim()}>
          추가
        </Button>
      </form>

      <Dialog open={renaming !== null} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>이름 바꾸기</DialogTitle>
            <DialogDescription>지난 기록도 새 이름으로 보여요.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (renaming) run(() => renameCategory({ id: renaming.id, name: newName }), "이름을 바꿨어요", () => setRenaming(null));
            }}
          >
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={20} className="h-9" aria-label="새 이름" />
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setRenaming(null)} disabled={pending}>
                취소
              </Button>
              <Button type="submit" disabled={pending || !newName.trim() || newName.trim() === renaming?.name}>
                바꾸기
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{removing?.name} 지우기</DialogTitle>
            <DialogDescription>이 카테고리의 기록은 고른 카테고리로 옮겨요 (합치기).</DialogDescription>
          </DialogHeader>
          {!usage ? (
            <p className="text-sm text-muted-foreground">확인하는 중…</p>
          ) : usage.children > 0 ? (
            <p className="text-sm">소분류가 {usage.children}개 있어요. 소분류를 먼저 지우거나 옮기세요.</p>
          ) : (
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (removing) run(() => deleteCategory({ id: removing.id, moveToId: moveTo }), `${removing.name} 카테고리를 지웠어요`, () => setRemoving(null));
              }}
            >
              <p className="text-sm">
                {usage.tx || usage.rules || usage.recurring
                  ? `기록 ${usage.tx}건${usage.rules ? ` · 가맹점 규칙 ${usage.rules}개` : ""}${usage.recurring ? ` · 정기 거래 ${usage.recurring}개` : ""}를 옮겨요.`
                  : "이 카테고리를 쓰는 기록이 없어요."}
              </p>
              <Field label="옮길 카테고리" htmlFor="cat-move-to">
                <NativeSelect id="cat-move-to" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                  <option value="" disabled>
                    고르세요
                  </option>
                  {targets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setRemoving(null)} disabled={pending}>
                  취소
                </Button>
                <Button type="submit" variant="destructive" disabled={pending || !moveTo}>
                  옮기고 지우기
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BucketSelect({
  value,
  allowInherit,
  disabled,
  onChange,
}: {
  value: Bucket;
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
