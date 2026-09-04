import { ARMOR_SPAWNS, ATTACK, PLAYER, CONFIG, FIXED_DIFFICULTY, WAVES, SURVIVAL, ZOMBIE_TYPES } from './config';
import type { Difficulty, GameMode, ZombieKind } from './config';
import { CrowdMovement } from './movement';
import type { Navigation } from './navigation';

export interface Position { x: number; z: number; }
export interface SpawnPosition extends Position { spawnZone?: string; }
export interface Zombie extends SpawnPosition { id: number; kind: ZombieKind; health: number; maxHealth: number; armorHealth: number; downTime: number; bornAt: number; avoidance?: number; heading?: number; attacking?: boolean; attackTime?: number; }
export const PRACTICE_POSITIONS: Position[] = [{ x: -5.8, z: -9.5 }, { x: 0.15, z: -22 }, { x: 5.4, z: -21 }, { x: -1, z: -31 }];

export function waveSettings(wave: number) {
  const index = Math.max(0, Math.floor(wave) - 1);
  return { count: WAVES.firstCount + index * WAVES.countGrowth, speed: WAVES.firstSpeed + index * WAVES.speedGrowth,
    spawnRate: Math.min(SURVIVAL.maxSpawnRate, WAVES.spawnRate + index * WAVES.spawnGrowth) };
}

/** 到接触半径的直线距离下界，不包含绕障路程或拥挤避让。 */
export function distanceToContact(zombie: SpawnPosition, player: Position = { x: SURVIVAL.playerX, z: SURVIVAL.playerZ }) {
  return Math.max(0, Math.hypot(zombie.x - player.x, zombie.z - player.z) - SURVIVAL.contactRadius);
}

export class Encounter {
  player: Position = { x: SURVIVAL.playerX, z: SURVIVAL.playerZ };
  playerHeight = 0;
  wave = 1;
  wavesCleared = 0;
  waveSpawned = 0;
  intermission = 0;
  failureCause: 'zombie' | 'water' | null = null;
  health: number = PLAYER.health;
  lastDamageAt = -Infinity;
  mode: GameMode = 'practice';
  difficulty: Difficulty = FIXED_DIFFICULTY;
  elapsed = 0;
  failed = false;
  breachedId: number | null = null;
  kills = 0;
  zombies: Zombie[] = [];
  totalSpawned = 0;
  private spawnCredit = 0;
  private nextId = 0;
  private normalsSinceCone = 0;
  private conesSinceBucket = 0;
  private movement = new CrowdMovement();

  constructor() { this.reset('practice', FIXED_DIFFICULTY); }
  setNavigation(navigation: Navigation) { this.movement = new CrowdMovement(navigation); }

  reset(mode: GameMode, difficulty: Difficulty) {
    this.mode = mode; this.difficulty = difficulty;
    this.player = { x: SURVIVAL.playerX, z: SURVIVAL.playerZ }; this.health = PLAYER.health; this.lastDamageAt = -Infinity;
    this.elapsed = 0; this.failed = false; this.kills = 0; this.spawnCredit = 0; this.nextId = 0; this.totalSpawned = 0;
    this.breachedId = null; this.failureCause = null; this.playerHeight = 0;
    this.wave = 1; this.wavesCleared = 0; this.waveSpawned = 0; this.intermission = 0;
    this.normalsSinceCone = 0; this.conesSinceBucket = 0;
    this.zombies = mode === 'practice' ? PRACTICE_POSITIONS.map(p => this.makeZombie(p)) : [];
  }

  private nextKind(): ZombieKind {
    if (this.mode === 'practice' || this.difficulty === 'easy') return 'normal';
    if (this.difficulty === 'hard' && this.conesSinceBucket === ARMOR_SPAWNS.conesPerBucket) {
      this.conesSinceBucket = 0;
      return 'bucket';
    }
    if (this.normalsSinceCone === ARMOR_SPAWNS.normalPerCone) {
      this.normalsSinceCone = 0;
      this.conesSinceBucket++;
      return 'cone';
    }
    this.normalsSinceCone++;
    return 'normal';
  }

  private makeZombie(position: SpawnPosition): Zombie {
    const kind = this.nextKind();
    const health = ZOMBIE_TYPES[kind].health;
    return { ...position, id: this.nextId++, kind, health, armorHealth: ZOMBIE_TYPES[kind].armor, maxHealth: health, downTime: 0, bornAt: this.elapsed };
  }
  drown() {
    if (this.failed) return;
    this.health = 0; this.failed = true; this.failureCause = 'water'; this.breachedId = null;
  }
  get pressure() { return waveSettings(this.wave); }
  get waveRemaining() { return this.pressure.count - this.waveSpawned + this.alive; }
  get alive() { return this.zombies.filter(z => z.health > 0).length; }
  get zombieCounts(): Record<ZombieKind, number> {
    const counts = { normal: 0, cone: 0, bucket: 0 };
    for (const zombie of this.zombies) if (zombie.health > 0) counts[zombie.kind]++;
    return counts;
  }
  get nearest(): number | null {
    let nearest = Infinity;
    for (const z of this.zombies) if (z.health > 0) nearest = Math.min(nearest, Math.hypot(z.x - this.player.x, z.z - this.player.z));
    return Number.isFinite(nearest) ? nearest : null;
  }

