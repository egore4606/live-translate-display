# Live Übersetzung

A minimal iPad-first caption display for a Russian presentation. It streams the iPad microphone directly to Gemini Live Translate and renders the German transcript in very large text. No translated audio is played.

Live page: <https://egore4606.eu/LiveTranslate/>

## Use

1. Open the page in Safari on the iPad over HTTPS.
2. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey).
3. Paste the key, tap **Начать перевод**, and approve the microphone prompt.
4. Tap **Vollbild**. Put the iPad screen toward the audience.
5. Tap **Stopp** when finished.

The page uses `gemini-3.5-live-translate-preview`, Russian audio input, target language `de`, and Gemini's `outputAudioTranscription` stream.

## Security model

- The site is static: it has no backend, database, analytics, or cookies.
- The API key is never embedded in source, sent to `egore4606.eu`, written to `localStorage`, or placed in a URL on this site.
- The browser opens its WebSocket directly to `generativelanguage.googleapis.com`; Google receives the key and microphone stream.
- Browser reload stops the session and clears the page state. Use a dedicated key and apply Google API-key restrictions where available.
- Response headers disable caching and restrict browser connections to the Gemini WebSocket endpoint.

## Local verification

```bash
npm test
node --check src/app.js
```

The unit tests cover Gemini session setup, PCM conversion, downsampling, and incremental caption state. A live Gemini session requires a real user API key and microphone permission, so it is intentionally not automated.
