// Smoke test for the whole backend API surface: mints a JWT for an existing
// Admin user (via the app's own signAuthToken - no real password is read,
// guessed, or needed) and hits every module's safe, read-only (GET) endpoint
// against the real dev database, so a broken query/serializer in any module
// shows up here instead of only when a real screen loads it in the app.
//
// Deliberately excludes:
// - /api/system/* (clear-warehouse-stock, factory-reset): destructive, would
//   wipe real dev data.
// - Any POST/PATCH/PUT/DELETE endpoint: this suite must not mutate data.
//
// Requires a reachable dev database (see backend/.env DATABASE_URL) with at
// least one active Admin user. Run with `npm run test:smoke:api`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { app } from './app';
import { prisma } from './lib/prisma';
import { signAuthToken } from './lib/jwt';

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, () => {
      const address = server.address();
      if (address && typeof address === 'object') resolve(address.port);
      else reject(new Error('Failed to acquire a port'));
    });
  });
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

type EndpointResult = { path: string; status: number; ok: boolean; body?: unknown; error?: string };

const READ_ONLY_ENDPOINTS: string[] = [
  '/api/users',
  '/api/categories',
  '/api/areas',
  '/api/villages',
  '/api/partner-types',
  '/api/asset-types',
  '/api/assets',
  '/api/assets/inventory-summary',
  '/api/assets/inventory',
  '/api/assets/history',
  '/api/inventory-movements',
  '/api/store-pricing',
  '/api/products',
  '/api/suppliers',
  '/api/purchases',
  '/api/purchase-order-requests',
  '/api/warehouse/inventory',
  '/api/trucks',
  '/api/dispatch/trucks/inventory',
  '/api/stores',
  '/api/stores/visits',
  '/api/orders',
  '/api/orders/invoices',
  '/api/payments',
  '/api/prebookings',
  '/api/notifications',
  '/api/settings/qr-code',
  '/api/settings/audit-logs',
  '/api/settings/permissions',
  '/api/settings/user-permissions',
];

test('backend API smoke: every read-only endpoint as Admin', async (t) => {
  const server = http.createServer(app);
  const port = await listen(server);
  const base = `http://127.0.0.1:${port}`;

  try {
    const admin = await prisma.user.findFirst({ where: { role: 'Admin', status: 'Active' } });
    assert.ok(admin, 'no active Admin user found in the dev database; cannot test authenticated endpoints');
    const token = signAuthToken({ sub: admin!.id, role: 'Admin' });

    const results: EndpointResult[] = [];

    for (const path of READ_ONLY_ENDPOINTS) {
      await t.test(`GET ${path}`, async () => {
        try {
          const res = await fetch(`${base}${path}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          let body: unknown;
          try {
            body = await res.json();
          } catch {
            body = await res.text().catch(() => undefined);
          }
          results.push({ path, status: res.status, ok: res.status < 500, body: res.status >= 400 ? body : undefined });
          assert.ok(res.status < 500, `GET ${path} returned ${res.status}: ${JSON.stringify(body)}`);
        } catch (err) {
          results.push({ path, status: 0, ok: false, error: err instanceof Error ? err.message : String(err) });
          throw err;
        }
      });
    }

    t.after(() => {
      console.log('\n--- Backend endpoint smoke report ---');
      for (const r of results) {
        const marker = r.ok ? 'OK ' : 'FAIL';
        console.log(`[${marker}] ${r.status || 'ERR'}  ${r.path}${r.error ? `  (${r.error})` : ''}${r.body ? `  ${JSON.stringify(r.body)}` : ''}`);
      }
    });
  } finally {
    await close(server);
    await prisma.$disconnect();
  }
});
