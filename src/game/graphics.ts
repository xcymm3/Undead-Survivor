export type GraphicsPreset = 'ultra-performance' | 'performance' | 'balanced' | 'quality' | 'ultra-quality';
export type ActiveGraphicsPreset = GraphicsPreset | 'custom';
export type ResolutionScale = 0.5 | 0.67 | 0.75 | 1;
export type AntiAliasing = 'off' | 'fxaa' | 'smaa';
export type ShadowQuality = 'off' | 'low' | 'medium' | 'high' | 'ultra';
export type EffectsQuality = 'low' | 'medium' | 'high';
export type ViewDistance = 'near' | 'medium' | 'far';
export type FrameLimit = 30 | 60 | 120 | 0;

export interface GraphicsSettings {
  resolutionScale: ResolutionScale;
  antiAliasing: AntiAliasing;
  shadows: ShadowQuality;
  effects: EffectsQuality;
  viewDistance: ViewDistance;
  frameLimit: FrameLimit;
  pixelated: boolean;
}

export const GRAPHICS_STORAGE_KEY = 'undead-survivor.graphics';

export const GRAPHICS_PRESETS: Record<GraphicsPreset, GraphicsSettings> = {
  'ultra-performance': { resolutionScale: 0.5, antiAliasing: 'off', shadows: 'off', effects: 'low', viewDistance: 'near', frameLimit: 60, pixelated: true },
  performance: { resolutionScale: 0.67, antiAliasing: 'fxaa', shadows: 'low', effects: 'low', viewDistance: 'medium', frameLimit: 60, pixelated: false },
  balanced: { resolutionScale: 0.75, antiAliasing: 'fxaa', shadows: 'medium', effects: 'medium', viewDistance: 'medium', frameLimit: 60, pixelated: false },
  quality: { resolutionScale: 1, antiAliasing: 'fxaa', shadows: 'high', effects: 'high', viewDistance: 'far', frameLimit: 60, pixelated: false },
  'ultra-quality': { resolutionScale: 1, antiAliasing: 'smaa', shadows: 'ultra', effects: 'high', viewDistance: 'far', frameLimit: 0, pixelated: false },
};

export const DEFAULT_GRAPHICS_SETTINGS: GraphicsSettings = { ...GRAPHICS_PRESETS.quality };

const allowed = {
  resolutionScale: [0.5, 0.67, 0.75, 1],
  antiAliasing: ['off', 'fxaa', 'smaa'],
  shadows: ['off', 'low', 'medium', 'high', 'ultra'],
  effects: ['low', 'medium', 'high'],
  viewDistance: ['near', 'medium', 'far'],
  frameLimit: [30, 60, 120, 0],
} as const;

function includes<T>(values: readonly T[], value: unknown): value is T { return values.includes(value as T); }

export function sanitizeGraphicsSettings(value: unknown): GraphicsSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_GRAPHICS_SETTINGS };
  const candidate = value as Partial<GraphicsSettings>;
  return {
    resolutionScale: includes(allowed.resolutionScale, candidate.resolutionScale) ? candidate.resolutionScale : DEFAULT_GRAPHICS_SETTINGS.resolutionScale,
    antiAliasing: includes(allowed.antiAliasing, candidate.antiAliasing) ? candidate.antiAliasing : DEFAULT_GRAPHICS_SETTINGS.antiAliasing,
    shadows: includes(allowed.shadows, candidate.shadows) ? candidate.shadows : DEFAULT_GRAPHICS_SETTINGS.shadows,
    effects: includes(allowed.effects, candidate.effects) ? candidate.effects : DEFAULT_GRAPHICS_SETTINGS.effects,
    viewDistance: includes(allowed.viewDistance, candidate.viewDistance) ? candidate.viewDistance : DEFAULT_GRAPHICS_SETTINGS.viewDistance,
    frameLimit: includes(allowed.frameLimit, candidate.frameLimit) ? candidate.frameLimit : DEFAULT_GRAPHICS_SETTINGS.frameLimit,
    pixelated: typeof candidate.pixelated === 'boolean' ? candidate.pixelated : DEFAULT_GRAPHICS_SETTINGS.pixelated,
  };
}

export function presetSettings(preset: GraphicsPreset) { return { ...GRAPHICS_PRESETS[preset] }; }

export function matchingGraphicsPreset(settings: GraphicsSettings): ActiveGraphicsPreset {
  const match = (Object.keys(GRAPHICS_PRESETS) as GraphicsPreset[]).find(preset => {
    const values = GRAPHICS_PRESETS[preset];
    return (Object.keys(values) as (keyof GraphicsSettings)[]).every(key => values[key] === settings[key]);
  });
  return match ?? 'custom';
}

export function loadGraphicsSettings(storage: Pick<Storage, 'getItem'>): GraphicsSettings {
  try {
    const saved = storage.getItem(GRAPHICS_STORAGE_KEY);
    if (saved) return sanitizeGraphicsSettings(JSON.parse(saved));
    // 兼容 0.6.0 之前的三档清晰度设置。
    const legacy = storage.getItem('undead-survivor.render-quality');
    if (legacy === 'performance') return presetSettings('performance');
    if (legacy === 'balanced') return presetSettings('balanced');
    if (legacy === 'native') return presetSettings('quality');
  } catch { /* 存储不可用或内容损坏时恢复默认画质。 */ }
  return { ...DEFAULT_GRAPHICS_SETTINGS };
}
