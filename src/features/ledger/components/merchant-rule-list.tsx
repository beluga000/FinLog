"use client";

import { X } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteMerchantRule } from "../actions";

/** 설정 — 가맹점 규칙 목록. 규칙은 기록 창에서 카테고리를 고칠 때 만든다 */
export function MerchantRuleList({ rules }: { rules: { id: string; merchant: string; categoryName: string }[] }) {
  const [pending, start] = useTransition();
  if (!rules.length) {
    return <p className="text-sm text-muted-foreground">아직 없어요. 기록 창에서 카테고리를 고치면 &ldquo;앞으로 이 사용처는…&rdquo;을 물어봐요.</p>;
  }
  return (
    <ul className="grid divide-y text-sm">
      {rules.map((r) => (
        <li key={r.id} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
          <span className="min-w-0 flex-1 truncate">
            {r.merchant} <span className="text-muted-foreground">→ {r.categoryName}</span>
          </span>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`${r.merchant} 규칙 지우기`}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await deleteMerchantRule(r.id);
                if (res.ok) toast.success("규칙을 지웠어요");
                else toast.error(res.error);
              })
            }
          >
            <X />
          </Button>
        </li>
      ))}
    </ul>
  );
}
