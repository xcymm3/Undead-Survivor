import { PerspectiveCamera, Vector3 } from 'three';
import { ARMOR_SPAWNS, CONFIG, CROWD, PRESSURE, ZOMBIE_TYPES } from '../src/game/config';
import type { Difficulty, ZombieKind } from '../src/game/config';
import { distanceToContact, Encounter } from '../src/game/encounter';
import { Firearm } from '../src/game/firearm';
import { seededRandom } from '../src/game/geometry';
import { SpawnDirector } from '../src/game/spawn';

export const PLAYER_PROFILES = [
  { id: 'idle', label: '不射击', accuracy: 0, headshotShare: 0, interval: 1, acquireDelay: 0, reloadDelay: 0 },
  { id: 'regular', label: '一般操作假设', accuracy: 0.70, headshotShare: 0.45, interval: 0.20, acquireDelay: 0.22, reloadDelay: 0.25 },
  { id: 'skilled', label: '熟练操作假设', accuracy: 0.88, headshotShare: 0.75, interval: 0.14, acquireDelay: 0.12, reloadDelay: 0.12 },
  { id: 'expert', label: '高水平操作假设', accuracy: 0.96, headshotShare: 0.92, interval: 0.115, acquireDelay: 0.05, reloadDelay: 0.06 },
  { id: 'ideal', label: '理想机器人参考', accuracy: 1, headshotShare: 1, interval: 0.115, acquireDelay: 0, reloadDelay: 0 },
] as const;

/** 使用实际刷新、移动、血量、伤害、弹匣和换弹逻辑；输入操作由公开的假设参数模拟。 */
export function simulateRun(difficulty: Difficulty, profile: typeof PLAYER_PROFILES[number], seed: number, fps = 60) {
  const encounter = new Encounter(); encounter.reset('survival', difficulty);
  const firearm = new Firearm();
  const camera = new PerspectiveCamera(CONFIG.camera.fov, 1440 / 900, 0.025, 220);
  camera.position.set(0, CONFIG.camera.height, 9); camera.rotation.set(-0.105, 0, 0, 'YXZ'); camera.updateMatrixWorld();
  const spawns = new SpawnDirector(seededRandom(seed));
  const randomShot = seededRandom(seed + 98171);
  const project = new Vector3();
  const dt = 1 / fps;
  let targetId: number | null = null;
  let readyAt = 0;
  let shotReadyAt = 0;
  let emptySince: number | null = null;
  let hits = 0;
  let headHits = 0;
  let maxAlive = 0;
  let observedSpawns = 0;
  const firstAppearance: Partial<Record<ZombieKind, number>> = {};
  const spawned = { normal: 0, cone: 0, bucket: 0 };
  const kills = { normal: 0, cone: 0, bucket: 0 };
  const originalKinds = new Map<number, ZombieKind>();
  while (!encounter.failed && encounter.elapsed < 360) {
    firearm.update(dt);
    encounter.update(dt, () => spawns.next(encounter.player, 0));
    const time = encounter.elapsed;
    if (encounter.totalSpawned > observedSpawns) {
      for (const z of encounter.zombies) if (z.id >= observedSpawns) {
        spawned[z.kind]++;
        originalKinds.set(z.id, z.kind);
        firstAppearance[z.kind] ??= z.bornAt;
      }
      observedSpawns = encounter.totalSpawned;
    }
    maxAlive = Math.max(maxAlive, encounter.alive);
    if (encounter.failed || profile.id === 'idle') continue;
    if (firearm.ammo === 0) {
      emptySince ??= time;
      if (time - emptySince >= profile.reloadDelay) firearm.reload();
    } else emptySince = null;

    let target = encounter.zombies.find(z => z.id === targetId && z.health > 0);
    if (!target) {
      let closest = Infinity;
      for (const z of encounter.zombies) {
        if (z.health <= 0) continue;
        project.set(z.x, 1.83, z.z).project(camera);
        if (Math.abs(project.x) > 0.94 || Math.abs(project.y) > 0.9) continue;
        const remaining = distanceToContact(z);
        if (remaining < closest) { closest = remaining; target = z; }
      }
      if (target) { targetId = target.id; readyAt = time + profile.acquireDelay; }
    }
    if (!target || time + 1e-8 < readyAt || time + 1e-8 < shotReadyAt || !firearm.fire()) continue;
    shotReadyAt = time + profile.interval;
    if (randomShot() >= profile.accuracy) continue;
    hits++;
    const head = randomShot() < profile.headshotShare;
    if (head) headHits++;
    const result = encounter.hit(target.id, head)!;
    if (result.killed) { kills[originalKinds.get(target.id) ?? target.kind]++; targetId = null; }
  }
  return { seed, seconds: encounter.elapsed, failed: encounter.failed, shots: firearm.shots, hits, headHits, kills, spawned, firstAppearance, maxAlive, finalPressure: encounter.pressure };
}

export function evaluateBalance() {
  const groups = [];
  for (const fps of [60, 30]) for (const difficulty of ['easy', 'normal', 'hard'] as Difficulty[]) for (const profile of PLAYER_PROFILES) {
    const runs = Array.from({ length: 24 }, (_, i) => simulateRun(difficulty, profile, 42031 + i * 177, fps));
    const times = runs.map(run => run.seconds).sort((a, b) => a - b);
    const quantile = (p: number) => Number(times[Math.floor((times.length - 1) * p)].toFixed(1));
    groups.push({ difficulty, profile: profile.id, fps, samples: runs.length, min: quantile(0), p10: quantile(0.1), median: quantile(0.5), p90: quantile(0.9), max: quantile(1), withinTarget: runs.filter(r => r.seconds >= 60 && r.seconds <= 180).length, runs });
  }
  return {
    generatedAt: new Date().toISOString(), profiles: PLAYER_PROFILES, pressure: PRESSURE, armorSpawns: { ...ARMOR_SPAWNS, enabledFromStart: true }, crowd: CROWD, zombieTypes: ZOMBIE_TYPES, weapon: CONFIG.weapon,
    assumptions: ['使用实际 Encounter、Firearm、SpawnDirector，1440×900 固定镜头，分别模拟 60/30 FPS。', '命中率和命中后的爆头比例是操作假设，不是实测玩家数据；获取目标延迟和换弹反应时间按配置计算。', '选择距离失守路线最短的可见活僵尸，击杀后切换；模型不精确模拟建筑遮挡、鼠标轨迹或枪口视差，结果偏乐观。', '每组 24 个可复现种子，最多模拟 360 秒；理想机器人是参考值，不是数学证明的绝对极限。'],
    groups,
  };
}
