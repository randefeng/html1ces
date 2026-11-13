export class TempleConnection {
  constructor({ onStatus, onWelcome, onPlayers, onRooms, onError }) {
    Object.assign(this, { onStatus, onWelcome, onPlayers, onRooms, onError });
    this.socket = null;
    this.id = null;
    this.room = 'quiet-1';
    this.joined = false;
    this.disposed = false;
    this.retry = 0;
    this.retryTimer = null;
    this.latestPose = null;
    this.autoJoinAttempted = false;
    this.connect();
    this.moveTimer = setInterval(() => {
      if (this.joined && this.latestPose) this.send({ type: 'move', ...this.latestPose });
    }, 1000 / 15);
  }

  connect() {
    if (this.disposed) return;
    this.onStatus('connecting');
    this.autoJoinAttempted = false;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}/ws`);
    this.socket = socket;
    socket.addEventListener('open', () => this.send({ type: 'join', room: this.room }));
    socket.addEventListener('message', (event) => {
      if (this.disposed || this.socket !== socket) return;
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      if (data.type === 'welcome') {
        this.joined = true;
        this.retry = 0;
        this.id = data.id;
        this.room = data.room;
        const self = data.players.find((player) => player.id === this.id);
        if (self) this.latestPose = { x: self.x, z: self.z, yaw: self.yaw };
        this.onStatus('online');
        this.onWelcome(data);
      } else if (data.type === 'snapshot' && data.room === this.room) {
        this.onPlayers(data.players, this.id);
      } else if (data.type === 'rooms') {
        this.onRooms(data.rooms);
      } else if (data.type === 'error') {
        this.onError(data.message || '房间暂时不可用');
        if (!this.joined) {
          this.onStatus('offline');
          // If the remembered room is full, auto-select a different room on reconnect.
          if (data.code === 'ROOM_FULL' && !this.autoJoinAttempted) {
            this.autoJoinAttempted = true;
            this.send({ type: 'join' });
          } else if (data.code === 'ROOM_FULL') {
            socket.close(1000, 'Rooms full; retry later');
          }
        }
      }
    });
    socket.addEventListener('close', () => {
      if (this.socket !== socket || this.disposed) return;
      this.joined = false;
      this.id = null;
      this.onPlayers([], null);
      this.onStatus('offline');
      const delay = Math.min(15000, 1500 * 2 ** this.retry++);
      this.retryTimer = setTimeout(() => this.connect(), delay);
    });
    socket.addEventListener('error', () => { /* close triggers the visible status and retry */ });
  }

  send(data) {
    if (this.socket?.readyState === WebSocket.OPEN && this.socket.bufferedAmount < 65536) {
      this.socket.send(JSON.stringify(data));
      return true;
    }
    return false;
  }

  setPose(pose) { this.latestPose = pose; }
  action(action) { if (this.joined) this.send({ type: 'action', action }); }
  join(room) {
    if (!this.joined) { this.onError('连接尚未恢复，暂时不能换房间。'); return; }
    this.send({ type: 'join', room });
  }
  requestRooms() { this.send({ type: 'rooms' }); }
  dispose() {
    this.disposed = true;
    clearInterval(this.moveTimer);
    clearTimeout(this.retryTimer);
    this.socket?.close(1000, 'Leaving temple');
  }
}