  hit(id: number, head: boolean, hitDamage?: number) {
    const zombie = this.zombies.find(z => z.id === id && z.health > 0);
    if (!zombie || this.failed) return null;
    const damage = hitDamage ?? (head ? CONFIG.target.headDamage : CONFIG.target.bodyDamage);
    const armorHit = zombie.armorHealth > 0 ? zombie.kind : null;
    zombie.armorHealth = Math.max(0, zombie.armorHealth - damage);
    zombie.health = Math.max(0, zombie.health - damage);
    const armorBroken = armorHit !== null && zombie.armorHealth === 0;
    if (armorBroken) zombie.kind = 'normal';
    const killed = zombie.health === 0;
    if (killed) { zombie.attacking = false; zombie.attackTime = 0; this.kills++; zombie.downTime = this.mode === 'practice' ? CONFIG.target.respawn : 0.85; }
    return { killed, armorHit, armorBroken };
  }

  update(delta: number, spawnPosition: () => SpawnPosition | null, move: (step: number) => void = () => {}) {
    if (this.failed || !Number.isFinite(delta) || delta <= 0) return;
    // 小步推进可防止快移速跨过接触半径，也确保新生僵尸只移动其出生后的时间。
    let remaining = delta;
    while (remaining > 1e-8 && !this.failed) {
      const step = Math.min(remaining, 0.05);
      remaining -= step;
      move(step);
      if (this.failed) return;
      for (const zombie of this.zombies) if (zombie.health === 0) {
        zombie.downTime = Math.max(0, zombie.downTime - step);
        if (zombie.downTime === 0 && this.mode === 'practice') zombie.health = zombie.maxHealth;
      }
      if (this.mode === 'practice') continue;
      this.zombies = this.zombies.filter(z => z.health > 0 || z.downTime > 0);
      const speed = this.pressure.speed;
      const movement = this.movement.advance(this.zombies, step, speed, this.player);
      this.elapsed += movement.duration;
      for (const zombie of this.zombies) {
        if (zombie.health <= 0) continue;
        const touching = this.playerHeight < 1.1 && Math.hypot(zombie.x - this.player.x, zombie.z - this.player.z) <= SURVIVAL.contactRadius + 1e-6;
        zombie.attacking = touching;
        if (!touching) { zombie.attackTime = 0; continue; }
        zombie.heading = Math.atan2(this.player.x - zombie.x, this.player.z - zombie.z);
        const before = zombie.attackTime ?? 0;
        zombie.attackTime = before + step;
        if (before < ATTACK.windup && zombie.attackTime + 1e-9 >= ATTACK.windup) {
          this.health = Math.max(0, this.health - ATTACK.damage);
          this.lastDamageAt = this.elapsed;
          if (this.health === 0) { this.failed = true; this.failureCause = 'zombie'; this.breachedId = zombie.id; return; }
        }
        if (zombie.attackTime + 1e-9 >= ATTACK.duration) zombie.attackTime = Math.max(0, zombie.attackTime - ATTACK.duration);
      }
      if (this.intermission > 0) {
        this.intermission = Math.max(0, this.intermission - step);
        if (this.intermission < 1e-8) {
          this.intermission = 0; this.wave++; this.waveSpawned = 0; this.spawnCredit = 0;
        }
        continue;
      }
      if (this.waveSpawned === this.pressure.count && this.alive === 0) {
        this.wavesCleared = this.wave; this.intermission = WAVES.rest; this.spawnCredit = 0;
        continue;
      }
      if (this.waveSpawned >= this.pressure.count) continue;
      // 无可用入口或实例已满时保留配额，仅重试一次，恢复后也不突发补刷。
      this.spawnCredit = Math.min(1, this.spawnCredit + step * this.pressure.spawnRate);
      if (this.spawnCredit >= 1 - 1e-9 && this.zombies.length < SURVIVAL.maxZombies) {
        const position = spawnPosition();
        if (!position) continue;
        this.spawnCredit = 0;
        this.zombies.push(this.makeZombie(position));
        this.totalSpawned++; this.waveSpawned++;
      }
    }
  }
}
