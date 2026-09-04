import { ARENA } from './config';
import type { Position } from './encounter';

// 渲染、落水判定和寻路共用同一条折线河岸，不用装饰贴图模拟河流。
export const RIVER_POINTS = [
  { x: -22, z: -14 }, { x: -17, z: -12 }, { x: -12, z: -14 },
  { x: -6, z: -18 }, { x: 0, z: -17 }, { x: 6, z: -12 },
  { x: 12, z: -11 }, { x: 17, z: -13 }, { x: 22, z: -16 },
] as const;
export const RIVER = { halfWidth: 1.25, waterHeight: -0.45, bedHeight: -0.85 } as const;
export function riverCenter(x: number) {
  for (let i = 1; i < RIVER_POINTS.length; i++) {
    const a = RIVER_POINTS[i - 1], b = RIVER_POINTS[i];
    if (x <= b.x) return a.z + (b.z - a.z) * Math.max(0, (x - a.x) / (b.x - a.x));
  }
  return RIVER_POINTS.at(-1)!.z;
}
export const BRIDGES = [-10, 10].map((x, index) => ({
  id: `bridge-${index + 1}`, x, z: riverCenter(x), halfWidth: 2.6, halfLength: 3.6,
}));
export function onBridge(p: Position) {
  return BRIDGES.some(b => Math.abs(p.x - b.x) <= b.halfWidth && Math.abs(p.z - b.z) <= b.halfLength);
}
export function inRiver(p: Position) {
  return p.x >= ARENA.minX && p.x <= ARENA.maxX && Math.abs(p.z - riverCenter(p.x)) < RIVER.halfWidth;
}
export function isWater(p: Position) { return inRiver(p) && !onBridge(p); }

/** 把河槽切成保守的窄矩形并扣掉桥面，供连续线段碰撞使用，避免采样漏过桥角。 */
export function riverObstacles() {
  const xs = [...new Set([
    ...Array.from({ length: 177 }, (_, i) => ARENA.minX + i * 0.25),
    ...RIVER_POINTS.map(p => p.x), ...BRIDGES.flatMap(b => [b.x - b.halfWidth, b.x + b.halfWidth]),
  ])].sort((a, b) => a - b);
  return xs.slice(1).flatMap((maxX, index) => {
    const minX = xs[index];
    let spans = [{ minZ: Math.min(riverCenter(minX), riverCenter(maxX)) - RIVER.halfWidth,
      maxZ: Math.max(riverCenter(minX), riverCenter(maxX)) + RIVER.halfWidth }];
    for (const bridge of BRIDGES) if (minX >= bridge.x - bridge.halfWidth && maxX <= bridge.x + bridge.halfWidth) {
      spans = spans.flatMap(span => [
        { minZ: span.minZ, maxZ: Math.min(span.maxZ, bridge.z - bridge.halfLength) },
        { minZ: Math.max(span.minZ, bridge.z + bridge.halfLength), maxZ: span.maxZ },
      ].filter(span => span.maxZ > span.minZ));
    }
    return spans.map((span, part) => ({ id: `river-${index}-${part}`, minX, maxX, ...span, water: true }));
  });
}
