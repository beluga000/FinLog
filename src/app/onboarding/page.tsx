import { redirect } from "next/navigation";
import { Onboarding } from "@/features/household/components/onboarding";
import { getViewer } from "@/lib/db/context";

export const metadata = { title: "시작하기" };

export default async function OnboardingPage() {
  const { user, membership } = await getViewer();
  if (membership) redirect("/dashboard");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div>
        <p className="text-sm font-semibold text-muted-foreground">FINLOG</p>
        <h1 className="mt-1 text-2xl font-bold">{user.name}님, 어떻게 시작할까요?</h1>
      </div>
      <Onboarding userName={user.name} />
    </main>
  );
}
