export const GEMINI_MODEL = 'gemini-3.5-live-translate-preview';

export function buildProxyWebSocketUrl(locationLike) {
  const websocketProtocol = locationLike.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${websocketProtocol}//${locationLike.host}/LiveTranslate/ws`;
}

export function buildProxyAuthentication(apiKey) {
  return { authenticate: { apiKey } };
}

export function buildTranslateSetup(targetLanguageCode = 'de') {
  return {
    setup: {
      model: `models/${GEMINI_MODEL}`,
      outputAudioTranscription: {},
      generationConfig: {
        responseModalities: ['AUDIO'],
        translationConfig: {
          targetLanguageCode,
          echoTargetLanguage: false,
        },
      },
    },
  };
}

export function extractGeminiError(message) {
  return typeof message?.error?.message === 'string' ? message.error.message : null;
}

export async function parseWebSocketData(data) {
  let text;
  if (typeof data === 'string') {
    text = data;
  } else if (typeof Blob !== 'undefined' && data instanceof Blob) {
    text = await data.text();
  } else if (data instanceof ArrayBuffer) {
    text = new TextDecoder().decode(data);
  } else if (ArrayBuffer.isView(data)) {
    text = new TextDecoder().decode(data);
  } else {
    throw new TypeError('Unsupported WebSocket message type');
  }
  return JSON.parse(text);
}

export function float32ToPcm16(samples) {
  const pcm = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    pcm[index] = Math.round(sample < 0 ? sample * 0x8000 : sample * 0x7fff);
  }
  return pcm;
}

export function downsampleTo16k(samples, inputSampleRate) {
  if (inputSampleRate === 16000) return samples;

  const ratio = inputSampleRate / 16000;
  const outputLength = Math.ceil(samples.length / ratio);
  const output = new Float32Array(outputLength);

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const start = Math.floor(outputIndex * ratio);
    const end = Math.min(samples.length, Math.floor((outputIndex + 1) * ratio));
    let sum = 0;
    for (let inputIndex = start; inputIndex < end; inputIndex += 1) {
      sum += samples[inputIndex];
    }
    output[outputIndex] = sum / Math.max(1, end - start);
  }
  return output;
}

export function nextCaptionState(state, chunk, turnComplete) {
  const draft = `${state.draft}${chunk || ''}`;
  if (!turnComplete || !draft.trim()) {
    return { history: state.history, draft };
  }

  return {
    history: [...state.history, draft.trim()].slice(-3),
    draft: '',
  };
}
