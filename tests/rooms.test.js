import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { Rooms, RoomError, ROOM_IDS, CAPACITY, ACTION_DURATIONS } from '../server/rooms.js';
import { createApplication } from '../server/index.js';
import { canStandAt, moveOnGround } from '../src/movement.js';

function fixture() {
  let time = 100_000;
  return { rooms: new Rooms({ now: () => time }), advance: (ms) => { time += ms; } };
}

function expectRoomError(operation, code) {
  assert.throws(operation, (error) => error instanceof RoomError && error.code === code);
}

function player(rooms, id) {
  return rooms.snapshot(rooms.roomOf(id)).players.find((entry) => entry.id === id);
}

test('join returns the exact welcome shape and bounded deterministic spawn', () => {
  const { rooms } = fixture();
  const welcome = rooms.join('one');
  assert.equal(welcome.type, 'welcome');
  assert.equal(welcome.id, 'one');
  assert.equal(welcome.room, 'quiet-1');
  assert.equal(welcome.capacity, 12);
  assert.deepEqual(Object.keys(welcome.players[0]), ['id', 'x', 'z', 'yaw', 'action', 'actionAt']);
  assert.equal(welcome.players[0].action, 'idle');
  assert.equal(welcome.players[0].actionAt, 100_000);
  for (let i = 0; i < 100; i++) {
    const separate = new Rooms();
    const initial = separate.join(`player-${i}`).players[0];
    assert.ok(initial.x >= -1.5 && initial.x <= 1.5);
    assert.ok(initial.z >= 4.5 && initial.z <= 6);
    assert.ok(canStandAt(initial.x, initial.z));
    assert.equal(initial.yaw, Math.PI);
  }
  assert.deepEqual(rooms.join('one'), welcome);
  welcome.players[0].x = 999;
  assert.notEqual(player(rooms, 'one').x, 999);
});

test('default join fills eight rooms in order and rejects global capacity overflow', () => {
  const { rooms } = fixture();
  for (let i = 0; i < ROOM_IDS.length * CAPACITY; i++) {
    assert.equal(rooms.join(`p-${i}`).room, ROOM_IDS[Math.floor(i / CAPACITY)]);
  }
  expectRoomError(() => rooms.join('overflow'), 'ROOM_FULL');
  assert.equal(rooms.members.size, 96);
  assert.equal(rooms.join('p-0', 'quiet-1').room, 'quiet-1');
});

test('full or invalid room switching is atomic and preserves the original state', () => {
  const { rooms } = fixture();
  rooms.join('moving', 'quiet-1');
  rooms.action('moving', 'beads');
  for (let i = 0; i < CAPACITY; i++) rooms.join(`resident-${i}`, 'quiet-2');
  const before = rooms.snapshot('quiet-1');
  expectRoomError(() => rooms.join('moving', 'quiet-2'), 'ROOM_FULL');
  for (const invalid of [null, '', 'quiet-9', 1, {}, ['quiet-1'], '__proto__']) {
    expectRoomError(() => rooms.join('moving', invalid), 'INVALID_ROOM');
  }
  assert.equal(rooms.roomOf('moving'), 'quiet-1');
  assert.deepEqual(rooms.snapshot('quiet-1'), before);
  assert.equal(rooms.join('moving', 'quiet-3').room, 'quiet-3');
  assert.equal(rooms.snapshot('quiet-1').players.length, 0);
  assert.equal(player(rooms, 'moving').action, 'idle');
});

test('leave is idempotent, releases capacity and clear removes all players', () => {
  const { rooms } = fixture();
  rooms.join('one');
  assert.equal(rooms.leave('one'), 'quiet-1');
  assert.equal(rooms.leave('one'), undefined);
  assert.equal(rooms.roomOf('one'), undefined);
  assert.equal(rooms.move('one', { x: 0, z: 5, yaw: 0 }), false);
  assert.equal(rooms.action('one', 'bow'), false);
  rooms.join('two', 'quiet-8');
  rooms.clear();
  assert.equal(rooms.members.size, 0);
  assert.ok(rooms.list().every((room) => room.count === 0 && room.capacity === 12));
});

