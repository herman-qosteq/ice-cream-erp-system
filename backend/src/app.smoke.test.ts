// Smoke test for the whole backend: importing `app` wires up every module
// router (auth, orders, dispatch, payments, etc.), so if any route file has
// a bad import or throws during setup, this test fails before anything else
// does. Run with `npm run test:smoke`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { app } from './app';

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        resolve(address.port);
      } else {
        reject(new Error('Failed to acquire a port'));
      }
    });
  });
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

test('app boots and responds on GET /health', async () => {
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ok' });
  } finally {
    await close(server);
  }
});

test('unknown routes fall through to the 404 handler instead of crashing', async () => {
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/does-not-exist`);
    assert.equal(res.status, 404);
  } finally {
    await close(server);
  }
});
