# Contributing

Thanks for helping improve Live Translate Display.

## Before opening a pull request

1. Read the README and understand the browser-to-relay architecture.
2. Create a focused branch from `main`.
3. Do not commit API keys, cookies, audio recordings, server paths, personal
   data, or production configuration.
4. Add or update tests for behavior changes.
5. Run:

```bash
npm ci
npm test
node --check src/app.js
node --check src/lib.js
node --check src/proxy.js
npm audit --omit=dev
```

## Pull requests

Describe the user-visible change, the reason for it, and the checks you ran.
For UI changes, include a screenshot or explain which browser/device was
checked. Keep generated dependencies out of commits; `node_modules/` is ignored.

Do not add external analytics, paid services, or server-side key storage without
maintainer approval. Changes to the relay must preserve origin checking,
localhost binding, bounded message sizes, and the no-persistence security model.
