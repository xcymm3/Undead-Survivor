const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { deflateRawSync, inflateRawSync } = require('node:zlib');
const GAME = 'xcymm3.undead-survivor', VERSION = 'coop-v6-enemies';
const UNRELIABLE_LIMIT = 1150, SNAPSHOT_CHUNK = 690;
const idOf = value => String(value.steamId64);

class SteamRooms {
  constructor(client, native, emit) {
    this.client = client; this.native = native; this.emit = emit; this.id = idOf(client.localplayer.getSteamId());
    this.name = client.localplayer.getName().slice(0, 128); this.lobby = null; this.match = null; this.pending = null; this.ready = new Set(); this.lastPeer = 0;
    this.snapshots = new Map();
    this.handles = [client.callback.register(6, ({ remote }) => {
      if (this.memberIds().includes(String(remote))) client.networking.acceptP2PSession(remote);
    }), client.callback.register(7, ({ remote }) => {
      if (this.memberIds().includes(String(remote))) this.abort('Steam P2P 连接失败，请返回房间重试。');
    })];
    this.timer = setInterval(() => this.poll(), 33); this.roomTimer = setInterval(() => this.refresh(), 1000);
  }
  memberIds() { return this.lobby ? this.lobby.getMembers().map(idOf) : []; }
  room(lobby = this.lobby) {
    return lobby ? { id: String(lobby.id), name: lobby.getData('name') || '小队生存', owner: idOf(lobby.getOwner()),
      members: lobby.getMembers().map(m => ({ id: idOf(m), name: idOf(m) === this.id ? this.name : `队友 ${idOf(m).slice(-4)}` })),
      playing: lobby.getData('state') !== 'waiting' } : null;
  }
  status() { return { available: true, id: this.id, name: this.name, message: 'Steam 已连接 · Spacewar 测试', appId: 480, room: this.room() }; }
  publish() { this.emit({ type: 'status', status: this.status() }); }
  compatible(lobby) { return lobby.getData('game') === GAME && lobby.getData('protocol') === VERSION; }
  async exclusive(action) { if (this.busy) throw Error('正在处理房间请求，请稍候。'); this.busy = true; try { return await action(); } finally { this.busy = false; } }
  create(name) { return this.exclusive(async () => {
    if (this.lobby) throw Error('请先离开当前房间。');
    const lobby = await this.client.matchmaking.createLobby(2, 4);
    if (!lobby.mergeFullData({ game: GAME, protocol: VERSION, name: String(name || `${this.name}的房间`).slice(0, 40), state: 'waiting' })) {
      lobby.leave(); throw Error('房间信息设置失败。');
    }
    this.lobby = lobby; this.publish(); return this.room();
  }); }
  search() { return this.exclusive(async () => {
    // Steam 480 共用大厅，查询前在服务端按本项目与协议筛选，避免被其他游戏的 50 条结果挤掉。
    this.native.filter(GAME, VERSION);
    const rooms = await this.client.matchmaking.getLobbies();
    // 搜索结果只有公开元数据与人数；Steam 要求加入后才能查询成员 ID 和房主。
    return rooms.filter(l => this.compatible(l) && l.getData('state') === 'waiting' && Number(l.getMemberCount()) < 4)
      .map(l => ({ id: String(l.id), name: l.getData('name') || '小队生存', owner: '', members: [], memberCount: Number(l.getMemberCount()), playing: false }));
  }); }
  join(id) { return this.exclusive(async () => {
    if (this.lobby) throw Error('请先离开当前房间。');
    if (typeof id !== 'string' || !/^\d{1,20}$/.test(id)) throw Error('房间号格式不正确。');
    const lobby = await this.client.matchmaking.joinLobby(BigInt(id));
    if (!this.compatible(lobby) || lobby.getData('state') !== 'waiting' || Number(lobby.getMemberCount()) > 4) {
      lobby.leave(); throw Error('房间不兼容、已满或已经开始。');
    }
    this.lobby = lobby; this.lastPeer = Date.now(); this.publish(); return this.room();
  }); }
  leave() {
    const lobby = this.lobby;
    try {
      if (lobby) {
        try { this.sendControl('leave'); } catch { /* Steam 退出后仍需清理本地状态。 */ }
        try { for (const id of this.memberIds()) if (id !== this.id) this.native.close(BigInt(id)); } catch { /* 已断开。 */ }
        lobby.leave();
      }
    } finally {
      this.lobby = null; this.match = null; this.pending = null; this.ready.clear(); this.snapshots.clear(); this.publish();
    }
  }
  abort(message) { try { this.leave(); } catch { /* SDK 不可用时以本地清理为准。 */ } this.emit({ type: 'left', message }); }
  start() {
    const room = this.room();
    if (!room || room.owner !== this.id || room.members.length < 2 || room.members.length > 4 || this.match || this.pending) throw Error('需要 2～4 名玩家在房间内，由房主开始。');
    this.pending = { session: randomUUID(), host: this.id, members: room.members, local: this.id };
    this.ready = new Set([this.id]);
    this.pendingAt = Date.now(); this.lastPeer = Date.now();
    this.lobby.setJoinable(false); this.lobby.setData('state', 'loading'); this.sendControl('prepare', this.pending); this.publish();
  }
  sendControl(type, payload) { this.send({ type, payload }); }
  send(packet, mode = 2) {
    if (!this.lobby) return false;
    const data = Buffer.from(JSON.stringify({ game: GAME, version: VERSION, room: String(this.lobby.id), ...packet }));
    if (data.length > (mode === 0 ? UNRELIABLE_LIMIT : 128 * 1024)) return false;
    let sent = true;
    for (const id of this.memberIds()) if (id !== this.id) sent = this.client.networking.sendP2PPacket(BigInt(id), mode, data) && sent;
    return sent;
  }
  sendSnapshot(payload) {
    const compressed = deflateRawSync(Buffer.from(JSON.stringify(payload)), { level: 1 });
    const total = Math.ceil(compressed.length / SNAPSHOT_CHUNK);
    if (!total || total > 64) return false;
    let sent = true;
    for (let index = 0; index < total; index++) sent = this.send({ type: 'snapshot', session: this.match.session,
      snapshot: payload.seq, index, total, data: compressed.subarray(index * SNAPSHOT_CHUNK, (index + 1) * SNAPSHOT_CHUNK).toString('base64') }, 0) && sent;
    return sent;
  }
  sendData(payload) {
    if (!this.match) return;
    // 高频输入与世界快照允许丢弃，避免可靠队列在网络抖动时堆积旧画面。
    // 射击、换弹、切枪、伤害反馈和房间控制仍走可靠通道。
    const sent = payload?.type === 'world' ? this.sendSnapshot(payload)
      : this.send({ type: 'data', session: this.match.session, payload }, payload?.type === 'input' ? 0 : 2);
    if (!sent) this.emit({ type: 'error', message: '联机数据发送失败，正在重试连接。' });
  }
  receiveSnapshot(from, packet) {
    if (!this.match || packet.session !== this.match.session || !Number.isSafeInteger(packet.snapshot) || packet.snapshot < 0
      || !Number.isInteger(packet.index) || !Number.isInteger(packet.total) || packet.total < 1 || packet.total > 64
      || packet.index < 0 || packet.index >= packet.total || typeof packet.data !== 'string' || packet.data.length > 1000) return;
    const key = `${from}:${packet.snapshot}`;
    let entry = this.snapshots.get(key);
    if (!entry) { entry = { at: Date.now(), parts: Array(packet.total), received: 0 }; this.snapshots.set(key, entry); }
    if (entry.parts.length !== packet.total || entry.parts[packet.index] !== undefined) return;
    entry.parts[packet.index] = packet.data; entry.received++;
    for (const [id, item] of this.snapshots) if (Date.now() - item.at > 2000) this.snapshots.delete(id);
    if (entry.received !== packet.total) return;
    this.snapshots.delete(key);
    try {
      const data = JSON.parse(inflateRawSync(Buffer.concat(entry.parts.map(part => Buffer.from(part, 'base64'))), { maxOutputLength: 128 * 1024 }).toString('utf8'));
      for (const id of this.snapshots.keys()) if (id.startsWith(`${from}:`) && Number(id.slice(id.indexOf(':') + 1)) < packet.snapshot) this.snapshots.delete(id);
      this.emit({ type: 'packet', from, data });
    } catch { /* 丢弃缺损、超限或无法解压的快照，下一帧会自然替代。 */ }
  }
  refresh() {
    try {
      if (!this.lobby) return;
      const ids = this.memberIds();
      const expected = (this.match || this.pending)?.members.map(member => member.id);
      if (expected && (ids.length !== expected.length || !expected.every(id => ids.includes(id)))) return this.abort('队友已离开，联机对局结束。本次不写入单人排行。');
      if (this.pending && Date.now() - this.pendingAt > 15000) return this.abort('等待队友连接超时，请重新创建或加入房间。');
      if (this.match && Date.now() - this.lastPeer > 15000) return this.abort('15 秒未收到队友数据，连接已中断。');
      this.sendControl('hello'); this.publish();
    } catch { this.abort('Steam 房间连接中断。'); }
  }
  poll() {
    try {
      for (let i = 0; i < 64; i++) {
        const size = this.client.networking.isP2PPacketAvailable(); if (!size) break;
        const packet = this.client.networking.readP2PPacket(size);
        if (size > 128 * 1024) continue;
        const from = idOf(packet.steamId); if (!this.lobby || from === this.id || !this.memberIds().includes(from)) continue;
        let p; try { p = JSON.parse(packet.data.toString('utf8')); } catch { continue; }
        if (!p || p.game !== GAME || p.version !== VERSION || p.room !== String(this.lobby.id)) continue;
        this.lastPeer = Date.now();
        if (p.type === 'leave') { if (this.match || this.pending) this.abort('队友离开了对局。'); continue; }
        if (p.type === 'prepare' && from === idOf(this.lobby.getOwner()) && !this.match) {
          const m = p.payload;
          if (!m || typeof m.session !== 'string' || m.session.length > 80 || m.host !== from || !Array.isArray(m.members)
            || m.members.length < 2 || m.members.length > 4 || !m.members.every(v => v && typeof v.id === 'string' && typeof v.name === 'string' && v.name.length <= 128)
            || this.memberIds().length !== m.members.length || !this.memberIds().every(id => m.members.some(v => v.id === id))) continue;
          this.pending = { ...m, local: this.id }; this.pendingAt = Date.now(); this.sendControl('ready', m.session);
        } else if (p.type === 'ready' && this.pending?.host === this.id && p.payload === this.pending.session) {
          this.ready.add(from);
          if (this.pending.members.every(member => this.ready.has(member.id))) {
            this.match = this.pending; this.pending = null; this.lobby.setData('state', 'playing');
            this.sendControl('go', this.match.session); this.emit({ type: 'start', match: this.match }); this.publish();
          }
        } else if (p.type === 'go' && this.pending?.host === from && p.payload === this.pending.session) {
          this.match = this.pending; this.pending = null; this.emit({ type: 'start', match: this.match }); this.publish();
        } else if (p.type === 'snapshot') this.receiveSnapshot(from, p);
        else if (p.type === 'data' && this.match && p.session === this.match.session) this.emit({ type: 'packet', from, data: p.payload });
      }
    } catch (error) { this.emit({ type: 'error', message: `Steam 接收失败：${error.message}` }); }
  }
  dispose() {
    clearInterval(this.timer); clearInterval(this.roomTimer);
    try { this.leave(); } catch { /* 退出时 Steam 可能先关闭。 */ }
    this.snapshots.clear(); this.handles.forEach(h => h.disconnect());
  }
}

