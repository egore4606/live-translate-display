import {
  buildTranslateSetup,
  downsampleTo16k,
  float32ToPcm16,
  nextCaptionState,
} from './lib.js';

const apiKeyInput = document.querySelector('#apiKey');
const startButton = document.querySelector('#startButton');
const stopButton = document.querySelector('#stopButton');
const fullscreenButton = document.querySelector('#fullscreenButton');
const toggleKeyButton = document.querySelector('#toggleKey');
const setupPanel = document.querySelector('#setupPanel');
const captionScreen = document.querySelector('#captionScreen');
const captionList = document.querySelector('#captionList');
const emptyCaption = document.querySelector('#emptyCaption');
const connectionStatus = document.querySelector('#connectionStatus');
const errorMessage = document.querySelector('#errorMessage');

const state = {
  audioContext: null,
  microphoneStream: null,
  processor: null,
  socket: null,
  wakeLock: null,
  captions: { history: [], draft: '' },
  stoppedByUser: false,
};

function setStatus(text) {
  connectionStatus.textContent = text;
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
}

function clearError() {
  errorMessage.textContent = '';
  errorMessage.hidden = true;
}

function setRunning(running) {
  setupPanel.hidden = running;
  captionScreen.classList.toggle('running', running);
  stopButton.hidden = !running;
  startButton.disabled = running;
}

function renderCaptions() {
  const lines = state.captions.draft
    ? [...state.captions.history, state.captions.draft]
    : state.captions.history;

  captionList.replaceChildren();
  if (lines.length === 0) {
    emptyCaption.hidden = false;
    captionList.hidden = true;
    return;
  }

  emptyCaption.hidden = true;
  captionList.hidden = false;
  lines.forEach((line, index) => {
    const paragraph = document.createElement('p');
    paragraph.className = `caption ${index === lines.length - 1 && state.captions.draft ? 'draft' : 'history'}`;
    paragraph.textContent = line;
    captionList.append(paragraph);
  });
}

function pcmBase64(samples) {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function translateWebSocketUrl(apiKey) {
  return `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(apiKey)}`;
}

async function requestDisplayMode() {
  try {
    if (!document.fullscreenElement && captionScreen.requestFullscreen) {
      await captionScreen.requestFullscreen();
    }
  } catch {
    // iPad Safari may keep the page in browser chrome; the app remains usable.
  }
}

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    state.wakeLock = await navigator.wakeLock.request('screen');
  } catch {
    // The user can still keep the screen awake with iPad Auto-Lock settings.
  }
}

function releaseWakeLock() {
  state.wakeLock?.release().catch(() => {});
  state.wakeLock = null;
}

function handleGeminiMessage(event) {
  let message;
  try {
    message = JSON.parse(event.data);
  } catch {
    return;
  }

  const content = message.serverContent;
  if (!content) return;

  if (content.outputTranscription?.text) {
    state.captions = nextCaptionState(state.captions, content.outputTranscription.text, Boolean(content.turnComplete));
    renderCaptions();
  } else if (content.turnComplete) {
    state.captions = nextCaptionState(state.captions, '', true);
    renderCaptions();
  }
}

async function startMicrophone() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });

  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);

  processor.onaudioprocess = (audioEvent) => {
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
    const input = audioEvent.inputBuffer.getChannelData(0);
    const downsampled = downsampleTo16k(input, audioContext.sampleRate);
    const pcm = float32ToPcm16(downsampled);
    state.socket.send(JSON.stringify({
      realtimeInput: {
        audio: {
          mimeType: 'audio/pcm;rate=16000',
          data: pcmBase64(pcm),
        },
      },
    }));
  };

  source.connect(processor);
  processor.connect(audioContext.destination);
  await audioContext.resume();

  state.microphoneStream = stream;
  state.audioContext = audioContext;
  state.processor = processor;
}

function cleanupMedia() {
  state.processor?.disconnect();
  state.processor = null;
  state.microphoneStream?.getTracks().forEach((track) => track.stop());
  state.microphoneStream = null;
  state.audioContext?.close().catch(() => {});
  state.audioContext = null;
  releaseWakeLock();
}

function stopTranslation({ unexpected = false } = {}) {
  state.stoppedByUser = !unexpected;
  cleanupMedia();
  if (state.socket && state.socket.readyState < WebSocket.CLOSING) {
    state.socket.close();
  }
  state.socket = null;
  setRunning(false);
  setStatus('Bereit');
  if (unexpected) {
    showError('Соединение с Gemini было закрыто. Проверь ключ, доступ к модели и интернет, затем попробуй ещё раз.');
  }
}

async function startTranslation() {
  clearError();
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    showError('Вставь Gemini API key.');
    apiKeyInput.focus();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.WebSocket) {
    showError('Этот браузер не поддерживает микрофон или WebSocket. Открой страницу в Safari на iPad.');
    return;
  }

  state.stoppedByUser = false;
  state.captions = { history: [], draft: '' };
  renderCaptions();
  setRunning(true);
  setStatus('Verbinde…');
  requestDisplayMode();
  requestWakeLock();

  try {
    const socket = new WebSocket(translateWebSocketUrl(apiKey));
    state.socket = socket;

    socket.addEventListener('open', async () => {
      if (state.socket !== socket) return;
      socket.send(JSON.stringify(buildTranslateSetup('de')));
      try {
        await startMicrophone();
        if (state.socket !== socket) {
          cleanupMedia();
          return;
        }
        setStatus('Übersetzung läuft');
      } catch (error) {
        showError(`Микрофон не запущен: ${error.message || 'разреши доступ в Safari.'}`);
        stopTranslation();
      }
    });

    socket.addEventListener('message', handleGeminiMessage);
    socket.addEventListener('error', () => {
      if (state.socket === socket) setStatus('Verbindungsfehler');
    });
    socket.addEventListener('close', () => {
      if (state.socket !== socket) return;
      state.socket = null;
      if (!state.stoppedByUser) stopTranslation({ unexpected: true });
    });
  } catch (error) {
    stopTranslation();
    showError(`Не удалось открыть соединение: ${error.message || 'неизвестная ошибка.'}`);
  }
}

startButton.addEventListener('click', startTranslation);
stopButton.addEventListener('click', () => stopTranslation());
fullscreenButton.addEventListener('click', requestDisplayMode);
toggleKeyButton.addEventListener('click', () => {
  const visible = apiKeyInput.type === 'text';
  apiKeyInput.type = visible ? 'password' : 'text';
  toggleKeyButton.textContent = visible ? 'Показать' : 'Скрыть';
});
document.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'f' && !event.metaKey && !event.ctrlKey && !event.altKey) {
    requestDisplayMode();
  }
});
window.addEventListener('beforeunload', () => stopTranslation());

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && captionScreen.classList.contains('running')) requestWakeLock();
});
