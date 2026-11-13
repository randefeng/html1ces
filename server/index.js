import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { Rooms, RoomError } from './rooms.js';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.wav': 'audio/wav',
};

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function serveHttp(request, response, dist) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  let pathname;
  try {
    pathname = decodeURIComponent((request.url ?? '/').split('?')[0]);
  } catch {
    response.writeHead(400).end();
    return;
  }
  if (pathname === '/health' && request.method === 'GET') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  if (!pathname.startsWith('/') || pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').includes('..')) {
    response.writeHead(403).end();
    return;
  }
  const root = await realpath(dist);
  const target = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!inside(root, target)) {
    response.writeHead(403).end();
    return;
  }
  const resolved = await realpath(target);
  if (!inside(root, resolved)) {
    response.writeHead(403).end();
    return;
  }
  const info = await stat(resolved);
  if (!info.isFile()) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    'Content-Type': MIME[path.extname(resolved)] ?? 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': 'no-cache',
  });
  if (request.method === 'HEAD') response.end();
  else createReadStream(resolved).on('error', () => response.destroy()).pipe(response);
}

export function createApplication({ dist = DIST, rooms = new Rooms() } = {}) {
  const server = http.createServer((request, response) => {
    serveHttp(request, response, dist).catch((error) => {
      if (response.headersSent) response.destroy();
      else response.writeHead(['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : 500).end();
    });
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048, perMessageDeflate: false });
  const clients = new Map();
  let stopping = false;

  function send(socket, message) {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 64 * 1024) {
      disconnect(socket);
      socket.terminate();
      return;
    }
    socket.send(JSON.stringify(message));
  }

  function broadcastRoom(room) {
    if (!room) return;
    const snapshot = rooms.snapshot(room);
    for (const [id, socket] of clients) {
      if (rooms.roomOf(id) === room) send(socket, snapshot);
    }
  }

  function broadcastRooms() {
    const message = { type: 'rooms', rooms: rooms.list() };
    for (const socket of clients.values()) send(socket, message);
  }

  function disconnect(socket) {
    if (!clients.delete(socket.playerId)) return;
    const oldRoom = rooms.leave(socket.playerId);
    if (!stopping && oldRoom) {
      broadcastRoom(oldRoom);
      broadcastRooms();
    }
  }

  function error(socket, code, message) {
    send(socket, { type: 'error', code, message });
  }

  server.on('upgrade', (request, socket, head) => {
    // Browser clients must use the same origin (including the Vite proxy host).
    // Native clients may omit Origin; no identity or user text is accepted.
    if (request.headers.origin !== undefined) {
      let allowed = false;
      try {
        const origin = new URL(request.headers.origin);
        const host = new URL(`http://${request.headers.host}`);
        allowed = ['http:', 'https:'].includes(origin.protocol)
          && origin.origin === request.headers.origin && origin.host === host.host;
      } catch { /* Malformed or opaque origins are denied. */ }
      if (!allowed) {
        socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        return;
      }
    }
    if (stopping || (request.url ?? '').split('?')[0] !== '/ws') {
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      return;
    }
    wss.handleUpgrade(request, socket, head, (client) => wss.emit('connection', client));
  });

  wss.on('connection', (socket) => {
    socket.playerId = randomUUID();
    socket.alive = true;
    const messages = [];
    clients.set(socket.playerId, socket);
    socket.on('pong', () => { socket.alive = true; });
    socket.on('close', () => disconnect(socket));
    socket.on('error', () => { disconnect(socket); socket.terminate(); });
    socket.on('message', (data, binary) => {
      const time = Date.now();
      while (messages.length && time - messages[0] >= 1000) messages.shift();
      if (messages.length >= 60) {
        error(socket, 'RATE_LIMIT', 'At most 60 messages per second.');
        return;
      }
      messages.push(time);
      let message;
      try {
        if (binary) throw new Error('Binary message');
        message = JSON.parse(data.toString());
        if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error('Invalid object');
      } catch {
        error(socket, 'INVALID_MESSAGE', 'Send a JSON protocol object.');
        return;
      }
      const fields = { join: ['type', 'room'], move: ['type', 'x', 'z', 'yaw'], action: ['type', 'action'], rooms: ['type'] };
      if (typeof message.type !== 'string' || !Object.hasOwn(fields, message.type) || Object.keys(message).some((key) => !fields[message.type].includes(key))) {
        error(socket, 'INVALID_MESSAGE', 'Unknown message type or fields.');
        return;
      }
      if (message.type === 'rooms') {
        send(socket, { type: 'rooms', rooms: rooms.list() });
        return;
      }
      if (message.type === 'join') {
        try {
          const previous = rooms.roomOf(socket.playerId);
          const welcome = rooms.join(socket.playerId, message.room);
          send(socket, welcome);
          if (previous !== welcome.room) broadcastRoom(previous);
          broadcastRoom(welcome.room);
          broadcastRooms();
        } catch (cause) {
          if (!(cause instanceof RoomError)) throw cause;
          error(socket, cause.code, cause.message);
        }
        return;
      }
      if (!rooms.roomOf(socket.playerId)) {
        error(socket, 'NOT_JOINED', 'Join a room first.');
        return;
      }
      if (message.type === 'move') rooms.move(socket.playerId, message);
      if (message.type === 'action' && !rooms.action(socket.playerId, message.action)) {
        error(socket, 'INVALID_ACTION', 'Choose idle, bow, fish, beads or incense.');
      }
    });
  });

  const snapshots = setInterval(() => {
    rooms.tick();
    for (const { id, count } of rooms.list()) if (count) broadcastRoom(id);
  }, 100);
  const heartbeat = setInterval(() => {
    for (const socket of clients.values()) {
      if (!socket.alive) {
        disconnect(socket);
        socket.terminate();
      } else {
        socket.alive = false;
        socket.ping();
      }
    }
  }, 30_000);
  snapshots.unref();
  heartbeat.unref();

  let closing;
  function close() {
    if (closing) return closing;
    stopping = true;
    clearInterval(snapshots);
    clearInterval(heartbeat);
    closing = new Promise((resolve) => {
      const deadline = setTimeout(() => {
        for (const socket of wss.clients) socket.terminate();
        server.closeAllConnections();
      }, 2000);
      deadline.unref();
      for (const socket of clients.values()) socket.close(1001, 'Server shutting down');
      clients.clear();
      rooms.clear();
      Promise.all([
        new Promise((done) => wss.close(done)),
        new Promise((done) => server.close(done)),
      ]).then(() => { clearTimeout(deadline); resolve(); });
      server.closeIdleConnections();
    });
    return closing;
  }
  return { server, wss, rooms, close };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const host = process.env.HOST ?? '0.0.0.0';
  const port = Number(process.env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer from 0 to 65535.');
  const app = createApplication();
  app.server.on('error', async (error) => {
    console.error(`Server error: ${error.code ?? 'UNKNOWN'}`);
    await app.close();
    process.exitCode = 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void app.close(); });
  app.server.listen(port, host, () => console.log(`Temple server listening on ${host}:${app.server.address().port}`));
}
