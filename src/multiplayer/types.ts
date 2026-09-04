import type { Zombie } from '../game/encounter';

export interface Member { id: string; name: string; }
export interface Room { id: string; name: string; owner: string; members: Member[]; memberCount?: number; playing: boolean; }
export interface SteamStatus { available: boolean; id: string; name: string; message: string; appId: number; room: Room | null; }
export interface Match { session: string; host: string; local: string; members: Member[]; }
export type SteamEvent = { type: 'status'; status: SteamStatus } | { type: 'start'; match: Match }
  | { type: 'packet'; from: string; data: unknown } | { type: 'error'; message: string } | { type: 'left'; message: string };
export interface SteamBridge {
  status(): Promise<SteamStatus>; create(name: string): Promise<Room>; search(): Promise<Room[]>;
  join(id: string): Promise<Room>; leave(): Promise<void>; start(): Promise<void>;
  send(data: unknown): void; onEvent(callback: (event: SteamEvent) => void): () => void;
}
declare global { interface Window { steamCoop?: SteamBridge; } }
export interface Pawn extends Member {
  x: number; z: number; height: number; yaw: number; pitch: number; health: number; lastDamageAt: number; weapon: number; shots: number;
}
export type Command = { type: 'input'; seq: number; keys: string[]; yaw: number; pitch: number; jump: number }
  | { type: 'fire'; seq: number; yaw: number; pitch: number }
  | { type: 'reload' | 'weapon'; seq: number; index: number };
export interface WorldState {
  type: 'world'; seq: number; players: Pawn[]; zombies: Zombie[]; wave: number; wavesCleared: number;
  waveSpawned: number; totalSpawned: number; intermission: number; elapsed: number; kills: number; failed: boolean;
}
export const movementKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
const finite = (n: unknown, max: number) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= max;
export function validCommand(v: unknown): v is Command {
  if (!v || typeof v !== 'object') return false;
  const p = v as Command;
  if (!Number.isSafeInteger(p.seq) || p.seq < 0) return false;
  if (p.type === 'input') return Array.isArray(p.keys) && p.keys.length <= 4 && p.keys.every(k => movementKeys.includes(k))
    && finite(p.yaw, 1e6) && finite(p.pitch, 1.49) && Number.isSafeInteger(p.jump) && p.jump >= 0;
  if (p.type === 'fire') return finite(p.yaw, 1e6) && finite(p.pitch, 1.49);
  return (p.type === 'reload' || p.type === 'weapon') && Number.isInteger(p.index) && p.index >= 0 && p.index < 6;
}
export function validWorld(v: unknown, members: Member[]): v is WorldState {
  if (!v || typeof v !== 'object') return false;
  const s = v as WorldState;
  return s.type === 'world' && Number.isSafeInteger(s.seq) && s.seq >= 0 && typeof s.failed === 'boolean'
    && [s.wave, s.wavesCleared, s.waveSpawned, s.totalSpawned, s.kills].every(n => Number.isSafeInteger(n) && n >= 0)
    && s.wave >= 1 && s.wavesCleared <= s.wave && finite(s.elapsed, 1e8) && s.elapsed >= 0 && finite(s.intermission, 5) && s.intermission >= 0
    && Array.isArray(s.players) && s.players.length === 2 && s.players.every(p => p && typeof p === 'object') && new Set(s.players.map(p => p.id)).size === 2
    && s.players.every(p => members.some(m => m.id === p.id) && typeof p.name === 'string' && p.name.length <= 128
      && finite(p.x, 22) && finite(p.z, 48) && finite(p.height, 3) && p.height >= 0
      && finite(p.yaw, 1e6) && finite(p.pitch, 1.49) && finite(p.health, 100) && p.health >= 0
      && Number.isFinite(p.lastDamageAt) && Number.isInteger(p.weapon) && p.weapon >= 0 && p.weapon < 6
      && Number.isSafeInteger(p.shots) && p.shots >= 0)
    && Array.isArray(s.zombies) && s.zombies.length <= 256 && s.zombies.every(z => z && typeof z === 'object') && new Set(s.zombies.map(z => z.id)).size === s.zombies.length
    && s.zombies.every(z => Number.isSafeInteger(z.id) && z.id >= 0 && ['normal', 'cone', 'bucket'].includes(z.kind)
      && finite(z.x, 22) && finite(z.z, 48) && finite(z.health, 400) && z.health >= 0 && finite(z.armorHealth, 300)
      && z.armorHealth >= 0 && finite(z.maxHealth, 400) && z.maxHealth > 0 && finite(z.downTime, 10) && z.downTime >= 0 && finite(z.bornAt, 1e8)
      && (z.attacking === undefined || typeof z.attacking === 'boolean')
      && (z.heading === undefined || finite(z.heading, 1e6)) && (z.attackTime === undefined || finite(z.attackTime, 2) && z.attackTime >= 0));
}
