import http from 'node:http';
import { pathToFileURL } from 'node:url';
import WebSocket, { WebSocketServer } from 'ws';

const DEFAULT_UPSTREAM =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const MAX_MESSAGE_BYTES = 2 * 1024 * 1024;

function sendJson(socket, value) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(value));
  }
}

export async function startProxyServer({
  host = '127.0.0.1',
  port = 3015,
  upstreamUrl = DEFAULT_UPSTREAM,
  allowedOrigin = null,
} = {}) {
  const server = http.createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('Not found');
  });

  const websocketServer = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  const clients = new Set();

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname;
    if (pathname !== '/ws' || (allowedOrigin && request.headers.origin !== allowedOrigin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    websocketServer.handleUpgrade(request, socket, head, (client) => {
      websocketServer.emit('connection', client, request);
    });
  });

  websocketServer.on('connection', (client) => {
    clients.add(client);
    let upstream = null;
    let authenticated = false;
    let upstreamReady = false;
    const pending = [];

    const authenticationTimer = setTimeout(() => {
      if (!authenticated) client.close(1008, 'Authentication message required');
    }, 10_000);

    client.on('message', (data, isBinary) => {
      if (!authenticated) {
        let message;
        try {
          message = JSON.parse(data.toString());
        } catch {
          client.close(1008, 'Invalid authentication message');
          return;
        }

        const apiKey = message?.authenticate?.apiKey;
        if (typeof apiKey !== 'string' || apiKey.length < 20 || apiKey.length > 512) {
          client.close(1008, 'Invalid authentication message');
          return;
        }

        authenticated = true;
        clearTimeout(authenticationTimer);
        upstream = new WebSocket(upstreamUrl, {
          headers: { 'x-goog-api-key': apiKey },
          maxPayload: MAX_MESSAGE_BYTES,
        });

        upstream.on('open', () => {
          upstreamReady = true;
          sendJson(client, { proxyReady: true });
          for (const queued of pending.splice(0)) {
            upstream.send(queued.data, { binary: queued.isBinary });
          }
        });

        upstream.on('message', (payload, upstreamIsBinary) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(payload, { binary: upstreamIsBinary });
          }
        });

        upstream.on('error', (error) => {
          sendJson(client, { proxyError: { message: error.message || 'Upstream connection failed' } });
        });

        upstream.on('close', (code, reason) => {
          const detail = reason.toString().slice(0, 1200);
          if (code !== 1000) {
            sendJson(client, {
              proxyError: {
                message: detail || `Gemini connection closed (code ${code})`,
              },
            });
          }
          if (client.readyState === WebSocket.OPEN) {
            client.close(code === 1000 ? 1000 : 1011, code === 1000 ? 'Session ended' : 'Gemini unavailable');
          }
        });
        return;
      }

      if (!upstreamReady) {
        if (pending.length >= 20) {
          client.close(1009, 'Too many queued messages');
          return;
        }
        pending.push({ data, isBinary });
        return;
      }

      if (upstream?.readyState === WebSocket.OPEN) {
        upstream.send(data, { binary: isBinary });
      }
    });

    client.on('close', () => {
      clearTimeout(authenticationTimer);
      clients.delete(client);
      if (upstream && upstream.readyState < WebSocket.CLOSING) upstream.close();
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  const address = server.address();
  return {
    host,
    port: typeof address === 'object' && address ? address.port : port,
    close: async () => {
      for (const client of clients) client.close(1001, 'Server shutdown');
      await new Promise((resolve) => websocketServer.close(resolve));
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const proxy = await startProxyServer({
    host: process.env.HOST || '127.0.0.1',
    port: Number(process.env.PORT || 3015),
    allowedOrigin: process.env.ALLOWED_ORIGIN || 'https://egore4606.eu',
  });
  console.log(`Live Translate proxy listening on ${proxy.host}:${proxy.port}`);
}
