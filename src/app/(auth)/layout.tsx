import Link from "next/link";
import { Logo } from "@/components/common/logo-mark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6 py-12">
      <Link href="/" data-slot="logo" aria-label="FINLOG" className="text-lg font-black tracking-tight">
        <Logo />
      </Link>
      {children}
    </main>
  );
}
