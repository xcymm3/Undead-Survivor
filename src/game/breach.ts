import * as THREE from 'three';
import type { Zombie } from './encounter';

export const BREACH_DURATION = 2;
/** 生命归零后的失败镜头自动聚焦最后的攻击者，战斗期间使用玩家自由视角。 */
export class BreachSequence {
  readonly light = new THREE.PointLight(0xffcf95, 0, 12, 2);
  elapsed = 0;
  private origin = new THREE.Vector3();
  private rotation = new THREE.Quaternion();
  private destination = new THREE.Vector3();
  private target = new THREE.Vector3();
  private originalFov = 61;
  get progress() { return Math.min(1, this.elapsed / BREACH_DURATION); }
  begin(camera: THREE.PerspectiveCamera, zombie: Zombie, surfaces: THREE.Object3D[] = []) {
    this.elapsed = 0; this.origin.copy(camera.position); this.rotation.copy(camera.quaternion); this.originalFov = camera.fov;
    this.target.set(zombie.x, 1.45, zombie.z);
    const approach = new THREE.Vector3(camera.position.x - zombie.x, 0, camera.position.z - zombie.z).normalize();
    const ray = new THREE.Raycaster(), direction = new THREE.Vector3(), candidate = new THREE.Vector3();
    const clear = (a: THREE.Vector3, b: THREE.Vector3) => {
      direction.subVectors(b, a); ray.far = direction.length(); ray.near = 0.025;
      ray.set(a, direction.normalize());
      return ray.intersectObjects(surfaces, false).length === 0;
    };
    // 侧面突破时，固定低机位会被哨塔平台、沙袋或立柱挡住；先验证镜头路径和取景。
    const focusPoints = [new THREE.Vector3(zombie.x, 1.85, zombie.z), new THREE.Vector3(zombie.x, 1.15, zombie.z),
      new THREE.Vector3(zombie.x - 0.35, 1.55, zombie.z), new THREE.Vector3(zombie.x + 0.35, 1.55, zombie.z),
      new THREE.Vector3(zombie.x, 1.75, zombie.z).addScaledVector(approach, 0.65),
      new THREE.Vector3(zombie.x, 1.10, zombie.z).addScaledVector(approach, 0.55)];
    this.destination.copy(this.origin);
    search: for (const distance of [4.2, 3.2, 2.4]) for (const angle of [0, -Math.PI / 8, Math.PI / 8, -Math.PI / 4, Math.PI / 4]) for (const height of [3.1, 4.2, 5.2]) {
      candidate.copy(approach).applyAxisAngle(THREE.Object3D.DEFAULT_UP, angle).multiplyScalar(distance).add(this.target); candidate.y = height;
      if (clear(this.origin, candidate) && focusPoints.every(point => clear(candidate, point))) { this.destination.copy(candidate); break search; }
    }
    this.light.position.copy(this.target).addScaledVector(approach, 2); this.light.position.y = 3.8;
    this.light.intensity = 9;
  }
  update(camera: THREE.PerspectiveCamera, delta: number) {
    this.elapsed = Math.min(BREACH_DURATION, this.elapsed + delta);
    const t = Math.min(1, this.elapsed / 0.8), ease = t * t * (3 - 2 * t);
    camera.position.lerpVectors(this.origin, this.destination, ease);
    const rotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(camera.position, this.target, camera.up));
    camera.quaternion.copy(this.rotation).slerp(rotation, ease);
    camera.fov = THREE.MathUtils.lerp(this.originalFov, 43, ease); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    this.light.intensity = 9 + Math.sin(this.progress * Math.PI) * 5;
    return this.elapsed >= BREACH_DURATION;
  }
  reset() { this.elapsed = 0; this.light.intensity = 0; }
}
