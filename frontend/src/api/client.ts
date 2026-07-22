import AsyncStorage from '../utils/asyncStorage';
import { Platform } from 'react-native';

const TOKEN_KEY = '@frostyflow_token';

// Android emulator maps 10.0.2.2 to the host machine's localhost; every other
// target (iOS simulator, web, Windows/macOS desktop, physical device on the
// same network as an overridden URL) can reach the API via localhost directly.

// const DEFAULT_BASE_URL = Platform.OS === 'android'
//   ? 'http://10.0.2.2:4000/api'
  // : 'http://localhost:4000/api';

// production
const DEFAULT_BASE_URL = "https://api.maybentraders.in/api";

// dev
// const DEFAULT_BASE_URL = "http://localhost:4000/api";
// const DEFAULT_BASE_URL = "https://fool-quartet-boastful.ngrok-free.dev/api";

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || DEFAULT_BASE_URL;

let cachedToken: string | null | undefined;

export async function getToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken;
  cachedToken = await AsyncStorage.getItem(TOKEN_KEY);
  return cachedToken;
}

export async function setToken(token: string | null) {
  cachedToken = token;
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

export class ApiRequestError extends Error {}

// Fires when an already-authenticated request comes back 401 (session
// revoked by an admin disabling the user, or the JWT naturally expiring).
// AppContext registers a handler that forces logout back to the login
// screen instead of leaving the user stuck re-triggering the same error.
let onSessionInvalid: (() => void) | null = null;
export function setOnSessionInvalid(handler: (() => void) | null) {
  onSessionInvalid = handler;
}

// Set by the realtime module once the socket handshake completes. Sent as a
// header on every mutating request so the backend can exclude this exact tab
// from the broadcast of the change it's about to make — this tab already has
// the fresh result from the request's own response.
let currentSocketId: string | null = null;
export function setSocketId(id: string | null) {
  currentSocketId = id;
}

// Screens don't disable buttons while a save/submit is in flight, so a fast
// double-tap can fire the same mutation twice before the first response
// comes back (a real risk now that these go over the network instead of
// mutating local state synchronously). Dedupe identical concurrent requests
// by method+path+body so the second tap rides the first request's result
// instead of creating a duplicate user/order/payment/etc.
const inFlightRequests = new Map<string, Promise<unknown>>();

async function performRequest<T>(path: string, options: { method?: string; body?: unknown }): Promise<T> {
  const token = await getToken();
  // ngrok's free-tier browser warning interstitial intercepts requests that
  // look like they come from a browser (web target) and returns an HTML page
  // with no CORS headers instead of proxying to the backend. This header
  // tells ngrok to skip that page and pass the request through untouched.
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (currentSocketId) headers['X-Socket-Id'] = currentSocketId;

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (e) {
    throw new ApiRequestError('Cannot reach the server. Please check your network connection and try again.');
  }

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;

  if (!res.ok) {
    if (res.status === 401 && token) {
      onSessionInvalid?.();
    }
    throw new ApiRequestError(json?.error ?? 'Something went wrong. Please try again.');
  }
  return json as T;
}

function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const key = `${method}:${path}:${options.body !== undefined ? JSON.stringify(options.body) : ''}`;

  const existing = inFlightRequests.get(key);
  if (existing) return existing as Promise<T>;

  const promise = performRequest<T>(path, options).finally(() => {
    inFlightRequests.delete(key);
  });
  inFlightRequests.set(key, promise);
  return promise;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
