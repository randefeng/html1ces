import { canStandAt } from '../src/movement.js';

const MOVE_SPEED = 4.5;
const MAX_MOVE_BUDGET = MOVE_SPEED * 1.5;
const INITIAL_MOVE_BUDGET = 0.4;

export const CAPACITY = 12;
export const ROOM_IDS = Object.freeze(Array.from({ length: 8 }, (_, i) => `quiet-${i + 1}`));
export const ACTION_DURATIONS = Object.freeze({ idle: 0, bow: 4000, fish: 5000, beads: 8000, incense: 5000 });

export class RoomError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RoomError';
    this.code = code;
  }
}

function spawn(id) {
  let hash = 2166136261;
  for (const character of id) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  const position = { x: (hash % 3001) / 1000 - 1.5, z: 4.5 + ((hash >>> 12) % 1501) / 1000 };
  if (canStandAt(position.x, position.z)) return position;
  // Deterministic fallback within the spawn zone if shared collision geometry changes.
  for (let z = 4.5; z <= 6; z += 0.25) {
    for (let x = -1.5; x <= 1.5; x += 0.25) {
      if (canStandAt(x, z)) return { x, z };
    }
  }
  throw new RoomError('NO_SAFE_SPAWN', 'No walkable spawn position is available.');
}

// Transport-independent state. The injectable clock keeps time-based rules deterministic.
export class Rooms {
  constructor({ now = Date.now } = {}) {
    this.now = now;
    this.rooms = new Map(ROOM_IDS.map((id) => [id, new Map()]));
    this.members = new Map();
  }

  roomOf(id) {
    return this.members.get(id)?.room;
  }

  list() {
    return ROOM_IDS.map((id) => ({ id, count: this.rooms.get(id).size, capacity: CAPACITY }));
  }

  join(id, requestedRoom) {
    if (typeof id !== 'string' || !id) throw new RoomError('INVALID_ID', 'Invalid player ID.');
    if (requestedRoom !== undefined && !ROOM_IDS.includes(requestedRoom)) {
      throw new RoomError('INVALID_ROOM', 'Choose a room from quiet-1 to quiet-8.');
    }
    const current = this.members.get(id);
    const room = requestedRoom ?? ROOM_IDS.find((candidate) =>
      this.rooms.get(candidate).size < CAPACITY || current?.room === candidate);
    if (!room || (this.rooms.get(room).size >= CAPACITY && current?.room !== room)) {
      throw new RoomError('ROOM_FULL', 'The requested room is full.');
    }
    if (current?.room !== room) {
      const position = spawn(id);
      const time = this.now();
      const player = { id, ...position, yaw: Math.PI, action: 'idle', actionAt: time };
      this.leave(id);
      this.rooms.get(room).set(id, player);
      this.members.set(id, { room, player, moveBudget: INITIAL_MOVE_BUDGET, budgetAt: time });
    }
    return { type: 'welcome', id, room, capacity: CAPACITY, players: this.snapshot(room).players };
  }

  leave(id) {
    const member = this.members.get(id);
    if (!member) return undefined;
    this.rooms.get(member.room).delete(id);
    this.members.delete(id);
    return member.room;
  }

  move(id, update) {
    const member = this.members.get(id);
    if (!member || !update || ![update.x, update.z, update.yaw].every(Number.isFinite)) return false;
    const { x, z, yaw } = update;
    if (!canStandAt(x, z)) return false;
    const time = Math.max(this.now(), member.budgetAt);
    const elapsed = (time - member.budgetAt) / 1000;
    const budget = Math.min(MAX_MOVE_BUDGET, member.moveBudget + elapsed * MOVE_SPEED);
    const distance = Math.hypot(x - member.player.x, z - member.player.z);
    if (distance > budget) return false;
    Object.assign(member.player, { x, z, yaw: ((yaw % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI });
    // Only successful movement commits the refill and debit; rejected messages change nothing.
    member.moveBudget = budget - distance;
    member.budgetAt = time;
    return true;
  }

  action(id, action) {
    const member = this.members.get(id);
    if (!member || typeof action !== 'string' || !Object.hasOwn(ACTION_DURATIONS, action)) return false;
    Object.assign(member.player, { action, actionAt: this.now() });
    return true;
  }

  tick() {
    const time = this.now();
    for (const { player } of this.members.values()) {
      if (player.action !== 'idle' && time - player.actionAt >= ACTION_DURATIONS[player.action]) {
        Object.assign(player, { action: 'idle', actionAt: time });
      }
    }
  }

  snapshot(room) {
    this.tick();
    return { type: 'snapshot', room, players: Array.from(this.rooms.get(room)?.values() ?? [], (player) => ({ ...player })) };
  }

  clear() {
    this.members.clear();
    for (const players of this.rooms.values()) players.clear();
  }
}
