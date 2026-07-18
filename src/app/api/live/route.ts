import { subscribeLiveUpdates } from "@/lib/server/liveUpdates";
import type { LiveUpdate } from "@/lib/server/liveUpdates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const enqueue = (payload: LiveUpdate | { type: "connected" }) => {
        if (closed) {
          return;
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      enqueue({ type: "connected" });

      const unsubscribe = subscribeLiveUpdates((update) => {
        enqueue(update);
      });

      const keepAliveId = setInterval(() => {
        if (!closed) {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        }
      }, 25000);

      const close = () => {
        if (closed) {
          return;
        }

        closed = true;
        clearInterval(keepAliveId);
        unsubscribe();
        controller.close();
      };

      request.signal.addEventListener("abort", close, { once: true });
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
