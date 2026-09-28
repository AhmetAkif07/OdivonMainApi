import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from 'miniflare';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
let firestoreCalls = 0;
let failFirestore = false;
const worker = new Miniflare(convertV4MiniflareOptions({
  modules: true,
  scriptPath: '.wrangler/smoke/index.js',
  compatibilityDate: '2026-09-21',
  compatibilityFlags: ['nodejs_compat'],
  log: new Log(LogLevel.ERROR),
  bindings: {
    NODE_ENV: 'production', PORT: '3000', FIRESTORE_PREFER_REST: 'true',
    FIREBASE_PROJECT_ID: 'odivon-main-api-a2095',
    FIREBASE_CLIENT_EMAIL: 'worker-test@odivon-main-api-a2095.iam.gserviceaccount.com',
    FIREBASE_PRIVATE_KEY: privateKey,
  },
  outboundService: async (request) => {
    const url = new URL(request.url);
    assert.equal(url.hostname, 'firestore.googleapis.com');
    assert.ok(url.pathname.endsWith('/documents:listCollectionIds'));
    assert.equal(request.method, 'POST');
    assert.match(request.headers.get('authorization'), /^Bearer /);
    firestoreCalls++;
    return Response.json(failFirestore
      ? { error: { code: 403, status: 'PERMISSION_DENIED', message: 'Mock permission denied' } }
      : { collectionIds: ['users', 'tenants'] }, { status: failFirestore ? 403 : 200 });
  },
}));
try {
  let response = await worker.dispatchFetch('https://example.com/health');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'ok');
  assert.equal(firestoreCalls, 1);
  failFirestore = true;
  response = await worker.dispatchFetch('https://example.com/health');
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error.code, 'INTERNAL_ERROR');
  response = await worker.dispatchFetch('https://example.com/api/v1/identity/me');
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'AUTH_REQUIRED');
  response = await worker.dispatchFetch('https://example.com/api/v1/identity/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(response.status, 400);
  for (const authorization of [undefined, 'Bearer firebase-id-token', 'Agent malformed']) {
    response = await worker.dispatchFetch('https://example.com/api/v1/gym/access/agents/work', {
      headers: authorization ? { authorization } : {},
    });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, 'GYM_AGENT_UNAUTHORIZED');
  }
  response = await worker.dispatchFetch('https://example.com/api/v1/gym/access/agents/enroll', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(response.status, 400);
  response = await worker.dispatchFetch('https://example.com/docs-json');
  assert.equal(response.status, 200);
  const openApi = await response.json();
  assert.ok(openApi.paths['/api/v1/identity/me']);
  assert.ok(openApi.paths['/api/v1/gym/access/agents/work']);
  console.log('Workers smoke checks passed: mocked Firestore success/error, auth, agent auth, validation, OpenAPI.');
} finally {
  await worker.dispose();
}
