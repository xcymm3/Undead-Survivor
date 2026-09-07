import { afterEach, expect, it, vi } from 'vitest';
import { Scene } from 'three';
import { createWorld } from '../../src/game/world';
import { Navigation } from '../../src/game/navigation';
import { BRIDGES } from '../../src/game/terrain';

afterEach(() => vi.unstubAllGlobals());
it('桥牌和桥柱占地阻挡穿越，两座桥中央保持可通行', () => {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ fillRect() {}, strokeRect() {}, fillText() {} }) }) });
  const { obstacles } = createWorld(new Scene());
  const navigation = new Navigation(obstacles, true);
  for (const bridge of BRIDGES) {
    const sign = obstacles.find(o => o.id === `${bridge.id}-sign`)!;
    expect(sign.maxX - sign.minX).toBeCloseTo(3.3);
    const x = (sign.minX + sign.maxX) / 2;
    expect(navigation.clear({ x, z: sign.minZ - 2 }, { x, z: sign.maxZ + 2 }, true)).toBe(false);
    const posts = obstacles.filter(o => o.id.startsWith(`${bridge.id}-post-`));
    expect(posts).toHaveLength(4);
    for (const post of posts) expect(navigation.clear({ x: post.minX, z: post.minZ }, { x: post.maxX, z: post.maxZ }, true)).toBe(false);
    expect(navigation.clear({ x: bridge.x, z: bridge.z - 5 }, { x: bridge.x, z: bridge.z + 5 })).toBe(true);
  }
});
