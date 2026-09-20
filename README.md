# Live Übersetzung

A minimal iPad-first caption display for a Russian presentation. It streams the iPad microphone through a private relay to Gemini Live Translate and renders the German transcript in very large text. No translated audio is played.

Live page: <https://egore4606.eu/LiveTranslate/>

## Use

1. Open the page in Safari on the iPad over HTTPS.
2. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey).
3. Paste the key, tap **Начать перевод**, and approve the microphone prompt.
4. Tap **Vollbild**. Put the iPad screen toward the audience.
5. Tap **Stopp** when finished.

The page uses `gemini-3.5-live-translate-preview`, Russian audio input, target language `de`, and Gemini's `outputAudioTranscription` stream.

## Security model

- The public page has no database, analytics, or cookies.
- The browser sends the API key as the first message inside the site's encrypted WebSocket connection. It is not embedded in source, written to storage, or placed in any URL.
- A localhost-only relay forwards the key to Gemini in the required `x-goog-api-key` header and keeps no key or audio logs.
- Nginx exposes only the relay's WebSocket path through the existing HTTPS virtual host; the Node listener stays on `127.0.0.1`.
- Browser reload stops the session and clears the page state. Use a dedicated key and apply Google API-key restrictions where available.
- Response headers disable caching and restrict browser connections to the same origin.

## Local verification

```bash
npm test
node --check src/app.js
node --check src/proxy.js
```

The tests cover the proxy authentication header, message relay, Gemini setup schema, PCM conversion, downsampling, and incremental caption state. The deployed integration was also checked against a real Gemini auth key and Russian speech fixture without persisting the key.
