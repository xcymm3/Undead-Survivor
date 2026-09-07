import { Arsenal } from '../game/arsenal';
import { PLAYER } from '../game/config';
import { Navigation } from '../game/navigation';
import { PlayerMotion } from '../game/player';
import type { Encounter } from '../game/encounter';
import type { Match, Pawn, Command, WorldState } from './types';
import { validCommand, validWorld } from './types';
import { defaultAppearance, normalizeAppearance, randomAppearance } from './appearance';
import type { PlayerAppearance } from './appearance';

const compact = (value: number) => Math.round(value * 1000) / 1000;
const SPAWNS = [{ x: -3, z: 9 }, { x: 3, z: 9 }, { x: -3, z: 6.5 }, { x: 3, z: 6.5 }] as const;

interface RemoteController {
  motion: PlayerMotion; arsenal: Arsenal; keys: Set<string>; lastInputAt: number; lastPacketAt: number;
  commandSeq: number; inputSeq: number; jump: number; commands: Command[];
}

/** 房主模拟所有队员；每位队员拥有独立输入、武器、序号和预测校正状态。 */
export class CoopSession {
  readonly players: Pawn[];
  readonly host: boolean;
  private controllers = new Map<string, RemoteController>();
  private worldSeq = -1;
  private outgoing = 0;
  private inputTimer = 0;
  private localJump = 0;
  private worldTimer = 0;
  private worldReceivedAt = 0;
  private revived = false;
  private selectedAppearance: PlayerAppearance;
  private appearanceConfirmed = false;
  private appearanceTimer = 0;
  private zombieTracks = new Map<number, { fromX: number; fromZ: number; fromHeading: number; toX: number; toZ: number; toHeading: number; elapsed: number; duration: number }>();
  lastPacketAt = performance.now();
  authoritativeKeys = new Set<string>();
  feedback: { head: boolean; killed: boolean; armorBroken: boolean }[] = [];

  constructor(readonly match: Match, readonly encounter: Encounter, navigation: Navigation,
    private send: (data: unknown) => void, appearance: PlayerAppearance = randomAppearance()) {
    this.host = match.host === match.local;
    this.selectedAppearance = normalizeAppearance(appearance);
    this.players = match.members.map((member, index) => ({ ...member, ...SPAWNS[index], height: 0, yaw: 0, pitch: 0,
      health: PLAYER.health, lastDamageAt: -1e6, weapon: 0, shots: 0, ammo: 30, reloading: false, reloadProgress: 1,
      reloadEmpty: false, appearance: member.id === match.local ? normalizeAppearance(appearance) : defaultAppearance(index) }));
    for (const player of this.remotes) this.controllers.set(player.id, {
      motion: new PlayerMotion(), arsenal: new Arsenal(), keys: new Set(), lastInputAt: 0, lastPacketAt: performance.now(),
      commandSeq: -1, inputSeq: -1, jump: 0, commands: [],
    });
    if (this.host) encounter.setCombatants(this.players, this.players.map(() => new Navigation(navigation.obstacles, true)));
    Object.assign(encounter.player, { x: this.local.x, z: this.local.z });
  }

  get local() { return this.players.find(player => player.id === this.match.local)!; }
  get remotes() { return this.players.filter(player => player.id !== this.match.local); }
  get remote() { return this.remotes[0]!; }
  get remoteMotion() { return this.controllers.get(this.remote.id)!.motion; }
  get remoteArsenal() { return this.controllers.get(this.remote.id)!.arsenal; }
  get keys() { return this.controllers.get(this.remote.id)!.keys; }
  get lastInputAt() { return this.controllers.get(this.remote.id)!.lastInputAt; }
  set lastInputAt(value: number) { this.controllers.get(this.remote.id)!.lastInputAt = value; }

  command(data: Omit<Extract<Command, { type: 'fire' }>, 'seq'> | Omit<Extract<Command, { type: 'reload' | 'weapon' }>, 'seq'>) {
    if (!this.host && this.local.health > 0) this.send({ ...data, seq: ++this.outgoing });
  }

