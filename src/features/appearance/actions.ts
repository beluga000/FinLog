"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/features/ledger/schema";
import { getViewer } from "@/lib/db/context";
import { prisma } from "@/lib/db/prisma";
import { isPalette } from "./palettes";

/** 화면 테마는 사용자별 — 배우자와 따로 고른다 */
export async function updatePalette(raw: unknown): Promise<ActionResult> {
  if (!isPalette(raw)) return { ok: false, error: "알 수 없는 테마입니다." };
  const { user } = await getViewer();
  await prisma.user.update({ where: { id: user.id }, data: { palette: raw } });
  revalidatePath("/", "layout");
  return { ok: true };
}
