import { SURVIVAL } from './config';
import type { Position, SpawnPosition } from './encounter';

export const SPAWN_ZONES = [
  { id: 'north-west', label: '北侧入口 01', center: { x: -13, z: -45 } },
  { id: 'north-road', label: '北侧入口 02', center: { x: 1, z: -45 } },
  { id: 'north-east', label: '北侧入口 03', center: { x: 12, z: -45 } },
  { id: 'east-north', label: '东侧入口 01', center: { x: 19, z: -36 } },
  { id: 'east-yard', label: '东侧入口 02', center: { x: 19, z: -20 } },
  { id: 'east-south', label: '东侧入口 03', center: { x: 19, z: -4 } },
] as const;

/** 世界坐标固定入口；跳过背后和贴脸点，无安全入口时放弃本次刷新。 */
export class SpawnDirector {
  private remaining: (typeof SPAWN_ZONES[number])[] = [];
  constructor(private random: () => number = Math.random) {}
  reset() { this.remaining = []; }
  next(player: Position, yaw: number, valid: (position: SpawnPosition) => boolean = () => true): SpawnPosition | null {
    for (let attempt = 0; attempt < SPAWN_ZONES.length; attempt++) {
      if (!this.remaining.length) {
        this.remaining = [...SPAWN_ZONES];
        for (let i = this.remaining.length - 1; i > 0; i--) {
          const j = Math.floor(this.random() * (i + 1));
          [this.remaining[i], this.remaining[j]] = [this.remaining[j], this.remaining[i]];
        }
      }
      const zone = this.remaining.pop()!;
      const position = { ...zone.center, spawnZone: zone.id };
      const dx = position.x - player.x, dz = position.z - player.z;
      if (Math.hypot(dx, dz) < SURVIVAL.spawnSafeRadius || -dx * Math.sin(yaw) - dz * Math.cos(yaw) < 0) continue;
      if (valid(position)) return position;
    }
    return null;
  }
}
