import { WifiOff } from "lucide-react";
import { RetryButton } from "./retry-button";

export const metadata = { title: "연결 끊김" };
// 서비스 워커가 미리 받아 두는 화면 — 로그인·데이터 없이 그린다
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 py-12">
      <div className="grid max-w-sm justify-items-center gap-3 text-center">
        <WifiOff className="size-10 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-bold">인터넷에 연결되지 않았어요</h1>
        <p className="text-sm text-muted-foreground">
          FINLOG는 가계부를 서버에 바로 저장해서, 연결이 돌아오면 그대로 이어서 쓸 수 있어요. 카드 문자는 연결된 뒤 공유하기로 다시 기록해 주세요.
        </p>
        <RetryButton />
      </div>
    </main>
  );
}