test('movement rejects non-finite, non-numeric, missing and out-of-bounds coordinates without mutation', () => {
  const { rooms, advance } = fixture();
  rooms.join('one');
  advance(10_000);
  const before = player(rooms, 'one');
  for (const field of ['x', 'z', 'yaw']) {
    for (const value of [NaN, Infinity, -Infinity, '0', null, undefined, {}, []]) {
      assert.equal(rooms.move('one', { ...before, [field]: value }), false);
    }
  }
  const blocked = [[8.31, 0], [0, -8.31], [7, 7], [2.6, -2], [-0.5, -4.1],
    [1, -0.62], [-0.5, -3.2], [-0.45, 3], [4.2, 5.55], [-4.7, 4.7], [-5.65, 1.3]];
  for (const [x, z] of blocked) {
    assert.equal(canStandAt(x, z), false);
    assert.equal(rooms.move('one', { x, z, yaw: 0 }), false);
  }
  assert.equal(rooms.move('one', null), false);
  assert.deepEqual(player(rooms, 'one'), before);
});

test('movement starts with 0.4 budget, refills at 4.5/sec and wraps yaw', () => {
  const { rooms, advance } = fixture();
  rooms.join('one');
  const initial = player(rooms, 'one');
  assert.equal(rooms.move('one', { ...initial, x: initial.x + 0.41 }), false);
  assert.equal(rooms.move('one', { ...initial, x: initial.x + 0.39, yaw: 7 * Math.PI }), true);
  const moved = player(rooms, 'one');
  assert.ok(Math.abs(moved.yaw + Math.PI) < 1e-10);
  assert.equal(rooms.move('one', initial), false);
  advance(100);
  assert.equal(rooms.move('one', { ...initial, yaw: -100 * Math.PI - 0.5 }), true);
  assert.ok(Math.abs(player(rooms, 'one').yaw + 0.5) < 1e-10);
});

test('repeated 0.3 moves cannot mint per-message tolerance, even with repeated join or idle', () => {
  const { rooms, advance } = fixture();
  rooms.join('one');
  const initial = player(rooms, 'one');
  const offset = { ...initial, x: initial.x + 0.3 };
  assert.equal(rooms.move('one', offset), true);
  for (let i = 0; i < 100; i++) {
    rooms.join('one', 'quiet-1');
    rooms.action('one', 'idle');
    assert.equal(rooms.move('one', player(rooms, 'one')), true);
    assert.equal(rooms.move('one', initial), false);
  }
  let distance = 0.3;
  let atOffset = true;
  for (let i = 1; i <= 150; i++) {
    advance(1000 / 15);
    const target = atOffset ? initial : offset;
    if (rooms.move('one', target)) { distance += 0.3; atOffset = !atOffset; }
    assert.ok(distance <= 0.4 + i * (4.5 / 15) + 1e-8);
  }
});

test('idle accumulation is capped at 6.75 units and jitter bursts spend the accumulated budget', () => {
  const { rooms, advance } = fixture();
  rooms.join('one');
  const initial = player(rooms, 'one');
  const offset = { ...initial, x: initial.x + 0.3 };
  advance(60_000);
  for (let i = 0; i < 22; i++) assert.equal(rooms.move('one', i % 2 === 0 ? offset : initial), true);
  assert.equal(rooms.move('one', offset), false);
  advance(100);
  assert.equal(rooms.move('one', offset), true);
  assert.equal(rooms.move('one', initial), true);
  assert.equal(rooms.move('one', offset), false);
});

