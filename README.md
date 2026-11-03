# Talgat AI 2.0 — staging

This branch contains a responsive chat frontend and a Netlify Functions Groq proxy.

## Netlify deployment (existing site `talgat-ai`)
- Connect repository `talgatmamanov6-pixel/Talgat-AI-NOVA` to the **existing** Netlify project (do not create a replacement site).
- Enable branch deploys for `talgat-ai-2-staging`.
- Publish directory: `web`.
- Functions directory: `netlify/functions`.
- Keep `GROQ_API_KEY` as a secret scoped to Functions in branch deploy and production. Never commit it.
- Optional `GROQ_MODEL` can override the default `llama-3.3-70b-versatile`; confirm availability with the provider.
- Deploy staging, then test it before changing production.

## API
- `GET /api/status` returns JSON with `ok`, `ai_configured`, `version`; it does **not** prove the provider responds.
- `POST /api/chat` accepts `{"message":"Привет","history":[]}` and returns `{"answer":"..."}` or a JSON error.
- If HTML is returned instead of JSON, check Netlify Functions deployment and routes. Do not add a wildcard SPA redirect ahead of API routes.
- All provider calls and API keys remain server-side.

## Tests
- `node --check web/app.js`
- `node --check netlify/functions/api.mjs`
- `node --test tests/api.test.mjs` (mocked provider, not live Groq)
- `/.github/workflows/staging-checks.yml` defines staging CI.
- Test staging on Android Chrome: chat, Markdown, LaTeX, error messages, history, speech synthesis and browser-dependent dictation.
- Check actual status and chat responses from the **staging URL** and verify upstream Groq response before production release.

## Current production finding (2026-11-03)
Netlify's published production deploy is a manual drop deploy from **2026-10-02** (no linked branch/commit). Its listed functions include `chat` at `/api/chat`, but **no `/api/status` function**. Netlify edge metrics reported a `404` for `/api/status` during the inspected 24-hour window. This is a concrete cause of status-check failures. A separate staging deployment is still required to verify and correct the live site.

## Android
This repository contains a web/PWA prototype, **not a built or tested APK**. The browser speech API may use a platform speech service; it is not an independent offline voice engine. Native Android permissions, wake-word, local model, phone integration, and signing require a separate Android build.

## Security
An API key was previously shared in chat. Rotate it in the Groq dashboard and replace the Netlify secret; do not expose the new value.
