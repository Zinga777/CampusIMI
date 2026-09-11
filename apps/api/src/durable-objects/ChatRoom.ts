import { randomId } from "../lib/crypto.js";
import type { Env } from "../types.js";

const MAX_MESSAGE_LENGTH = 1000;

interface Socket {
  ws: WebSocket;
  userId: string;
  profileId: string;
}

/**
 * One Durable Object instance per conversation (keyed by conversation id). The Worker
 * verifies the caller is a participant in that conversation *before* forwarding the
 * WebSocket upgrade here — this class trusts the `X-User-Id` header the Worker attaches
 * precisely because clients can never reach a Durable Object directly, only through the
 * Worker's authenticated route. Messages are persisted to D1 on receipt so history
 * survives even if every socket disconnects.
 */
export class ChatRoom {
  private state: DurableObjectState;
  private env: Env;
  private sockets: Socket[] = [];

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const conversationId = url.searchParams.get("conversationId");
    const userId = request.headers.get("X-User-Id");
    const profileId = request.headers.get("X-Profile-Id");

    if (!conversationId || !userId || !profileId) {
      return new Response("Missing conversation or user context.", { status: 400 });
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade.", { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    const socket: Socket = { ws: server, userId, profileId };
    this.sockets.push(socket);

    server.addEventListener("message", (event) => {
      this.handleMessage(conversationId, socket, event.data).catch((err) => {
        console.error("chat message error", err);
      });
    });

    const cleanup = () => {
      this.sockets = this.sockets.filter((s) => s.ws !== server);
    };
    server.addEventListener("close", cleanup);
    server.addEventListener("error", cleanup);

    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleMessage(conversationId: string, sender: Socket, data: string | ArrayBuffer): Promise<void> {
    if (typeof data !== "string") return;
    let parsed: { message?: string };
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }

    const message = parsed.message?.trim();
    if (!message || message.length === 0 || message.length > MAX_MESSAGE_LENGTH) return;

    const id = randomId();
    const createdAt = new Date().toISOString();

    // sender_user_id is the real account — kept for backend accountability/moderation,
    // and NEVER included in the payload broadcast to clients below.
    await this.env.DB.prepare(
      `INSERT INTO messages (id, conversation_id, sender_user_id, message, created_at) VALUES (?1, ?2, ?3, ?4, ?5)`,
    )
      .bind(id, conversationId, sender.userId, message, createdAt)
      .run();

    const payload = JSON.stringify({
      type: "message",
      id,
      senderProfileId: sender.profileId,
      message,
      createdAt,
    });

    for (const socket of this.sockets) {
      try {
        socket.ws.send(payload);
      } catch {
        // dead socket — will be cleaned up by its own close/error listener
      }
    }
  }
}
