import { describe, expect, it } from 'vitest';
import { DEFAULT_GRAPHICS_SETTINGS, GRAPHICS_PRESETS, GRAPHICS_STORAGE_KEY, loadGraphicsSettings, matchingGraphicsPreset, presetSettings, sanitizeGraphicsSettings } from '../../src/game/graphics';

describe('graphics settings', () => {
  it('提供五档彼此可识别的画质预设', () => {
    expect(Object.keys(GRAPHICS_PRESETS)).toEqual(['ultra-performance', 'performance', 'balanced', 'quality', 'ultra-quality']);
    for (const preset of Object.keys(GRAPHICS_PRESETS) as (keyof typeof GRAPHICS_PRESETS)[]) {
      expect(matchingGraphicsPreset(presetSettings(preset))).toBe(preset);
    }
  });

  it('手动修改任一选项后标记为自定义', () => {
    expect(matchingGraphicsPreset({ ...presetSettings('balanced'), frameLimit: 120 })).toBe('custom');
  });

  it('过滤损坏或越界的本机设置', () => {
    expect(sanitizeGraphicsSettings({ resolutionScale: 9, antiAliasing: 'taa', shadows: 'high', effects: 'low', viewDistance: 'far', frameLimit: 144, pixelated: true })).toEqual({
      ...DEFAULT_GRAPHICS_SETTINGS, shadows: 'high', effects: 'low', viewDistance: 'far', pixelated: true,
    });
  });

  it('读取新版设置并兼容旧版三档清晰度', () => {
    const custom = { ...presetSettings('quality'), frameLimit: 120 as const };
    const current = { getItem: (key: string) => key === GRAPHICS_STORAGE_KEY ? JSON.stringify(custom) : null };
    expect(loadGraphicsSettings(current)).toEqual(custom);
    const legacy = { getItem: (key: string) => key === 'undead-survivor.render-quality' ? 'performance' : null };
    expect(loadGraphicsSettings(legacy)).toEqual(GRAPHICS_PRESETS.performance);
  });
});
