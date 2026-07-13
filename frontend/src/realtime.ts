import { io, Socket } from 'socket.io-client';
import { API_BASE_URL, setSocketId } from './api/client';

// API_BASE_URL is e.g. "http://localhost:4000/api" — the socket connects to
// the bare server origin, not the /api prefix.
const SOCKET_URL = API_BASE_URL.replace(/\/api\/?$/, '');

let socket: Socket | null = null;

interface RealtimeHandlers {
  onDataChanged: (resource: string) => void;
  onNotification: (notification: unknown) => void;
}

// One socket per logged-in session, re-created on every login (fresh token)
// and torn down on logout. Uses websocket-only transport (no XHR polling
// fallback) since that's the one transport guaranteed to exist across every
// platform this app ships on — web, iOS, Android, Windows, macOS.
export function connectRealtime(token: string, handlers: RealtimeHandlers): void {
  disconnectRealtime();

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });

  socket.on('connect', () => setSocketId(socket?.id ?? null));
  socket.on('disconnect', () => setSocketId(null));
  socket.on('data:changed', (payload: { resource: string }) => handlers.onDataChanged(payload.resource));
  socket.on('notification:new', handlers.onNotification);
}

export function disconnectRealtime(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  setSocketId(null);
}
