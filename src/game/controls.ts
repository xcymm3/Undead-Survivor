import { CONFIG } from './config';

export const LOOK_SENSITIVITY_STORAGE_KEY = 'undead-survivor.look-sensitivity';
export const DEFAULT_LOOK_SENSITIVITY = 100;
export const MIN_LOOK_SENSITIVITY = 10;
export const MAX_LOOK_SENSITIVITY = 200;

export function normalizeLookSensitivity(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_LOOK_SENSITIVITY;
  return Math.round(Math.max(MIN_LOOK_SENSITIVITY, Math.min(MAX_LOOK_SENSITIVITY, value)));
}

export function lookSensitivityRadians(value: number) {
  return CONFIG.camera.sensitivity * normalizeLookSensitivity(value) / 100;
}

export function loadLookSensitivity(storage: Pick<Storage, 'getItem'>) {
  return normalizeLookSensitivity(Number(storage.getItem(LOOK_SENSITIVITY_STORAGE_KEY) ?? DEFAULT_LOOK_SENSITIVITY));
}
