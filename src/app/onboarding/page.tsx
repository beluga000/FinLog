import { redirect } from "next/navigation";
import { Onboarding } from "@/features/household/components/onboarding";
import { getViewer } from "@/lib/db/context";
import { todayKST } from "@/lib/finance/period";

export const metadata = { title: "시작하기" };

export default async function OnboardingPage() {
  const { user, membership } = await getViewer();
  if (membership) redirect("/dashboard");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-6 py-10">
      <p className="text-sm font-semibold text-muted-foreground">FINLOG</p>
      <Onboarding userName={user.name} today={todayKST()} />
    </main>
  );
}
