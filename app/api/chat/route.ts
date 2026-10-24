import { runTurn } from "@/lib/agent/runTurn";
import { hasApiKey } from "@/lib/agent/model";
import type { ChatRequest } from "@/lib/api/contract";
import { getDb } from "@/lib/store/db";
import { withDb } from "@/lib/store/persist";
import { rateLimited } from "@/lib/api/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** A turn can take several model calls; give it room on Vercel. */
export const maxDuration = 60;

const MAX_TURNS_PER_CONVERSATION = 30;

/** Runs one agent turn and streams trace events live as Server-Sent Events. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as ChatRequest | null;
  const message = body?.message?.trim();
  if (!message) return Response.json({ message: "Message is required" }, { status: 400 });
  if (message.length > 2000) return Response.json({ message: "Message too long" }, { status: 400 });
  // Public demo: protect the API budget.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip)) return Response.json({ message: "You're sending messages quickly — please wait a minute and try again." }, { status: 429 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      try {
        if (!hasApiKey()) send("trace", { id: "nokey", ts: new Date().toISOString(), turn: 0, kind: "error", title: "No ANTHROPIC_API_KEY set — only the rule-based safety layer can run", badge: "blocked" });
        const result = await withDb(async () => {
          const existing = body?.conversationId ? getDb().conversations.get(body.conversationId) : undefined;
          if (existing && existing.turn >= MAX_TURNS_PER_CONVERSATION) throw new Error("This conversation is at its limit. Click 'New conversation' to keep going.");
          return runTurn(body?.conversationId ?? null, message, { emit: (e) => send("trace", e) });
        }, { write: true });
        send("done", result);
      } catch (err) {
        send("error", { message: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
