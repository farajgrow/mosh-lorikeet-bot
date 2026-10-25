import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { AGENT_MODEL } from "@/lib/agent/model";
import type { EvalReport, EvalRuns } from "@/lib/api/contract";

export const dynamic = "force-dynamic";

/** Eval runs shown on /evals, one tab each. Written by `npm run eval` (per model). */
const RUNS = [
  { key: "sonnet", label: "Sonnet 5.5", file: "results.json" },
  { key: "haiku", label: "Haiku 5.5", file: "results-haiku.json" },
];

async function read(file: string): Promise<EvalReport | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(process.cwd(), "evals", file), "utf8")) as EvalReport;
  } catch {
    return null;
  }
}

export async function GET() {
  const runs = (await Promise.all(RUNS.map(async (r) => ({ key: r.key, label: r.label, report: await read(r.file) })))).filter(
    (r): r is EvalRuns["runs"][number] => r.report !== null,
  );
  const body: EvalRuns = { runs, liveModel: AGENT_MODEL };
  return NextResponse.json(body);
}
