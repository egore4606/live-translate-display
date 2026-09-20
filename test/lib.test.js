import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProxyAuthentication,
  buildProxyWebSocketUrl,
  buildTranslateSetup,
  downsampleTo16k,
  extractGeminiError,
  float32ToPcm16,
  nextCaptionState,
  parseWebSocketData,
} from '../src/lib.js';

test('buildProxyWebSocketUrl keeps credentials out of the URL', () => {
  assert.equal(
    buildProxyWebSocketUrl({ protocol: 'https:', host: 'egore4606.eu' }),
    'wss://egore4606.eu/LiveTranslate/ws',
  );
  assert.deepEqual(buildProxyAuthentication('secret-key'), {
    authenticate: { apiKey: 'secret-key' },
  });
});

test('parseWebSocketData handles both text and browser Blob messages', async () => {
  assert.deepEqual(await parseWebSocketData('{"proxyReady":true}'), { proxyReady: true });
  assert.deepEqual(await parseWebSocketData(new Blob(['{"setupComplete":{}}'])), {
    setupComplete: {},
  });
});

test('buildTranslateSetup uses the current raw-WebSocket setup schema', () => {
  assert.deepEqual(buildTranslateSetup('de'), {
    setup: {
      model: 'models/gemini-3.5-live-translate-preview',
      outputAudioTranscription: {},
      generationConfig: {
        responseModalities: ['AUDIO'],
        translationConfig: {
          targetLanguageCode: 'de',
          echoTargetLanguage: false,
        },
      },
    },
  });
});

test('extractGeminiError returns the server error message only', () => {
  assert.equal(extractGeminiError({ error: { message: 'API key not valid' } }), 'API key not valid');
  assert.equal(extractGeminiError({ serverContent: {} }), null);
});

test('float32ToPcm16 clamps samples and writes little-endian PCM', () => {
  const pcm = float32ToPcm16(new Float32Array([-2, -1, -0.5, 0, 0.5, 1, 2]));
  assert.deepEqual([...pcm], [-32768, -32768, -16384, 0, 16384, 32767, 32767]);
});

test('downsampleTo16k averages each source-rate window', () => {
  const input = new Float32Array([0, 0.2, 0.4, 0.6, 0.8, 1, -1, -0.8]);
  const output = downsampleTo16k(input, 48000);
  assert.deepEqual(Array.from(output, (value) => Number(value.toFixed(1))), [0.2, 0.8, -0.9]);
});

test('nextCaptionState accumulates partial text and commits it on turn completion', () => {
  let state = { history: [], draft: '' };
  state = nextCaptionState(state, 'Guten ', false);
  state = nextCaptionState(state, 'Tag!', false);
  assert.deepEqual(state, { history: [], draft: 'Guten Tag!' });

  state = nextCaptionState(state, '', true);
  assert.deepEqual(state, { history: ['Guten Tag!'], draft: '' });
});

test('nextCaptionState keeps only the latest three finalized captions', () => {
  let state = { history: ['eins', 'zwei', 'drei'], draft: '' };
  state = nextCaptionState(state, 'vier', true);
  assert.deepEqual(state, { history: ['zwei', 'drei', 'vier'], draft: '' });
});