  announceAppearance() {
    if (this.host) return;
    this.selectedAppearance = normalizeAppearance(this.local.appearance);
    this.appearanceConfirmed = false; this.appearanceTimer = 0;
    this.send({ type: 'appearance', seq: ++this.outgoing, appearance: this.selectedAppearance });
  }

  sendInput(keys: Set<string>, yaw: number, pitch: number, jump: number, delta: number) {
    if (this.host) return;
    this.appearanceTimer += delta;
    if (!this.appearanceConfirmed && this.appearanceTimer >= 1) this.announceAppearance();
    this.inputTimer += delta;
    if (this.inputTimer < .05 && jump === this.localJump) return;
    this.localJump = jump; this.inputTimer = 0;
    this.send({ type: 'input', seq: ++this.outgoing, keys: [...keys], yaw, pitch, jump });
  }

  receive(from: string, data: unknown) {
    if (this.host) {
      const controller = this.controllers.get(from);
      const player = this.players.find(value => value.id === from);
      if (!controller || !player || !validCommand(data)) return;
      this.lastPacketAt = controller.lastPacketAt = performance.now();
      if (data.type === 'input') {
        if (data.seq <= controller.inputSeq) return;
        controller.inputSeq = data.seq; controller.keys = new Set(data.keys); player.yaw = data.yaw; player.pitch = data.pitch;
        controller.lastInputAt = performance.now();
        if (data.jump > controller.jump && player.health > 0) controller.motion.jump(controller.keys);
        controller.jump = data.jump;
      } else {
        if (data.seq <= controller.commandSeq) return;
        controller.commandSeq = data.seq;
        if (data.type === 'appearance') player.appearance = normalizeAppearance(data.appearance);
        else if (controller.commands.length < 32) controller.commands.push(data);
      }
      return;
    }
    if (from !== this.match.host || !data || typeof data !== 'object' || !('type' in data)) return;
    if (data.type === 'hit') {
      const hit = data as { to?: unknown; head?: unknown; killed?: unknown; armorBroken?: unknown };
      if (hit.to === this.local.id && [hit.head, hit.killed, hit.armorBroken].every(value => typeof value === 'boolean') && this.feedback.length < 32) {
        this.feedback.push({ head: hit.head as boolean, killed: hit.killed as boolean, armorBroken: hit.armorBroken as boolean });
      }
      return;
    }
    if (!validWorld(data, this.match.members) || data.seq <= this.worldSeq) return;
    this.worldSeq = data.seq; this.lastPacketAt = performance.now();
    const wasDead = this.local.health === 0;
    for (const player of data.players) {
      const pawn = this.players.find(value => value.id === player.id)!;
      Object.assign(pawn, player);
      if (player.id === this.match.local) {
        const selected = this.selectedAppearance;
        this.appearanceConfirmed = player.appearance.character === selected.character
          && player.appearance.primary === selected.primary && player.appearance.accent === selected.accent;
        // 开局默认快照不能覆盖本机选择，否则重发也只会发送默认外貌。
        pawn.appearance = { ...selected };
      }
    }
    const input = data.inputs.find(value => value.id === this.local.id);
    this.authoritativeKeys = new Set(input?.keys ?? []);
    if (wasDead && this.local.health > 0) {
      Object.assign(this.encounter.player, { x: this.local.x, z: this.local.z });
      this.revived = true;
    }
    const e = this.encounter;
    const now = performance.now();
    const duration = this.worldReceivedAt ? Math.max(.06, Math.min(.2, (now - this.worldReceivedAt) / 1000)) : .1;
    this.worldReceivedAt = now;
    const current = new Map(e.zombies.map(zombie => [zombie.id, zombie]));
    const nextIds = new Set(data.zombies.map(zombie => zombie.id));
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

  consumeRevival() { const value = this.revived; this.revived = false; return value; }

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

  advanceRemotes(delta: number, navigation: Navigation, fire: (pawn: Pawn, arsenal: Arsenal) => void) {
    if (!this.host) return;
    for (const player of this.remotes) {
      const controller = this.controllers.get(player.id)!;
      controller.arsenal.update(delta);
      if (performance.now() - controller.lastInputAt > 500) controller.keys.clear();
      if (player.health > 0) {
        if (controller.motion.update(player, player.yaw, controller.keys, delta, navigation, this.encounter.zombies)) player.health = 0;
        player.height = controller.motion.height;
        while (controller.commands.length) {
          const command = controller.commands[0];
          if (command.type === 'fire' && (controller.arsenal.blocked || controller.arsenal.gun.reloading || controller.arsenal.gun.cooldown > 1e-8)) break;
          controller.commands.shift();
          if (command.type === 'weapon') controller.arsenal.request(command.index);
          else if (command.type === 'reload') controller.arsenal.reload();
          else if (command.type === 'fire') fire({ ...player, yaw: command.yaw, pitch: command.pitch }, controller.arsenal);
        }
      }
      if (player.health === 0) controller.commands = [];
      player.weapon = controller.arsenal.active; player.shots = controller.arsenal.shots;
      player.ammo = controller.arsenal.gun.ammo; player.reloading = controller.arsenal.gun.reloading; player.reloadProgress = controller.arsenal.gun.animationProgress;
      player.reloadEmpty = controller.arsenal.gun.reloadEmpty;
    }
  }

  advanceRemote(delta: number, navigation: Navigation, fire: (pawn: Pawn, arsenal: Arsenal) => void) { this.advanceRemotes(delta, navigation, fire); }

  reviveAll() {
    const localWasDead = this.local.health === 0;
    this.players.forEach((player, index) => {
      const wasDead = player.health === 0;
      if (wasDead) Object.assign(player, SPAWNS[index], { height: 0 });
      Object.assign(player, { health: PLAYER.health, lastDamageAt: -1e6 });
      const controller = this.controllers.get(player.id);
      if (wasDead && controller) { controller.motion.reset(); controller.keys.clear(); controller.commands = []; }
    });
    if (localWasDead) Object.assign(this.encounter.player, { x: this.local.x, z: this.local.z });
    return localWasDead;
  }

  sendHit(to: string, head: boolean, killed: boolean, armorBroken: boolean) { this.send({ type: 'hit', to, head, killed, armorBroken }); }

  broadcast(delta: number, force = false) {
    if (!this.host) return;
    this.worldTimer += delta;
    const interval = this.encounter.zombies.length > 96 ? .1 : 1 / 15;
    if (!force && this.worldTimer < interval) return; this.worldTimer = 0;
    const e = this.encounter;
    const state: WorldState = { type: 'world', seq: ++this.outgoing,
      inputs: this.remotes.map(player => { const controller = this.controllers.get(player.id)!; return { id: player.id, ack: controller.inputSeq, keys: [...controller.keys] }; }),
      players: this.players.map(player => ({ ...player, x: compact(player.x), z: compact(player.z), height: compact(player.height), yaw: compact(player.yaw), pitch: compact(player.pitch), lastDamageAt: compact(player.lastDamageAt), reloadProgress: compact(player.reloadProgress) })),
      zombies: e.zombies.map(zombie => ({ ...zombie, x: compact(zombie.x), z: compact(zombie.z), downTime: compact(zombie.downTime), bornAt: compact(zombie.bornAt),
        ...(zombie.heading === undefined ? {} : { heading: compact(zombie.heading) }), ...(zombie.attackTime === undefined ? {} : { attackTime: compact(zombie.attackTime) }),
        ...(zombie.avoidance === undefined ? {} : { avoidance: compact(zombie.avoidance) }) })), wave: e.wave, wavesCleared: e.wavesCleared, waveSpawned: e.waveSpawned,
      totalSpawned: e.totalSpawned, intermission: compact(e.intermission), elapsed: compact(e.elapsed), kills: e.kills, failed: e.failed };
    this.send(state);
  }
}
