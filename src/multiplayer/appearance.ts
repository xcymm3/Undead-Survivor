export const APPEARANCE_STORAGE_KEY = 'undead-survivor.multiplayer-appearance';

export const CHARACTER_PRESETS = [
  { id: 'soldier-male', label: '男士兵', file: 'Soldier_Male.gltf', primaryMaterials: ['Main', 'Helmet'], accentMaterials: ['DarkGreen'] },
  { id: 'soldier-female', label: '女士兵', file: 'Soldier_Female.gltf', primaryMaterials: ['Main'], accentMaterials: ['DarkGreen', 'Hair'] },
  { id: 'casual-male', label: '男便装', file: 'Casual_Male.gltf', primaryMaterials: ['Shirt'], accentMaterials: ['Pants', 'Belt'] },
  { id: 'casual-female', label: '女便装', file: 'Casual_Female.gltf', primaryMaterials: ['Shirt'], accentMaterials: ['Pants', 'Belt'] },
  { id: 'worker-male', label: '男工人', file: 'Worker_Male.gltf', primaryMaterials: ['Vest', 'Hat'], accentMaterials: ['Shirt', 'Pants'] },
  { id: 'worker-female', label: '女工人', file: 'Worker_Female.gltf', primaryMaterials: ['Vest', 'Hat'], accentMaterials: ['Shirt', 'Pants'] },
] as const;

export const APPEARANCE_COLORS = [
  { label: '松林绿', value: 0x355747 }, { label: '哨站蓝', value: 0x365d73 }, { label: '铁锈红', value: 0x794638 },
  { label: '沙土黄', value: 0x987f4c }, { label: '暗紫红', value: 0x663a4b }, { label: '岩灰色', value: 0x4b595b },
] as const;

export type CharacterId = typeof CHARACTER_PRESETS[number]['id'];
export interface PlayerAppearance { character: CharacterId; primary: number; accent: number; }
export const DEFAULT_APPEARANCE: PlayerAppearance = { character: 'soldier-male', primary: 0, accent: 5 };

export function normalizeAppearance(value: unknown, fallback = DEFAULT_APPEARANCE): PlayerAppearance {
  if (!value || typeof value !== 'object') return { ...fallback };
  const source = value as Partial<PlayerAppearance>;
  const character = CHARACTER_PRESETS.some(item => item.id === source.character) ? source.character as CharacterId : fallback.character;
  const color = (candidate: unknown, defaultValue: number) => Number.isInteger(candidate) && Number(candidate) >= 0 && Number(candidate) < APPEARANCE_COLORS.length ? Number(candidate) : defaultValue;
  return { character, primary: color(source.primary, fallback.primary), accent: color(source.accent, fallback.accent) };
}

export function isValidAppearance(value: unknown): value is PlayerAppearance {
  if (!value || typeof value !== 'object') return false;
  const source = value as Partial<PlayerAppearance>, normalized = normalizeAppearance(value);
  return source.character === normalized.character && source.primary === normalized.primary && source.accent === normalized.accent;
}

export function defaultAppearance(index: number): PlayerAppearance {
  return { character: CHARACTER_PRESETS[index % CHARACTER_PRESETS.length].id, primary: index % APPEARANCE_COLORS.length, accent: (index + 3) % APPEARANCE_COLORS.length };
}

export function loadAppearance(storage: Pick<Storage, 'getItem'> = localStorage) {
  try { return normalizeAppearance(JSON.parse(storage.getItem(APPEARANCE_STORAGE_KEY) ?? 'null')); }
  catch { return { ...DEFAULT_APPEARANCE }; }
}

export function saveAppearance(appearance: PlayerAppearance, storage: Pick<Storage, 'setItem'> = localStorage) {
  const normalized = normalizeAppearance(appearance);
  try { storage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(normalized)); } catch { /* 当前会话仍保留选择。 */ }
  return normalized;
}
