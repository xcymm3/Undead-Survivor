import * as THREE from 'three';
import { cube } from './geometry';

const CAPACITY = 384;
const COLORS = [0xd43d38, 0xad2332, 0x801b2a, 0xe65345].map(color => new THREE.Color(color));
interface Droplet {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  size: number;
  age: number;
  lifetime: number;
  spin: number;
}

/** 所有击杀血滴共用一个绘制批次；池满后覆盖最早的粒子。 */
export class BloodEffects extends THREE.InstancedMesh {
  private droplets: Droplet[] = [];
  private cursor = 0;
  private transform = new THREE.Object3D();
  private origin: number[] | null = null;
  private bursts = 0;
  private density = 1;

  constructor() {
    super(cube, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, flatShading: true }), CAPACITY);
    this.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.count = 0;
    this.visible = false;
    this.frustumCulled = false;
    // 不投影，也不加入射线命中列表，避免血滴遮挡后续子弹。
  }

  burst(position: THREE.Vector3, direction: THREE.Vector3, headshot: boolean) {
    this.origin = position.toArray();
    this.bursts++;
    const amount = Math.max(8, Math.round((headshot ? 44 : 32) * this.density));
    for (let i = 0; i < amount; i++) {
      const index = this.cursor;
      this.cursor = (this.cursor + 1) % CAPACITY;
      const angle = i * 2.399963 + Math.random() * 0.4;
      const speed = 1.8 + Math.random() * (headshot ? 3.8 : 2.8);
      const droplet = this.droplets[index] ?? { position: new THREE.Vector3(), velocity: new THREE.Vector3(), size: 0, age: 0, lifetime: 0, spin: 0 };
      droplet.position.copy(position).addScaledVector(direction, -0.08);
      // 径向扩散叠加迎着来弹的反溅，使正面的命中也能清楚看见。
      droplet.velocity.set(Math.cos(angle) * speed - direction.x, 0.8 + Math.random() * 3.2, Math.sin(angle) * speed - direction.z);
      droplet.size = 0.075 + Math.random() * 0.11;
      droplet.age = 0;
      droplet.lifetime = 0.65 + Math.random() * 0.45;
      droplet.spin = (Math.random() - 0.5) * 12;
      this.droplets[index] = droplet;
      this.setColorAt(index, COLORS[i % COLORS.length]);
      this.writeDroplet(index, droplet);
      this.count = Math.max(this.count, index + 1);
    }
    this.visible = true;
    this.instanceMatrix.needsUpdate = true;
    this.instanceColor!.needsUpdate = true;
  }

  update(delta: number) {
    if (!this.visible || delta <= 0) return;
    let active = 0;
    this.droplets.forEach((droplet, index) => {
      if (droplet.age >= droplet.lifetime) return;
      droplet.age = Math.min(droplet.lifetime, droplet.age + delta);
      droplet.velocity.multiplyScalar(Math.exp(-delta * 1.4));
      droplet.velocity.y -= delta * 7;
      droplet.position.addScaledVector(droplet.velocity, delta);
      // 触地前消散，避免穿过地面或留下无上限积累的血迹。
      if (droplet.position.y <= 0.08) droplet.age = droplet.lifetime;
      this.writeDroplet(index, droplet);
      if (droplet.age < droplet.lifetime) active++;
    });
    this.visible = active > 0;
    this.instanceMatrix.needsUpdate = true;
  }

  private writeDroplet(index: number, droplet: Droplet) {
    const fade = THREE.MathUtils.clamp((droplet.lifetime - droplet.age) / 0.35, 0, 1);
    this.transform.position.copy(droplet.position);
    this.transform.rotation.set(droplet.spin * droplet.age, index * 1.7, droplet.spin * droplet.age * 0.7);
    this.transform.scale.set(droplet.size * fade, droplet.size * fade * 0.7, droplet.size * fade * 1.7);
    this.transform.updateMatrix();
    this.setMatrixAt(index, this.transform.matrix);
  }

  reset() {
    this.droplets = [];
    this.cursor = 0;
    this.count = 0;
    this.visible = false;
    this.origin = null;
    this.bursts = 0;
  }

  setDensity(density: number) { this.density = THREE.MathUtils.clamp(density, 0.25, 1); }

  diagnostics() {
    return { active: this.droplets.filter(d => d.age < d.lifetime).length, capacity: CAPACITY, density: this.density, bursts: this.bursts, origin: this.origin?.slice() ?? null };
  }
}
