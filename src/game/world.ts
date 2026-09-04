import * as THREE from 'three';
import { batchStaticBoxes, box, cube, material, seededRandom } from './geometry';
import { ARENA } from './config';
import { SPAWN_ZONES } from './spawn';
import type { Obstacle } from './navigation';

function sign(parent: THREE.Object3D, text: string, subtitle: string, x: number, y: number, z: number, width = 5) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 160;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#303e38'; ctx.fillRect(0, 0, 512, 160);
  ctx.strokeStyle = '#a9af8c'; ctx.lineWidth = 5; ctx.strokeRect(8, 8, 496, 144);
  ctx.fillStyle = '#e4dfbd'; ctx.textAlign = 'center'; ctx.font = 'bold 49px monospace';
  ctx.fillText(text, 256, 75);
  ctx.fillStyle = '#b8bfaa'; ctx.font = '23px monospace'; ctx.fillText(subtitle, 256, 123);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 160 / 512), new THREE.MeshStandardMaterial({ map: texture, roughness: 1 }));
  mesh.position.set(x, y, z);
  parent.add(mesh);
}

function building(scene: THREE.Scene, x: number, z: number) {
  const group = new THREE.Group(); group.position.set(x, 0, z); scene.add(group);
  box(group, [8.2, 4.5, 8], [0, 2.25, 0], 0x949981);
  box(group, [8.4, 0.32, 8.2], [0, 0.2, 0], 0x606e63);
  box(group, [9.2, 0.35, 9], [0, 4.62, 0], 0x4c6056);
  box(group, [8.6, 0.36, 8.6], [0, 4.88, 0], 0x596d5d);
  box(group, [1.6, 2.8, 0.12], [1.7, 1.5, 4.06], 0x354a44);
  box(group, [0.10, 0.24, 0.07], [2.2, 1.5, 4.15], 0xbdb796);
  for (const wx of [-2.2, -0.1]) {
    box(group, [1.55, 1.4, 0.14], [wx, 2.6, 4.04], 0x566359);
    box(group, [1.32, 1.17, 0.16], [wx, 2.6, 4.13], 0x2b4846);
    box(group, [1.55, 0.08, 0.20], [wx, 2.6, 4.24], 0x899985);
    box(group, [0.07, 1.4, 0.20], [wx, 2.6, 4.24], 0x899985);
  }
  box(group, [0.1, 4.6, 0.12], [-4.13, 2.4, 4.07], 0x53665a);
  sign(group, 'PINE RIDGE', 'RANGER STATION  /  04', 0, 4.1, 4.3, 5.3);
  box(group, [0.09, 5, 0.09], [2.4, 7.3, 0], 0x4d5e59);
  box(group, [2, 0.07, 0.07], [2.4, 8.7, 0], 0x4d5e59);
  box(group, [1.4, 0.07, 0.07], [2.4, 9.1, 0], 0x4d5e59);
  return group;
}

function barrier(scene: THREE.Scene, x: number, z: number, angle = 0) {
  const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = angle; scene.add(group);
  box(group, [3.8, 0.4, 0.9], [0, 0.2, 0], 0x7d8272);
  box(group, [3.5, 0.9, 0.55], [0, 0.73, 0], 0xb1ae8b);
  for (let i = 0; i < 7; i++) box(group, [0.27, 0.35, 0.01], [-1.42 + i * 0.47, 0.9, 0.284], i % 2 ? 0xc7af6f : 0x424b42);
  return group;
}

function pickup(scene: THREE.Scene, x: number, z: number) {
  const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = -0.24; scene.add(group);
  box(group, [2.5, 0.8, 4.8], [0, 1, 0], 0x71877d);
  box(group, [2.3, 0.85, 1.7], [0, 1.6, -1.65], 0x7d9387);
  box(group, [2.25, 1.05, 1.9], [0, 2.03, -0.07], 0x465f58);
  box(group, [2.1, 0.75, 0.025], [0, 2.1, 0.91], 0x304949);
  box(group, [2.5, 0.17, 2.1], [0, 2.63, -0.07], 0x90a091);
  box(group, [2.1, 0.15, 1.35], [0, 1.43, 1.61], 0x52695f);
  box(group, [0.15, 0.48, 1.5], [-1.15, 1.6, 1.6], 0x7d9387);
  box(group, [0.15, 0.48, 1.5], [1.15, 1.6, 1.6], 0x7d9387);
  box(group, [2.5, 0.38, 0.18], [0, 1.4, 2.43], 0x879587);
  box(group, [2.6, 0.18, 0.2], [0, 0.8, 2.52], 0x444f48);
  for (const tx of [-1.22, 1.22]) for (const tz of [-1.5, 1.5]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.3, 8), material(0x303b37));
    wheel.rotation.z = Math.PI / 2; wheel.position.set(tx, 0.56, tz); wheel.castShadow = true; group.add(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.33, 8), material(0x7b8577));
    hub.rotation.z = Math.PI / 2; hub.position.copy(wheel.position); group.add(hub);
  }
  for (const sx of [-0.95, 0.95]) box(group, [0.26, 0.24, 0.03], [sx, 1.4, 2.54], 0xa9644e);
  return group;
}

