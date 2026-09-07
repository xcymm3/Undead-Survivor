import { CROWD, ENEMY_RULES, SURVIVAL, zombieContactRadius } from './config';
import type { Position, Zombie } from './encounter';
import type { Navigation } from './navigation';

interface Leg { start: Position; vx: number; vz: number; duration: number; }
interface Motion { zombie: Zombie; legs: Leg[]; avoidance: number; contactAt: number; blocked: boolean; waterBlocked: boolean; }

export function zombieMoveSpeed(zombie: Zombie, baseSpeed: number) {
  if ((zombie.ragePause ?? 0) > 0 || zombie.specialState === 'windup' || zombie.specialState === 'stunned') return 0;
  if (zombie.kind === 'imp') return Math.min(baseSpeed * ENEMY_RULES.imp.speed, ENEMY_RULES.imp.speedCap);
  if (zombie.kind === 'shield') return Math.min(baseSpeed * ENEMY_RULES.shield.speed, ENEMY_RULES.shield.speedCap);
  if (zombie.kind === 'berserker') return Math.min(baseSpeed * (zombie.enraged ? ENEMY_RULES.berserker.rageSpeed : ENEMY_RULES.berserker.speed), ENEMY_RULES.berserker.speedCap);
  if (zombie.kind === 'giant') return baseSpeed * ENEMY_RULES.giant.speed;
  if (zombie.kind === 'football') {
    if (zombie.specialState === 'charging') return Math.min(baseSpeed * ENEMY_RULES.football.chargeSpeed, ENEMY_RULES.football.chargeSpeedCap);
    const multiplier = zombie.armorHealth > 0 ? ENEMY_RULES.football.speed : ENEMY_RULES.football.brokenSpeed;
    return Math.min(baseSpeed * multiplier, ENEMY_RULES.football.speedCap);
  }
  if (zombie.kind === 'bucket') return baseSpeed * .9;
  return baseSpeed;
}

function separationRadius(zombie: Zombie) {
  if (zombie.kind === 'imp') return ENEMY_RULES.imp.separationRadius;
  if (zombie.kind === 'giant') return ENEMY_RULES.giant.separationRadius;
  return CROWD.separationRadius;
}

function contactTime(leg: Leg, player: Position, radius: number) {
  const x = leg.start.x - player.x, z = leg.start.z - player.z;
  const c = x * x + z * z - radius ** 2;
  if (c <= 1e-8) return 0;
  const speed = Math.hypot(leg.vx, leg.vz);
  if (speed === 0 || Math.hypot(x, z) - radius > speed * leg.duration + 1e-8) return Infinity;
  const b = x * leg.vx + z * leg.vz;
  const discriminant = b * b - speed * speed * c;
  if (b >= 0 || discriminant < -1e-8) return Infinity;
  const time = c / (-b + Math.sqrt(Math.max(0, discriminant)));
  return time <= leg.duration + 1e-8 ? Math.max(0, Math.min(leg.duration, time)) : Infinity;
}

/** 先从同一帧位置计算所有方向，再统一移动，避免更新顺序造成单向推挤。 */
export class CrowdMovement {
  private grid = new Map<string, Zombie[]>();
  constructor(private navigation?: Navigation) {}
  private player: Position = { x: SURVIVAL.playerX, z: SURVIVAL.playerZ };
  private readonly gridSize = ENEMY_RULES.giant.separationRadius;

  private rebuild(zombies: Zombie[]) {
    this.grid.clear();
    for (const zombie of zombies) if (zombie.health > 0) {
      const key = `${Math.floor(zombie.x / this.gridSize)},${Math.floor(zombie.z / this.gridSize)}`;
      const cell = this.grid.get(key);
      if (cell) cell.push(zombie); else this.grid.set(key, [zombie]);
    }
  }

