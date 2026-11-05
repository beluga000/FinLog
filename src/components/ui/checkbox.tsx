import { Check } from "lucide-react";
import { cn } from "cn";

/**
 * 테마를 따르는 체크박스. 기본 input 을 그대로 써서 label 로 감싸면 글자를 눌러도 켜지고 꺼진다.
 * 켜지면 테마 강조색으로 채우고, 모서리는 테마 둥글기(--radius)를 따른다.
 */
function Checkbox({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <span data-slot="checkbox" className={cn("relative inline-flex size-5 shrink-0", className)}>
      <input
        type="checkbox"
        className="peer size-5 cursor-pointer appearance-none rounded-[calc(var(--radius)*0.4)] border-2 border-muted-foreground/45 bg-card transition-colors checked:border-brand checked:bg-brand hover:border-brand/70 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        {...props}
      />
      <Check
        aria-hidden
        strokeWidth={3}
        className="pointer-events-none absolute inset-0 m-auto size-3.5 text-background opacity-0 transition-opacity peer-checked:opacity-100"
      />
    </span>
  );
}

export { Checkbox };
