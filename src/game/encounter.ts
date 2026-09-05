import { ATTACK, PLAYER, CONFIG, ENEMY_RULES, FIXED_DIFFICULTY, WAVES, SURVIVAL, ZOMBIE_TYPES,
  emptyZombieCounts, zombieAttack, zombieContactRadius } from './config';
import type { Difficulty, GameMode, ZombieKind } from './config';
import { simultaneousCap, waveRoster } from './enemyRoster';
import { CrowdMovement } from './movement';
import type { Navigation } from './navigation';
import type { Pawn } from '../multiplayer/types';

export interface Position { x: number; z: number; }
export interface SpawnPosition extends Position { spawnZone?: string; }
export type FootballState = 'ready' | 'windup' | 'charging' | 'stunned';
export interface Zombie extends SpawnPosition {
  id: number; kind: ZombieKind; health: number; bodyHealth?: number; maxHealth: number; armorHealth: number;
  downTime: number; bornAt: number; avoidance?: number; heading?: number; attacking?: boolean; attackTime?: number;
  attackTarget?: string; enraged?: boolean; ragePause?: number; specialState?: FootballState; specialRemaining?: number;
  specialCooldown?: number; chargeAvoidRiver?: boolean;
}
export const PRACTICE_POSITIONS: Position[] = [{ x: -5.8, z: -9.5 }, { x: 0.15, z: -22 }, { x: 5.4, z: -21 }, { x: -1, z: -31 }];

export function waveSettings(wave: number) {
  const index = Math.max(0, Math.floor(wave) - 1);
  return { count: WAVES.firstCount + index * WAVES.countGrowth, speed: WAVES.firstSpeed + index * WAVES.speedGrowth,
    spawnRate: Math.min(SURVIVAL.maxSpawnRate, WAVES.spawnRate + index * WAVES.spawnGrowth) };
}

