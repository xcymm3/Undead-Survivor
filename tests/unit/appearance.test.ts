import { describe, expect, it } from 'vitest';
import { APPEARANCE_COLORS, CHARACTER_PRESETS, DEFAULT_APPEARANCE, isValidAppearance, normalizeAppearance, randomAppearance } from '../../src/multiplayer/appearance';

describe('多人角色外貌', () => {
  it('接受六种角色与调色板索引并修正非法输入', () => {
    expect(CHARACTER_PRESETS).toHaveLength(6); expect(APPEARANCE_COLORS).toHaveLength(6);
    expect(normalizeAppearance({ character: 'worker-female', primary: 4, accent: 2 })).toEqual({ character: 'worker-female', primary: 4, accent: 2 });
    expect(normalizeAppearance({ character: 'zombie', primary: 99, accent: -1 })).toEqual(DEFAULT_APPEARANCE);
    expect(isValidAppearance({ accent: 2, character: 'worker-female', primary: 4 })).toBe(true);
    expect(isValidAppearance({ character: 'worker-female', primary: 8, accent: 2 })).toBe(false);
  });

  it('每局随机选择角色和两种不同配色，不依赖保存的外貌', () => {
    const low = randomAppearance(() => 0), high = randomAppearance(() => .999);
    expect(low).toEqual({ character: 'soldier-male', primary: 0, accent: 1 });
    expect(high).toEqual({ character: 'worker-female', primary: 5, accent: 4 });
    expect(isValidAppearance(low)).toBe(true); expect(isValidAppearance(high)).toBe(true);
    expect(low.primary).not.toBe(low.accent); expect(high.primary).not.toBe(high.accent);
  });
});
