import { Server as IOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import { verifyAuthToken } from './lib/jwt';

let io: IOServer | undefined;

// Every browser tab/device that's logged in opens one of these. Auth mirrors
// requireAuth: the same JWT used for REST calls is handed over in the
// handshake, so a revoked/expired token can't open a socket either.
export function initRealtime(httpServer: HTTPServer): IOServer {
  io = new IOServer(httpServer, {
    cors: { origin: '*' },
    transports: ['websocket'],
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || !token) {
      return next(new Error('Unauthorized'));
    }
    try {
      const payload = verifyAuthToken(token);
      socket.data.userId = payload.sub;
      socket.data.role = payload.role;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  return io;
}

// Broadcasts to every connected client except the one that made the request
// that triggered this change (identified by the `X-Socket-Id` header the
// frontend attaches to mutating requests) — that client already has the
// fresh result from its own request/response and doesn't need to re-fetch.
export function broadcastExcept(excludeSocketId: string | undefined, event: string, payload: unknown) {
  if (!io) return;
  const emitter = excludeSocketId ? io.except(excludeSocketId) : io;
  emitter.emit(event, payload);
}
