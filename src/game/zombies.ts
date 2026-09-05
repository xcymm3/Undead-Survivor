import * as THREE from 'three';
import { cube } from './geometry';
import { ENEMY_RULES, SURVIVAL, zombieAttack, zombieScale } from './config';
import type { ZombieKind } from './config';
import type { Encounter, Zombie } from './encounter';

type Triple = [number, number, number];
interface Part { size: Triple; position: Triple; color: number; head?: boolean; limb?: number; shirt?: boolean; kind?: ZombieKind; armor?: boolean; shield?: boolean; decor?: boolean; }
const PARTS: Part[] = [
  { size: [0.64, 0.70, 0.35], position: [0, 1.18, 0], color: 0x596450, shirt: true },
  { size: [0.18, 0.24, 0.02], position: [-0.16, 1.30, 0.19], color: 0x81965d },
  { size: [0.15, 0.19, 0.02], position: [0.12, 0.91, 0.19], color: 0x859565 },
  { size: [0.49, 0.49, 0.45], position: [0, 1.79, 0], color: 0x8c9f68, head: true },
  { size: [0.48, 0.10, 0.43], position: [0, 2.02, -0.04], color: 0x42503e, head: true },
  { size: [0.09, 0.065, 0.02], position: [-0.12, 1.84, 0.236], color: 0xf1d79b, head: true },
  { size: [0.09, 0.065, 0.02], position: [0.12, 1.84, 0.236], color: 0xf1d79b, head: true },
  { size: [0.045, 0.05, 0.023], position: [-0.11, 1.84, 0.247], color: 0x9d4f3e, head: true },
  { size: [0.045, 0.05, 0.023], position: [0.13, 1.84, 0.247], color: 0x9d4f3e, head: true },
  { size: [0.22, 0.09, 0.02], position: [0.02, 1.65, 0.234], color: 0x354431, head: true },
  { size: [0.055, 0.04, 0.025], position: [-0.045, 1.68, 0.244], color: 0xc8c5a4, head: true },
  { size: [0.08, 0.15, 0.02], position: [-0.19, 1.73, 0.239], color: 0x6e784b, head: true },
  { size: [0.24, 0.71, 0.30], position: [-0.19, 0.47, 0], color: 0x3d4945, limb: 1 },
  { size: [0.24, 0.71, 0.30], position: [0.19, 0.47, 0.02], color: 0x3d4945, limb: -1 },
  { size: [0.25, 0.15, 0.42], position: [-0.19, 0.11, 0.08], color: 0x29352e, limb: 1 },
  { size: [0.25, 0.15, 0.42], position: [0.19, 0.11, 0.10], color: 0x29352e, limb: -1 },
  { size: [0.23, 0.23, 0.47], position: [-0.43, 1.30, 0.19], color: 0x596450, shirt: true, limb: 0.25 },
  { size: [0.23, 0.23, 0.47], position: [0.43, 1.27, 0.23], color: 0x596450, shirt: true, limb: -0.25 },
  { size: [0.20, 0.20, 0.26], position: [-0.44, 1.24, 0.53], color: 0x8c9f68, limb: 0.25 },
  { size: [0.20, 0.20, 0.26], position: [0.44, 1.21, 0.57], color: 0x8c9f68, limb: -0.25 },
  { size: [0.79, 0.10, 0.74], position: [0, 2.08, 0], color: 0xb95620, head: true, kind: 'cone' },
  { size: [0.61, 0.22, 0.59], position: [0, 2.24, 0], color: 0xe9822d, head: true, kind: 'cone' },
  { size: [0.46, 0.10, 0.45], position: [0, 2.40, 0], color: 0xe8e1c7, head: true, kind: 'cone' },
  { size: [0.36, 0.18, 0.35], position: [0, 2.54, 0], color: 0xe9822d, head: true, kind: 'cone' },
  { size: [0.19, 0.18, 0.18], position: [0, 2.72, 0], color: 0xf69b3e, head: true, kind: 'cone' },
  { size: [0.72, 0.11, 0.67], position: [0, 1.94, 0], color: 0x495657, head: true, kind: 'bucket' },
  { size: [0.65, 0.48, 0.60], position: [0, 2.21, 0], color: 0x9aa9ac, head: true, kind: 'bucket' },
  { size: [0.68, 0.08, 0.63], position: [0, 2.47, 0], color: 0xc0cbca, head: true, kind: 'bucket' },
  { size: [0.10, 0.25, 0.02], position: [-0.17, 2.19, 0.31], color: 0x657778, head: true, kind: 'bucket' },
  { size: [0.18, 0.08, 0.02], position: [0.09, 2.35, 0.31], color: 0xd0d6cc, head: true, kind: 'bucket' },
  { size: [0.34, 0.18, 0.22], position: [0, 2.08, -0.02], color: 0x6d3b50, head: true, kind: 'imp', decor: true },
  { size: [0.14, 0.32, 0.12], position: [-0.24, 1.35, 0.03], color: 0x704056, kind: 'imp', decor: true },
  { size: [1.08, 1.42, 0.12], position: [0, 1.25, 0.72], color: 0x52636a, kind: 'shield', armor: true, shield: true },
  { size: [0.84, 0.12, 0.04], position: [0, 1.25, 0.79], color: 0xaab8b8, kind: 'shield', armor: true, shield: true },
  { size: [0.12, 1.18, 0.04], position: [0, 1.25, 0.79], color: 0x354247, kind: 'shield', armor: true, shield: true },
  { size: [0.72, 0.18, 0.42], position: [0, 1.62, -0.03], color: 0x8e342b, kind: 'berserker', decor: true },
  { size: [0.13, 0.58, 0.08], position: [-0.20, 1.18, 0.22], color: 0xb13d30, kind: 'berserker', decor: true },
  { size: [0.13, 0.58, 0.08], position: [0.20, 1.18, 0.22], color: 0xb13d30, kind: 'berserker', decor: true },
  { size: [0.92, 0.34, 0.48], position: [0, 1.46, -0.03], color: 0x715943, kind: 'giant', decor: true },
  { size: [0.62, 0.16, 0.48], position: [0, 2.02, 0], color: 0x4b392c, head: true, kind: 'giant', decor: true },
  { size: [0.76, 0.46, 0.62], position: [0, 2.08, 0], color: 0x9c3034, head: true, kind: 'football', armor: true },
  { size: [1.02, 0.36, 0.52], position: [0, 1.48, 0], color: 0x9c3034, kind: 'football', armor: true },
  { size: [0.52, 0.07, 0.05], position: [0, 1.84, 0.34], color: 0xe4e4cc, head: true, kind: 'football', armor: true },
];
const SHIRTS = [0x596450, 0x6c585a, 0x546877, 0x827157].map(color => new THREE.Color(color));
const COLORS = PARTS.map(part => new THREE.Color(part.color));
const BREACH_COLOR = new THREE.Color(0xffd297);

