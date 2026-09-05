import { Arsenal } from '../game/arsenal';
import { Navigation } from '../game/navigation';
import { PlayerMotion } from '../game/player';
import type { Encounter } from '../game/encounter';
import type { Match, Pawn, Command, WorldState } from './types';
import { validCommand, validWorld } from './types';

/** 房主接受输入并模拟队友；客户端仅预测自己移动，不提交位置、血量或伤害。 */
export class CoopSession {
  readonly players: Pawn[];
  readonly host: boolean;
  readonly remoteMotion = new PlayerMotion();
  readonly remoteArsenal = new Arsenal();
  keys = new Set<string>();
  lastInputAt = 0;
  lastPacketAt = performance.now();
  private commandSeq = -1;
  private inputSeq = -1;
  private worldSeq = -1;
  private jump = 0;
  private outgoing = 0;
  private inputTimer = 0;
  private worldTimer = 0;
  private commands: Command[] = [];
  private worldReceivedAt = 0;
  private zombieTracks = new Map<number, { fromX: number; fromZ: number; fromHeading: number; toX: number; toZ: number; toHeading: number; elapsed: number; duration: number }>();
  authoritativeKeys = new Set<string>();
  feedback: { head: boolean; killed: boolean; armorBroken: boolean }[] = [];
  constructor(readonly match: Match, readonly encounter: Encounter, navigation: Navigation,
    private send: (data: unknown) => void) {
    this.host = match.host === match.local;
    this.players = match.members.map((m, i) => ({ ...m, x: i ? 2 : -2, z: 9, height: 0, yaw: 0, pitch: 0,
      health: 100, lastDamageAt: -1e6, weapon: 0, shots: 0 }));
    if (this.host) encounter.setCombatants(this.players, this.players.map(() => new Navigation(navigation.obstacles, true)));
    Object.assign(encounter.player, { x: this.local.x, z: this.local.z });
  }
  get local() { return this.players.find(p => p.id === this.match.local)!; }
  get remote() { return this.players.find(p => p.id !== this.match.local)!; }
  command(data: Omit<Extract<Command, { type: 'fire' }>, 'seq'> | Omit<Extract<Command, { type: 'reload' | 'weapon' }>, 'seq'>) {
    if (!this.host && this.local.health > 0) this.send({ ...data, seq: ++this.outgoing });
  }
  sendInput(keys: Set<string>, yaw: number, pitch: number, jump: number, delta: number) {
    if (this.host) return;
    this.inputTimer += delta;
    if (this.inputTimer < .05 && jump === this.jump) return;
    this.jump = jump; this.inputTimer = 0;
    this.send({ type: 'input', seq: ++this.outgoing, keys: [...keys], yaw, pitch, jump });
  }
  receive(from: string, data: unknown) {
    if (from !== this.remote.id) return;
    if (!this.host && data && typeof data === 'object' && 'type' in data && data.type === 'hit') {
      const hit = data as unknown as { head: boolean; killed: boolean; armorBroken: boolean };
      if (['head', 'killed', 'armorBroken'].every(k => typeof hit[k as keyof typeof hit] === 'boolean') && this.feedback.length < 32) this.feedback.push(hit);
      return;
    }
    if (this.host) {
      if (!validCommand(data)) return;
      if (data.type === 'input') {
        if (data.seq <= this.inputSeq) return;
        this.inputSeq = data.seq; this.lastPacketAt = performance.now();
        this.keys = new Set(data.keys); this.remote.yaw = data.yaw; this.remote.pitch = data.pitch;
        this.lastInputAt = performance.now();
        if (data.jump > this.jump && this.remote.health > 0) this.remoteMotion.jump(); this.jump = data.jump;
      } else {
        // 高频输入与可靠操作使用不同 Steam 通道，二者允许交错到达，分别判重。
        if (data.seq <= this.commandSeq) return;
        this.commandSeq = data.seq; this.lastPacketAt = performance.now();
        if (this.commands.length < 32) this.commands.push(data);
      }
    } else {
      if (!validWorld(data, this.match.members) || data.seq <= this.worldSeq) return;
      this.worldSeq = data.seq; this.lastPacketAt = performance.now();
      for (const p of data.players) Object.assign(this.players.find(v => v.id === p.id)!, p);
      const e = this.encounter;
      const now = performance.now();
      const duration = this.worldReceivedAt ? Math.max(.06, Math.min(.2, (now - this.worldReceivedAt) / 1000)) : .1;
      this.worldReceivedAt = now; this.authoritativeKeys = new Set(data.inputKeys);
      const current = new Map(e.zombies.map(z => [z.id, z]));
      const nextIds = new Set(data.zombies.map(z => z.id));
      e.zombies = data.zombies.map(incoming => {
        const zombie = current.get(incoming.id);
        if (!zombie) { this.zombieTracks.delete(incoming.id); return { ...incoming }; }
        const fromX = zombie.x, fromZ = zombie.z, fromHeading = zombie.heading ?? incoming.heading ?? 0;
        Object.assign(zombie, incoming); zombie.x = fromX; zombie.z = fromZ; zombie.heading = fromHeading;
        this.zombieTracks.set(zombie.id, { fromX, fromZ, fromHeading, toX: incoming.x, toZ: incoming.z,
          toHeading: incoming.heading ?? fromHeading, elapsed: 0, duration });
        return zombie;
      });
      for (const id of this.zombieTracks.keys()) if (!nextIds.has(id)) this.zombieTracks.delete(id);
      e.wave = data.wave; e.wavesCleared = data.wavesCleared; e.waveSpawned = data.waveSpawned;
      e.totalSpawned = data.totalSpawned; e.intermission = data.intermission;
      e.elapsed = data.failed ? data.elapsed : Math.max(e.elapsed, data.elapsed); e.kills = data.kills; e.failed = data.failed;
    }
  }
  smoothWorld(delta: number) {
    if (this.host || delta <= 0) return;
    if (!this.encounter.failed) this.encounter.elapsed += delta;
    for (const zombie of this.encounter.zombies) {
      const track = this.zombieTracks.get(zombie.id); if (!track) continue;
      track.elapsed = Math.min(track.duration, track.elapsed + delta);
      const t = track.elapsed / track.duration;
      zombie.x = track.fromX + (track.toX - track.fromX) * t;
      zombie.z = track.fromZ + (track.toZ - track.fromZ) * t;
      const turn = Math.atan2(Math.sin(track.toHeading - track.fromHeading), Math.cos(track.toHeading - track.fromHeading));
      zombie.heading = track.fromHeading + turn * t;
    }
  }
  advanceRemote(delta: number, navigation: Navigation, fire: (pawn: Pawn, arsenal: Arsenal) => void) {
    if (!this.host) return;
    this.remoteArsenal.update(delta);
    if (performance.now() - this.lastInputAt > 500) this.keys.clear();
    if (this.remote.health > 0) {
      if (this.remoteMotion.update(this.remote, this.remote.yaw, this.keys, delta, navigation, this.encounter.zombies)) this.remote.health = 0;
      this.remote.height = this.remoteMotion.height;
      while (this.commands.length) {
        const command = this.commands[0];
        // 网络抖动可能让下一枪提前到达：等待冷却，不丢掉合法射击，也不允许突发连发。
        if (command.type === 'fire' && (this.remoteArsenal.blocked || this.remoteArsenal.gun.reloading || this.remoteArsenal.gun.cooldown > 1e-8)) break;
        this.commands.shift();
        if (command.type === 'weapon') this.remoteArsenal.request(command.index);
        else if (command.type === 'reload') this.remoteArsenal.reload();
        // 射击方向属于该发子弹，不能把排队期间收到的新移动朝向改回旧值。
        else if (command.type === 'fire') fire({ ...this.remote, yaw: command.yaw, pitch: command.pitch }, this.remoteArsenal);
      }
    }
    if (this.remote.health === 0) this.commands = [];
    this.remote.weapon = this.remoteArsenal.active; this.remote.shots = this.remoteArsenal.shots;
  }
  sendHit(head: boolean, killed: boolean, armorBroken: boolean) { this.send({ type: 'hit', head, killed, armorBroken }); }
  broadcast(delta: number, force = false) {
    if (!this.host) return;
    this.worldTimer += delta; if (!force && this.worldTimer < .1) return; this.worldTimer = 0;
    const e = this.encounter;
    const state: WorldState = { type: 'world', seq: ++this.outgoing, inputAck: this.inputSeq, inputKeys: [...this.keys], players: this.players.map(p => ({ ...p })),
      zombies: e.zombies.map(z => ({ ...z })), wave: e.wave, wavesCleared: e.wavesCleared, waveSpawned: e.waveSpawned,
      totalSpawned: e.totalSpawned, intermission: e.intermission, elapsed: e.elapsed, kills: e.kills, failed: e.failed };
    this.send(state);
  }
}
