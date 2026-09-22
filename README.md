# Live Translate Display

An iPad-first display for live Russian-to-German captions. Speak into the iPad microphone and show the translated German text to an audience in large, readable type. The app does not play translated audio.

[Русская документация](docs/README.ru.md) · [Live demo](https://egore4606.eu/LiveTranslate/)

> **Important:** The demo is a public deployment. For talks or other sensitive material, self-host the relay and use a restricted, dedicated Gemini API key.

## Features

- Russian speech input with German live translation via Gemini Live Translate.
- Large, centered captions designed for an iPad facing an audience.
- Rolling live-caption window: a long uninterrupted speech keeps the newest text visible instead of filling the page forever.
- No audio playback, analytics, cookies, or application database.
- Fullscreen and screen-wake-lock requests where the browser supports them.
- Small Node.js WebSocket relay that keeps the Gemini API key out of the browser URL and forwards it only in the upstream request header.

## How it works

```text
iPad microphone
      │ PCM audio over WSS
      ▼
Browser UI ── same-origin WSS ──► private relay ── x-goog-api-key ──► Gemini Live API
      ◄──────── German caption transcription stream ────────────────────────────────
```

The frontend is static. The relay accepts browser sessions, opens the Gemini Live API connection, and forwards messages in both directions. It does not persist API keys or audio.

## Use the demo

1. Open the demo in Safari on an iPad over HTTPS.
2. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey).
3. Paste the key into the page and choose **Начать перевод**.
4. Approve microphone access, then choose **Vollbild**.
5. Put the iPad screen toward the audience and speak Russian.
6. Choose **Stopp** when finished.

The page currently targets German (`de`) and uses `gemini-3.5-live-translate-preview`. Google API availability, quotas, model names, and pricing can change independently of this project.

## Self-hosting

### Requirements

- Node.js 20 or newer
- A Gemini API key with access to the Live API model
- An HTTPS static host for the frontend
- A private server-side process reachable only through a same-origin reverse-proxy WebSocket route

### Install and run the relay

```bash
npm ci
ALLOWED_ORIGIN=https://translate.example npm run start:proxy
```

The relay listens on `127.0.0.1:3015` by default. Set `HOST`, `PORT`, and `ALLOWED_ORIGIN` explicitly in production. Do not expose the Node port directly to the internet.

The browser expects its WebSocket route at `/LiveTranslate/ws`. Configure the HTTPS server to proxy that route to the relay's local `/ws` endpoint, and serve the repository's static files from `/LiveTranslate/` (or update the path in `src/lib.js` for a different mount point).

A systemd template is provided at [`deploy/live-translate-proxy.service.example`](deploy/live-translate-proxy.service.example). Replace its example user, paths, and origin before installing it. The template intentionally contains no machine-specific account or filesystem details.

### Frontend-only development

Serve the repository over HTTPS, because microphone access and secure WebSockets require a secure context. The frontend is not intended to connect directly to Gemini: normal browser WebSocket APIs cannot set the required `x-goog-api-key` header.

## Security and privacy

- API keys are entered at runtime and are not bundled into the source, URL, browser storage, or repository.
- The browser sends the key as the first message over the site's encrypted WebSocket connection. The relay uses it in memory for the current upstream Gemini handshake and does not log or persist it.
- Production origin checking is mandatory: the executable refuses to start without `ALLOWED_ORIGIN`.
- The relay binds to localhost by default and should remain behind an HTTPS reverse proxy.
- The relay has a per-message size limit and requires authentication as the first WebSocket message.
- Use a dedicated, restricted key and revoke it after a presentation if it was exposed to an audience or entered into a shared device.
- This repository contains a deployment template, not a copy of any production server configuration.

For responsible vulnerability reports, see [`SECURITY.md`](SECURITY.md). This is a small personal project, not a security-certified service.

## Development and tests

```bash
npm ci
npm test
node --check src/app.js
node --check src/lib.js
node --check src/proxy.js
npm audit --omit=dev
```

The test suite covers the setup schema, proxy authentication and relaying, PCM conversion, downsampling, Blob/text WebSocket decoding, long streaming captions, bounded caption state, and edge cases around completed turns. Browser UI behavior should still be checked on the target iPad and Safari version before a presentation.

## Limitations

- The relay is intentionally minimal and is not a multi-user service: add authentication, rate limiting, monitoring, and operational isolation before adapting it for a larger audience.
- Translation quality and latency depend on Gemini, microphone conditions, network connectivity, quotas, and the selected model.
- The app currently has one fixed source/target configuration: Russian input and German output.
- The API key is supplied by the person starting a session; this project does not provide a server-side key-management system.

## Contributing

Small, focused pull requests are welcome. Please read [`CONTRIBUTING.md`](CONTRIBUTING.md), run the local checks above, and do not include API keys, recordings, cookies, server paths, or personal information in commits or issue attachments.

## License

Released under the [MIT License](LICENSE).