/** 整个尸群共用一个 InstancedMesh；命中先按僵尸包围盒筛选，再检查实际方块。 */
export class ZombieField extends THREE.InstancedMesh {
  private enemies: Zombie[] = [];
  private root = new THREE.Object3D();
  private part = new THREE.Object3D();
  private partMatrix = new THREE.Matrix4();
  private inverse = new THREE.Matrix4();
  private localRay = new THREE.Ray();
  private broadBox = new THREE.Box3();
  private unitBox = new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5));
  private point = new THREE.Vector3();
  private previousIds = '';

  constructor() {
    super(cube, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), SURVIVAL.maxZombies * PARTS.length);
    this.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.count = 0;
    this.frustumCulled = false;
    this.castShadow = true;
    this.receiveShadow = true;
  }

  sync(encounter: Encounter, breachProgress = 0) {
    this.enemies = encounter.zombies;
    const ids = `${encounter.breachedId}|${this.enemies.map(z => `${z.id}:${z.kind}:${z.armorHealth > 0}:${!!z.enraged}:${z.specialState}`).join(',')}`;
    const colorsChanged = ids !== this.previousIds;
    this.previousIds = ids;
    this.count = this.enemies.length * PARTS.length;
    this.enemies.forEach((zombie, index) => {
      const culprit = zombie.id === encounter.breachedId;
      const attackTime = zombie.attackTime ?? 0, profile = zombieAttack(zombie.kind, zombie.enraged);
      const attack = zombie.attacking ? (attackTime <= profile.windup
        ? attackTime / profile.windup : Math.max(0, 1 - (attackTime - profile.windup) / .35)) : 0;
      const lunge = culprit ? Math.sin(Math.PI * Math.min(1, breachProgress / 0.8)) : attack;
      const moving = encounter.mode === 'survival' && zombie.health > 0 && !zombie.attacking
        && zombie.specialState !== 'windup' && zombie.specialState !== 'stunned' && (zombie.ragePause ?? 0) <= 0;
      const pace = zombie.kind === 'imp' ? 1.6 : zombie.kind === 'football' ? 1.35 : zombie.enraged ? 1.7 : zombie.kind === 'giant' ? .75 : 1;
      const stride = moving ? Math.sin((encounter.elapsed - zombie.bornAt + (culprit ? breachProgress * 1.4 : 0)) * 5 * pace + zombie.id * 2) : 0;
      const shieldExposed = zombie.kind === 'shield' && zombie.attacking
        && (zombie.attackTime ?? 0) < ENEMY_RULES.shield.exposeDuration;
      const downDuration = encounter.mode === 'practice' ? 3 : 0.85;
      const fall = zombie.health === 0 ? Math.min(Math.PI / 2, (downDuration - zombie.downTime) * 5) : 0;
      this.root.position.set(zombie.x, moving ? Math.abs(stride) * 0.025 : 0, zombie.z);
      const goal = encounter.player;
      this.root.rotation.set(-fall, encounter.mode === 'survival' ? zombie.heading ?? Math.atan2(goal.x - zombie.x, goal.z - zombie.z) : 0, 0, 'YXZ');
      if (culprit || zombie.attacking) {
        this.root.rotation.y = Math.atan2(goal.x - zombie.x, goal.z - zombie.z);
        this.root.rotation.x += lunge * 0.16;
        this.root.position.x += Math.sin(this.root.rotation.y) * lunge * 0.3;
        this.root.position.z += Math.cos(this.root.rotation.y) * lunge * 0.3;
      }
      if (zombie.specialState === 'windup') this.root.rotation.x = -.22;
      if (zombie.specialState === 'charging') this.root.rotation.x = .28;
      if (zombie.specialState === 'stunned') this.root.rotation.z = Math.sin(encounter.elapsed * 16) * .08;
      if (zombie.enraged) this.root.rotation.x += .12;
      this.root.scale.setScalar(zombieScale(zombie.kind));
      this.root.updateMatrix();
      PARTS.forEach((part, partIndex) => {
        this.part.position.set(...part.position);
        if (part.shield && shieldExposed) { this.part.position.y -= .85; this.part.position.z -= .18; }
        this.part.position.z += stride * (part.limb ?? 0) * 0.12;
        if (part.limb && Math.abs(part.limb) < 1) { this.part.position.z += lunge * 0.28; this.part.position.y += Math.sin(lunge * Math.PI) * 0.16; }
        this.part.rotation.set(stride * (part.limb ?? 0) * 0.14, 0, 0);
        this.part.scale.set(...part.size);
        if (part.kind && (part.kind !== zombie.kind || (part.armor && zombie.armorHealth <= 0))) this.part.scale.setScalar(0);
        this.part.updateMatrix();
        this.partMatrix.multiplyMatrices(this.root.matrix, this.part.matrix);
        const instance = index * PARTS.length + partIndex;
        this.setMatrixAt(instance, this.partMatrix);
        if (colorsChanged) {
          const color = (part.shirt ? SHIRTS[zombie.id % SHIRTS.length] : COLORS[partIndex]).clone();
          if (part.shirt && zombie.kind === 'imp') color.setHex(0x57405f);
          if (part.shirt && zombie.kind === 'shield') color.setHex(0x465d65);
          if (part.shirt && zombie.kind === 'berserker') color.setHex(zombie.enraged ? 0xb63b2c : 0x7e382f);
          if (part.shirt && zombie.kind === 'giant') color.setHex(0x715943);
          if (part.shirt && zombie.kind === 'football') color.setHex(0x8f2830);
          if (encounter.failed) { if (culprit) color.lerp(BREACH_COLOR, 0.18); else color.multiplyScalar(0.42); }
          this.setColorAt(instance, color);
        }
      });
    });
    this.instanceMatrix.needsUpdate = true;
    if (colorsChanged && this.instanceColor) this.instanceColor.needsUpdate = true;
  }

  captureArmor(id: number, kind: ZombieKind) {
    const index = this.enemies.findIndex(zombie => zombie.id === id);
    if (index < 0 || kind === 'normal') return [];
    return PARTS.flatMap((part, partIndex) => {
      const armor = part.armor || part.kind === 'cone' || part.kind === 'bucket';
      if (part.kind !== kind || !armor) return [];
      const matrix = new THREE.Matrix4();
      this.getMatrixAt(index * PARTS.length + partIndex, matrix);
      return [{ matrix, color: part.color }];
    });
  }

  override raycast(raycaster: THREE.Raycaster, intersections: THREE.Intersection[]) {
    this.enemies.forEach((zombie, index) => {
      if (zombie.health <= 0) return;
      // 扑击时躯干前倾、手臂伸出，粗筛必须包含动画后的手部。
      const scale = zombieScale(zombie.kind);
      this.broadBox.min.set(zombie.x - 1.5 * scale, -0.1, zombie.z - 1.5 * scale);
      this.broadBox.max.set(zombie.x + 1.5 * scale, 2.9 * scale, zombie.z + 1.5 * scale);
      if (!raycaster.ray.intersectsBox(this.broadBox)) return;
      let nearest: THREE.Intersection | undefined;
      for (let partIndex = 0; partIndex < PARTS.length; partIndex++) {
        const part = PARTS[partIndex];
        if (part.kind && (part.kind !== zombie.kind || (part.armor && zombie.armorHealth <= 0))) continue;
        const instanceId = index * PARTS.length + partIndex;
        this.getMatrixAt(instanceId, this.partMatrix);
        this.inverse.copy(this.partMatrix).invert();
        this.localRay.copy(raycaster.ray).applyMatrix4(this.inverse);
        if (!this.localRay.intersectBox(this.unitBox, this.point)) continue;
        this.point.applyMatrix4(this.partMatrix);
        const distance = raycaster.ray.origin.distanceTo(this.point);
        if (distance < raycaster.near || distance > raycaster.far || (nearest && nearest.distance <= distance)) continue;
        nearest = { distance, point: this.point.clone(), object: this, instanceId };
      }
      if (nearest) {
        const shieldExposed = zombie.attacking && (zombie.attackTime ?? 0) < ENEMY_RULES.shield.exposeDuration;
        const shielded = zombie.kind === 'shield' && zombie.armorHealth > 0 && !shieldExposed;
        if (shielded) {
          const dx = raycaster.ray.origin.x - zombie.x, dz = raycaster.ray.origin.z - zombie.z, distance = Math.hypot(dx, dz);
          const heading = zombie.heading ?? 0;
          const facing = distance > 0 ? (Math.sin(heading) * dx + Math.cos(heading) * dz) / distance : 1;
          (nearest as THREE.Intersection & { shieldArmor?: boolean }).shieldArmor = facing >= Math.cos(75 * Math.PI / 180);
        }
        intersections.push(nearest);
      }
    });
  }

  decode(hit: THREE.Intersection | undefined) {
    if (!hit || hit.object !== this || hit.instanceId === undefined) return null;
    const zombie = this.enemies[Math.floor(hit.instanceId / PARTS.length)];
    if (!zombie) return null;
    const part = PARTS[hit.instanceId % PARTS.length];
    const shield = zombie.kind === 'shield' ? Boolean((hit as THREE.Intersection & { shieldArmor?: boolean }).shieldArmor) : undefined;
    return { id: zombie.id, head: shield ? false : Boolean(part.head), ...(shield === undefined ? {} : { armor: shield }) };
  }
}
