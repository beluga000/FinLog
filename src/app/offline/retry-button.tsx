"use client";

import { Button } from "@/components/ui/button";

export function RetryButton() {
  return <Button onClick={() => window.location.reload()}>다시 시도</Button>;
}
