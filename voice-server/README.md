# Talgat AI voice server

This worker synthesizes Russian speech with Qwen3-TTS 0.6B Base from a single
reference. Use one process so the model and reference stay in memory.

1. Deploy this directory as a Docker web service with the health check
   `/health`. Provision enough RAM for the model and benchmark inference on
   the chosen instance. Free sleeping instances are unsuitable for live chat.
2. Mount a private reference WAV. Set `VOICE_REFERENCE_FILE` to its absolute
   path and `QWEN_VOICE_TOKEN` to a strong, random secret. Never commit them.
3. On Netlify, set `QWEN_VOICE_URL` to the HTTPS origin and set the same
   `QWEN_VOICE_TOKEN` for Functions in the staging deploy context. Redeploy.
4. Test `/api/speech` on staging with
   `{"provider":"qwen","language":"ru","text":"Талгат, система готова."}`.
   It should return a playable WAV. Then select the reference voice in the
   UI and check a live response on a phone.

The worker permits one generation at a time and returns 429 when busy.
Keep the worker token server-side. The current browser sends text in chunks
of up to 120 characters. Verify response times before enabling production.
