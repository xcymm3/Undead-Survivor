import { CROWD, SURVIVAL } from './config';
import type { Position, Zombie } from './encounter';
import type { Navigation } from './navigation';

interface Leg { start: Position; vx: number; vz: number; duration: number; }
interface Motion { zombie: Zombie; legs: Leg[]; avoidance: number; contactAt: number; }

/** 连续检测每条实际移动线段首次进入接触范围的时间，而非依赖剩余路径估算。 */
function contactTime(leg: Leg, player: Position) {
  const x = leg.start.x - player.x, z = leg.start.z - player.z;
  const c = x * x + z * z - SURVIVAL.contactRadius ** 2;
  if (c <= 1e-8) return 0;
  const speed = Math.hypot(leg.vx, leg.vz);
  if (speed === 0 || Math.hypot(x, z) - SURVIVAL.contactRadius > speed * leg.duration + 1e-8) return Infinity;
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

  private rebuild(zombies: Zombie[]) {
    this.grid.clear();
    for (const zombie of zombies) if (zombie.health > 0) {
      const key = `${Math.floor(zombie.x / CROWD.separationRadius)},${Math.floor(zombie.z / CROWD.separationRadius)}`;
      const cell = this.grid.get(key);
      if (cell) cell.push(zombie); else this.grid.set(key, [zombie]);
    }
  }

  private separation(zombie: Zombie, tx: number, tz: number) {
    const cx = Math.floor(zombie.x / CROWD.separationRadius), cz = Math.floor(zombie.z / CROWD.separationRadius);
    let force = 0;
    for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) {
      for (const other of this.grid.get(`${ix},${iz}`) ?? []) {
        if (other.id === zombie.id) continue;
        const dx = zombie.x - other.x, dz = zombie.z - other.z;
        const distance = Math.hypot(dx, dz);
        if (distance >= CROWD.separationRadius) continue;
        const lateral = distance > 1e-8 ? (dx * tx + dz * tz) / distance : 0;
        // 完全重叠或首尾排队时也能分开；按 ID 固定选择方向，不用逐帧随机摇摆。
        const side = Math.abs(lateral) < 0.1 ? (zombie.id < other.id ? -1 : 1) : lateral;
        force += side * (1 - distance / CROWD.separationRadius);
      }
    }
    return Math.max(-1, Math.min(1, force));
  }

  private plan(zombie: Zombie, step: number, speed: number): Motion {
    const player = this.player;
    const motion: Motion = { zombie, legs: [], avoidance: 0, contactAt: Infinity };
    const position = { x: zombie.x, z: zombie.z };
    if (step > 0) {
      const target = this.navigation ? this.navigation.waypoint(position) : player;
      if (!target) return motion;
      const dx = target.x - position.x, dz = target.z - position.z;
      const distance = Math.hypot(dx, dz);
      const ux = distance > 0 ? dx / distance : 0, uz = distance > 0 ? dz / distance : 0;
      const force = this.separation(zombie, uz, -ux);
      // 没有拥挤就立刻回到最短路线，不能因旧避让状态继续横向漂移。
      motion.avoidance = force === 0 ? 0 : (zombie.avoidance ?? 0) + (force - (zombie.avoidance ?? 0)) * (1 - Math.exp(-CROWD.steeringDamping * step));
      const remaining = Math.hypot(position.x - player.x, position.z - player.z) - SURVIVAL.contactRadius;
      const lateral = motion.avoidance * Math.min(CROWD.maxLateralSpeed, speed * CROWD.lateralFraction) * Math.max(0, Math.min(1, remaining / CROWD.arrivalFade));
      const forward = Math.sqrt(Math.max(0, speed * speed - lateral * lateral));
      const leg = { start: position, vx: ux * forward + uz * lateral, vz: uz * forward - ux * lateral, duration: Math.min(step, distance / speed) };
      if (this.navigation && !this.navigation.clear(position, { x: position.x + leg.vx * leg.duration, z: position.z + leg.vz * leg.duration })) {
        // 静态碰撞优先于拥挤避让：取消横向力，沿已验证可通行的寻路线段前进。
        motion.avoidance = 0; leg.vx = ux * speed; leg.vz = uz * speed;
        if (!this.navigation.clear(position, { x: position.x + leg.vx * leg.duration, z: position.z + leg.vz * leg.duration })) return motion;
      }
      motion.legs.push(leg);
    }
    let elapsed = 0;
    for (const leg of motion.legs) { motion.contactAt = Math.min(motion.contactAt, elapsed + contactTime(leg, player)); elapsed += leg.duration; }
    return motion;
  }

  advance(zombies: Zombie[], step: number, speed: number, player: Position = { x: SURVIVAL.playerX, z: SURVIVAL.playerZ }) {
    this.player = player;
    this.navigation?.setGoal(player);
    this.rebuild(zombies);
    const motions = zombies.filter(zombie => zombie.health > 0).map(zombie => this.plan(zombie, step, speed));
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
    return { duration: step };
  }
}