export function createWorld(scene: THREE.Scene) {
  const obstacles: Obstacle[] = [];
  const solid = (object: THREE.Object3D, id: string) => {
    object.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(object);
    obstacles.push({ id, minX: bounds.min.x, maxX: bounds.max.x, minZ: bounds.min.z, maxZ: bounds.max.z });
  };
  scene.background = new THREE.Color(0xb1c7bd);
  scene.fog = new THREE.Fog(0xb1c7bd, 38, 140);
  scene.add(new THREE.HemisphereLight(0xe0ecde, 0x657154, 2.7));
  const sun = new THREE.DirectionalLight(0xffe0a0, 3.1);
  sun.position.set(-28, 40, -20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 110 });
  sun.shadow.normalBias = 0.035;
  sun.target.position.set(0, 0, -20);
  scene.add(sun, sun.target);
  const ground = box(scene, [230, 0.5, 240], [0, -0.3, -75], 0x7e8d68);
  ground.castShadow = false;
  box(scene, [12.8, 0.04, 170], [1, -0.005, -64], 0x9c9d80);
  box(scene, [10, 0.045, 170], [1, 0.015, -64], 0x69756c);
  for (let i = 0; i < 21; i++) box(scene, [0.14, 0.015, 2.8], [1, 0.05, 8 - i * 7.6], 0xbec2a2);
  for (const edge of [-3.4, 5.4]) box(scene, [0.09, 0.015, 148], [edge, 0.048, -59], 0x9aa88e);

  const random = seededRandom(42031);
  // 树冠、树干和草采用实例化绘制，控制大量方块的 draw calls。
  const trunks = new THREE.InstancedMesh(cube, material(0x706a50), 150);
  const foliage = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 4), material(0x547965), 450);
  const transform = new THREE.Object3D();
  for (let i = 0; i < 150; i++) {
    const side = i % 2 ? -1 : 1;
    const x = side * (27 + random() * 60);
    const z = -10 - random() * 135;
    const height = 7 + random() * 11;
    obstacles.push({ id: `tree-${i}`, minX: x - 0.25, maxX: x + 0.25, minZ: z - 0.25, maxZ: z + 0.25 });
    transform.position.set(x, height * 0.26, z); transform.rotation.set(0, 0, 0); transform.scale.set(0.5, height * 0.55, 0.5); transform.updateMatrix(); trunks.setMatrixAt(i, transform.matrix);
    for (let j = 0; j < 3; j++) {
      transform.position.set(x, height * (0.46 + j * 0.2), z);
      transform.rotation.set(0, Math.PI / 4 + random() * 0.12, 0);
      const radius = height * (0.31 - j * 0.071);
      transform.scale.set(radius, height * 0.54, radius); transform.updateMatrix();
      foliage.setMatrixAt(i * 3 + j, transform.matrix);
      foliage.setColorAt(i * 3 + j, new THREE.Color().setHSL(0.36 + random() * 0.035, 0.17, 0.72 + random() * 0.25));
    }
  }
  trunks.castShadow = true; foliage.castShadow = true; foliage.receiveShadow = true;
  scene.add(trunks, foliage);
  const grasses = new THREE.InstancedMesh(cube, material(0x687c51), 520);
  for (let i = 0; i < 520; i++) {
    const x = (i % 2 ? -1 : 1) * (6.6 + random() * 35);
    transform.position.set(x, 0.13, 8 - random() * 95);
    transform.scale.set(0.08 + random() * 0.12, 0.16 + random() * 0.35, 0.09);
    transform.rotation.set(0, random() * 6.28, random() * 0.3); transform.updateMatrix(); grasses.setMatrixAt(i, transform.matrix);
  }
  scene.add(grasses);
  for (let i = 0; i < 28; i++) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), material(0x8c9580));
    rock.position.set((i % 2 ? -1 : 1) * (26 + random() * 20), 0.35, -5 - random() * 75);
    rock.scale.set(0.7 + random() * 1.2, 0.55 + random(), 0.7 + random()); rock.rotation.set(random(), random(), 0); rock.castShadow = true; scene.add(rock);
    solid(rock, `rock-${i}`);
  }
  for (let i = 0; i < 9; i++) {
    const mountain = new THREE.Mesh(new THREE.ConeGeometry(22 + random() * 17, 24 + random() * 24, 5), material(0x8ba99b));
    mountain.position.set(-100 + i * 25, 9, -133 - random() * 20); scene.add(mountain);
  }
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 12), new THREE.MeshBasicMaterial({ color: 0xeee4ba, fog: false }));
  sunDisc.position.set(-52, 43, -130); scene.add(sunDisc);
  for (let i = 0; i < 12; i++) {
    const cloud = box(scene, [8 + random() * 15, 1 + random() * 2, 5], [-80 + random() * 160, 31 + random() * 18, -110 - random() * 60], 0xc7d6c8);
    cloud.castShadow = false;
  }

  solid(building(scene, -13.5, -26), 'station');
  solid(pickup(scene, 10.2, -19), 'pickup');
  solid(barrier(scene, -3, -12, -0.08), 'barrier-near');
  solid(barrier(scene, 4.5, -26, 0.11), 'barrier-east');
  solid(barrier(scene, -1.5, -40), 'barrier-north');
  // 路障横杆保持高于靶标，避免遮挡射击验收。
  solid(box(scene, [0.3, 5.8, 0.3], [-5.5, 2.9, -42], 0x586c5e), 'gate-west');
  solid(box(scene, [0.3, 5.8, 0.3], [7.5, 2.9, -42], 0x586c5e), 'gate-east');
  box(scene, [13.3, 0.18, 0.25], [1, 5.7, -42], 0x596c5e);
  sign(scene, 'RESTRICTED AREA', 'CHECKPOINT 04', 1, 5.0, -41.8, 6);
  // 地面生存区：边墙与碰撞边界一致；北、东各三个固定入口。
  for (const x of [ARENA.minX - 0.25, ARENA.maxX + 0.25]) {
    box(scene, [0.5, 2.8, ARENA.maxZ - ARENA.minZ + 1], [x, 1.4, (ARENA.minZ + ARENA.maxZ) / 2], 0x586c5e);
    box(scene, [0.7, 0.18, ARENA.maxZ - ARENA.minZ + 1], [x, 2.85, (ARENA.minZ + ARENA.maxZ) / 2], 0xa0a68b);
  }
  for (const z of [ARENA.minZ - 0.25, ARENA.maxZ + 0.25]) {
    box(scene, [ARENA.maxX - ARENA.minX, 2.8, 0.5], [0, 1.4, z], 0x586c5e);
    box(scene, [ARENA.maxX - ARENA.minX, 0.18, 0.7], [0, 2.85, z], 0xa0a68b);
  }
  for (const zone of SPAWN_ZONES) {
    const gate = new THREE.Group(); scene.add(gate);
    const east = zone.id.startsWith('east');
    gate.position.set(east ? ARENA.maxX - 0.05 : zone.center.x, 0, east ? zone.center.z : ARENA.minZ + 0.05);
    gate.rotation.y = east ? -Math.PI / 2 : 0;
    box(gate, [3.5, 2.7, 0.08], [0, 1.35, 0], 0x303e38);
    for (const x of [-1.8, 1.8]) box(gate, [0.18, 3.4, 0.18], [x, 1.7, 0], 0xb6a66d);
    sign(gate, east ? 'EAST / INFECTED' : 'NORTH / INFECTED', zone.id.toUpperCase(), 0, 3.3, 0.12, 3.8);
    box(scene, [2.5, 0.035, 2.5], [zone.center.x, 0.08, zone.center.z], 0xaaa077);
  }
  // 僵尸在场景合批后单独加入，便于模式切换与高密度绘制。
  batchStaticBoxes(scene, new Set());
  const surfaces: THREE.Object3D[] = [];
  scene.traverse(obj => { if (obj instanceof THREE.Mesh && obj !== sunDisc && obj !== grasses) surfaces.push(obj); });
  return { surfaces, obstacles };
}
