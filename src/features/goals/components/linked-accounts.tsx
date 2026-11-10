import type { AccountType } from "@/lib/finance/types";

/** 연결 계좌 성격 — 계좌마다 모인 돈이 어떻게 움직이는지 */
const NATURE: Partial<Record<AccountType, { label: string; note: string; tone: "steady" | "swing" | "rare" }>> = {
  CHECKING: { label: "입출금", note: "생활비가 드나들어 출렁여요", tone: "swing" },
  CASH: { label: "현금", note: "쓰는 만큼 줄어요", tone: "swing" },
  SAVINGS: { label: "예적금", note: "꾸준히 쌓여요", tone: "steady" },
  PENSION: { label: "연금", note: "시세 따라 오르내려요", tone: "swing" },
  INVESTMENT: { label: "투자", note: "시세 따라 오르내려요", tone: "swing" },
  REAL_ESTATE: { label: "부동산", note: "잔액을 가끔 맞춰야 바뀌어요", tone: "rare" },
  OTHER_ASSET: { label: "기타 자산", note: "잔액을 가끔 맞춰야 바뀌어요", tone: "rare" },
};

const TONE = { steady: "bg-good", swing: "bg-warning", rare: "bg-muted-foreground" } as const;

/** 목표 상세 — 연결 계좌와 그 성격, 생활비 통장이 섞였을 때 안내 */
export function LinkedAccounts({ accounts }: { accounts: { id: string; name: string; type: AccountType }[] }) {
  if (!accounts.length) return null;
  const hasChecking = accounts.some((a) => a.type === "CHECKING" || a.type === "CASH");
  return (
    <div className="grid gap-1.5">
      <ul className="flex flex-wrap gap-1.5">
        {accounts.map((a) => {
          const n = NATURE[a.type];
          return (
            <li key={a.id} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
              <span className={`size-1.5 rounded-full ${n ? TONE[n.tone] : "bg-muted-foreground"}`} aria-hidden />
              <span className="font-medium">{a.name}</span>
              {n ? <span className="text-muted-foreground">{n.note}</span> : null}
            </li>
          );
        })}
      </ul>
      {hasChecking ? (
        <p className="text-xs text-muted-foreground">
          생활비 통장이 연결돼 있어 월급날·카드 대금날마다 모인 돈이 오르내려요. 목표용 통장을 따로 두고 옮겨 담으면 진척이 정확해져요.
        </p>
      ) : null}
    </div>
  );
}