test('invalid movement preserves budget and its clock, including rejected speed updates', () => {
  const { rooms, advance } = fixture();
  rooms.join('one');
  const initial = player(rooms, 'one');
  const member = rooms.members.get('one');
  const before = { ...member, player: { ...member.player } };
  advance(100);
  for (const update of [{ x: 100, z: 0, yaw: 0 }, { x: -0.45, z: 3, yaw: 0 },
    { ...initial, x: NaN }, { ...initial, x: initial.x + 1 }]) {
    assert.equal(rooms.move('one', update), false);
    assert.deepEqual(member, before);
  }
  assert.equal(rooms.move('one', { ...initial, x: initial.x + 0.8 }), true);
  assert.ok(Math.abs(member.moveBudget - 0.05) < 1e-10);
  advance(-50);
  assert.equal(rooms.move('one', player(rooms, 'one')), true);
  advance(50);
  assert.equal(rooms.move('one', { ...initial, x: initial.x + 0.9 }), false);
});

test('shared walkable positions outside the old rectangle are accepted', () => {
  const { rooms, advance } = fixture();
  rooms.join('one');
  for (const [x, z] of [[0, 1], [0, -5], [0, -7], [0, -2], [5, 0], [8, 0], [0, 0]]) {
    advance(2000);
    assert.ok(canStandAt(x, z));
    // The return from x=8 to the origin exceeds one capped budget: use a waypoint.
    if (x === 0 && z === 0) {
      assert.equal(rooms.move('one', { x: 4, z: 0, yaw: 0 }), true);
      advance(2000);
    }
    assert.equal(rooms.move('one', { x, z, yaw: 0 }), true);
  }
});

test('client moveOnGround walking is accepted and an early origin teleport is rejected', () => {
  const { rooms, advance } = fixture();
  rooms.join('one');
  const initial = player(rooms, 'one');
  assert.equal(rooms.move('one', { x: 0, z: 0, yaw: 0 }), false);
  assert.deepEqual(player(rooms, 'one'), initial);
  let position = initial;
  for (let i = 0; i < 100; i++) {
    advance(1000 / 15);
    position = moveOnGround(position, 0, -2.7 / 15);
    assert.equal(rooms.move('one', { ...position, yaw: Math.PI }), true);
    assert.ok(canStandAt(position.x, position.z));
  }
});

test('only whitelisted actions are accepted, use server timestamps and expire at their own duration', () => {
  for (const [action, duration] of Object.entries(ACTION_DURATIONS)) {
    const { rooms, advance } = fixture();
    rooms.join('one');
    advance(100);
    assert.equal(rooms.action('one', action), true);
    assert.equal(player(rooms, 'one').actionAt, 100_100);
    if (!duration) continue;
    advance(duration - 1);
    assert.equal(player(rooms, 'one').action, action);
    advance(1);
    assert.equal(player(rooms, 'one').action, 'idle');
    assert.equal(player(rooms, 'one').actionAt, 100_100 + duration);
  }
  const { rooms } = fixture();
  rooms.join('one');
  const before = player(rooms, 'one');
  for (const action of ['chat', 'toString', '__proto__', '', null, {}, ['bow'], 0]) {
    assert.equal(rooms.action('one', action), false);
  }
  assert.deepEqual(player(rooms, 'one'), before);
});

test('snapshots isolate rooms and expose copies without movement internals', () => {
  const { rooms } = fixture();
  rooms.join('one', 'quiet-1');
  rooms.join('two', 'quiet-2');
  rooms.action('two', 'fish');
  assert.deepEqual(rooms.snapshot('quiet-1').players.map((entry) => entry.id), ['one']);
  assert.deepEqual(rooms.snapshot('quiet-2').players.map((entry) => entry.id), ['two']);
  assert.equal(player(rooms, 'one').action, 'idle');
  for (const field of ['lastMoveAt', 'budgetAt', 'moveBudget']) {
    assert.equal(Object.hasOwn(player(rooms, 'two'), field), false);
  }
  assert.deepEqual(rooms.list()[1], { id: 'quiet-2', count: 1, capacity: 12 });
});

async function startApp(t, options) {
  const app = createApplication(options);
  t.after(() => app.close());
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  return { ...app, url: `http://127.0.0.1:${app.server.address().port}` };
}

