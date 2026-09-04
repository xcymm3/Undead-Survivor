import * as THREE from 'three';
import { box } from '../game/geometry';
import type { Pawn } from './types';
export class PartnerView extends THREE.Group {
  private body = new THREE.Group();
  private legs: THREE.Mesh[] = [];
  private initialized = false;
  private flash: THREE.Mesh;
  private shots = 0;
  private flashUntil = 0;
  constructor() {
    super(); this.add(this.body);
    box(this.body, [.55, .65, .3], [0, 1.13, 0], 0x476879);
    box(this.body, [.42, .43, .4], [0, 1.76, 0], 0xd6c194);
    box(this.body, [.46, .14, .44], [0, 2, 0], 0x314c57);
    box(this.body, [.35, .09, .025], [0, 1.79, -.213], 0x152d2e);
    for (const x of [-.16, .16]) this.legs.push(box(this.body, [.21, .8, .23], [x, .42, 0], 0x34494b));
    for (const x of [-.34, .34]) box(this.body, [.17, .2, .65], [x, 1.32, -.23], 0x476879);
    box(this.body, [.12, .17, .88], [.24, 1.43, -.45], 0x203233);
    box(this.body, [.09, .25, .12], [.24, 1.24, -.35], 0x203233);
    this.flash = box(this.body, [.2, .2, .3], [.24, 1.43, -.95], 0xffd36f); this.flash.visible = false;
  }
  update(p: Pawn, delta: number, spectator: boolean, time: number) {
    this.visible = !spectator;
    const destination = new THREE.Vector3(p.x, p.height, p.z), moving = this.position.distanceTo(destination) > .05;
    if (!this.initialized) { this.position.copy(destination); this.initialized = true; }
    this.position.lerp(destination, 1 - Math.exp(-delta * 16)); this.rotation.y = p.yaw;
    this.body.rotation.z = p.health > 0 ? 0 : Math.PI / 2;
    this.body.position.y = p.health > 0 ? 0 : .28;
    if (p.shots > this.shots) this.flashUntil = time + .08;
    this.shots = p.shots; this.flash.visible = time < this.flashUntil && p.health > 0;
    this.legs.forEach((leg, i) => { leg.rotation.x = p.health > 0 && moving ? Math.sin(time * 10 + i * Math.PI) * .35 : 0; });
  }
}
