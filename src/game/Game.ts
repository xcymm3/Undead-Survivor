import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CONFIG, FIXED_DIFFICULTY } from './config';
import type { GameMode, GamePhase, GameSnapshot, RunResult } from './config';
import { DEFAULT_GRAPHICS_SETTINGS, GRAPHICS_STORAGE_KEY, loadGraphicsSettings, matchingGraphicsPreset, presetSettings } from './graphics';
import type { AntiAliasing, GraphicsPreset, GraphicsSettings, ShadowQuality } from './graphics';
import { visualWeaponTarget, weaponQuaternion } from './aim';
import { scheduleFrame } from './frameTiming';
import { GameAudio } from './audio';
import { Arsenal } from './arsenal';
import { WEAPONS } from './weapons';
import { cube, material } from './geometry';
import { WeaponView } from './weapon';
import { createWorld } from './world';
import { Encounter } from './encounter';
import { ZombieField } from './zombies';
import { SpawnDirector } from './spawn';
import { BloodEffects } from './blood';
import { ArmorEffects } from './armorEffects';
import { BreachSequence } from './breach';
import { Navigation } from './navigation';
import { filterPointerMovement, PlayerMotion, turnView } from './player';
import { isWater, BRIDGES, RIVER_POINTS } from './terrain';
import { CoopSession } from '../multiplayer/CoopSession';
import { PartnerView } from '../multiplayer/PartnerView';
import type { Match, Pawn } from '../multiplayer/types';
import { DEFAULT_LOOK_SENSITIVITY, loadLookSensitivity, LOOK_SENSITIVITY_STORAGE_KEY, lookSensitivityRadians, normalizeLookSensitivity } from './controls';
import type { PlayerAppearance } from '../multiplayer/appearance';
import { crossedReloadStage, reloadPose, reloadStage } from './reloadAnimation';

interface Effect { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; maxLife: number; gravity: number; spin: boolean; shrink: boolean; }
interface GameCallbacks { onState: (state: GameSnapshot) => void; onHit: (head: boolean, killed: boolean, armorBroken: boolean) => void; onError: (message: string) => void; onEnd: (result: RunResult) => void; }