async function connect(url) {
  const socket = new WebSocket(url.replace('http:', 'ws:') + '/ws');
  const inbox = [];
  socket.on('message', (data) => inbox.push(JSON.parse(data.toString())));
  await once(socket, 'open');
  return {
    socket, inbox,
    send: (message) => socket.send(JSON.stringify(message)),
    async receive(type) {
      const deadline = Date.now() + 2000;
      while (Date.now() < deadline) {
        const index = inbox.findIndex((message) => message.type === type);
        if (index >= 0) return inbox.splice(index, 1)[0];
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      assert.fail(`Timed out waiting for ${type}`);
    },
  };
}

test('WebSocket join, switch, snapshots, errors and disconnect follow the isolated protocol', async (t) => {
  const app = await startApp(t);
  const first = await connect(app.url);
  const second = await connect(app.url);
  first.send({ type: 'rooms' });
  assert.equal((await first.receive('rooms')).rooms.length, 8);
  first.send({ type: 'join', room: 'quiet-1' });
  const welcome = await first.receive('welcome');
  assert.equal(welcome.capacity, 12);
  second.send({ type: 'join', room: 'quiet-2' });
  const other = await second.receive('welcome');
  first.send({ type: 'action', action: 'bow' });
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.ok(first.inbox.filter((m) => m.type === 'snapshot').every((m) => m.room === 'quiet-1' && m.players.every((p) => p.id === welcome.id)));
  assert.ok(second.inbox.filter((m) => m.type === 'snapshot').every((m) => m.room === 'quiet-2' && m.players.every((p) => p.id === other.id)));
  assert.ok(first.inbox.some((m) => m.type === 'snapshot' && m.players[0].action === 'bow'));
  first.send({ type: 'join', room: 'invalid' });
  assert.equal((await first.receive('error')).code, 'INVALID_ROOM');
  assert.equal(app.rooms.roomOf(welcome.id), 'quiet-1');
  for (const message of [{ type: 'chat', text: 'ignored' }, { type: {} }, { type: 'join', room: 'quiet-2', text: 'ignored' }]) {
    first.send(message);
    assert.equal((await first.receive('error')).code, 'INVALID_MESSAGE');
  }
  first.socket.send('{bad JSON');
  assert.equal((await first.receive('error')).code, 'INVALID_MESSAGE');
  first.send({ type: 'action', action: 'invalid' });
  assert.equal((await first.receive('error')).code, 'INVALID_ACTION');
  second.send({ type: 'join', room: 'quiet-1' });
  assert.equal((await second.receive('welcome')).players.length, 2);
  const closed = once(second.socket, 'close');
  second.socket.close();
  await closed;
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(app.rooms.roomOf(other.id), undefined);
  const firstClosed = once(first.socket, 'close');
  await app.close();
  await firstClosed;
  assert.equal(app.rooms.members.size, 0);
  assert.equal(first.socket.readyState, WebSocket.CLOSED);
});

test('WebSocket rejects malformed and cross-site Origin, and accepts matching host/port', async (t) => {
  const app = await startApp(t);
  const endpoint = app.url.replace('http:', 'ws:') + '/ws';
  for (const origin of ['null', 'not-a-url', 'https://attacker.example', app.url + '/path', 'http://127.0.0.1:1']) {
    const socket = new WebSocket(endpoint, { origin });
    const [error] = await once(socket, 'error');
    assert.match(error.message, /403/);
  }
  const socket = new WebSocket(endpoint, { origin: app.url });
  await once(socket, 'open');
  const message = once(socket, 'message');
  socket.send(JSON.stringify({ type: 'join' }));
  assert.equal(JSON.parse((await message)[0].toString()).type, 'welcome');
});

test('movement cannot target another player and snapshots remain isolated after room changes', async (t) => {
  const app = await startApp(t);
  const first = await connect(app.url);
  const second = await connect(app.url);
  first.send({ type: 'join', room: 'quiet-1' });
  const one = await first.receive('welcome');
  second.send({ type: 'join', room: 'quiet-2' });
  const two = await second.receive('welcome');
  const before = app.rooms.snapshot('quiet-2');
  first.send({ type: 'move', id: two.id, x: 0, z: 0, yaw: 0 });
  assert.equal((await first.receive('error')).code, 'INVALID_MESSAGE');
  assert.deepEqual(app.rooms.snapshot('quiet-2'), before);
  first.send({ type: 'move', x: 0, z: 0, yaw: 0 });
  // A rooms reply is a processing barrier for prior movement on this connection.
  first.send({ type: 'rooms' });
  first.inbox.length = 0;
  await first.receive('rooms');
  assert.deepEqual(player(app.rooms, one.id), one.players[0]);
  first.send({ type: 'join', room: 'quiet-3' });
  assert.equal((await first.receive('welcome')).room, 'quiet-3');
  first.inbox.length = 0;
  second.inbox.length = 0;
  assert.equal((await first.receive('snapshot')).room, 'quiet-3');
  assert.equal((await second.receive('snapshot')).room, 'quiet-2');
  assert.deepEqual(app.rooms.snapshot('quiet-2'), before);
  assert.equal(app.rooms.snapshot('quiet-1').players.length, 0);
});

test('WebSocket enforces 60 messages/sec and 2 KB max payload', async (t) => {
  const app = await startApp(t);
  const client = await connect(app.url);
  for (let i = 0; i < 61; i++) client.send({ type: 'rooms' });
  assert.equal((await client.receive('error')).code, 'RATE_LIMIT');
  client.socket.send('x'.repeat(2049));
  const [code] = await once(client.socket, 'close');
  assert.equal(code, 1009);
});

function request(url, pathname, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(url + '/', { path: pathname, method }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('HTTP health and dist serving reject traversal and malformed paths', async (t) => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'temple-rooms-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const dist = path.join(temporary, 'dist');
  await mkdir(dist);
  await writeFile(path.join(dist, 'index.html'), '<!doctype html><title>Temple</title>');
  await writeFile(path.join(temporary, 'private.txt'), 'Must not be served');
  await symlink(path.join(temporary, 'private.txt'), path.join(dist, 'escape.txt'));
  const sibling = path.join(temporary, 'dist-private');
  await mkdir(sibling);
  await writeFile(path.join(sibling, 'secret.txt'), 'Sibling prefix must not bypass containment');
  await symlink(sibling, path.join(dist, 'escape-dir'));
  const app = await startApp(t, { dist });
  const health = await request(app.url, '/health');
  assert.equal(health.status, 200);
  assert.deepEqual(JSON.parse(health.body), { ok: true });
  const index = await request(app.url, '/');
  assert.equal(index.status, 200);
  assert.match(index.headers['content-type'], /text\/html/);
  assert.equal(index.body, '<!doctype html><title>Temple</title>');
  const head = await request(app.url, '/', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.equal((await request(app.url, '/escape.txt')).status, 403);
  assert.equal((await request(app.url, '/escape-dir/secret.txt')).status, 403);
  assert.equal((await request(app.url, '/%252e%252e/private.txt')).status, 404);
  for (const pathname of ['/../package.json', '/%2e%2e/package.json', '/%2e%2e%2fpackage.json', '/%5c..%5cpackage.json', '/%00', '/assets/../../private.txt', '//../private.txt']) {
    assert.equal((await request(app.url, pathname)).status, 403);
  }
  assert.equal((await request(app.url, '/%zz')).status, 400);
  assert.equal((await request(app.url, '/package.json')).status, 404);
  assert.equal((await request(app.url, '/', 'POST')).status, 405);
  const bad = new WebSocket(app.url.replace('http:', 'ws:') + '/not-ws');
  const [error] = await once(bad, 'error');
  assert.match(error.message, /404/);
});
