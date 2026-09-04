import type { Difficulty, RunResult } from './config';

// 波次成绩独立保存，旧时长榜保留在原键，不把旧时长虚构成波数。
export const LEADERBOARD_KEY = 'undead-survivor.leaderboard.waves-v1';
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
export interface PersonalRecord { status: 'first' | 'new' | 'tied' | 'chasing'; previous: number | null; difference: number; }

/** 在写入本次成绩前比较同难度最佳，按完整守住的波数比较。 */
export function personalRecord(result: RunResult, entries: RunResult[]): PersonalRecord {
  const previous = entries.filter(r => r.difficulty === result.difficulty && r.id !== result.id).reduce<number | null>((best, r) => best === null ? r.waves : Math.max(best, r.waves), null);
  if (previous === null) return { status: 'first', previous, difference: 0 };
  const difference = result.waves - previous;
  return { status: difference > 0 ? 'new' : difference === 0 ? 'tied' : 'chasing', previous, difference: Math.abs(difference) };
}
const difficulties: Difficulty[] = ['easy', 'normal', 'hard'];

function isResult(value: unknown): value is RunResult {
  if (!value || typeof value !== 'object') return false;
  const r = value as RunResult;
  return r.mode === 'survival' && ['water', 'zombie'].includes(r.cause)
    && Number.isSafeInteger(r.waves) && r.waves >= 0 && Number.isSafeInteger(r.wave) && r.wave >= 1 && r.waves <= r.wave
    && typeof r.id === 'string' && r.id.length > 0 && difficulties.includes(r.difficulty)
    && Number.isFinite(r.duration) && r.duration >= 0
    && [r.kills, r.shots, r.hits].every(n => Number.isSafeInteger(n) && n >= 0)
    && r.hits <= r.shots && r.kills <= r.hits
    && typeof r.endedAt === 'string' && Number.isFinite(Date.parse(r.endedAt));
}

export function rankResults(entries: RunResult[]): RunResult[] {
  const unique = [...new Map(entries.filter(isResult).map(entry => [entry.id, entry])).values()];
  return difficulties.flatMap(difficulty => unique.filter(r => r.difficulty === difficulty)
    .sort((a, b) => b.waves - a.waves || b.kills - a.kills || b.duration - a.duration || a.endedAt.localeCompare(b.endedAt) || a.id.localeCompare(b.id)).slice(0, 10));
}

/** 存储不可用时保留当前会话成绩，且明确向 UI 返回保存失败。 */
export class LeaderboardStore {
  private entries: RunResult[] = [];
  private storage?: StoragePort;
  persistent = true;

  constructor(storage?: StoragePort) {
    try { this.storage = storage ?? window.localStorage; }
    catch { this.persistent = false; }
    this.read();
  }
  read() {
    if (!this.storage) { this.persistent = false; return [...this.entries]; }
    try {
      const raw = this.storage.getItem(LEADERBOARD_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      this.entries = rankResults([...this.entries, ...(Array.isArray(parsed) ? parsed.filter(isResult) : [])]);
    } catch { /* 损坏数据不会阻止游戏；下一次保存可替换损坏 JSON。 */ }
    return [...this.entries];
  }
  record(result: RunResult) {
    this.entries = rankResults([...this.read(), result]);
    try {
      if (!this.storage) throw new Error('storage unavailable');
      this.storage.setItem(LEADERBOARD_KEY, JSON.stringify(this.entries));
      this.persistent = true;
    } catch { this.persistent = false; }
    return [...this.entries];
  }
}

export function formatDuration(seconds: number, precise = false) {
  const tenths = Math.floor(Math.max(0, seconds) * 10 + 1e-6);
  const minutes = Math.floor(tenths / 600);
  const rest = Math.floor(tenths / 10) % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}${precise ? `.${tenths % 10}` : ''}`;
}
