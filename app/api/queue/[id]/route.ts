import { decideQueueItem } from "@/lib/agent/approvals";
import { conversationView } from "@/lib/agent/runTurn";
import type { QueueActionRequest, QueueActionResponse } from "@/lib/api/contract";
import { getDb } from "@/lib/store/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as QueueActionRequest | null;
  if (!body || !["approve", "reject", "resolve"].includes(body.action)) return Response.json({ message: "Invalid action" }, { status: 400 });
  try {
    const item = decideQueueItem(id, body.action, { note: body.note, approver: body.approver });
    const conv = getDb().conversations.get(item.conversationId);
    const res: QueueActionResponse = { item, conversation: conv ? conversationView(conv) : null };
    return Response.json(res);
  } catch (err) {
    return Response.json({ message: (err as Error).message }, { status: 409 });
  }
}
