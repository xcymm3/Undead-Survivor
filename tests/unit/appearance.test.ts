import { describe, expect, it } from 'vitest';
import { APPEARANCE_COLORS, CHARACTER_PRESETS, DEFAULT_APPEARANCE, isValidAppearance, loadAppearance, normalizeAppearance, saveAppearance } from '../../src/multiplayer/appearance';

describe('多人角色外貌', () => {
  it('接受六种角色与调色板索引并修正非法输入', () => {
    expect(CHARACTER_PRESETS).toHaveLength(6); expect(APPEARANCE_COLORS).toHaveLength(6);
    expect(normalizeAppearance({ character: 'worker-female', primary: 4, accent: 2 })).toEqual({ character: 'worker-female', primary: 4, accent: 2 });
    expect(normalizeAppearance({ character: 'zombie', primary: 99, accent: -1 })).toEqual(DEFAULT_APPEARANCE);
    expect(isValidAppearance({ accent: 2, character: 'worker-female', primary: 4 })).toBe(true);
    expect(isValidAppearance({ character: 'worker-female', primary: 8, accent: 2 })).toBe(false);
  });

  it('外貌只写入本机存储并能恢复', () => {
    const data = new Map<string, string>(), storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    const appearance = saveAppearance({ character: 'casual-female', primary: 3, accent: 1 }, storage);
    expect(loadAppearance(storage)).toEqual(appearance);
  });
});
