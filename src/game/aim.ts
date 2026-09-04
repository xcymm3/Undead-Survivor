import { Quaternion, Vector3 } from 'three';

/** 模型以本地 -Z 为枪管轴，枪管和最终子弹共享这条方向。 */
export function weaponQuaternion(origin: Vector3, target: Vector3): Quaternion {
  return new Quaternion().setFromUnitVectors(new Vector3(0, 0, -1), target.clone().sub(origin).normalize());
}
