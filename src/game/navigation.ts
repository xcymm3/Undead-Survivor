import { ARENA, SURVIVAL } from './config';
import { riverObstacles } from './terrain';
import type { Position, SpawnPosition } from './encounter';

export interface Obstacle { id: string; minX: number; maxX: number; minZ: number; maxZ: number; }
// 包含伸出的手臂；只把实体的地面占地计入导航，树冠、草和高架横杆不封路。
export const NAV_RADIUS = 0.95;
const CELL = 0.65, MIN_X = ARENA.minX, MIN_Z = ARENA.minZ,
  WIDTH = Math.ceil((ARENA.maxX - MIN_X) / CELL) + 1, HEIGHT = Math.ceil((ARENA.maxZ - MIN_Z) / CELL) + 1, HASH = 4;

const DIRECTIONS = [-1, 0, 1].flatMap(dz => [-1, 0, 1].filter(dx => dx || dz).map(dx => ({ dx, dz, cost: Math.hypot(dx, dz) * CELL })));

/** 静态占地缓存，玩家跨网格时重建共享流场；直线路径始终追踪玩家实时位置。 */
export class Navigation {
  private goal: Position = { x: SURVIVAL.playerX, z: SURVIVAL.playerZ };
  private goalIndex = -1;
  private buckets = new Map<string, (Obstacle & { water?: boolean })[]>();
  private connections = new Uint8Array(WIDTH * HEIGHT);
  private blocked = new Uint8Array(WIDTH * HEIGHT);
  private distance = new Float64Array(WIDTH * HEIGHT).fill(Infinity);
  private next = new Int32Array(WIDTH * HEIGHT).fill(-1);
  constructor(readonly obstacles: readonly Obstacle[], readonly river = false) {
    for (const obstacle of [...obstacles, ...(river ? riverObstacles() : [])]) {
      const o = { ...obstacle, id: obstacle.id, minX: obstacle.minX - NAV_RADIUS, maxX: obstacle.maxX + NAV_RADIUS, minZ: obstacle.minZ - NAV_RADIUS, maxZ: obstacle.maxZ + NAV_RADIUS };
      for (let x = Math.floor(o.minX / HASH); x <= Math.floor(o.maxX / HASH); x++) for (let z = Math.floor(o.minZ / HASH); z <= Math.floor(o.maxZ / HASH); z++) {
        const key = `${x},${z}`, bucket = this.buckets.get(key);
        if (bucket) bucket.push(o); else this.buckets.set(key, [o]);
      }
    }
    for (let i = 0; i < this.blocked.length; i++) this.blocked[i] = this.clear(this.point(i), this.point(i)) ? 0 : 1;
    // 相邻网格间的连续碰撞只在建图时计算，重建流场复用八方向连通掩码。
    for (let index = 0; index < this.blocked.length; index++) {
      if (this.blocked[index]) continue;
      const x = index % WIDTH, z = Math.floor(index / WIDTH);
      DIRECTIONS.forEach(({ dx, dz }, direction) => {
        if (x + dx < 0 || x + dx >= WIDTH || z + dz < 0 || z + dz >= HEIGHT) return;
        const next = (z + dz) * WIDTH + x + dx;
        if (!this.blocked[next] && this.clear(this.point(index), this.point(next))) this.connections[index] |= 1 << direction;
      });
    }
    this.setGoal(this.goal);
  }
  private point(index: number): Position { return { x: MIN_X + index % WIDTH * CELL, z: MIN_Z + Math.floor(index / WIDTH) * CELL }; }
  private index(p: Position) {
    const x = Math.round((p.x - MIN_X) / CELL), z = Math.round((p.z - MIN_Z) / CELL);
    return x < 0 || z < 0 || x >= WIDTH || z >= HEIGHT ? -1 : z * WIDTH + x;
  }
  clear(a: Position, b: Position, allowWater = false) {
    if ([a, b].some(p => p.x < ARENA.minX + NAV_RADIUS || p.x > ARENA.maxX - NAV_RADIUS || p.z < ARENA.minZ + NAV_RADIUS || p.z > ARENA.maxZ - NAV_RADIUS)) return false;
    const dx = b.x - a.x, dz = b.z - a.z;
    for (let x = Math.floor(Math.min(a.x, b.x) / HASH); x <= Math.floor(Math.max(a.x, b.x) / HASH); x++) {
      for (let z = Math.floor(Math.min(a.z, b.z) / HASH); z <= Math.floor(Math.max(a.z, b.z) / HASH); z++) {
        for (const o of this.buckets.get(`${x},${z}`) ?? []) {
          if (allowWater && o.water) continue;
          let near = 0, far = 1;
          for (const [start, delta, min, max] of [[a.x, dx, o.minX, o.maxX], [a.z, dz, o.minZ, o.maxZ]]) {
            if (Math.abs(delta) < 1e-12) { if (start < min || start > max) { far = -1; break; } }
            else { const t1 = (min - start) / delta, t2 = (max - start) / delta; near = Math.max(near, Math.min(t1, t2)); far = Math.min(far, Math.max(t1, t2)); }
          }
          if (near <= far) return false;
        }
      }
    }
    return true;
  }
  setGoal(position: Position) {
    this.goal = { ...position };
    let root = this.index(position);
    // 玩家可处于两个网格点之间，选择与玩家连通的最近可通行格。
    if (root < 0) return;
    let best = Infinity, selected = -1;
    const cx = root % WIDTH, cz = Math.floor(root / WIDTH);
    const overWater = this.river && !this.clear(position, position) && this.clear(position, position, true), radius = overWater ? 7 : 2;
    for (let z = Math.max(0, cz - radius); z <= Math.min(HEIGHT - 1, cz + radius); z++) for (let x = Math.max(0, cx - radius); x <= Math.min(WIDTH - 1, cx + radius); x++) {
      const index = z * WIDTH + x, point = this.point(index), distance = Math.hypot(point.x - position.x, point.z - position.z);
      if (!this.blocked[index] && distance < best && this.clear(position, point, overWater)) { best = distance; selected = index; }
    }
    root = selected;
    if (root === this.goalIndex) return;
    this.goalIndex = root;
    this.build(root);
  }
  private build(root: number) {
    this.distance.fill(Infinity); this.next.fill(-1);
    const heap: { index: number; cost: number }[] = [];
    const push = (entry: typeof heap[number]) => {
      heap.push(entry); let i = heap.length - 1;
      while (i > 0) { const parent = (i - 1) >> 1; if (heap[parent].cost <= entry.cost) break; heap[i] = heap[parent]; i = parent; } heap[i] = entry;
    };
    if (root < 0 || this.blocked[root]) return;
    this.distance[root] = 0; push({ index: root, cost: 0 });
    while (heap.length) {
      const entry = heap[0], last = heap.pop()!;
      if (heap.length) {
        let i = 0;
        while (i * 2 + 1 < heap.length) {
          let child = i * 2 + 1; if (child + 1 < heap.length && heap[child + 1].cost < heap[child].cost) child++;
          if (heap[child].cost >= last.cost) break; heap[i] = heap[child]; i = child;
        } heap[i] = last;
      }
      if (entry.cost !== this.distance[entry.index]) continue;
      for (let direction = 0; direction < DIRECTIONS.length; direction++) {
        if (!(this.connections[entry.index] & (1 << direction))) continue;
        const { dx, dz, cost: edgeCost } = DIRECTIONS[direction];
        const index = entry.index + dz * WIDTH + dx, cost = entry.cost + edgeCost;
        if (cost >= this.distance[index]) continue;
        this.distance[index] = cost; this.next[index] = entry.index; push({ index, cost });
      }
    }
  }
  private nearest(p: Position, requireClear: boolean, radius = 3) {
    const center = this.index(p); if (center < 0) return -1;
    let best = -1, distance = Infinity;
    const cx = center % WIDTH, cz = Math.floor(center / WIDTH);
    for (let z = Math.max(0, cz - radius); z <= Math.min(HEIGHT - 1, cz + radius); z++) for (let x = Math.max(0, cx - radius); x <= Math.min(WIDTH - 1, cx + radius); x++) {
      const index = z * WIDTH + x; if (!Number.isFinite(this.distance[index])) continue;
      const point = this.point(index), d = Math.hypot(p.x - point.x, p.z - point.z);
      if (d < distance && (!requireClear || this.clear(p, point))) { best = index; distance = d; }
    }
    return best;
  }
  spawn(position: SpawnPosition): SpawnPosition | null {
    const index = this.nearest(position, false, 12); if (index < 0) return null;
    const point = this.clear(position, position) && this.clear(position, this.point(index)) ? position : this.point(index);
    if (Math.hypot(point.x - this.goal.x, point.z - this.goal.z) < SURVIVAL.spawnSafeRadius) return null;
    return { ...position, ...point };
  }
  waypoint(position: Position): Position | null {
    if (this.clear(position, this.goal)) return this.goal;
    let index = this.nearest(position, true); if (index < 0) return null;
    let target = this.point(index);
    for (let i = 0; i < 18 && this.next[index] >= 0; i++) {
      index = this.next[index]; const next = this.point(index);
      if (!this.clear(position, next)) break;
      target = next;
    }
    return target;
  }
}
