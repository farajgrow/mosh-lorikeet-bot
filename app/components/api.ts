import type { ChatDone, ChatRequest, TraceEvent } from "@/lib/api/contract";

/** GET/POST JSON with a readable error message. Never throws a raw network error to the UI. */
export async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  } catch {
    throw new Error("Can't reach the server. Check that the dev server is running.");
  }
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) msg = body.message;
      else if (body?.error) msg = body.error;
    } catch {
      /* not JSON */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export interface StreamHandlers {
  onTrace: (e: TraceEvent) => void;
  onDone: (d: ChatDone) => void;
  onError: (message: string) => void;
}

/** POST /api/chat and read the Server-Sent Events stream. */
export async function streamChat(body: ChatRequest, h: StreamHandlers): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify(body),
    });
  } catch {
    h.onError("Can't reach the server. Check that the dev server is running.");
    return;
  }
  if (!res.ok || !res.body) {
    let msg = `The agent couldn't respond (${res.status}).`;
    try {
      const j = await res.json();
      if (j?.message) msg = j.message;
    } catch {
      /* ignore */
    }
    h.onError(msg);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;

  const dispatch = (block: string) => {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    if (!data.length) return;
    let payload: unknown;
    try {
      payload = JSON.parse(data.join("\n"));
    } catch {
      return;
    }
    if (event === "trace") h.onTrace(payload as TraceEvent);
    else if (event === "done") {
      finished = true;
      h.onDone(payload as ChatDone);
    } else if (event === "error") {
      finished = true;
      h.onError((payload as { message?: string })?.message ?? "Something went wrong.");
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        dispatch(buffer.slice(0, idx));
        buffer = buffer.slice(idx + 2);
      }
    }
    if (buffer.trim()) dispatch(buffer);
  } catch {
    if (!finished) h.onError("The connection dropped before the agent finished.");
    return;
  }
  if (!finished) h.onError("The agent stopped without a reply.");
}
