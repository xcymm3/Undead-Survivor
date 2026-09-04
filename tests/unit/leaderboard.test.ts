import { describe, expect, it } from 'vitest';
import { formatDuration, LEADERBOARD_KEY, LeaderboardStore, personalRecord, rankResults } from '../../src/game/leaderboard';
import type { RunResult } from '../../src/game/config';

const result = (id: string, waves: number, difficulty: RunResult['difficulty'] = 'normal', kills = 2): RunResult => ({ id, waves, wave: waves + 1, mode: 'survival', cause: 'zombie', duration: 90, difficulty, kills, hits: 5, shots: 10, endedAt: '2026-09-03T08:00:00.000Z' });
const memoryStorage = () => {
  let data: string | null = null;
  return { getItem: () => data, setItem: (_key: string, value: string) => { data = value; } };
};

describe('本机排行榜', () => {
  it('个人纪录区分首次、突破、追平和追赶，排除其他难度及本次成绩', () => {
    const run = result('now', 90, 'hard');
    expect(personalRecord(run, [result('easy', 200, 'easy'), run]).status).toBe('first');
    expect(personalRecord(run, [result('old', 80, 'hard')])).toEqual({ status: 'new', previous: 80, difference: 10 });
    expect(personalRecord(run, [result('old', 90, 'hard')]).status).toBe('tied');
    expect(personalRecord(run, [result('old', 100, 'hard')])).toEqual({ status: 'chasing', previous: 100, difference: 10 });
  });
  it('新刷新规则单独记榜，保留旧规则成绩', () => {
    const oldKey = 'undead-survivor.leaderboard.v1';
    const oldData = JSON.stringify([result('old', 180)]);
    const data = new Map([[oldKey, oldData]]);
    const store = new LeaderboardStore({ getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } });
    expect(store.read()).toEqual([]);
    store.record(result('new', 90));
    expect(data.get(oldKey)).toBe(oldData);
    expect(JSON.parse(data.get(LEADERBOARD_KEY)!)).toEqual([result('new', 90)]);
  });
  it('按波数降序、同分按击杀排序，并且每种难度只留前 10 名', () => {
    const records = Array.from({ length: 15 }, (_, i) => result(String(i), i));
    records.push(result('easy', 99, 'easy'), result('hard', 88, 'hard'), result('tie', 14, 'normal', 4));
    const ranks = rankResults(records);
    expect(ranks.filter(r => r.difficulty === 'normal')).toHaveLength(10);
    expect(ranks.filter(r => r.difficulty === 'normal')[0].id).toBe('tie');
    expect(ranks.filter(r => r.difficulty === 'easy')).toHaveLength(1);
    expect(ranks.filter(r => r.difficulty === 'hard')).toHaveLength(1);
  });
  it('波数优先于时长和击杀，未清完的一波不计分', () => {
    const lower = { ...result('lower', 2, 'hard', 5), duration: 9999 };
    const higher = { ...result('higher', 3, 'hard', 1), duration: 50 };
    expect(rankResults([lower, higher]).map(r => r.id)).toEqual(['higher', 'lower']);
    expect(personalRecord(higher, [lower])).toEqual({ status: 'new', previous: 2, difference: 1 });
    expect(rankResults([{ ...higher, waves: 3.5 }, { ...higher, waves: -1 }, { ...higher, mode: 'practice' }, { ...higher, waves: undefined } as unknown as RunResult])).toEqual([]);
  });
  it('相同结算只写入一条，重新加载仍能读取', () => {
    const storage = memoryStorage();
    const store = new LeaderboardStore(storage);
    store.record(result('run', 3)); store.record(result('run', 3));
    expect(new LeaderboardStore(storage).read()).toEqual([result('run', 3)]);
  });
  it('损坏记录、非法数字和错误难度不会破坏排行榜', () => {
    const storage = memoryStorage(); storage.setItem('', '{broken');
    const store = new LeaderboardStore(storage);
    expect(store.read()).toEqual([]);
    const records = [result('valid', 10), { ...result('invalid', 2), duration: -1 }, { ...result('invalid2', 3), hits: 99 }, { ...result('invalid3', 5), difficulty: 'unknown' }];
    storage.setItem('', JSON.stringify(records));
    expect(store.read()).toEqual([result('valid', 10)]);
  });
  it('存储不可写时保留会话成绩并报告保存失败', () => {
    const store = new LeaderboardStore({ getItem: () => null, setItem: () => { throw new Error('blocked'); } });
    expect(store.record(result('run', 1))).toHaveLength(1);
    expect(store.persistent).toBe(false);
    expect(store.read()).toHaveLength(1);
  });
  it('秒表跨分钟显示正确，不将小数秒错误进位', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(59.99, true)).toBe('00:59.9');
    expect(formatDuration(61.23, true)).toBe('01:01.2');
    expect(formatDuration(3600)).toBe('60:00');
  });
});
