# Odivon Main API

NestJS 11 modular monolith. Firebase Authentication + Cloud Firestore. Product modules: **vet** (core), **farm**, **gym**, **spa**.

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

Swagger UI is served as static assets at `/docs/`. The `/docs-json` schema is
generated during the Worker build and served as a static asset to keep Worker
startup within Cloudflare's limit.
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

### Verification and welcome emails

Workers cannot open a TCP socket to `smtp.hostinger.com` because that hostname
resolves to a Cloudflare address. For production mail, create a Hostinger Agentic
Mail API token with **Selected mailboxes: info@odivon.com**. Obtain that mailbox's
`resourceId` from Hostinger Mail API `GET /api/v1/me`, then configure both Worker
secrets:

```bash
npx wrangler secret put HOSTINGER_MAIL_API_TOKEN
npx wrangler secret put HOSTINGER_MAILBOX_RESOURCE_ID
```

When both are set, all welcome and verification mail uses Hostinger's HTTPS API.
The existing SMTP transport remains available for a local Node server. The
`resend-verification` endpoint waits for provider acceptance and returns HTTP 503
if sending fails; a response from the provider does not guarantee inbox delivery.

## Sandbox payments

Payments use a provider interface and a tenant-specific provider setting. The only
registered adapter is iyzico Checkout Form in **sandbox mode**. More providers can
be added by implementing `PaymentProvider` and registering the adapter in
`PaymentsService`. Provider credentials are server-side secrets and are never
returned by the API. The integration never sends card data through Odivon.

Set these Cloudflare secrets before testing checkout:

```bash
npx wrangler secret put IYZICO_SANDBOX_API_KEY
npx wrangler secret put IYZICO_SANDBOX_SECRET_KEY
```

For local development, set the same names in `.dev.vars`. If the callback should
reach a different API host, set `PAYMENT_PUBLIC_BASE_URL` to its HTTPS origin.
Set `PAYMENT_GYM_RETURN_URL` to the public GYM license page URL when it differs
from `https://gym.odivon.com/admin/subscription`. The callback returns the
browser to that page with a `paymentSession` query parameter.
Only the sandbox endpoint `https://sandbox-api.iyzipay.com` is used.

Authenticated tenant owners/admins can call:

- `GET /api/v1/payments/providers` to see available and selected providers.
- `PUT /api/v1/payments/provider` with `{ "provider": "iyzico" }` to select it.
- `GET /api/v1/payments/saas-plans` returns server-side GYM license prices.
- `POST /api/v1/payments/saas-orders` with `planId` and `billingCycle`
  creates a tenant-owner-only sandbox order. Its price is fixed on the server.
- `POST /api/v1/payments/checkout` with a source of `vet_sale`,
  `gym_receivable`, or `saas_subscription`, its `sourceId`, and the buyer's `name`, `surname`,
  `identityNumber`, `email`, `gsmNumber`, `address`, `city`, and `country`.
  The API calculates the remaining amount from the tenant's Firestore data and
  returns an iyzico `paymentPageUrl` and a session ID.
- `GET /api/v1/payments/sessions/:id` to read the outcome and
  `POST /api/v1/payments/sessions/:id/reconcile` to recheck a pending outcome.

iyzico posts its checkout token to the public callback URL. The API retrieves
the result from iyzico and verifies its signature, conversation ID, token,
currency and amount before recording the payment session result. Repeated
callbacks do not reapply a result. This foundation records **payment sessions
only**: it does not yet create vet collection entries or apply payments to gym
receivables. Those accounting changes need their own reconciliation rules and
tests before being enabled. A pending or succeeded session reserves its source
to prevent another checkout for the same record.
For `saas_subscription`, a verified sandbox result marks the test order as
`sandbox_succeeded`. It does not activate the paid license or create an invoice:
the sandbox processes no real funds. Production activation needs a separate
live-provider flow and must close the current direct `PATCH /gym/saas` path.

API request signing and Checkout Form result verification follow the official
[iyzico HMAC](https://docs.iyzico.com/en/getting-started/preliminaries/authentication/hmacsha256-auth),
[Checkout Form](https://docs.iyzico.com/en/payment-methods/checkoutform/cf-implementation),
and [response signature](https://docs.iyzico.com/en/advanced/response-signature-validation)
documentation.

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

## Farm

`/api/v1/farm/*` serves the OdivonFARM client (replaces its direct Firestore access). A signed-in
Firebase user without a profile creates a farm tenant (14-day trial) with `POST /api/v1/farm/onboarding`;
`GET /api/v1/farm/me` returns the farm, the caller's farm role and the subscription. The farm's
collections are served generically under `/farm/data/{collection}` (list, get, create, batch, update,
soft delete, restore, permanent delete) and live in `tenants/{tenantId}/farm*`. Farm roles
(`admin|yonetici|veteriner|saha|muhasebe|okuyucu`) sit on the member card `farmMembers/{uid}`; the owner is
always `admin`, `okuyucu` is read-only, and only admins manage members (`/farm/members`), settings and the plan.
E-mails are queued in `tenants/{tenantId}/farmMailQueue` (`POST /farm/mail`).

## Gym

These endpoints run `FirebaseAuthGuard` → `TenantGuard` → `ModuleGuard`. Missing module → `403 FORBIDDEN_MODULE`.

## Spa

`/api/v1/spa/*` serves the OdivonSPA client (replaces its direct Firestore access). Register with
`module: 'spa'`, then call `GET /api/v1/spa/me` once: it seeds the default spa roles
(`roles/spa-admin|spa-reception|spa-therapist`), `spaSettings` and the owner's staff card. Staff
invited via `POST /spa/staff/invite` get `roleIds: ['spa-<role>']`, so permissions go through the
normal `PermissionGuard`. Data lives under `tenants/{tenantId}/spa*`; dates are ISO strings.
A signed-in Firebase user without a profile (client sign-up, Google) creates a spa tenant with
`POST /api/v1/spa/onboarding`. `npm run test:spa-e2e` runs the spa flows against the emulators.

## Firebase

- Project: [odivon-main-api-a2095](https://console.firebase.google.com/project/odivon-main-api-a2095/overview)
- Firestore location: `eur3` (Europe)
- Enable Email/Password under [Authentication → Sign-in method](https://console.firebase.google.com/project/odivon-main-api-a2095/authentication/providers) if client login is needed. Admin SDK user creation works from the API regardless.

## Platform Administration (`/api/v1/platform/*`)

Cross-tenant management API for Odivon platform administrators:
- Secured by `FirebaseAuthGuard` and `PlatformAdminGuard` (verifies `platformAdmins/{uid}` in Firestore).
- Endpoints operate across tenants without `TenantGuard`.
- Manage tenant lifetimes, demo accounts, manual payments, and view API error logs and audit trails.

### Grant / Revoke Platform Admin
```bash
# Grant access
node scripts/grant-platform-admin.mjs admin@odivon.com

# Revoke access
node scripts/grant-platform-admin.mjs admin@odivon.com --revoke
```

