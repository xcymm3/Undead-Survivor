import { Quaternion, Vector3 } from 'three';

export const MIN_WEAPON_CONVERGENCE = 6;

/** 近处命中点只影响子弹，不让第一人称枪模因深度突变大幅摆动或切入相机。 */
export function visualWeaponTarget(target: Vector3, minimum = MIN_WEAPON_CONVERGENCE): Vector3 {
  const distance = target.length();
  if (distance >= minimum) return target;
  return distance > 1e-8 ? target.clone().multiplyScalar(minimum / distance) : new Vector3(0, 0, -minimum);
}

/** 模型以本地 -Z 为枪管轴，枪管和最终子弹共享这条方向。 */
export function weaponQuaternion(origin: Vector3, target: Vector3): Quaternion {
  return new Quaternion().setFromUnitVectors(new Vector3(0, 0, -1), target.clone().sub(origin).normalize());
}
