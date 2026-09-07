import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { box } from '../game/geometry';
import { WEAPONS } from '../game/weapons';
import type { Pawn } from './types';
import { APPEARANCE_COLORS, CHARACTER_PRESETS, normalizeAppearance } from './appearance';
import type { CharacterId, PlayerAppearance } from './appearance';

const loader = new GLTFLoader();
const assets = new Map<CharacterId, Promise<GLTF>>();
function loadCharacter(character: CharacterId) {
  let asset = assets.get(character);
  if (!asset) {
    const preset = CHARACTER_PRESETS.find(item => item.id === character)!;
    asset = loader.loadAsync(`${import.meta.env.BASE_URL}models/characters/${preset.file}`).catch(error => {
      assets.delete(character);
      throw error;
    });
    assets.set(character, asset);
  }
  return asset;
}

export class PartnerView extends THREE.Group {
  private fallback = new THREE.Group();
  private modelHost = new THREE.Group();
  private heldWeapon = new THREE.Group();
  private legs: THREE.Mesh[] = [];
  private initialized = false;
  private shots = 0;
  private flashUntil = 0;
  private appearanceKey = '';
  private loadGeneration = 0;
  private retryAppearanceAt = 0;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private action = '';
  private model: THREE.Object3D | null = null;
  private weapon = -1;
  private disposed = false;
  readonly flash: THREE.Mesh;

  constructor() {
    super(); this.add(this.fallback, this.modelHost, this.heldWeapon);
    box(this.fallback, [.55, .65, .3], [0, 1.13, 0], 0x476879);
    box(this.fallback, [.42, .43, .4], [0, 1.76, 0], 0xd6c194);
    box(this.fallback, [.46, .14, .44], [0, 2, 0], 0x314c57);
    box(this.fallback, [.35, .09, .025], [0, 1.79, -.213], 0x152d2e);
    for (const x of [-.16, .16]) this.legs.push(box(this.fallback, [.21, .8, .23], [x, .42, 0], 0x34494b));
    for (const x of [-.34, .34]) box(this.fallback, [.17, .2, .65], [x, 1.32, -.23], 0x476879);
    this.flash = box(this.heldWeapon, [.16, .16, .24], [.22, 1.42, -1], 0xffd36f); this.flash.visible = false;
  }

  private ensureAppearance(value: PlayerAppearance) {
    const appearance = normalizeAppearance(value), key = `${appearance.character}:${appearance.primary}:${appearance.accent}`;
    if (this.appearanceKey === key || performance.now() < this.retryAppearanceAt) return;
    this.appearanceKey = key; const generation = ++this.loadGeneration;
    void loadCharacter(appearance.character).then(asset => {
      if (this.disposed || generation !== this.loadGeneration) return;
      this.clearModel();
      const preset = CHARACTER_PRESETS.find(item => item.id === appearance.character)!;
      const model = cloneSkeleton(asset.scene);
      model.scale.setScalar(.61); model.rotation.y = Math.PI;
      model.traverse(node => {
        if (!(node instanceof THREE.Mesh)) return;
        node.frustumCulled = false; node.castShadow = true; node.receiveShadow = true;
        const tint = (material: THREE.Material) => {
          const copy = material.clone();
          if (copy instanceof THREE.MeshStandardMaterial) {
            if ((preset.primaryMaterials as readonly string[]).includes(copy.name)) copy.color.setHex(APPEARANCE_COLORS[appearance.primary].value);
            if ((preset.accentMaterials as readonly string[]).includes(copy.name)) copy.color.setHex(APPEARANCE_COLORS[appearance.accent].value);
            copy.roughness = .82; copy.metalness = .02;
          }
          return copy;
        };
        node.material = Array.isArray(node.material) ? node.material.map(tint) : tint(node.material);
      });
      this.model = model; this.modelHost.add(model); this.fallback.visible = false;
      this.mixer = new THREE.AnimationMixer(model); this.actions.clear();
      for (const clip of asset.animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
      this.action = ''; this.play('Idle');
    }).catch(error => {
      if (this.disposed || generation !== this.loadGeneration) return;
      this.fallback.visible = !this.model;
      this.appearanceKey = ''; this.retryAppearanceAt = performance.now() + 3000;
      console.warn(`角色模型加载失败，将重试：${appearance.character}`, error);
    });
  }

  private play(name: string) {
    if (!this.mixer || this.action === name) return;
    const next = this.actions.get(name) ?? this.actions.get('Idle'); if (!next) return;
    this.actions.get(this.action)?.fadeOut(.12);
    next.reset(); next.paused = false; next.setEffectiveTimeScale(1).setEffectiveWeight(1);
    const once = ['Death', 'Jump', 'PickUp', 'Shoot_OneHanded'].includes(name);
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity); next.clampWhenFinished = once;
    next.fadeIn(.12).play(); this.action = name;
  }

