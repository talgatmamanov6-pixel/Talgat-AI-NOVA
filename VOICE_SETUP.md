# Talgat Studio voice providers

The Jarvis reference project uses Fish Audio for speech synthesis:
https://github.com/ethanplusai/jarvis

This project implements the documented Fish API independently. No Jarvis application source or private voice samples are bundled. Using the same provider does not guarantee the same speaker, voice quality or latency.

## Fish Audio

Set server-side Netlify variables with Functions scope for production and branch deploys:

- `FISH_API_KEY`: secret API key for your Fish Audio account.
- `FISH_VOICE_ID`: the ID of a voice you are permitted to use; select it in Fish Audio's voice library.
- `FISH_MODEL` (optional): defaults to `s2.1-pro`. Provider usage is governed by your Fish Audio account's plan and limits. Unknown model values are rejected rather than silently falling back.

Redeploy, open settings and select **Fish Audio · движок Jarvis**. The option is disabled until both required server variables are present. `/api/speech` reports presence only; it never returns key or voice-ID values. A present key is not proof that the provider will accept it.

Official API: https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech

## OpenAI Cedar

The separate OpenAI speech adapter requires the server secret `TALGAT_TTS_API_KEY`. This is an API integration, not an extracted or downloadable ChatGPT voice engine. OpenAI Realtime/WebRTC is a distinct integration and is not implemented in this release.

## Reaction and interruptions

Cloud speech starts with a short first sentence, prefetches at most one following chunk, and cancels both pending work and audio playback on Stop. There is no silent substitution of the selected cloud voice with a device voice. The device voice remains explicitly selectable.

## Validation limits

Provider adapters and lifecycle tests use mocked upstream responses. Without a configured provider account, live Fish/Cedar timbre, billing access and end-to-end latency cannot be verified. Physical Android microphone behavior requires device testing.
