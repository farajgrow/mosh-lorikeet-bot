import { runTurn } from "@/lib/agent/runTurn";
import { hasApiKey } from "@/lib/agent/model";
import type { ChatRequest } from "@/lib/api/contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Runs one agent turn and streams trace events live as Server-Sent Events. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as ChatRequest | null;
  const message = body?.message?.trim();
  if (!message) return Response.json({ message: "Message is required" }, { status: 400 });
  if (message.length > 2000) return Response.json({ message: "Message too long" }, { status: 400 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      try {
        if (!hasApiKey()) send("trace", { id: "nokey", ts: new Date().toISOString(), turn: 0, kind: "error", title: "No ANTHROPIC_API_KEY set — only the rule-based safety layer can run", badge: "blocked" });
        const result = await runTurn(body?.conversationId ?? null, message, { emit: (e) => send("trace", e) });
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