export class Game {
  private coop: CoopSession | null = null;
  private partners = new Map<string, PartnerView>();
  private jumpSequence = 0;
  private coopTimer: ReturnType<typeof setInterval> | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.025, 220);
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private appliedAntiAliasing: AntiAliasing = 'off';
  private weapon = new WeaponView();
  private world: ReturnType<typeof createWorld>;
  private encounter = new Encounter();
  private spawns = new SpawnDirector();
  private zombieField = new ZombieField();
  private blood = new BloodEffects();
  private armorEffects = new ArmorEffects();
  private breachSequence = new BreachSequence();
  private navigation: Navigation;
  private result: RunResult | null = null;
  private arsenal = new Arsenal();
  private get firearm() { return this.arsenal.gun; }
  private wheelTime = 0;
  private audio = new GameAudio();
  private phase: GamePhase = 'ready';
  private playerMotion = new PlayerMotion();
  private keys = new Set<string>();
  private lockPending = false;
  private lockHint = false;
  private focused = true;
  private aim = new THREE.Vector2();
  private view = new THREE.Vector2();
  private aimPoint = new THREE.Vector3();
  private raycaster = new THREE.Raycaster();
  private effects: Effect[] = [];
  private hitCount = 0;
  private kills = 0;
  private trigger = false;
  private recoil = 0;
  private flashTime = 0;
  private displayedWeapon = 0;
  private spectatingPlayer: string | null = null;
  private spectatedPlayerId: string | null = null;
  private spectatorShots = 0;
  private spectatorFireRemaining = 0;
  private elapsed = 0;
  private frameId = 0;
  private previousTime = 0;
  private frameDeadline = 0;
  private dirty = true;
  private renderCount = 0;
  private shadowTime = 0;
  private publishTime = 0;
  private frameCount = 0;
  private fpsTime = 0;
  private fps = 60;
  private graphics: GraphicsSettings = { ...DEFAULT_GRAPHICS_SETTINGS };
  private sensitivity = DEFAULT_LOOK_SENSITIVITY;
  private appliedShadowQuality: ShadowQuality | null = null;
  private effectLimit = 160;
  private renderWidth = 1;
  private renderHeight = 1;
  private gpu = '未识别';
  private disposed = false;
  private width = 1;
  private height = 1;
  private observer: ResizeObserver;
  private lastShot: { muzzle: number[]; direction: number[]; aimPoint: number[]; impact: number[]; hitTarget: number | null } | null = null;

  constructor(private host: HTMLDivElement, private callbacks: GameCallbacks) {
    try { this.graphics = loadGraphicsSettings(localStorage); } catch { /* 禁用存储时沿用默认画质。 */ }
    try { this.sensitivity = loadLookSensitivity(localStorage); } catch { /* 禁用存储时沿用默认灵敏度。 */ }
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    const gl = this.renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    this.gpu = String(debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).slice(0, 100);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.setAttribute('aria-label', '灰松哨站 3D 射击场景，WASD 移动，鼠标自由转向，左键开火');
    this.renderer.domElement.setAttribute('data-testid', 'game-canvas');
    this.renderer.domElement.tabIndex = 0;
    host.appendChild(this.renderer.domElement);
    this.camera.position.set(0, CONFIG.camera.height, 9);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.x = 0;
    this.world = createWorld(this.scene);
    this.navigation = new Navigation(this.world.obstacles, true);
    this.encounter.setNavigation(this.navigation);
    this.zombieField.sync(this.encounter);
    this.scene.add(this.zombieField);
    this.scene.add(this.blood);
    this.scene.add(this.armorEffects, this.breachSequence.light);
    this.scene.add(this.camera);
    this.camera.add(this.weapon.root);
    this.weapon.root.scale.setScalar(0.5);
    this.applyGraphicsSettings(false);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(host);
    this.resize();
    this.renderer.domElement.addEventListener('pointermove', this.pointerMove);
    this.renderer.domElement.addEventListener('pointerdown', this.pointerDown);
    this.renderer.domElement.addEventListener('pointerleave', this.releaseTrigger);
    this.renderer.domElement.addEventListener('pointercancel', this.releaseTrigger);
    this.renderer.domElement.addEventListener('contextmenu', this.contextMenu);
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLost);
    window.addEventListener('pointerup', this.releaseTrigger);
    window.addEventListener('blur', this.blur);
    window.addEventListener('focus', this.focus);
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    document.addEventListener('pointerlockchange', this.pointerLockChange);
    document.addEventListener('pointerlockerror', this.pointerLockError);
    this.renderer.domElement.addEventListener('wheel', this.wheel, { passive: false });
    document.addEventListener('visibilitychange', this.visibility);
    void this.weapon.ready.then(() => { if (this.disposed) return; this.updateAim(0); this.dirty = true; this.publish(); }).catch(error => { if (!this.disposed) { console.error(error); this.callbacks.onError('枪械资源加载失败，请重新加载游戏。'); } });
    this.updateAim(0);
    this.publish();
    this.frameId = requestAnimationFrame(this.frame);
  }

  private resize = () => {
    this.width = Math.max(1, this.host.clientWidth);
    this.height = Math.max(1, this.host.clientHeight);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    const nativeRatio = Math.min(devicePixelRatio, 2, 3840 / this.width, 2160 / this.height);
    const ratio = nativeRatio * this.graphics.resolutionScale * (this.graphics.pixelated ? 0.68 : 1);
    this.renderer.setPixelRatio(Math.max(0.34, ratio));
    this.renderer.setSize(this.width, this.height);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(this.width, this.height);
    const buffer = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.renderWidth = Math.round(buffer.x); this.renderHeight = Math.round(buffer.y);
    this.dirty = true;
    this.updateCrosshair();
  };

  private updateCrosshair() {
    this.host.style.setProperty('--aim-x', `${(this.aim.x + 1) * this.width / 2}px`);
    this.host.style.setProperty('--aim-y', `${(1 - this.aim.y) * this.height / 2}px`);
  }

  private get pointerLocked() { return document.pointerLockElement === this.renderer.domElement; }
  // Electron 联机关闭计时器限速后，Page Visibility 可能仍报告可见；失焦时也停绘，只保留同步。
  private get background() { return document.hidden || (this.coop !== null && !this.focused); }
  private requestPointerLock() {
    if (this.pointerLocked || this.lockPending) return;
    this.lockPending = true;
    try {
      const request = this.renderer.domElement.requestPointerLock();
      if (request) void request.catch(() => this.pointerLockError());
    } catch { this.pointerLockError(); }
  }
  private pointerLockError = () => {
    if (this.disposed) return;
    this.lockPending = false;
    // 浏览器可在刚按 Esc 后拒绝立即重锁；保留点击场景重试的入口。
    this.lockHint = true;
    this.publish();
  };
  private pointerLockChange = () => {
    this.lockPending = false;
    if (this.pointerLocked) {
      if (this.phase !== 'playing') { document.exitPointerLock(); return; }
      this.lockHint = false;
    } else if (this.phase === 'playing') this.pause();
    this.publish();
  };
  private keyUp = (event: KeyboardEvent) => { this.keys.delete(event.code); };
  private clearInput() {
    this.keys.clear(); this.playerMotion.clearInput(); this.trigger = false;
    this.coop?.sendInput(this.keys, this.view.x, this.view.y, this.jumpSequence, 1);
    if (this.pointerLocked) document.exitPointerLock();
  }
  private pointerMove = (event: PointerEvent) => {
    if (this.phase !== 'playing' || !this.pointerLocked) return;
    const sensitivity = lookSensitivityRadians(this.sensitivity);
    const movement = filterPointerMovement(event.movementX, event.movementY, this.width, this.height, sensitivity);
    const next = turnView(this.view.x, this.view.y, movement.dx, movement.dy, sensitivity);
    this.view.set(next.yaw, next.pitch);
  };

  private pointerDown = (event: PointerEvent) => {
    if (this.phase !== 'playing' || event.button !== 0) return;
    event.preventDefault();
    this.renderer.domElement.focus({ preventScroll: true });
    if (this.coop?.local.health === 0) {
      if (!this.pointerLocked) this.requestPointerLock(); else this.cycleSpectator();
      return;
    }
    if (!this.pointerLocked) { this.requestPointerLock(); return; }
    this.audio.unlock();
    this.trigger = this.firearm.definition.automatic;
    this.updateAim(0);
    this.shoot();
  };
  private releaseTrigger = () => { this.trigger = false; };
  private contextMenu = (event: Event) => event.preventDefault();
  private contextLost = (event: Event) => {
    event.preventDefault();
    this.pause();
    this.callbacks.onError('3D 图形上下文已中断，请刷新页面重新加载哨站。');
  };
  private blur = () => { this.focused = false; this.pause(); };
  private focus = () => { this.focused = true; this.dirty = true; };
  private visibility = () => { if (document.hidden) this.pause(); };
  private keyDown = (event: KeyboardEvent) => {
    if (event.repeat) return;
    const tag = (event.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (event.code === 'Escape') { event.preventDefault(); if (this.phase === 'playing') this.pause(); else if (this.phase === 'paused') this.start(); }
    if (this.phase !== 'playing') return;
    if (event.code === 'Space') { event.preventDefault(); if (this.pointerLocked && (!this.coop || this.coop.local.health > 0)) { this.playerMotion.jump(); this.jumpSequence++; } }
    if (/^Key[WASD]$/.test(event.code)) { event.preventDefault(); if (this.pointerLocked) this.keys.add(event.code); }
    if (/^(Digit|Numpad)[1-6]$/.test(event.code)) { event.preventDefault(); this.switchWeapon(Number(event.code.slice(-1)) - 1); }
    if (event.code === 'KeyR') { event.preventDefault(); this.reload(); }
    if (event.code === 'KeyM') this.setSound(!this.audio.enabled);
  };

  switchWeapon(index: number) {
    if (this.coop?.local.health === 0) return;
    if (this.phase !== 'playing' || !this.weapon.loaded) return;
    this.releaseTrigger(); this.flashTime = 0;
    this.arsenal.request(index); this.publish();
    this.coop?.command({ type: 'weapon', index });
  }
  private wheel = (event: WheelEvent) => {
    if (this.phase !== 'playing' || event.ctrlKey || event.deltaY === 0) return;
    event.preventDefault();
    if (event.timeStamp - this.wheelTime < 100) return;
    this.wheelTime = event.timeStamp;
    this.switchWeapon((this.arsenal.requested + Math.sign(event.deltaY) + WEAPONS.length) % WEAPONS.length);
  };

  start() {
    if (!this.weapon.loaded) return;
    if (this.phase === 'failed' || this.phase === 'breaching') return;
    this.phase = 'playing';
    this.keys.clear(); this.trigger = false;
    this.requestPointerLock();
    this.previousTime = 0; this.frameDeadline = 0;
    this.dirty = true;
    this.aim.set(0, 0);
    this.updateCrosshair();
    this.audio.unlock();
    this.renderer.domElement.focus({ preventScroll: true });
    this.audio.setPlaying(true);
    this.publish();
  }

  pause() {
    this.audio.setPlaying(false);
    this.dirty = true;
    if (this.phase === 'playing') this.phase = 'paused';
    this.clearInput(); this.publish();
  }

  private prepare(mode: GameMode) {
    this.stopCoop();
    this.breachSequence.reset();
    this.camera.position.set(0, CONFIG.camera.height, 9); this.camera.fov = CONFIG.camera.fov; this.camera.updateProjectionMatrix();
    this.audio.resetMusic();
    this.weapon.root.visible = true;
    this.arsenal.reset(); this.weapon.select(0); this.displayedWeapon = 0; this.hitCount = 0; this.kills = 0;
    this.encounter.reset(mode, FIXED_DIFFICULTY); this.playerMotion.reset();
    this.keys.clear(); this.navigation.setGoal(this.encounter.player);
    this.spawns.reset();
    this.zombieField.sync(this.encounter);
    this.blood.reset();
    this.armorEffects.reset();
    this.result = null;
    this.elapsed = 0;
    this.view.set(0, 0); this.aim.set(0, 0); this.recoil = 0; this.flashTime = 0; this.lastShot = null;
    this.spectatingPlayer = null; this.spectatedPlayerId = null; this.spectatorShots = 0; this.spectatorFireRemaining = 0;
    this.renderer.shadowMap.needsUpdate = true;
    for (const effect of this.effects) this.scene.remove(effect.mesh);
    this.effects = [];
  }

  begin(mode: GameMode) {
    if (!this.weapon.loaded) return;
    this.prepare(mode);
    this.phase = 'ready';
    this.start();
  }

  reset() { this.begin(this.encounter.mode); }

  beginCoop(match: Match, send: (data: unknown) => void, appearance?: PlayerAppearance) {
    this.prepare('survival'); this.jumpSequence = 0;
    this.coop = new CoopSession(match, this.encounter, this.navigation, send, appearance);
    for (const player of this.coop.remotes) {
      const partner = new PartnerView(); this.partners.set(player.id, partner); this.scene.add(partner);
    }
    this.phase = 'ready'; this.start(); this.coop.announceAppearance(); this.coop.broadcast(0, true);
    this.coopTimer = setInterval(() => {
      if (!this.coop || this.phase === 'failed') return;
      // 队员同样推进武器与结算，避免切出窗口后换弹冻结或错过全员阵亡快照。
      if (this.background) {
        const previousWeapon = this.arsenal.active;
        this.arsenal.update(.05);
        if (this.arsenal.active !== previousWeapon) { this.weapon.select(this.arsenal.active); this.displayedWeapon = this.arsenal.active; }
        this.advanceCoop(.05); this.publish();
      }
      if (performance.now() - this.coop.lastPacketAt > 20000) {
        this.callbacks.onError('队友同步已中断，请重新连接房间。');
        void window.steamCoop?.leave().catch(() => {}); this.menu();
      }
    }, 50);
  }
  receiveCoop(from: string, data: unknown) { this.coop?.receive(from, data); this.dirty = true; }
  private stopCoop() {
    if (this.coopTimer) clearInterval(this.coopTimer); this.coopTimer = null;
    for (const partner of this.partners.values()) { this.scene.remove(partner); partner.dispose(); }
    this.partners.clear(); this.coop = null;
  }

  menu() {
    this.prepare('practice');
    this.phase = 'ready'; this.clearInput(); this.dirty = true;
    this.updateCrosshair(); this.publish();
  }

  private endRun() {
    if (this.coop && (this.phase === 'playing' || this.phase === 'paused')) {
      this.coop.broadcast(0, true); this.phase = 'failed'; this.clearInput(); this.weapon.root.visible = false;
      this.audio.setPlaying(false); this.audio.failure();
      this.result = { mode: 'survival', waves: this.encounter.wavesCleared, wave: this.encounter.wave, cause: 'zombie',
        id: this.coop.match.session, difficulty: FIXED_DIFFICULTY, duration: this.encounter.elapsed, kills: this.encounter.kills,
        shots: this.arsenal.shots, hits: this.hitCount, endedAt: new Date().toISOString() };
      this.publish(); return;
    }
    if (this.phase !== 'playing') return;
    this.phase = 'breaching'; this.clearInput(); this.flashTime = 0; this.dirty = true;
    this.weapon.root.visible = false;
    this.audio.setPlaying(false);
    this.result = { mode: this.encounter.mode, waves: this.encounter.wavesCleared, wave: this.encounter.wave, cause: this.encounter.failureCause ?? 'zombie', id: crypto.randomUUID(), difficulty: this.encounter.difficulty, duration: this.encounter.elapsed, kills: this.kills, shots: this.arsenal.shots, hits: this.hitCount, endedAt: new Date().toISOString() };
    if (this.encounter.failureCause === 'water') {
      this.phase = 'failed'; this.audio.failure();
      if (this.encounter.mode === 'survival') this.callbacks.onEnd(this.result);
      this.publish(); return;
    }
    const culprit = this.encounter.zombies.find(z => z.id === this.encounter.breachedId)!;
    this.breachSequence.begin(this.camera, culprit, this.world.surfaces);
    this.audio.failure();
    this.publish();
  }

  private spawnEnemy = () => {
    const survivors = this.coop?.players.filter(p => p.health > 0);
    const target = survivors?.find(p => p.id === this.coop?.local.id) ?? survivors?.[0];
    return this.spawns.next(target ?? this.encounter.player, target?.yaw ?? this.view.x, position => this.navigation.clear(position, position)
    && (!survivors || survivors.every(p => Math.hypot(p.x - position.x, p.z - position.z) >= 8))
    && this.navigation.waypoint(position) !== null
    && this.encounter.zombies.every(z => z.health <= 0 || Math.hypot(z.x - position.x, z.z - position.z) > 1.35));
  };

  reload() {
    if (this.coop?.local.health === 0) return;
    if (this.phase === 'playing' && this.arsenal.reload()) {
      this.coop?.command({ type: 'reload', index: this.arsenal.active });
      if (this.firearm.reloading) this.audio.mechanical('release');
      this.publish();
    }
  }
  setSound(enabled: boolean) { this.audio.enabled = enabled; if (enabled) this.audio.unlock(); this.publish(); }
  setVolume(volume: number) { this.audio.volume = volume; this.audio.unlock(); this.publish(); }
  setSensitivity(value: number) {
    this.sensitivity = normalizeLookSensitivity(value);
    try { localStorage.setItem(LOOK_SENSITIVITY_STORAGE_KEY, String(this.sensitivity)); } catch { /* 当前会话的灵敏度调节仍然有效。 */ }
    this.publish();
  }
  setPixelated(enabled: boolean) { this.setGraphicsOption('pixelated', enabled); }
  applyGraphicsPreset(preset: GraphicsPreset) {
    this.graphics = presetSettings(preset);
    this.applyGraphicsSettings();
  }
  setGraphicsOption<K extends keyof GraphicsSettings>(key: K, value: GraphicsSettings[K]) {
    this.graphics = { ...this.graphics, [key]: value };
    this.applyGraphicsSettings();
  }

  private applyGraphicsSettings(persist = true) {
    const shadow = { off: [false, 512, Infinity], low: [true, 512, 500], medium: [true, 1024, 250], high: [true, 2048, 100], ultra: [true, 4096, 0] }[this.graphics.shadows] as [boolean, number, number];
    this.renderer.shadowMap.enabled = shadow[0];
    this.world.sun.castShadow = shadow[0];
    if (this.appliedShadowQuality !== this.graphics.shadows) {
      this.world.sun.shadow.map?.dispose();
      this.world.sun.shadow.map = null;
      this.world.sun.shadow.mapSize.set(shadow[1], shadow[1]);
      this.renderer.shadowMap.needsUpdate = shadow[0];
      this.appliedShadowQuality = this.graphics.shadows;
    }
    const view = { near: [28, 90, 105], medium: [34, 125, 155], far: [38, 170, 220] }[this.graphics.viewDistance];
    const fog = this.scene.fog;
    if (fog instanceof THREE.Fog) { fog.near = view[0]; fog.far = view[1]; }
    this.camera.far = view[2];
    this.camera.updateProjectionMatrix();
    this.effectLimit = { low: 48, medium: 96, high: 160 }[this.graphics.effects];
    this.blood.setDensity({ low: 0.45, medium: 0.7, high: 1 }[this.graphics.effects]);
    this.configurePostProcessing();
    if (persist) {
      try { localStorage.setItem(GRAPHICS_STORAGE_KEY, JSON.stringify(this.graphics)); } catch { /* 设置仍对当前运行有效。 */ }
    }
    this.previousTime = 0; this.frameDeadline = 0;
    this.resize();
    this.publish();
  }

  private configurePostProcessing() {
    if (this.appliedAntiAliasing === this.graphics.antiAliasing && (this.graphics.antiAliasing === 'off' || this.composer)) return;
    this.disposeComposer();
    this.appliedAntiAliasing = this.graphics.antiAliasing;
    if (this.graphics.antiAliasing === 'off') return;
    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    composer.addPass(this.graphics.antiAliasing === 'smaa' ? new SMAAPass() : new FXAAPass());
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  private disposeComposer() {
    this.composer?.passes.forEach(pass => pass.dispose());
    this.composer?.dispose();
    this.composer = null;
  }

  private activeSurfaces() {
    return [...this.world.surfaces, this.zombieField];
  }

  private spectatedPlayer() {
    if (!this.coop || this.coop.local.health > 0) { this.spectatedPlayerId = null; return null; }
    const alive = this.coop.remotes.filter(player => player.health > 0);
    const selected = alive.find(player => player.id === this.spectatedPlayerId) ?? alive[0] ?? null;
    this.spectatedPlayerId = selected?.id ?? null;
    return selected;
  }

  private cycleSpectator() {
    if (!this.coop || this.coop.local.health > 0) return;
    const alive = this.coop.remotes.filter(player => player.health > 0);
    if (alive.length < 2) return;
    const current = alive.findIndex(player => player.id === this.spectatedPlayerId);
    this.spectatedPlayerId = alive[(current + 1 + alive.length) % alive.length].id;
    this.spectatingPlayer = null; this.spectatorFireRemaining = 0; this.dirty = true;
    this.updateAim(0); this.publish();
  }

  private updateAim(delta: number) {
    const spectated = this.spectatedPlayer();
    this.camera.position.set(spectated?.x ?? this.encounter.player.x, CONFIG.camera.height + (spectated?.height ?? this.playerMotion.height), spectated?.z ?? this.encounter.player.z);
    this.camera.rotation.set(spectated?.pitch ?? this.view.y, spectated?.yaw ?? this.view.x, 0, 'YXZ');
    this.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.aim, this.camera);
    this.raycaster.far = CONFIG.weapon.range;
    const hit = this.raycaster.intersectObjects(this.activeSurfaces(), false)[0];
    this.aimPoint.copy(hit?.point ?? this.raycaster.ray.at(CONFIG.weapon.range, new THREE.Vector3()));
    const gun = this.firearm;
    let reloadProgress = 0, reloadEmpty = false, drop = 0, definition = gun.definition;
    if (spectated) {
      const weaponIndex = Math.min(WEAPONS.length - 1, Math.max(0, spectated.weapon));
      definition = WEAPONS[weaponIndex];
      if (this.spectatingPlayer !== spectated.id) {
        this.spectatingPlayer = spectated.id; this.spectatorShots = spectated.shots; this.spectatorFireRemaining = 0;
      }
      if (this.displayedWeapon !== weaponIndex) { this.weapon.select(weaponIndex); this.displayedWeapon = weaponIndex; }
      if (spectated.shots > this.spectatorShots) {
        this.spectatorFireRemaining = definition.fireDuration;
        this.flashTime = 0.065;
        this.recoil = Math.min(1, this.recoil + definition.recoil);
      }
      this.spectatorShots = Math.max(this.spectatorShots, spectated.shots);
      this.spectatorFireRemaining = Math.max(0, this.spectatorFireRemaining - delta);
      this.weapon.animate(spectated.reloading ? 'reload' : this.spectatorFireRemaining > 0 ? 'fire' : 'idle', spectated.reloading ? spectated.reloadProgress : this.spectatorFireRemaining > 0 ? 1 - this.spectatorFireRemaining / definition.fireDuration : 1);
      this.host.parentElement?.style.setProperty('--reload-progress', String(spectated.reloading ? spectated.reloadProgress : 0));
      reloadProgress = spectated.reloading ? spectated.reloadProgress : 0; reloadEmpty = spectated.reloadEmpty;
    } else {
      this.spectatingPlayer = null; this.spectatorShots = 0; this.spectatorFireRemaining = 0;
      if (this.displayedWeapon !== this.arsenal.active) { this.weapon.select(this.arsenal.active); this.displayedWeapon = this.arsenal.active; }
      this.weapon.animate(gun.reloading ? 'reload' : gun.fireRemaining > 0 ? 'fire' : 'idle', gun.reloading ? gun.animationProgress : gun.fireProgress);
      this.host.parentElement?.style.setProperty('--reload-progress', String(gun.reloadProgress));
      reloadProgress = gun.reloading ? gun.animationProgress : 0; reloadEmpty = gun.reloadEmpty;
      drop = this.arsenal.switching ? Math.sin(Math.PI * this.arsenal.switchProgress) : 0;
    }
    const viewX = Math.min(0.38, Math.tan(THREE.MathUtils.degToRad(CONFIG.camera.fov / 2)) * this.camera.aspect * 0.8);
    const viewY = definition.length < 0.6 ? -0.32 : -0.40;
    const pose = reloadPose(definition, reloadProgress, reloadEmpty);
    this.weapon.root.position.set(viewX * .5 + pose.x, (viewY - drop * 1.45 - this.recoil * .025) * .5 + pose.y, -.38 + this.recoil * .04 + pose.z);
    const localTarget = this.camera.worldToLocal(this.aimPoint.clone());
    this.weapon.root.quaternion.copy(weaponQuaternion(this.weapon.root.position, visualWeaponTarget(localTarget)));
    this.weapon.root.rotateX(pose.rx); this.weapon.root.rotateY(pose.ry); this.weapon.root.rotateZ(pose.rz - drop * .20);
    this.weapon.root.updateMatrixWorld(true);
  }

  private addEffect(position: THREE.Vector3, velocity: THREE.Vector3, scale: THREE.Vector3, color: number, life: number, gravity = 0, spin = false, shrink = true, emissive = false) {
    const effectMaterial = emissive ? this.tracerMaterial : material(color);
    const mesh = new THREE.Mesh(cube, effectMaterial);
    mesh.position.copy(position); mesh.scale.copy(scale); this.scene.add(mesh);
    this.effects.push({ mesh, velocity, life, maxLife: life, gravity, spin, shrink });
    if (this.effects.length > this.effectLimit) this.scene.remove(this.effects.shift()!.mesh);
    return mesh;
  }
  private tracerMaterial = new THREE.MeshBasicMaterial({ color: 0xffdf9b });

  private remoteShoot = (pawn: Pawn, arsenal: Arsenal) => {
    if (pawn.health <= 0 || !arsenal.fire()) return;
    this.zombieField.sync(this.encounter); this.scene.updateMatrixWorld(true);
    const camera = new THREE.PerspectiveCamera(); camera.position.set(pawn.x, 1.7 + pawn.height, pawn.z);
    camera.rotation.set(pawn.pitch, pawn.yaw, 0, 'YXZ'); camera.updateMatrixWorld();
    this.raycaster.setFromCamera(new THREE.Vector2(), camera); this.raycaster.far = CONFIG.weapon.range;
    const aim = this.raycaster.intersectObjects(this.activeSurfaces(), false)[0]?.point ?? this.raycaster.ray.at(CONFIG.weapon.range, new THREE.Vector3());
    const muzzle = new THREE.Vector3(.24, -.18, -.5).applyQuaternion(camera.quaternion).add(camera.position);
    const center = aim.clone().sub(muzzle).normalize(), right = new THREE.Vector3().crossVectors(center, camera.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, center).normalize(), gun = arsenal.gun.definition;
    let landed = false, head = false, killed = false, armorBroken = false;
    for (let i = 0; i < gun.pellets; i++) {
      const angle = i * 2.399963229728653, radius = gun.spread * Math.sqrt(i / Math.max(1, gun.pellets - 1));
      const direction = center.clone().addScaledVector(right, Math.cos(angle) * radius).addScaledVector(up, Math.sin(angle) * radius).normalize();
      this.raycaster.set(muzzle, direction); const hit = this.raycaster.intersectObjects(this.activeSurfaces(), false)[0];
      const target = this.zombieField.decode(hit);
      if (target) {
        const damage = this.encounter.hit(target.id, target.head, gun.damage * (target.head ? 2 : 1));
        if (damage) {
          if (!this.background && damage.armorBroken && damage.armorHit) this.armorEffects.release(this.zombieField.captureArmor(target.id, damage.armorHit), direction);
          if (!this.background && damage.killed && hit) this.blood.burst(hit.point, direction, target.head);
          landed = true; head ||= target.head; killed ||= damage.killed; armorBroken ||= damage.armorBroken;
        }
        this.zombieField.sync(this.encounter); this.scene.updateMatrixWorld(true);
      }
      if (!this.background) {
        const end = hit?.point ?? muzzle.clone().addScaledVector(direction, CONFIG.weapon.range);
        const tracer = this.addEffect(muzzle.clone().lerp(end, .5), new THREE.Vector3(), new THREE.Vector3(.015, .015, muzzle.distanceTo(end)), 0, .06, 0, false, false, true);
        tracer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
      }
    }
    if (landed) this.coop?.sendHit(pawn.id, head, killed, armorBroken);
    if (!this.background) this.audio.shot();
  };

  private advanceCoop(delta: number) {
    const coop = this.coop!;
    const local = coop.local, controlled = this.phase === 'playing' && this.pointerLocked && local.health > 0;
    const keys = controlled ? this.keys : new Set<string>();
    if (coop.host) {
      const clearedBefore = this.encounter.wavesCleared;
      this.encounter.update(delta, this.spawnEnemy, step => {
        if (local.health > 0) {
          if (this.playerMotion.update(this.encounter.player, this.view.x, keys, step, this.navigation, this.encounter.zombies)) local.health = 0;
          local.x = this.encounter.player.x; local.z = this.encounter.player.z; local.height = this.playerMotion.height;
        }
        local.yaw = this.view.x; local.pitch = this.view.y; local.weapon = this.arsenal.active; local.shots = this.arsenal.shots;
        local.ammo = this.firearm.ammo; local.reloading = this.firearm.reloading; local.reloadProgress = this.firearm.animationProgress;
        coop.advanceRemotes(step, this.navigation, this.remoteShoot);
      });
      const revived = this.encounter.wavesCleared > clearedBefore;
      if (revived) {
        if (coop.reviveAll()) this.playerMotion.reset();
        this.spectatedPlayerId = null; this.spectatingPlayer = null;
      }
      coop.broadcast(delta, revived);
    } else {
      coop.sendInput(keys, this.view.x, this.view.y, this.jumpSequence, delta);
      if (coop.consumeRevival()) {
        this.playerMotion.reset(); this.spectatedPlayerId = null; this.spectatingPlayer = null;
      }
      if (local.health > 0) this.playerMotion.update(this.encounter.player, this.view.x, keys, delta, this.navigation, this.encounter.zombies);
      coop.smoothWorld(delta);
      const discrepancy = Math.hypot(this.encounter.player.x - local.x, this.encounter.player.z - local.z);
      const settled = !keys.size && !coop.authoritativeKeys.size;
      // 移动中的权威坐标天然落后约一个往返延迟，不能把它当成错误直接瞬移回去。
      // 双端都已停下时快速收敛；确有大幅分歧时只做限速校正，避免画面拉扯。
      if (discrepancy > .08 && (settled || discrepancy > 3.5)) {
        const distance = Math.min(discrepancy, (settled ? 4 : .75) * delta);
        this.encounter.player.x += (local.x - this.encounter.player.x) / discrepancy * distance;
        this.encounter.player.z += (local.z - this.encounter.player.z) / discrepancy * distance;
      }
      for (const hit of coop.feedback.splice(0)) { this.hitCount++; this.callbacks.onHit(hit.head, hit.killed, hit.armorBroken); this.audio.tone(950, 450, .07, .025); }
    }
    this.encounter.health = local.health; this.encounter.lastDamageAt = local.lastDamageAt; this.kills = this.encounter.kills;
    this.weapon.root.visible = local.health > 0 || coop.remotes.some(player => player.health > 0);
    if (local.health === 0) { this.keys.clear(); this.trigger = false; }
    const spectated = this.spectatedPlayer();
    for (const player of coop.remotes) this.partners.get(player.id)?.update(player, delta, player.id === spectated?.id, this.encounter.elapsed);
    if (this.encounter.failed) this.endRun();
  }

  private shoot() {
    if (this.coop?.local.health === 0) return;
    if (this.phase !== 'playing' || !this.weapon.loaded || !this.arsenal.fire()) return;
    this.coop?.command({ type: 'fire', yaw: this.view.x, pitch: this.view.y });
    this.audio.shot();
    this.flashTime = 0.065;
    this.recoil = Math.min(1, this.recoil + this.firearm.definition.recoil);
    const muzzle = this.weapon.muzzle.getWorldPosition(new THREE.Vector3());
    const centerDirection = this.aimPoint.clone().sub(muzzle).normalize();
    const definition = this.firearm.definition;
    const right = new THREE.Vector3().crossVectors(centerDirection, this.camera.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, centerDirection).normalize();
    let landed = false;
    for (let pellet = 0; pellet < definition.pellets; pellet++) {
      const angle = pellet * 2.399963229728653;
      const radius = definition.spread * Math.sqrt(pellet / Math.max(1, definition.pellets - 1));
      const direction = centerDirection.clone().addScaledVector(right, Math.cos(angle) * radius).addScaledVector(up, Math.sin(angle) * radius).normalize();
      this.raycaster.set(muzzle, direction);
      this.raycaster.far = CONFIG.weapon.range;
      // 从枪口再测一次遮挡，防止摄像机能看见但枪管被前景挡住时穿透。
      const hit = this.raycaster.intersectObjects(this.activeSurfaces(), false)[0];
      const end = hit?.point ?? muzzle.clone().addScaledVector(direction, CONFIG.weapon.range);
      const length = muzzle.distanceTo(end);
      const tracer = this.addEffect(muzzle.clone().lerp(end, 0.5), new THREE.Vector3(), new THREE.Vector3(0.015, 0.015, length), 0, 0.045, 0, false, false, true);
      tracer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
      const targetHit = this.zombieField.decode(hit);
      const targetId = targetHit?.id;
      let killed = false;
      if (pellet === 0) this.lastShot = { muzzle: muzzle.toArray(), direction: direction.toArray(), aimPoint: this.aimPoint.toArray(), impact: end.toArray(), hitTarget: targetId ?? null };
      if (targetHit && (!this.coop || this.coop.host)) {
        const head = targetHit.head;
        const damage = this.encounter.hit(targetHit.id, head, definition.damage * (head ? 2 : 1))!;
        if (damage.armorBroken && damage.armorHit) this.armorEffects.release(this.zombieField.captureArmor(targetHit.id, damage.armorHit), direction);
        // 立即同步外观与碰撞，避免同一帧继续命中已经脱落的护具。
        this.zombieField.sync(this.encounter);
        this.scene.updateMatrixWorld(true);
        killed = damage.killed;
        if (killed) { this.blood.burst(end, direction, head); this.audio.death(); }
        landed = true;
        this.kills = this.encounter.kills;
        this.callbacks.onHit(head, damage.killed, damage.armorBroken);
        if (damage.armorHit) this.audio.armor(damage.armorHit, damage.armorBroken);
        else this.audio.tone(head ? 1100 : 800, 450, 0.07, 0.025);
      }
      if (hit && !killed) {
        for (let i = 0; i < 9; i++) {
          const velocity = new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.3) * 2);
          this.addEffect(end.clone(), velocity, new THREE.Vector3().setScalar(0.035 + Math.random() * 0.055), targetId === undefined ? 0xb0ac85 : 0xc6ad78, 0.3 + Math.random() * 0.3, 5, true);
        }
      }
    }
    if (landed) this.hitCount++;
    const direction = centerDirection;
    for (let i = 0; i < 2; i++) this.addEffect(muzzle.clone().addScaledVector(direction, 0.12 + i * 0.13), new THREE.Vector3(0.03, 0.14, -0.07), new THREE.Vector3().setScalar(0.075), 0xc0c3ab, 0.24 + i * 0.09);
    this.publish();
  }

  private frame = (time: number) => {
    if (this.disposed) return;
    this.frameId = requestAnimationFrame(this.frame);
    if (this.background || ((!this.coop || this.phase === 'failed') && this.phase !== 'playing' && this.phase !== 'breaching' && !this.dirty)) { this.previousTime = 0; this.frameDeadline = 0; return; }
    // 保留 RAF 的刷新同步，并用累计截止时间避免 60 FPS 在 75/144/165 Hz 屏幕上被错误量化。
    const schedule = scheduleFrame(this.frameDeadline, time, this.graphics.frameLimit);
    this.frameDeadline = schedule.deadline;
    if (!schedule.render) return;
    const rawDelta = this.previousTime ? (time - this.previousTime) / 1000 : 0;
    const delta = Math.min(rawDelta, 0.1);
    this.previousTime = time;
    const wasBreaching = this.phase === 'breaching';
    this.dirty = false;
    this.elapsed += delta;
    this.frameCount++;
    this.fpsTime += rawDelta;
    if (this.fpsTime >= 1) { this.fps = Math.round(this.frameCount / this.fpsTime); this.fpsTime = 0; this.frameCount = 0; }
    if ((this.phase === 'playing' && this.pointerLocked) || (this.coop && this.phase !== 'failed')) {
      const previousGun = this.firearm;
      const previousActive = this.arsenal.active;
      const previousAmmo = this.firearm.ammo;
      const wasReloading = this.firearm.reloading;
      const wasSwitching = this.arsenal.switching;
      const previousFire = this.firearm.fireProgress;
      const wasFiring = this.firearm.fireRemaining > 0;
      const previousReload = this.firearm.reloadProgress;
      this.arsenal.update(delta);
      const gun = this.firearm;
      const ejectAt = gun.definition.shellReload || gun.definition.id === 'sniper' ? 0.55 : 0.2;
      // 左轮只在原始换弹动画中退壳；泵动与拉栓武器等机械动作推进后再抛壳。
      if (wasFiring && previousGun === gun && gun.definition.id !== 'revolver' && previousFire < ejectAt && gun.fireProgress >= ejectAt) {
        const shellOrigin = this.weapon.root.localToWorld(new THREE.Vector3(0.04, -0.02, -0.12));
        const velocity = new THREE.Vector3(1.8, 1.2, 0.1).applyQuaternion(this.camera.quaternion);
        this.addEffect(shellOrigin, velocity, new THREE.Vector3(0.03, 0.025, 0.085), gun.definition.shellReload ? 0x984038 : 0xbb9751, 0.85, 5, true, false);
      }
      if (this.arsenal.active !== previousActive) {
        if (!this.coop || this.coop.local.health > 0) { this.weapon.select(this.arsenal.active); this.displayedWeapon = this.arsenal.active; }
        this.recoil = 0; this.flashTime = 0; this.audio.tone(230, 350, 0.07, 0.03); this.publish();
      }
      if (this.arsenal.switching !== wasSwitching) this.publish();
      if (!wasReloading && this.firearm.reloading) { this.audio.mechanical('release'); this.publish(); }
      if (this.firearm.definition.shellReload && this.firearm.ammo > previousAmmo && previousGun === this.firearm) { this.audio.mechanical('shell'); this.publish(); }
      if (wasReloading && previousGun === this.firearm && !this.firearm.definition.shellReload) {
        const progress = this.firearm.reloadProgress;
        if (crossedReloadStage(this.firearm.definition, previousReload, progress, 'eject')) this.audio.mechanical('eject');
        if (crossedReloadStage(this.firearm.definition, previousReload, progress, 'insert')) this.audio.mechanical('insert');
        if (crossedReloadStage(this.firearm.definition, previousReload, progress, 'action')) this.audio.mechanical('action');
      }
      if (wasReloading && !previousGun.reloading) { this.audio.mechanical('close'); this.publish(); }
      this.recoil *= Math.exp(-delta * 15);
      this.flashTime = Math.max(0, this.flashTime - delta);
      this.blood.update(delta);
      this.armorEffects.update(delta);
      const previousHealth = this.encounter.health;
      if (this.coop) this.advanceCoop(delta);
      else this.encounter.update(delta, this.spawnEnemy, step => {
        const drowned = this.playerMotion.update(this.encounter.player, this.view.x, this.keys, step, this.navigation, this.encounter.zombies);
        this.encounter.playerHeight = this.playerMotion.height;
        if (drowned) this.encounter.drown();
      });
      if (this.encounter.health < previousHealth) { this.audio.tone(110, 45, 0.14, 0.06); this.publish(); }
      this.zombieField.sync(this.encounter);
      if (this.encounter.failed) this.endRun();
      for (let i = this.effects.length - 1; i >= 0; i--) {
        const effect = this.effects[i];
        effect.life -= delta;
        if (effect.life <= 0) { this.scene.remove(effect.mesh); this.effects.splice(i, 1); continue; }
        effect.velocity.y -= effect.gravity * delta;
        effect.mesh.position.addScaledVector(effect.velocity, delta);
        if (effect.spin) { effect.mesh.rotation.x += delta * 8; effect.mesh.rotation.z += delta * 5; }
        if (effect.shrink) effect.mesh.scale.multiplyScalar(Math.exp(-delta * 3));
      }
    }
    this.scene.updateMatrixWorld(true);
    if (this.phase === 'breaching') {
      const complete = this.breachSequence.update(this.camera, wasBreaching ? rawDelta : 0);
      this.zombieField.sync(this.encounter, this.breachSequence.progress);
      if (complete) { this.phase = 'failed'; this.callbacks.onEnd(this.result!); this.publish(); }
    } else if (this.phase !== 'failed') this.updateAim(this.phase === 'playing' ? delta : 0);
    if (this.phase === 'playing' && this.trigger && this.firearm.definition.automatic) this.shoot();
    this.weapon.flash.visible = this.flashTime > 0 && this.phase === 'playing';
    this.weapon.flash.rotation.z = this.elapsed * 26;
    this.weapon.light.intensity = this.weapon.flash.visible ? 8 : 0;
    const shadowInterval = { off: Infinity, low: 500, medium: 250, high: 100, ultra: 0 }[this.graphics.shadows];
    if (this.phase === 'playing' && time - this.shadowTime > shadowInterval) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowTime = time;
    }
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    // 特写取景与首帧材质准备可能耗时；从首帧呈现后重新计时，避免吞掉两秒动画。
    if (!wasBreaching && this.phase === 'breaching') { this.previousTime = 0; this.frameDeadline = 0; }
    this.renderCount++;
    if (time - this.publishTime > 200) { this.publishTime = time; this.publish(); }
  };

  private publish() {
    const observed = this.spectatedPlayer();
    const coop = this.coop ? { host: this.coop.host, localId: this.coop.local.id, players: this.coop.players.map(p => ({ id: p.id, name: p.name, health: p.health })), spectating: this.coop.local.health === 0, spectatingId: observed?.id } : undefined;
    const inventory = observed ? WEAPONS.map((gun, index) => index === observed.weapon ? observed.ammo : gun.capacity) : this.arsenal.guns.map(gun => gun.ammo);
    const shownDefinition = WEAPONS[observed?.weapon ?? this.arsenal.active], shownReloading = observed?.reloading ?? this.firearm.reloading;
    const shownReloadProgress = observed?.reloadProgress ?? this.firearm.animationProgress;
    this.callbacks.onState({ coop, wave: this.encounter.wave, wavesCleared: this.encounter.wavesCleared, waveTotal: this.encounter.pressure.count, waveSpawned: this.encounter.waveSpawned, intermission: this.encounter.intermission, grounded: this.playerMotion.grounded, playerHeight: this.playerMotion.height, health: this.encounter.health, hurt: this.encounter.elapsed - this.encounter.lastDamageAt < 0.28, pointerLocked: this.pointerLocked, phase: this.phase, mode: this.encounter.mode, difficulty: this.encounter.difficulty, survived: this.encounter.elapsed, alive: this.encounter.alive, zombieCounts: this.encounter.zombieCounts, nearest: this.encounter.nearest, spawnRate: this.encounter.pressure.spawnRate, speed: this.encounter.pressure.speed, result: this.result, ammo: observed?.ammo ?? this.firearm.ammo, reloading: shownReloading, reloadStage: shownReloading ? reloadStage(shownDefinition, shownReloadProgress) : null, shots: this.arsenal.shots, hits: this.hitCount, kills: this.kills, fps: this.fps, yaw: THREE.MathUtils.radToDeg(this.view.x), pitch: THREE.MathUtils.radToDeg(this.view.y), sound: this.audio.enabled, volume: this.audio.volume, sensitivity: this.sensitivity, breach: this.breachFeedback(), pixelated: this.graphics.pixelated, graphicsPreset: matchingGraphicsPreset(this.graphics), graphics: { ...this.graphics }, renderResolution: { width: this.renderWidth, height: this.renderHeight, scale: this.renderer.getPixelRatio(), gpu: this.gpu }, weaponsReady: this.weapon.loaded, weaponIndex: observed?.weapon ?? this.arsenal.active, requestedWeapon: observed?.weapon ?? this.arsenal.requested, switching: observed ? false : this.arsenal.switching, reloadQueued: observed ? false : this.arsenal.reloadQueued, inventory });
  }

  private breachFeedback(): GameSnapshot['breach'] {
    const zombie = this.encounter.zombies.find(z => z.id === this.encounter.breachedId);
    if (!zombie) return null;
    const position = new THREE.Vector3(zombie.x, 2.95, zombie.z).project(this.camera);
    const dx = zombie.x - this.encounter.player.x, dz = zombie.z - this.encounter.player.z;
    const side = dx * Math.cos(this.view.x) - dz * Math.sin(this.view.x);
    const forward = -dx * Math.sin(this.view.x) - dz * Math.cos(this.view.x);
    return { id: zombie.id, kind: zombie.kind, x: (position.x + 1) * 50, y: (1 - position.y) * 50, side: Math.abs(side) > Math.abs(forward) ? side < 0 ? '左侧' : '右侧' : forward < 0 ? '后方' : '正前方' };
  }

  /** 只读诊断用于验收，生产构建不挂载到 window。 */
  diagnostics() {
    const muzzle = this.weapon.muzzle.getWorldPosition(new THREE.Vector3());
    const barrelDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(this.weapon.root.getWorldQuaternion(new THREE.Quaternion()));
    const project = (point: THREE.Vector3) => {
      const p = point.clone().project(this.camera);
      return { x: (p.x + 1) / 2 * this.width, y: (1 - p.y) / 2 * this.height };
    };
    return {
      coop: this.coop ? { host: this.coop.host, players: this.coop.players.map(p => ({ ...p })), local: this.coop.local.id, spectating: this.spectatedPlayerId } : null,
      wave: this.encounter.wave, wavesCleared: this.encounter.wavesCleared, waveTotal: this.encounter.pressure.count, waveSpawned: this.encounter.waveSpawned, intermission: this.encounter.intermission,
      jump: { height: this.playerMotion.height, velocity: this.playerMotion.velocity, grounded: this.playerMotion.grounded },
      overWater: isWater(this.encounter.player), waterZombies: this.encounter.zombies.filter(z => z.health > 0 && isWater(z)).map(z => z.id), bridges: BRIDGES.map(b => ({ ...b })), river: RIVER_POINTS.map(p => ({ ...p })),
      health: this.encounter.health, player: { ...this.encounter.player }, pointerLocked: this.pointerLocked, lockHint: this.lockHint,
      phase: this.phase, mode: this.encounter.mode, difficulty: this.encounter.difficulty, survived: this.encounter.elapsed, totalSpawned: this.encounter.totalSpawned, pressure: this.encounter.pressure, nearest: this.encounter.nearest, result: this.result, ammo: this.firearm.ammo, shots: this.arsenal.shots, hits: this.hitCount, kills: this.kills, reloading: this.firearm.reloading,
      yaw: this.view.x, pitch: this.view.y, aim: this.aim.toArray(), aimPoint: this.aimPoint.toArray(), muzzle: muzzle.toArray(), barrelDirection: barrelDirection.toArray(),
      flashVisible: this.weapon.flash.visible, weaponVisible: this.weapon.root.visible, effects: this.effects.length, lastShot: this.lastShot, drawCalls: this.renderer.info.render.calls, renderCount: this.renderCount, fps: this.fps,
      blood: this.blood.diagnostics(),
      armorEffects: this.armorEffects.diagnostics(), audio: this.audio.diagnostics(), breach: this.breachFeedback(), defenseVisible: false,
      breachElapsed: this.breachSequence.elapsed, cameraPosition: this.camera.position.toArray(), cameraYaw: this.camera.rotation.y, cameraPitch: this.camera.rotation.x, cameraFov: this.camera.fov,
      obstacles: this.world.obstacles, blockedZombies: this.encounter.zombies.filter(z => z.health > 0 && !this.navigation.clear(z, z)).map(z => z.id),
      weaponIndex: this.arsenal.active, requestedWeapon: this.arsenal.requested, switching: this.arsenal.switching, switchProgress: this.arsenal.switchProgress, inventory: this.arsenal.guns.map(gun => gun.ammo), weaponAnimation: this.weapon.diagnostics(),
      partners: [...this.partners].map(([id, partner]) => ({ id, ...partner.diagnostics() })),
      sensitivity: this.sensitivity, graphicsPreset: matchingGraphicsPreset(this.graphics), graphics: { ...this.graphics },
      renderResolution: { width: this.renderWidth, height: this.renderHeight, scale: this.renderer.getPixelRatio(), gpu: this.gpu },
      reload: { progress: this.firearm.reloadProgress, remaining: this.firearm.reloadRemaining, empty: this.firearm.reloadEmpty, cycle: this.firearm.animationProgress, stage: this.firearm.reloading ? reloadStage(this.firearm.definition, this.firearm.animationProgress) : null },
      targets: this.encounter.zombies.map(z => ({ id: z.id, kind: z.kind, maxHealth: z.maxHealth, armorHealth: z.armorHealth, bodyHealth: z.health - z.armorHealth, spawnZone: z.spawnZone, health: z.health, x: z.x, z: z.z, bornAt: z.bornAt, avoidance: z.avoidance ?? 0, heading: z.heading, attacking: z.attacking ?? false, attackTime: z.attackTime ?? 0, head: project(new THREE.Vector3(z.x, 1.83, z.z)), chest: project(new THREE.Vector3(z.x, 1.25, z.z + 0.2)) })),
    };
  }

  dispose() {
    this.stopCoop();
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.observer.disconnect();
    this.renderer.domElement.removeEventListener('pointermove', this.pointerMove);
    this.renderer.domElement.removeEventListener('pointerdown', this.pointerDown);
    this.renderer.domElement.removeEventListener('pointerleave', this.releaseTrigger);
    this.renderer.domElement.removeEventListener('pointercancel', this.releaseTrigger);
    this.renderer.domElement.removeEventListener('contextmenu', this.contextMenu);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLost);
    window.removeEventListener('pointerup', this.releaseTrigger);
    window.removeEventListener('blur', this.blur);
    window.removeEventListener('focus', this.focus);
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    document.removeEventListener('pointerlockchange', this.pointerLockChange);
    document.removeEventListener('pointerlockerror', this.pointerLockError);
    this.clearInput();
    this.renderer.domElement.removeEventListener('wheel', this.wheel);
    document.removeEventListener('visibilitychange', this.visibility);
    this.audio.dispose();
    this.weapon.dispose();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.scene.traverse(obj => {
      if (obj instanceof THREE.DirectionalLight || obj instanceof THREE.PointLight || obj instanceof THREE.SpotLight) obj.shadow.dispose();
      if (obj instanceof THREE.Mesh) {
        if (obj instanceof THREE.InstancedMesh) obj.dispose();
        geometries.add(obj.geometry);
        (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => materials.add(m));
      }
    });
    geometries.forEach(g => g.dispose());
    materials.forEach(m => { if ('map' in m && m.map instanceof THREE.Texture) m.map.dispose(); m.dispose(); });
    this.tracerMaterial.dispose();
    this.disposeComposer();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

declare global { interface Window { __undeadTower?: { snapshot: () => ReturnType<Game['diagnostics']> }; } }
