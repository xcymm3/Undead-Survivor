import * as THREE from 'three';
import { box } from './geometry';
import { BRIDGES, RIVER, RIVER_POINTS, riverCenter } from './terrain';

type Point = [number, number, number];
function quad(vertices: number[], a: Point, b: Point, c: Point, d: Point) {
  vertices.push(...a, ...b, ...c, ...a, ...c, ...d);
}
function surface(scene: THREE.Scene, vertices: number[], color: number) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide }));
  mesh.receiveShadow = true; scene.add(mesh);
  return mesh;
}

/** 地面与公路真正挖开河槽；河岸线直接取自碰撞数据。 */
export function createTerrain(scene: THREE.Scene) {
  const splitGround = (minX: number, maxX: number, minZ: number, maxZ: number, y: number, color: number) => {
    const vertices: number[] = [];
    const xs = [minX, ...RIVER_POINTS.map(p => p.x).filter(x => x > minX && x < maxX), maxX];
    for (let i = 1; i < xs.length; i++) {
      const x0 = xs[i - 1], x1 = xs[i], z0 = riverCenter(x0), z1 = riverCenter(x1);
      quad(vertices, [x0, y, minZ], [x1, y, minZ], [x1, y, z1 - RIVER.halfWidth], [x0, y, z0 - RIVER.halfWidth]);
      quad(vertices, [x0, y, z0 + RIVER.halfWidth], [x1, y, z1 + RIVER.halfWidth], [x1, y, maxZ], [x0, y, maxZ]);
    }
    surface(scene, vertices, color);
  };
  splitGround(-22, 22, -195, 45, -0.05, 0x7e8d68);
  for (const x of [-68.5, 68.5]) {
    const ground = box(scene, [93, 0.5, 240], [x, -0.3, -75], 0x7e8d68); ground.castShadow = false;
  }
  splitGround(-5.4, 7.4, -149, 21, -0.01, 0x9c9d80);
  splitGround(-4, 6, -149, 21, 0.015, 0x69756c);
  for (const x of [-3.4, 5.4]) splitGround(x - 0.045, x + 0.045, -133, 15, 0.048, 0x9aa88e);
  for (let i = 0; i < 21; i++) {
    const z = 8 - i * 7.6;
    if (Math.abs(z - riverCenter(1)) > RIVER.halfWidth + 1.4) box(scene, [0.14, 0.015, 2.8], [1, 0.05, z], 0xbec2a2);
  }
  const water: number[] = [], banks: number[] = [];
  for (let i = 1; i < RIVER_POINTS.length; i++) {
    const a = RIVER_POINTS[i - 1], b = RIVER_POINTS[i];
    quad(water, [a.x, RIVER.waterHeight, a.z - RIVER.halfWidth], [b.x, RIVER.waterHeight, b.z - RIVER.halfWidth],
      [b.x, RIVER.waterHeight, b.z + RIVER.halfWidth], [a.x, RIVER.waterHeight, a.z + RIVER.halfWidth]);
    for (const side of [-1, 1]) quad(banks,
      [a.x, -0.05, a.z + side * RIVER.halfWidth], [b.x, -0.05, b.z + side * RIVER.halfWidth],
      [b.x, RIVER.bedHeight, b.z + side * RIVER.halfWidth], [a.x, RIVER.bedHeight, a.z + side * RIVER.halfWidth]);
  }
  const waterMesh = surface(scene, water, 0x397f89);
  waterMesh.name = 'river-water';
  surface(scene, banks, 0x656b50);
  for (let x = -21; x < 22; x += 1.6) {
    const ripple = box(scene, [0.55, 0.015, 0.035], [x, RIVER.waterHeight + 0.02, riverCenter(x) + Math.sin(x * 4) * 0.55], 0x9ac7bd);
    ripple.castShadow = false;
  }
  for (const bridge of BRIDGES) {
    const group = new THREE.Group(); group.name = bridge.id; scene.add(group);
    group.position.set(bridge.x, 0, bridge.z);
    box(group, [bridge.halfWidth * 2, 0.18, bridge.halfLength * 2], [0, -0.09, 0], 0x665b43);
    for (let z = -bridge.halfLength + 0.16; z < bridge.halfLength; z += 0.32) {
      box(group, [bridge.halfWidth * 2, 0.04, 0.29], [0, 0.02, z], Math.round(z * 10) % 2 ? 0x9a906a : 0xafa17a);
    }
    for (const x of [-bridge.halfWidth, bridge.halfWidth]) {
      box(group, [0.10, 0.14, bridge.halfLength * 2], [x, 0.04, 0], 0xc1ac70);
      for (const z of [-bridge.halfLength, bridge.halfLength]) {
        box(group, [0.12, 0.75, 0.12], [x + Math.sign(x) * 0.2, 0.375, z], 0xbdb079);
      }
    }
  }
}
