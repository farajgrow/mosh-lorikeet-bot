import { conversationView } from "@/lib/agent/runTurn";
import { getDb } from "@/lib/store/db";
import { withDb } from "@/lib/store/persist";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withDb(() => {
    const conv = getDb().conversations.get(id);
    if (!conv) return Response.json({ message: "Conversation not found" }, { status: 404 });
    return Response.json(conversationView(conv));
  }, { write: false });
}