function initialize(emit) {
  const client = require('steamworks.js').init(480);
  const koffi = require('koffi');
  // FFI 直接访问文件系统，发行包必须使用 asarUnpack 后的真实 DLL 路径。
  const nativeRoot = path.dirname(require.resolve('steamworks.js')).replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
  const dll = koffi.load(path.join(nativeRoot, 'dist/win64/steam_api64.dll'));
  const matchmaking = dll.func('void* SteamAPI_SteamMatchmaking_v009()')();
  const networking = dll.func('void* SteamAPI_SteamNetworking_v006()')();
  const stringFilter = dll.func('void SteamAPI_ISteamMatchmaking_AddRequestLobbyListStringFilter(void*, const char*, const char*, int)');
  const distanceFilter = dll.func('void SteamAPI_ISteamMatchmaking_AddRequestLobbyListDistanceFilter(void*, int)');
  const closeSession = dll.func('bool SteamAPI_ISteamNetworking_CloseP2PSessionWithUser(void*, uint64_t)');
  return new SteamRooms(client, {
    filter(game, version) { stringFilter(matchmaking, 'game', game, 0); stringFilter(matchmaking, 'protocol', version, 0); distanceFilter(matchmaking, 3); },
    close(id) { closeSession(networking, id); },
  }, emit);
}
module.exports = { SteamRooms, initialize };