  private separation(zombie: Zombie, tx: number, tz: number) {
    const cx = Math.floor(zombie.x / this.gridSize), cz = Math.floor(zombie.z / this.gridSize);
    let force = 0;
    for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) {
      for (const other of this.grid.get(`${ix},${iz}`) ?? []) {
        if (other.id === zombie.id) continue;
        const dx = zombie.x - other.x, dz = zombie.z - other.z;
        const distance = Math.hypot(dx, dz), radius = Math.max(separationRadius(zombie), separationRadius(other));
        if (distance >= radius) continue;
        const lateral = distance > 1e-8 ? (dx * tx + dz * tz) / distance : 0;
        const side = Math.abs(lateral) < .1 ? (zombie.id < other.id ? -1 : 1) : lateral;
        force += side * (1 - distance / radius);
      }
    }
    return Math.max(-1, Math.min(1, force));
  }

  private plan(zombie: Zombie, step: number, baseSpeed: number): Motion {
    const player = this.player;
    const motion: Motion = { zombie, legs: [], avoidance: 0, contactAt: Infinity, blocked: false, waterBlocked: false };
    const position = { x: zombie.x, z: zombie.z }, speed = zombieMoveSpeed(zombie, baseSpeed);
    if (step <= 0 || speed <= 0) return motion;
    const charging = zombie.kind === 'football' && zombie.specialState === 'charging';
    if (charging) zombie.chargeHeading ??= zombie.heading ?? Math.atan2(player.x - position.x, player.z - position.z);
    const target = charging
      ? { x: position.x + Math.sin(zombie.chargeHeading!), z: position.z + Math.cos(zombie.chargeHeading!) }
      : this.navigation ? this.navigation.waypoint(position) : player;
    if (!target) return motion;
    const dx = target.x - position.x, dz = target.z - position.z;
    const distance = Math.hypot(dx, dz);
    const ux = distance > 0 ? dx / distance : 0, uz = distance > 0 ? dz / distance : 0;
    const force = charging ? 0 : this.separation(zombie, uz, -ux);
    motion.avoidance = charging || force === 0 ? 0 : (zombie.avoidance ?? 0)
      + (force - (zombie.avoidance ?? 0)) * (1 - Math.exp(-CROWD.steeringDamping * step));
    const remaining = Math.hypot(position.x - player.x, position.z - player.z) - zombieContactRadius(zombie.kind);
    const lateral = charging ? 0 : motion.avoidance * Math.min(CROWD.maxLateralSpeed, speed * CROWD.lateralFraction)
      * Math.max(0, Math.min(1, remaining / CROWD.arrivalFade));
    const forward = Math.sqrt(Math.max(0, speed * speed - lateral * lateral));
    const leg = { start: position, vx: ux * forward + uz * lateral, vz: uz * forward - ux * lateral,
      duration: charging ? step : distance > 0 ? Math.min(step, distance / speed) : step };
    const destination = { x: position.x + leg.vx * leg.duration, z: position.z + leg.vz * leg.duration };
    if (this.navigation && !this.navigation.clear(position, destination)) {
      if (charging) {
        motion.blocked = true;
        motion.waterBlocked = this.navigation.clear(position, destination, true);
        return motion;
      }
      motion.avoidance = 0; leg.vx = ux * speed; leg.vz = uz * speed;
      const direct = { x: position.x + leg.vx * leg.duration, z: position.z + leg.vz * leg.duration };
      if (!this.navigation.clear(position, direct)) return motion;
    }
    motion.legs.push(leg);
    let elapsed = 0;
    for (const item of motion.legs) {
      motion.contactAt = Math.min(motion.contactAt, elapsed + contactTime(item, player, zombieContactRadius(zombie.kind)));
      elapsed += item.duration;
    }
    return motion;
  }

  advance(zombies: Zombie[], step: number, baseSpeed: number, player: Position = { x: SURVIVAL.playerX, z: SURVIVAL.playerZ }) {
    this.player = player;
    this.navigation?.setGoal(player);
    this.rebuild(zombies);
    const motions = zombies.filter(zombie => zombie.health > 0).map(zombie => this.plan(zombie, step, baseSpeed));
    for (const motion of motions) {
      const zombie = motion.zombie;
      let remaining = Math.min(step, motion.contactAt);
      for (const leg of motion.legs) {
        const time = Math.min(remaining, leg.duration);
        if (time > 0) {
          zombie.x = leg.start.x + leg.vx * time; zombie.z = leg.start.z + leg.vz * time;
          zombie.heading = Math.atan2(leg.vx, leg.vz);
        }
        remaining -= time;
        if (remaining <= 0) break;
      }
      zombie.avoidance = motion.avoidance;
    }
    return { duration: step, blockedIds: motions.filter(motion => motion.blocked).map(motion => motion.zombie.id),
      waterBlockedIds: motions.filter(motion => motion.waterBlocked).map(motion => motion.zombie.id) };
  }
}
