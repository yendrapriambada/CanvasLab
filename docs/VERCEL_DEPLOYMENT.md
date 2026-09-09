# Vercel deployment

**Live:** https://khalifah-board.vercel.app

Verified on 9 September 2026: production build READY, health 200, three browser
scenarios (including two-user collaboration, persistence, comments, images and
exports) and five direct WebSocket security checks passed against the live URL.
Local lint, typecheck, production build and 56 unit tests also passed.
See [recorded deployment evidence](../artifacts/vercel-deployment.json).

The user configured the secret directly in the Production environment. It remains
hidden in Vercel; no secret was downloaded or copied into source. Preview needs
its own environment selection before future preview deployments can use realtime.

The `khalifah-board` project is linked to the local checkout. Vercel serves Vite's
static output and `api/server.ts` handles `/api`, `/sync` and `/health` using the
Node 24 runtime, Fluid compute and the Singapore region (`sin1`).

## Required environment

Set the following in the project's **Settings → Environment Variables**, for
both **Preview** and **Production**:

- `CANVASLAB_REALTIME_KEY`: a server-only Supabase secret key for
  **Khalifah Internal Tools**. A legacy `service_role` key is also accepted by the
  SDK where that key type remains enabled. Never use an `anon`/publishable key.
- `CANVASLAB_REALTIME_URL`: defaults to `https://txsyyhcrtasrqodtvpvn.supabase.co`.
- `CANVASLAB_API_URL`: defaults to the existing `canvaslab-api` Edge Function.

[Vercel environment settings](https://vercel.com/yendrapriambada1234-9798s-projects/khalifah-board/settings/environment-variables)
· [Supabase API keys](https://supabase.com/dashboard/project/txsyyhcrtasrqodtvpvn/settings/api-keys)

If the Supabase account cannot view secret keys, ask the project owner to add the
value directly in Vercel. It need not be pasted into a chat or committed to a file.
The local Supabase CLI returned 403 when attempting key discovery in this session.

## Realtime architecture

Vercel connections can land on different instances. Gateways communicate through
private Supabase Broadcast channels whose names are derived with HMAC from the
server key and board ID. Browser users connect only to the application gateway;
they never receive the key or broker topic. Existing session, board-role, origin,
author and voting checks remain in place. No new database tables or public grants
are introduced; the 19 application tables remain in `"Khalifah Board"`.

A scene write commits to PostgreSQL before acknowledgement. The broker sends a
small invalidation notice; each receiving gateway reloads canonical document data
using an authorized user's session. Presence messages contain server-validated
identities. The gateway reloads persisted state after broker reconnection and
closes affected browser connections on broker failure so they reconnect cleanly.
Without the relay key, Vercel reports an incomplete configuration and refuses
editor WebSocket sessions. Local single-server development can run without it.

WebSockets are supported by [Vercel Functions](https://vercel.com/docs/functions/websockets)
but end when the function reaches its duration limit (configured here to 300 s).
The browser reconnects and reconciles Yjs state. This does not establish a
multi-region or large-user-count performance guarantee.

## Deploy and verify

```sh
npm ci
npm run lint
npm test
npm run build
npx vercel deploy --yes
# After preview checks pass and the server secret is configured:
npx vercel deploy --prod --yes
```

Verify `/health`, login, board creation, two-user document changes and cursors,
offline/reconnect, sharing/revocation, and reopening a saved board. A successful
static build alone does not verify the realtime backend. Keep Fluid compute
turned on in project settings. Production cookies are Secure and HttpOnly.

Vercel's Function request-body limit also applies to JSON image uploads and
editable imports. Large payloads may receive 413 before reaching the gateway;
the client displays an explicit size error. The local 8 MB raster limit does not
imply that an 8 MB upload will fit through Vercel.

Secrets, `.env.local`, QA artifacts and source archives are excluded from uploads
by `.vercelignore`. Never add `VITE_` to a server credential's name.
