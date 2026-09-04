import { ARENA, CONFIG, PLAYER, SURVIVAL } from './config';
import type { Position, Zombie } from './encounter';
import type { Navigation } from './navigation';

export function turnView(yaw: number, pitch: number, dx: number, dy: number) {
  return {
    yaw: yaw - dx * CONFIG.camera.sensitivity,
    pitch: Math.max(-CONFIG.camera.pitchLimit, Math.min(CONFIG.camera.pitchLimit, pitch - dy * CONFIG.camera.sensitivity)),
  };
}

/** 按朝向移动，斜向归一化；逐小步碰撞与沿墙滑动共用导航占地。 */
export function movePlayer(position: Position, yaw: number, keys: ReadonlySet<string>, delta: number, navigation: Navigation, zombies: readonly Zombie[]) {
  const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
  const side = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  const length = Math.hypot(forward, side);
  if (!length || delta <= 0) return;
  const dx = (side * Math.cos(yaw) - forward * Math.sin(yaw)) / length * PLAYER.speed;
  const dz = (-forward * Math.cos(yaw) - side * Math.sin(yaw)) / length * PLAYER.speed;
  const clear = (next: Position) => navigation.clear(position, next) && zombies.every(z => z.health <= 0
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
