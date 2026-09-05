import { ARENA, CONFIG, PLAYER, zombieContactRadius } from './config';
import type { Position, Zombie } from './encounter';
import { isWater } from './terrain';
import type { Navigation } from './navigation';

/** 过滤 Pointer Lock 在 Windows 光标回绕时产生的半屏/整屏瞬时位移。 */
export function filterPointerMovement(dx: number, dy: number, width: number, height: number, sensitivity: number = CONFIG.camera.sensitivity) {
  const maximum = Math.min(Math.PI / 2 / sensitivity, Math.PI / 2 / CONFIG.camera.sensitivity);
  const clean = (value: number, extent: number) => Number.isFinite(value) && Math.abs(value) < Math.min(maximum, Math.max(240, extent * 0.45)) ? value : 0;
  return { dx: clean(dx, width), dy: clean(dy, height) };
}

export function turnView(yaw: number, pitch: number, dx: number, dy: number, sensitivity: number = CONFIG.camera.sensitivity) {
  return {
    yaw: yaw - dx * sensitivity,
    pitch: Math.max(-CONFIG.camera.pitchLimit, Math.min(CONFIG.camera.pitchLimit, pitch - dy * sensitivity)),
  };
}

function movementDirection(yaw: number, keys: ReadonlySet<string>) {
  const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
  const side = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  const length = Math.hypot(forward, side);
  if (!length) return null;
  return {
    x: (side * Math.cos(yaw) - forward * Math.sin(yaw)) / length,
    z: (-forward * Math.cos(yaw) - side * Math.sin(yaw)) / length,
  };
}

/** 空中移动始终朝当前视角正前方，不读取键盘方向。 */
function airborneDirection(yaw: number): Position {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

/** 按固定的世界坐标方向移动；逐小步碰撞与沿墙滑动共用导航占地。 */
function movePlayerInDirection(position: Position, direction: Position | null, delta: number, navigation: Navigation, zombies: readonly Zombie[], height = 0) {
  if (!direction || delta <= 0) return;
  const dx = direction.x * PLAYER.speed;
  const dz = direction.z * PLAYER.speed;
  const clear = (next: Position) => navigation.clear(position, next, true) && zombies.every(z => z.health <= 0 || height >= PLAYER.zombieClearanceHeight
    || Math.hypot(next.x - z.x, next.z - z.z) >= zombieContactRadius(z.kind) - 1e-6
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

/** 按当前朝向移动，斜向归一化。 */
export function movePlayer(position: Position, yaw: number, keys: ReadonlySet<string>, delta: number, navigation: Navigation, zombies: readonly Zombie[], height = 0) {
  movePlayerInDirection(position, movementDirection(yaw, keys), delta, navigation, zombies, height);
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
    if (this.requested && this.grounded) {
      this.velocity = PLAYER.jumpSpeed;
      this.grounded = false;
    }
    this.requested = false;
    for (let remaining = delta; remaining > 1e-8;) {
      const step = Math.min(remaining, 0.01); remaining -= step;
      const wasGrounded = this.grounded;
      movePlayerInDirection(position, wasGrounded ? movementDirection(yaw, keys) : airborneDirection(yaw), step, navigation, zombies, this.height);
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
