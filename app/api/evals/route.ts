import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import type { EvalReport } from "@/lib/api/contract";

export const dynamic = "force-dynamic";

/** Latest eval results written by `npm run eval`, or null if none yet. */
export async function GET() {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), "evals", "results.json"), "utf8");
    return NextResponse.json(JSON.parse(raw) as EvalReport);
  } catch {
    return NextResponse.json(null);
  }
}
