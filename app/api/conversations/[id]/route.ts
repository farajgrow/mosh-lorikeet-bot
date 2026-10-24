import { conversationView } from "@/lib/agent/runTurn";
import { getDb } from "@/lib/store/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conv = getDb().conversations.get(id);
  if (!conv) return Response.json({ message: "Conversation not found" }, { status: 404 });
  return Response.json(conversationView(conv));
}