  private updateWeapon(index: number) {
    if (this.weapon === index) return; this.weapon = index;
    for (const child of [...this.heldWeapon.children]) if (child !== this.flash) {
      child.traverse(node => { if (node instanceof THREE.Mesh) { node.geometry.dispose(); (Array.isArray(node.material) ? node.material : [node.material]).forEach(material => material.dispose()); } });
      this.heldWeapon.remove(child);
    }
    const definition = WEAPONS[index] ?? WEAPONS[0], length = definition.length;
    if (definition.kind === 'melee') {
      const handle = box(this.heldWeapon, [.07, .70, .07], [.22, 1.42, -.63], 0x765039); handle.rotation.x = -.45;
      const head = box(this.heldWeapon, [.36, .18, .10], [.22, 1.70, -.86], 0x879596); head.rotation.x = -.45;
    } else {
      box(this.heldWeapon, [definition.id === 'heavy-machine-gun' ? .24 : .13, definition.kind === 'flame' ? .24 : .15, length], [.22, 1.42, -.48 - length / 2], definition.kind === 'flame' ? 0x3b4b45 : 0x263438);
      box(this.heldWeapon, [.1, .2, .18], [.22, 1.29, -.48], 0x4d5c58);
      if (definition.kind === 'flame') for (const x of [.10, .34]) box(this.heldWeapon, [.12, .34, .14], [x, 1.25, -.62], 0x8b633f);
      if (definition.id === 'heavy-machine-gun') box(this.heldWeapon, [.28, .30, .28], [.08, 1.24, -.66], 0x59604b);
    }
    this.flash.position.set(.22, 1.42, -.52 - length);
  }

  update(p: Pawn, delta: number, spectator: boolean, time: number) {
    this.visible = !spectator; this.ensureAppearance(p.appearance); this.updateWeapon(p.weapon);
    const destination = new THREE.Vector3(p.x, p.height, p.z), moving = this.position.distanceTo(destination) > .05;
    if (!this.initialized) { this.position.copy(destination); this.initialized = true; }
    this.position.lerp(destination, 1 - Math.exp(-delta * 16)); this.rotation.y = p.yaw;
    if (p.shots > this.shots) this.flashUntil = time + .08;
    this.shots = p.shots; this.flash.visible = time < this.flashUntil && p.health > 0 && WEAPONS[p.weapon]?.kind !== 'melee'; this.heldWeapon.visible = p.health > 0;
    const nextAction = p.health <= 0 ? 'Death' : p.reloading ? 'PickUp' : time < this.flashUntil ? 'Shoot_OneHanded' : p.height > .06 ? 'Jump' : moving ? 'Run_Carry' : 'Idle';
    this.play(nextAction);
    const reloadAction = p.reloading ? this.actions.get('PickUp') : undefined;
    if (reloadAction) {
      reloadAction.paused = true;
      reloadAction.time = THREE.MathUtils.clamp(p.reloadProgress, 0, 1) * reloadAction.getClip().duration;
      this.mixer?.update(0);
    } else this.mixer?.update(delta);
    this.fallback.rotation.z = p.health > 0 ? 0 : Math.PI / 2;
    this.fallback.position.y = p.health > 0 ? 0 : .28;
    this.legs.forEach((leg, i) => { leg.rotation.x = p.health > 0 && moving ? Math.sin(time * 10 + i * Math.PI) * .35 : 0; });
  }

  private clearModel() {
    this.mixer?.stopAllAction(); this.actions.clear(); this.mixer = null;
    if (this.model) {
      this.model.traverse(node => { if (node instanceof THREE.Mesh) (Array.isArray(node.material) ? node.material : [node.material]).forEach(material => material.dispose()); });
      this.modelHost.remove(this.model); this.model = null;
    }
  }

  dispose() { this.disposed = true; this.loadGeneration++; this.clearModel(); }
  diagnostics() { return { loaded: Boolean(this.model), appearance: this.appearanceKey, action: this.action, weapon: this.weapon }; }
}