export function distanceToContact(zombie: SpawnPosition & { kind?: ZombieKind }, player: Position = { x: SURVIVAL.playerX, z: SURVIVAL.playerZ }) {
  return Math.max(0, Math.hypot(zombie.x - player.x, zombie.z - player.z) - zombieContactRadius(zombie.kind ?? 'normal'));
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
  waveQueue: ZombieKind[] = [];
  private spawnCredit = 0;
  private nextId = 0;
  private rosterWave = 0;
  private movement = new CrowdMovement();
  private navigation?: Navigation;
  combatants: Pawn[] | null = null;
  private coopMovement = new Map<string, CrowdMovement>();

  constructor(private random: () => number = Math.random) { this.reset('practice', FIXED_DIFFICULTY); }
  setCombatants(players: Pawn[], navigations: Navigation[]) {
    this.combatants = players; this.coopMovement.clear();
    players.forEach((p, i) => this.coopMovement.set(p.id, new CrowdMovement(navigations[i])));
  }
  setNavigation(navigation: Navigation) { this.navigation = navigation; this.movement = new CrowdMovement(navigation); }

  private prepareWave() { this.waveQueue = waveRoster(this.wave, this.pressure.count, this.difficulty, this.random); this.rosterWave = this.wave; }

  reset(mode: GameMode, difficulty: Difficulty) {
    this.combatants = null; this.coopMovement.clear();
    this.mode = mode; this.difficulty = difficulty;
    this.player = { x: SURVIVAL.playerX, z: SURVIVAL.playerZ }; this.health = PLAYER.health; this.lastDamageAt = -Infinity;
    this.elapsed = 0; this.failed = false; this.kills = 0; this.spawnCredit = 0; this.nextId = 0; this.totalSpawned = 0;
    this.breachedId = null; this.failureCause = null; this.playerHeight = 0;
    this.wave = 1; this.wavesCleared = 0; this.waveSpawned = 0; this.intermission = 0; this.waveQueue = []; this.rosterWave = 0;
    if (mode === 'practice') this.zombies = PRACTICE_POSITIONS.map(p => this.makeZombie(p, 'normal'));
    else { this.zombies = []; this.prepareWave(); }
  }

  private makeZombie(position: SpawnPosition, kind: ZombieKind): Zombie {
    const definition = ZOMBIE_TYPES[kind], bodyHealth = definition.health - definition.armor;
    return { ...position, id: this.nextId++, kind, health: definition.health, bodyHealth, armorHealth: definition.armor,
      maxHealth: definition.health, downTime: 0, bornAt: this.elapsed,
      specialState: kind === 'football' ? 'ready' : undefined, specialCooldown: kind === 'football' ? 0 : undefined };
  }

  drown() {
    if (this.failed) return;
    this.health = 0; this.failed = true; this.failureCause = 'water'; this.breachedId = null;
  }
  get pressure() { return waveSettings(this.wave); }
  get waveRemaining() { return this.waveQueue.length + this.alive; }
  get alive() { return this.zombies.filter(z => z.health > 0).length; }
  get zombieCounts(): Record<ZombieKind, number> {
    const counts = emptyZombieCounts();
    for (const zombie of this.zombies) if (zombie.health > 0) counts[zombie.kind]++;
    return counts;
  }
  get nearest(): number | null {
    let nearest = Infinity;
    for (const z of this.zombies) if (z.health > 0) nearest = Math.min(nearest, Math.hypot(z.x - this.player.x, z.z - this.player.z));
    return Number.isFinite(nearest) ? nearest : null;
  }

  hit(id: number, head: boolean, hitDamage?: number, armorContact = true) {
    const zombie = this.zombies.find(z => z.id === id && z.health > 0);
    if (!zombie || this.failed) return null;
    const damage = hitDamage ?? (head ? CONFIG.target.headDamage : CONFIG.target.bodyDamage);
    if (!Number.isFinite(damage) || damage <= 0) return null;
    zombie.bodyHealth ??= Math.max(0, zombie.health - zombie.armorHealth);
    const armorHit = armorContact && zombie.armorHealth > 0 ? zombie.kind : null;
    if (armorHit) {
      const absorbed = Math.min(zombie.armorHealth, damage);
      zombie.armorHealth -= absorbed;
      zombie.bodyHealth = Math.max(0, zombie.bodyHealth - (damage - absorbed));
    } else zombie.bodyHealth = Math.max(0, zombie.bodyHealth - damage);
    zombie.health = zombie.bodyHealth + zombie.armorHealth;
    const armorBroken = armorHit !== null && zombie.armorHealth === 0;
    if (armorBroken && (zombie.kind === 'cone' || zombie.kind === 'bucket')) zombie.kind = 'normal';
    if (armorBroken && zombie.kind === 'football') {
      zombie.specialState = 'ready'; zombie.specialRemaining = 0; zombie.specialCooldown = ENEMY_RULES.football.chargeCooldown;
    }
    const enraged = zombie.kind === 'berserker' && !zombie.enraged && zombie.health > 0 && zombie.health <= ENEMY_RULES.berserker.rageAt;
    if (enraged) { zombie.enraged = true; zombie.ragePause = ENEMY_RULES.berserker.ragePause; zombie.attackTime = 0; zombie.attacking = false; }
    const killed = zombie.bodyHealth === 0;
    if (killed) {
      zombie.health = 0; zombie.armorHealth = 0; zombie.attacking = false; zombie.attackTime = 0; zombie.specialState = undefined;
      this.kills++; zombie.downTime = this.mode === 'practice' ? CONFIG.target.respawn : .85;
    }
    return { killed, armorHit, armorBroken, ...(enraged ? { enraged: true } : {}) };
  }

  private chargePossible(zombie: Zombie, target: Position) {
    if (!this.navigation || zombie.armorHealth <= 0 || zombie.specialState !== 'ready' || (zombie.specialCooldown ?? 0) > 0) return false;
    const range = Math.hypot(target.x - zombie.x, target.z - zombie.z);
    if (range < ENEMY_RULES.football.chargeMin || range > ENEMY_RULES.football.chargeMax) return false;
    const clearNormally = this.navigation.clear(zombie, target);
    if (zombie.chargeAvoidRiver) {
      if (!clearNormally) return false;
      zombie.chargeAvoidRiver = false;
    }
    return clearNormally || this.navigation.clear(zombie, target, true);
  }

  private prepareSpecials(targets: Map<number, Pawn>) {
    for (const zombie of this.zombies) if (zombie.health > 0 && zombie.kind === 'football') {
      const target = targets.get(zombie.id) ?? this.player;
      if (this.chargePossible(zombie, target)) {
        zombie.specialState = 'windup'; zombie.specialRemaining = ENEMY_RULES.football.chargeWindup;
        zombie.attackTime = 0; zombie.attacking = false;
      }
    }
  }

  private stunFootball(zombie: Zombie, duration: number, river = false) {
    zombie.specialState = 'stunned'; zombie.specialRemaining = duration;
    zombie.specialCooldown = ENEMY_RULES.football.chargeCooldown; zombie.attacking = false; zombie.attackTime = 0;
    if (river) zombie.chargeAvoidRiver = true;
  }

  private advanceStatuses(step: number) {
    for (const zombie of this.zombies) {
      zombie.ragePause = Math.max(0, (zombie.ragePause ?? 0) - step);
      zombie.specialCooldown = Math.max(0, (zombie.specialCooldown ?? 0) - step);
      if (!zombie.specialState || zombie.specialState === 'ready') continue;
      zombie.specialRemaining = Math.max(0, (zombie.specialRemaining ?? 0) - step);
      if (zombie.specialRemaining > 1e-8) continue;
      if (zombie.specialState === 'windup') {
        zombie.specialState = 'charging'; zombie.specialRemaining = ENEMY_RULES.football.chargeDuration;
      } else if (zombie.specialState === 'charging') this.stunFootball(zombie, ENEMY_RULES.football.missStun);
      else zombie.specialState = 'ready';
    }
  }

  private damage(target: Pawn | null) {
    if (target) { target.health = Math.max(0, target.health - ATTACK.damage); target.lastDamageAt = this.elapsed; }
    else { this.health = Math.max(0, this.health - ATTACK.damage); this.lastDamageAt = this.elapsed; }
  }

  private attack(zombie: Zombie, target: Pawn | undefined, targets: Map<number, Pawn>, step: number) {
    const position = target ?? this.player;
    if (target && zombie.attackTarget !== target.id) { zombie.attackTarget = target.id; zombie.attackTime = 0; }
    const airborne = target ? target.height >= PLAYER.zombieClearanceHeight : this.playerHeight >= PLAYER.zombieClearanceHeight;
    const touching = !airborne && Math.hypot(zombie.x - position.x, zombie.z - position.z) <= zombieContactRadius(zombie.kind) + 1e-6;
    if (zombie.kind === 'football' && zombie.specialState === 'charging' && touching) {
      this.damage(target ?? null); zombie.specialState = 'ready'; zombie.specialRemaining = 0;
      zombie.specialCooldown = ENEMY_RULES.football.chargeCooldown; zombie.attackTime = 0; zombie.attacking = false;
      if ((target?.health ?? this.health) === 0) this.breachedId = zombie.id;
      return;
    }
    if (zombie.specialState === 'charging' || zombie.specialState === 'windup' || zombie.specialState === 'stunned' || (zombie.ragePause ?? 0) > 0) {
      zombie.attacking = false; zombie.attackTime = 0; return;
    }
    zombie.attacking = touching;
    if (!touching) { zombie.attackTime = 0; return; }
    zombie.heading = Math.atan2(position.x - zombie.x, position.z - zombie.z);
    const profile = zombieAttack(zombie.kind, zombie.enraged), before = zombie.attackTime ?? 0;
    zombie.attackTime = before + step;
    if (before < profile.windup && zombie.attackTime + 1e-9 >= profile.windup) {
      if (zombie.kind === 'giant' && this.combatants) {
        for (const pawn of this.combatants) if (pawn.health > 0 && pawn.height < PLAYER.zombieClearanceHeight
          && Math.hypot(pawn.x - zombie.x, pawn.z - zombie.z) <= ENEMY_RULES.giant.slamRadius) this.damage(pawn);
      } else this.damage(target ?? null);
      if ((target?.health ?? this.health) === 0) this.breachedId = zombie.id;
    }
    if (zombie.attackTime + 1e-9 >= profile.duration) zombie.attackTime = Math.max(0, zombie.attackTime - profile.duration);
    void targets;
  }

  private queuedSpawnIndex() {
    const players = this.combatants?.length ?? 1, counts = this.zombieCounts;
    return this.waveQueue.findIndex(kind => counts[kind] < simultaneousCap(kind, this.wave, players));
  }

  update(delta: number, spawnPosition: () => SpawnPosition | null, move: (step: number) => void = () => {}) {
    if (this.failed || !Number.isFinite(delta) || delta <= 0) return;
    if (this.mode === 'survival' && this.waveSpawned === 0 && this.rosterWave !== this.wave) this.prepareWave();
    let remaining = delta;
    while (remaining > 1e-8 && !this.failed) {
      const step = Math.min(remaining, .05);
      remaining -= step;
      move(step);
      if (this.failed) return;
      for (const zombie of this.zombies) if (zombie.health === 0) {
        zombie.downTime = Math.max(0, zombie.downTime - step);
        if (zombie.downTime === 0 && this.mode === 'practice') {
          zombie.bodyHealth = zombie.maxHealth; zombie.health = zombie.maxHealth;
        }
      }
      if (this.mode === 'practice') continue;
      this.zombies = this.zombies.filter(z => z.health > 0 || z.downTime > 0);
      const living = this.combatants?.filter(p => p.health > 0);
      if (living && !living.length) { this.failed = true; this.failureCause ??= 'zombie'; return; }
      const targets = new Map<number, Pawn>();
      if (living) for (const zombie of this.zombies) if (zombie.health > 0) targets.set(zombie.id, living.reduce((a, b) =>
        Math.hypot(zombie.x - a.x, zombie.z - a.z) <= Math.hypot(zombie.x - b.x, zombie.z - b.z) ? a : b));
      this.prepareSpecials(targets);
      const blocked = new Set<number>(), waterBlocked = new Set<number>();
      if (living) {
        for (const pawn of living) {
          const result = this.coopMovement.get(pawn.id)!.advance(this.zombies.filter(z => targets.get(z.id)?.id === pawn.id), step, this.pressure.speed, pawn);
          result.blockedIds.forEach(id => blocked.add(id)); result.waterBlockedIds.forEach(id => waterBlocked.add(id));
        }
      } else {
        const result = this.movement.advance(this.zombies, step, this.pressure.speed, this.player);
        result.blockedIds.forEach(id => blocked.add(id)); result.waterBlockedIds.forEach(id => waterBlocked.add(id));
      }
      for (const id of blocked) {
        const zombie = this.zombies.find(candidate => candidate.id === id && candidate.kind === 'football' && candidate.specialState === 'charging');
        if (zombie) this.stunFootball(zombie, waterBlocked.has(id) ? ENEMY_RULES.football.riverStun : ENEMY_RULES.football.obstacleStun, waterBlocked.has(id));
      }
      this.elapsed += step;
      for (const zombie of this.zombies) if (zombie.health > 0) this.attack(zombie, targets.get(zombie.id), targets, step);
      this.advanceStatuses(step);
      if ((living ? this.combatants!.every(p => p.health === 0) : this.health === 0)) {
        this.failed = true; this.failureCause = 'zombie';
        this.breachedId ??= this.zombies.find(z => z.health > 0 && z.attacking)?.id ?? null; return;
      }
      if (this.intermission > 0) {
        this.intermission = Math.max(0, this.intermission - step);
        if (this.intermission < 1e-8) {
          this.intermission = 0; this.wave++; this.waveSpawned = 0; this.spawnCredit = 0; this.prepareWave();
        }
        continue;
      }
      if (this.waveQueue.length === 0 && this.alive === 0) {
        this.wavesCleared = this.wave; this.intermission = WAVES.rest; this.spawnCredit = 0; continue;
      }
      if (this.waveQueue.length === 0) continue;
      this.spawnCredit = Math.min(1, this.spawnCredit + step * this.pressure.spawnRate);
      if (this.spawnCredit >= 1 - 1e-9 && this.zombies.length < SURVIVAL.maxZombies) {
        const queueIndex = this.queuedSpawnIndex();
        if (queueIndex < 0) continue;
        const position = spawnPosition();
        if (!position) continue;
        this.spawnCredit = 0;
        const [kind] = this.waveQueue.splice(queueIndex, 1);
        this.zombies.push(this.makeZombie(position, kind));
        this.totalSpawned++; this.waveSpawned++;
      }
    }
  }
}
