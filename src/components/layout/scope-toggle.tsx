"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "cn";
import { SCOPE_LABEL } from "@/lib/labels";
import { parseViewScope, VIEW_SCOPES } from "@/lib/finance/visibility";

/** [우리 | 나 | 배우자] — URL ?scope= 로 상태를 들고 있어 서버 컴포넌트가 바로 다시 조회한다 */
export function ScopeToggle({ partnerName }: { partnerName: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = parseViewScope(params.get("scope"));
  return (
    <div role="radiogroup" aria-label="보기 범위" className="inline-flex rounded-lg bg-muted p-[3px] text-sm">
      {VIEW_SCOPES.map((scope) => (
        <button
          key={scope}
          type="button"
          role="radio"
          aria-checked={current === scope}
          onClick={() => {
            const next = new URLSearchParams(params);
            if (scope === "us") next.delete("scope");
            else next.set("scope", scope);
            const q = next.toString();
            router.push(q ? `${pathname}?${q}` : pathname);
          }}
          className={cn(
            "rounded-md px-3 py-1 text-muted-foreground transition-colors",
            current === scope && "bg-background font-semibold text-foreground shadow-sm",
          )}
        >
          {scope === "partner" ? partnerName : SCOPE_LABEL[scope]}
        </button>
      ))}
    </div>
  );
}
