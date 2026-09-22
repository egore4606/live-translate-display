import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import WebSocket, { WebSocketServer } from 'ws';
import { startProxyServer, normalizeAllowedOrigin } from '../src/proxy.js';

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}

function nextMessage(socket) {
  return new Promise((resolve, reject) => {
    socket.once('message', (data) => resolve(JSON.parse(data.toString())));
    socket.once('error', reject);
  });
}

test('allowed origin must be a canonical HTTP(S) origin', () => {
  assert.equal(normalizeAllowedOrigin('https://translate.example'), 'https://translate.example');
  assert.throws(() => normalizeAllowedOrigin('https://translate.example/'));
  assert.throws(() => normalizeAllowedOrigin(' https://translate.example'));
  assert.throws(() => normalizeAllowedOrigin('https://translate.example/path'));
  assert.throws(() => normalizeAllowedOrigin('not-an-origin'));
});

test('proxy authenticates upstream by header and relays Live messages', async (t) => {
  let upstreamRequest;
  let upstreamPayload;
  const upstreamHttp = http.createServer();
  const upstreamWss = new WebSocketServer({ noServer: true });
  upstreamHttp.on('upgrade', (request, socket, head) => {
    upstreamRequest = request;
    upstreamWss.handleUpgrade(request, socket, head, (websocket) => {
      upstreamWss.emit('connection', websocket, request);
    });
  });
  upstreamWss.on('connection', (socket) => {
    socket.once('message', (data) => {
      upstreamPayload = data.toString();
      socket.send(JSON.stringify({ setupComplete: {} }));
    });
  });
  const upstreamPort = await listen(upstreamHttp);

  const proxy = await startProxyServer({
    host: '127.0.0.1',
    port: 0,
    upstreamUrl: `ws://127.0.0.1:${upstreamPort}/gemini`,
  });
  t.after(async () => {
    await proxy.close();
    upstreamWss.close();
    upstreamHttp.close();
  });

  const client = new WebSocket(`ws://127.0.0.1:${proxy.port}/ws`);
  await once(client, 'open');
  const ready = nextMessage(client);
  client.send(JSON.stringify({ authenticate: { apiKey: 'test-auth-key-long-enough-123' } }));

  assert.deepEqual(await ready, { proxyReady: true });
  const setupComplete = nextMessage(client);
  client.send(JSON.stringify({ setup: { model: 'models/test' } }));
  assert.deepEqual(await setupComplete, { setupComplete: {} });

  assert.equal(upstreamRequest.url, '/gemini');
  assert.equal(upstreamRequest.headers['x-goog-api-key'], 'test-auth-key-long-enough-123');
  assert.equal(upstreamPayload, JSON.stringify({ setup: { model: 'models/test' } }));
  client.close();
});

test('proxy rejects sessions whose first message is not authentication', async (t) => {
  const proxy = await startProxyServer({
    host: '127.0.0.1',
    port: 0,
    upstreamUrl: 'ws://127.0.0.1:9/gemini',
  });
  t.after(proxy.close);

  const client = new WebSocket(`ws://127.0.0.1:${proxy.port}/ws`);
  await once(client, 'open');
  const closed = once(client, 'close');
  client.send(JSON.stringify({ setup: {} }));
  const [code] = await closed;
  assert.equal(code, 1008);
});
