import { ARENA, CONFIG, PLAYER, SURVIVAL } from './config';
import type { Position, Zombie } from './encounter';
import { isWater } from './terrain';
import type { Navigation } from './navigation';

export function turnView(yaw: number, pitch: number, dx: number, dy: number) {
  return {
    yaw: yaw - dx * CONFIG.camera.sensitivity,
    pitch: Math.max(-CONFIG.camera.pitchLimit, Math.min(CONFIG.camera.pitchLimit, pitch - dy * CONFIG.camera.sensitivity)),
  };
}

/** 按朝向移动，斜向归一化；逐小步碰撞与沿墙滑动共用导航占地。 */
export function movePlayer(position: Position, yaw: number, keys: ReadonlySet<string>, delta: number, navigation: Navigation, zombies: readonly Zombie[], height = 0) {
  const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
  const side = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  const length = Math.hypot(forward, side);
  if (!length || delta <= 0) return;
  const dx = (side * Math.cos(yaw) - forward * Math.sin(yaw)) / length * PLAYER.speed;
  const dz = (-forward * Math.cos(yaw) - side * Math.sin(yaw)) / length * PLAYER.speed;
  const clear = (next: Position) => navigation.clear(position, next, true) && zombies.every(z => z.health <= 0 || height >= PLAYER.zombieClearanceHeight
    || Math.hypot(next.x - z.x, next.z - z.z) >= SURVIVAL.contactRadius - 1e-6
    || Math.hypot(next.x - z.x, next.z - z.z) > Math.hypot(position.x - z.x, position.z - z.z));
  for (let remaining = delta; remaining > 1e-8;) {
    const step = Math.min(remaining, 0.025); remaining -= step;
    const next = {
      x: Math.max(ARENA.minX + PLAYER.radius, Math.min(ARENA.maxX - PLAYER.radius, position.x + dx * step)),
      z: Math.max(ARENA.minZ + PLAYER.radius, Math.min(ARENA.maxZ - PLAYER.radius, position.z + dz * step)),
    };
    if (clear(next)) Object.assign(position, next);
    else {
      const horizontal = { x: next.x, z: position.z };
      if (clear(horizontal)) position.x = horizontal.x;
      const vertical = { x: position.x, z: next.z };
      if (clear(vertical)) position.z = vertical.z;
    }
  }
}

/** 跳跃和落水使用有效游玩时间；暂停不重置空中速度，也不能在空中再次起跳。 */
export class PlayerMotion {
  height = 0;
  velocity = 0;
  grounded = true;
  private requested = false;
  jump() { if (this.grounded) this.requested = true; }
  clearInput() { this.requested = false; }
  reset() { this.height = 0; this.velocity = 0; this.grounded = true; this.requested = false; }
  update(position: Position, yaw: number, keys: ReadonlySet<string>, delta: number, navigation: Navigation, zombies: readonly Zombie[]) {
    if (!Number.isFinite(delta) || delta <= 0) return false;
    if (this.grounded && navigation.river && isWater(position)) return true;
    if (this.requested && this.grounded) { this.velocity = PLAYER.jumpSpeed; this.grounded = false; }
    this.requested = false;
    for (let remaining = delta; remaining > 1e-8;) {
      const step = Math.min(remaining, 0.01); remaining -= step;
      movePlayer(position, yaw, keys, step, navigation, zombies, this.height);
      if (!this.grounded) {
        this.height += this.velocity * step - PLAYER.gravity * step * step / 2;
        this.velocity -= PLAYER.gravity * step;
        if (this.height <= 1e-8 && this.velocity < 0) { this.height = 0; this.velocity = 0; this.grounded = true; }
      }
      if (this.grounded && navigation.river && isWater(position)) return true;
    }
    return false;
  }
}
