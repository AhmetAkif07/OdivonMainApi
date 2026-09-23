# Odivon Main API

NestJS 11 modular monolith. Firebase Authentication + Cloud Firestore. Product modules: **vet** (core), **farm** / **gym** (skeletons).

## Architecture

```
Controller → Service → Repository → Firestore
```

Tenant ID is never taken from query/body/header. It comes from the verified Firebase user profile (`users/{uid}`) and is stored in `AsyncLocalStorage`. Repositories read tenant id from `TenantContext` and write only to `tenants/{tenantId}/...`.

Authorization source of truth is Firestore `users/{uid}`. Custom claims are a cache. If they diverge, Firestore wins. After role/module changes, the client must refresh its ID token.

## Scripts

```bash
npm install
npm run start:dev
npm run build
npm run test
npm run lint
```

- API prefix: `/api/v1`
- Public health: `GET /health` (no auth)
- Swagger: `/docs`

## Environment

Copy `.env.example` to `.env`. Production requires `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` (`\n` in the key is unescaped automatically).

Do not commit secrets.

## Cloudflare Workers

Worker: `odivon-main-api`. Custom domain: `mainapi.odivon.com`.
This deployment uses Workers and static assets, without Containers or paid bindings.

```bash
npm ci
npm run test:worker
npm run deploy:worker
```

Set `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` with `npx wrangler secret put NAME`.
Without both secrets the API returns HTTP 503. Never deploy emulator settings or test keys.
For local development, put real credentials in the ignored `.dev.vars` file and run
`npm run dev:worker` (port 8799). Optional `CORS_ORIGIN` can be set in Wrangler vars.

Swagger UI is served as static assets at `/docs/`, with its schema at `/docs-json`.
`/health` checks actual Firestore connectivity. Firestore uses REST on Workers;
the protobuf schemas are prepared at isolate startup because Workers disallows
dynamic code generation during requests. Nest also starts outside requests;
Firestore initialization is deferred until the first database operation.

`test:worker` runs the bundled API in the Workers runtime with mocked outbound
Firestore responses, covering success/error decoding, authentication rejection,
input validation and OpenAPI. It does not validate real Firebase credentials,
authenticated CRUD, or production CPU usage. Test those after adding real secrets.
The Free plan's CPU limit still applies; fitting the bundle size does not guarantee
that every authenticated request will fit that limit. The throttle is per isolate.

Active Firebase project: `odivon-main-api-a2095`. Firestore `(default)` is in **eur3** (Europe multi-region). Client SDK access is denied by `firestore.rules`; the API uses Admin SDK.

## Local Firebase emulators

```bash
firebase emulators:start
```

Then in `.env`:

```
FIREBASE_PROJECT_ID=demo-odivon
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
```

Do not point emulator hosts at production.

## Register / identity

`POST /api/v1/identity/register` creates a Firebase Auth user, a tenant, a Firestore profile, and custom claims (`owner` + `vet`). Auth + Firestore are **not** one transaction. If provisioning fails after the Auth user is created, the API attempts rollback (delete profile, tenant, Auth user). If rollback also fails, the error is logged.

`GET /api/v1/identity/me` returns Auth identity + Firestore profile + tenant summary. It does not build the response from custom claims alone.

## Farm / Gym

These endpoints still run `FirebaseAuthGuard` → `TenantGuard` → `ModuleGuard`. Missing module → `403 FORBIDDEN_MODULE`. Authorized but unimplemented → `501 NOT_IMPLEMENTED`.

## Firebase

- Project: [odivon-main-api-a2095](https://console.firebase.google.com/project/odivon-main-api-a2095/overview)
- Firestore location: `eur3` (Europe)
- Enable Email/Password under [Authentication → Sign-in method](https://console.firebase.google.com/project/odivon-main-api-a2095/authentication/providers) if client login is needed. Admin SDK user creation works from the API regardless.
