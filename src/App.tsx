import { useEffect, useRef, useState } from 'react';
import { Game } from './game/Game';
import { WEAPONS } from './game/weapons';
import { isOpticalSight, weaponSight } from './game/sights';
import { SightOverlay } from './ui/SightOverlay';
import { DIFFICULTIES, FIXED_DIFFICULTY } from './game/config';
import type { GameSnapshot } from './game/config';
import { DEFAULT_GRAPHICS_SETTINGS } from './game/graphics';
import type { AntiAliasing, EffectsQuality, FrameLimit, GraphicsPreset, ResolutionScale, ShadowQuality, ViewDistance } from './game/graphics';
import { formatDuration, LeaderboardStore, personalRecord } from './game/leaderboard';
import type { PersonalRecord } from './game/leaderboard';
import { BreachOverlay, DeploymentPanel, LeaderboardTable, ResultPanel } from './ui/SessionPanels';
import { MultiplayerPanel } from './ui/MultiplayerPanel';
import { randomAppearance } from './multiplayer/appearance';

const initialState: GameSnapshot = { wave: 1, wavesCleared: 0, waveTotal: 9, waveSpawned: 0, intermission: 0, grounded: true, playerHeight: 0, health: 100, hurt: false, pointerLocked: false, weaponsReady: false, weaponIndex: 0, requestedWeapon: 0, switching: false, reloadQueued: false, aiming: false, inventory: WEAPONS.map(gun => gun.capacity), phase: 'ready', mode: 'practice', difficulty: FIXED_DIFFICULTY, survived: 0, alive: 4, zombieCounts: { normal: 4, cone: 0, bucket: 0, imp: 0, shield: 0, berserker: 0, giant: 0, football: 0 }, nearest: null, spawnRate: 0, speed: 0, result: null, ammo: 30, reloading: false, reloadStage: null, shots: 0, hits: 0, kills: 0, fps: 0, yaw: 0, pitch: 0, sound: true, volume: 1, sensitivity: 100, breach: null, pixelated: false, graphicsPreset: 'quality', graphics: { ...DEFAULT_GRAPHICS_SETTINGS }, renderResolution: { width: 1, height: 1, scale: 1, gpu: '未识别' } };

const graphicsPresets: { id: GraphicsPreset; label: string }[] = [
  { id: 'ultra-performance', label: '极致性能' }, { id: 'performance', label: '性能' }, { id: 'balanced', label: '平衡' }, { id: 'quality', label: '画质' }, { id: 'ultra-quality', label: '极致画质' },
];

function Icon({ name, size = 18 }: { name: 'tower' | 'aim' | 'sound' | 'mute' | 'settings' | 'expand' | 'pause' | 'arrow' | 'close'; size?: number }) {
  const paths = {
    tower: <><path d="M5 3h14v4H5zM7 7v7h10V7M8 14 4 22m12-8 4 8M7 18h10M10 8v3m4-3v3" /></>,
    aim: <><circle cx="12" cy="12" r="7" /><path d="M12 1v6m0 10v6M1 12h6m10 0h6" /></>,
    sound: <><path d="m11 4-6 5H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></>,
    mute: <><path d="m11 4-6 5H2v6h3l6 5ZM16 9l6 6m0-6-6 6" /></>,
    settings: <><path d="M4 5h16M4 12h16M4 19h16M8 2v6m8 1v6m-6 1v6" /></>,
    expand: <path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6" />,
    pause: <><path d="M8 5v14M16 5v14" /></>,
    arrow: <path d="M3 12h17m-6-6 6 6-6 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" aria-hidden="true">{paths[name]}</svg>;
}

function RifleIcon() {
  return <svg className="rifle-icon" viewBox="0 0 150 40" fill="currentColor" aria-hidden="true"><path d="M2 9h31v4h19V8h40v4h37v3h18v4h-18v2H88v5H75l-2 12H63l-3-15H49l-4 11h-8l3-14H23l-7 6H2zM66 3h17v4H66z" /></svg>;
}

export function App() {
  const host = useRef<HTMLDivElement>(null);
  const game = useRef<Game | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const resumeAfterSettings = useRef(false);
  const [state, setState] = useState(initialState);
  const [sensitivityInput, setSensitivityInput] = useState(String(initialState.sensitivity));
  const [error, setError] = useState('');
  const [settings, setSettings] = useState(false);
  const [multiplayer, setMultiplayer] = useState(false);
  const [feedback, setFeedback] = useState<{ head: boolean; killed: boolean; armorBroken: boolean; key: number } | null>(null);
  const [record, setRecord] = useState<PersonalRecord | null>(null);
  const hitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [fullscreen, setFullscreen] = useState(false);
  const scoreDialog = useRef<HTMLDialogElement>(null);
  const [leaderboard] = useState(() => new LeaderboardStore());
  const [entries, setEntries] = useState(() => leaderboard.read());
  const [saved, setSaved] = useState(leaderboard.persistent);

  useEffect(() => setSensitivityInput(String(state.sensitivity)), [state.sensitivity]);

  const commitSensitivityInput = () => {
    const value = Number(sensitivityInput);
    if (sensitivityInput.trim() && Number.isFinite(value)) game.current?.setSensitivity(value);
    else setSensitivityInput(String(state.sensitivity));
  };

  useEffect(() => {
    if (!host.current) return;
    try {
      const instance = new Game(host.current, {
        onState: setState,
        onHit: (head, killed, armorBroken) => {
          clearTimeout(hitTimer.current);
          setFeedback({ head, killed, armorBroken, key: performance.now() });
          hitTimer.current = setTimeout(() => setFeedback(null), 520);
        },
        onError: setError,
        onEnd: result => { setRecord(personalRecord(result, leaderboard.read())); setEntries(leaderboard.record(result)); setSaved(leaderboard.persistent); setFeedback(null); },
      });
      game.current = instance;
      if (import.meta.env.DEV) window.__undeadTower = { snapshot: () => instance.diagnostics() };
    } catch (cause) {
      console.error(cause);
      setError('无法启动 3D 场景。请使用支持 WebGL 2 的桌面版 Chrome 或 Edge，并开启硬件加速。');
    }
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    const offSteam = window.steamCoop?.onEvent(event => {
      if (event.type === 'start') { setError(''); setFeedback(null); setMultiplayer(false); game.current?.beginCoop(event.match, data => window.steamCoop?.send(data), randomAppearance()); }
      if (event.type === 'status' && event.status.room) game.current?.updateCoopMembers(event.status.room.members);
      if (event.type === 'packet') game.current?.receiveCoop(event.from, event.data);
      if (event.type === 'left') { game.current?.menu(); setError(event.message); setMultiplayer(true); }
      if (event.type === 'error') setError(event.message);
    });
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      offSteam?.();
      clearTimeout(hitTimer.current);
      document.removeEventListener('fullscreenchange', onFullscreen);
      delete window.__undeadTower;
      game.current?.dispose();
      game.current = null;
    };
  }, [leaderboard]);

  const openSettings = () => {
    resumeAfterSettings.current = state.phase === 'playing';
    game.current?.pause();
    setSettings(true);
    dialog.current?.showModal();
  };
  const closeSettings = () => {
    dialog.current?.close();
    setSettings(false);
    if (resumeAfterSettings.current) game.current?.start();
  };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { setError('当前窗口不支持全屏，请在独立浏览器中打开游戏。'); }
  };

  const weapon = WEAPONS[state.weaponIndex];
  const sight = weaponSight(weapon);
  const sightActive = state.phase === 'playing' && state.aiming;
  const scoped = sightActive && isOpticalSight(sight);
  const ammoBars = Math.min(weapon.capacity, 50);
  const leaveCoop = async () => {
    try { await window.steamCoop?.leave(); } catch (cause) { setError(String(cause)); }
    game.current?.menu(); setMultiplayer(true);
  };
  const pendingWeapon = state.requestedWeapon !== state.weaponIndex;

  return <main className={`game-shell phase-${state.phase} ${sightActive ? `aiming-${sight.kind}` : ''}`}>
    <div ref={host} className={`viewport ${state.pixelated ? 'pixelated' : ''}`}>
      {state.phase === 'playing' && <div className={`crosshair ${sightActive && sight.kind !== 'hold' ? 'sight-aligned' : ''} ${feedback ? 'is-hit' : ''} ${state.reloading ? 'is-reloading' : ''}`} aria-hidden="true"><i /><i /><i /><i /><b />{feedback && <span className="hit-mark" key={feedback.key}>×</span>}</div>}
    </div>
    {scoped && <SightOverlay sight={sight} />}
    <div className="vignette" aria-hidden="true" /><div className={`damage-vignette ${state.hurt ? 'active' : ''}`} aria-hidden="true" />

    {multiplayer && <MultiplayerPanel notice={error} close={() => setMultiplayer(false)} />}
    <header className="topbar" inert={state.phase === 'breaching'}>
      <div className="brand"><span className="brand-mark"><Icon name="tower" size={27} /></span><div>UNDEAD SURVIVOR</div></div>
      {state.phase !== 'ready' && <div className="compass" aria-label="当前朝向"><div className="compass-ticks"><b>{['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round((((-state.yaw % 360) + 360) % 360) / 45) % 8]}</b><span>{Math.round(((-state.yaw % 360) + 360) % 360)}°</span></div><span className="compass-notch" /><small>北 / 东侧来袭</small></div>}
      <div className="top-actions">

        <button className="icon-button sound-button" onClick={() => game.current?.setSound(!state.sound)} aria-label={state.sound ? '关闭声音' : '开启声音'} title={state.sound ? '关闭声音 · M' : '开启声音 · M'}><Icon name={state.sound ? 'sound' : 'mute'} /></button>
        <button className="icon-button" onClick={toggleFullscreen} aria-label={fullscreen ? '退出全屏' : '进入全屏'} title="切换全屏"><Icon name="expand" /></button>
        <button className="icon-button" onClick={openSettings} aria-label="游戏设置" title="游戏设置"><Icon name="settings" /></button>
        {state.phase === 'playing' && <button className="icon-button" onClick={() => game.current?.pause()} aria-label="暂停游戏" title="暂停 · Esc"><Icon name="pause" /></button>}
      </div>
    </header>

    {state.phase === 'ready' && <section className="intro mode-menu" aria-labelledby="game-title">
      <div className="intro-copy">
        <p className="menu-location">灰松哨站</p>
        <h1 id="game-title">UNDEAD<br /><span>SURVIVOR</span></h1>
        <p className="intro-line">活到下一波。</p>
      </div>
      <DeploymentPanel onMultiplayer={() => { setError('' ); setMultiplayer(true); }} onStart={mode => { setFeedback(null); game.current?.begin(mode); }} disabled={Boolean(error) || !state.weaponsReady} onLeaderboard={() => { setEntries(leaderboard.read()); scoreDialog.current?.showModal(); }} />
      {!state.weaponsReady && !error && <div className="weapon-loading" role="status">正在加载武器…</div>}
    </section>}

    {(state.phase === 'playing' || state.phase === 'paused') && <div className="hud" aria-label="游戏状态">
      <aside className="objective"><span className="label">{state.mode === 'practice' ? 'FIELD TRAINING' : `SURVIVAL / ${DIFFICULTIES[state.difficulty].label}`}</span><h2>{state.mode === 'practice' ? '僵尸练习靶场' : '在封锁区生存'}</h2><p><span className="tiny-square" /> {state.mode === 'practice' ? '僵尸静止站位，击倒后复位' : '北 / 东侧来袭 · 僵尸只能走桥'}</p><div className="objective-score"><span><b>{String(state.kills).padStart(2, '0')}</b> 击杀</span><span><b>{state.hits}</b> 命中</span><span><b>{state.shots ? Math.round(state.hits / state.shots * 100) : '—'}{state.shots > 0 && '%'}</b> 命中率</span></div></aside>
      {state.mode === 'survival' && <><div className="survival-clock"><span>{state.intermission > 0 ? '准备下一波' : '当前波次'}</span><strong data-testid="wave-number">第 {state.intermission > 0 ? state.wave + 1 : state.wave} 波</strong><small data-testid="wave-progress">{state.intermission > 0 ? `${Math.ceil(state.intermission)} 秒后开始` : `本波 ${state.waveTotal} 只 · 剩余 ${state.waveTotal - state.waveSpawned + state.alive}`}</small><small>已守住 {state.wavesCleared} 波 · <span data-testid="survival-clock">{formatDuration(state.survived)}</span></small></div><aside className="horde-status"><span className="label">INCOMING WAVE</span><p><b>{state.alive}</b> 只僵尸在场</p><small>一阶：普通 {state.zombieCounts.normal} · 路障 {state.zombieCounts.cone} · 铁桶 {state.zombieCounts.bucket}</small><small>二阶：小鬼 {state.zombieCounts.imp} · 持盾 {state.zombieCounts.shield}</small><small>三阶：狂暴 {state.zombieCounts.berserker} · 巨人 {state.zombieCounts.giant} · 四阶：橄榄球 {state.zombieCounts.football}</small><small>已出现 {state.waveSpawned} / {state.waveTotal} · 基础移速 {state.speed.toFixed(2)} m/s</small></aside><div className={`proximity ${state.nearest !== null && state.nearest < 4 ? 'danger' : ''}`}>{state.intermission > 0 ? '本波清空 · 整理弹药，准备下一波' : state.nearest === null ? '转向北侧或东侧，让入口保持在前方' : state.nearest < 4 ? '僵尸近身！移动或起跳躲避' : '守住本波 · 清空后进入下一波'}</div></>}
      <div className="terrain-hint"><kbd>空格</kbd> {state.grounded ? '跳跃过河' : '腾空中'}<small>两座桥可通行 · 落水立即失败</small></div>
      <div className={`health-panel ${state.health <= 30 ? 'critical' : ''}`} aria-label="玩家生命值"><span className="label">生命值 / HEALTH</span><div><strong data-testid="player-health">{state.health}</strong><span>/ 100</span></div><progress value={state.health} max={100} aria-label="剩余生命值" /><small>{state.mode === 'practice' ? '练习模式 · 不受伤害' : state.health <= 30 ? '生命垂危 · 保持距离' : '每次受伤 10 点 · 0.3 秒保护'}</small></div>
      {state.phase === 'playing' && !state.pointerLocked && <div className="pointer-hint">点击场景捕获鼠标 · WASD 移动 · ESC 暂停</div>}
      {feedback && state.phase === 'playing' && <div className={`hit-feedback ${feedback.head ? 'headshot' : ''}`} key={feedback.key}>{feedback.armorBroken ? '护甲击落' : feedback.head ? '精准命中' : feedback.killed ? '目标击倒' : '命中目标'}<small>{feedback.armorBroken ? 'ARMOR OFF · 继续射击' : feedback.head ? 'HEADSHOT' : feedback.killed ? 'TARGET DOWN' : 'TARGET HIT'}</small></div>}
      <div className={`ammo-panel ${state.ammo === 0 ? 'empty' : ''}`}><div className="weapon-label"><RifleIcon /><span data-testid="weapon-name">{weapon.label}<small>{weapon.tier}级 · {weapon.short} · {weapon.kind === 'melee' ? '近距离挥砍' : weapon.kind === 'flame' ? '火焰穿透' : weapon.automatic ? '按住连发' : '单次射击'}</small></span></div><div className="ammo-count"><strong data-testid="ammo">{weapon.infiniteAmmo ? '∞' : String(state.ammo).padStart(2, '0')}</strong>{!weapon.infiniteAmmo && <span>/ {weapon.capacity}<small>哨站备弹 ∞</small></span>}</div>{!weapon.infiniteAmmo && <div className="ammo-bars" aria-hidden="true">{Array.from({ length: ammoBars }, (_, i) => <i key={i} className={i < state.ammo / weapon.capacity * ammoBars ? 'loaded' : ''} />)}</div>}<span className="reload-hint">{state.coop?.spectating ? state.reloading ? '队友正在装填…' : '第一人称观战队友' : state.switching ? '切换中…' : pendingWeapon ? `动作结束后切换 · ${WEAPONS[state.requestedWeapon].label}` : state.reloadQueued ? '准备装填…' : state.reloading ? weapon.shellReload ? '逐发装填中…' : '正在更换弹匣…' : state.ammo === 0 ? '弹匣已空 · 按 R 换弹' : state.aiming ? `${sight.label} · ${sight.magnification}×` : <><kbd>右键</kbd> {sight.label}</>}</span></div>
      <div className="weapon-slots" role="group" aria-label="切换武器">{WEAPONS.map((gun, index) => { const key = index === 9 ? 0 : index + 1; return <button key={gun.id} disabled={state.phase !== 'playing' || state.coop?.spectating} aria-label={`切换到${gun.label}`} aria-pressed={index === state.weaponIndex} data-pending={pendingWeapon && index === state.requestedWeapon} onClick={() => game.current?.switchWeapon(index)} title={`${key} · ${gun.label}`}><kbd>{key}</kbd><span>{gun.tier} · {gun.short}</span><small>{gun.infiniteAmmo ? '∞' : state.inventory[index]}</small></button>; })}<p>{state.coop?.spectating ? '正在同步队友武器状态' : '数字键 1–0 / 滚轮切换'}</p></div>
      {state.reloading && <div className="reload-progress" role="status"><span>{{ prepare: '准备武器', eject: weapon.id === 'revolver' ? '打开弹巢并退壳' : '卸下弹匣', insert: weapon.shellReload ? '装入弹壳' : weapon.id === 'revolver' ? '快速装弹' : '插入弹匣', action: weapon.id === 'sniper' ? '拉动枪栓' : weapon.id === 'pistol' ? '释放套筒' : '枪机操作', return: '回正武器' }[state.reloadStage ?? 'prepare']}</span><i /></div>}
      <footer className="play-footer"><div><span className="signal-dot" /><span>{state.fps} FPS</span><span className="footer-divider" /><span>自由视角 · 44 × 62 m</span></div><div><span><kbd>WASD</kbd> 移动</span><span><kbd>空格</kbd> 跳跃</span><span><kbd>鼠标</kbd> 转向</span><span><kbd>左键</kbd> {weapon.kind === 'melee' ? '挥砍' : weapon.automatic ? '按住连发' : '单次射击'}</span><span><kbd>右键</kbd> {sight.label}</span><span><kbd>ESC</kbd> 暂停</span></div></footer>
    </div>}

    {state.phase === 'paused' && !settings && !state.coop && <section className="pause-screen" aria-label="暂停菜单"><div className="pause-content"><Icon name="tower" size={36} /><h2>哨站已暂停</h2><button className="start-button" onClick={() => game.current?.start()}>继续游戏 <Icon name="arrow" /></button><button className="text-button" onClick={() => { setFeedback(null); game.current?.reset(); }}>{state.mode === 'practice' ? '重新开始训练' : '重新开始坚守'}</button><button className="text-button" onClick={() => { setFeedback(null); game.current?.menu(); }}>返回主菜单</button></div></section>}

    {state.coop && state.phase !== 'failed' && <aside className="coop-team" aria-label="联机小队">
      <span className="label">{state.coop.players.length} 人协作 · {state.coop.host ? '房主' : '队员'}</span>
      {state.coop.players.map(player => <div key={player.id} className={player.health === 0 ? 'fallen' : ''}>
        <span>{player.name}{player.id === state.coop!.localId ? '（你）' : ''}</span><b>{player.health === 0 ? '已阵亡' : `${player.health} HP`}</b>
        <progress max={100} value={player.health} aria-label={`${player.name}生命值`} />
      </div>)}
    </aside>}
    {state.coop?.spectating && state.phase === 'playing' && <div className="coop-spectating" role="status"><strong>你已阵亡 · 正在观战 {state.coop.players.find(player => player.id === state.coop?.spectatingId)?.name ?? '队友'}</strong><span>点击鼠标左键切换存活队友；清完本波后全员复活。</span></div>}
    {state.coop && state.phase === 'paused' && !settings && <section className="pause-screen" aria-label="联机菜单"><div className="pause-content">
      <h2>联机对局仍在继续</h2><p>打开菜单不会暂停尸群，存活玩家仍会受到攻击。</p>
      <button className="start-button" onClick={() => game.current?.start()}>返回{state.coop.spectating ? '观战' : '战斗'} <Icon name="arrow" /></button>
      <button className="text-button" onClick={leaveCoop}>离开对局</button>
    </div></section>}
    {state.coop && state.phase === 'failed' && state.result && <section className="pause-screen" aria-label="多人结算"><div className="pause-content">
      <h2>小队全员阵亡</h2><p>共同守住 <strong>{state.result.waves}</strong> 波 · 击杀 <strong>{state.result.kills}</strong> 只</p>
      <p>坚守 {formatDuration(state.result.duration)} · 多人成绩不计入单人排行榜</p>
      <button className="start-button" onClick={leaveCoop}>返回多人大厅 <Icon name="arrow" /></button>
    </div></section>}
    {state.phase === 'breaching' && state.breach && <BreachOverlay breach={state.breach} />}
    {state.phase === 'failed' && state.result && !state.coop && <ResultPanel result={state.result} entries={entries} saved={saved} record={state.mode === 'survival' ? record : null} breach={state.breach} onRetry={() => game.current?.reset()} onMenu={() => game.current?.menu()} />}

    <dialog ref={scoreDialog} className="settings-dialog leaderboard-dialog" aria-labelledby="leaderboard-title" onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }}>
      <div className="dialog-heading"><div><h2 id="leaderboard-title">波次排行榜</h2></div><button className="icon-button" onClick={() => scoreDialog.current?.close()} aria-label="关闭排行榜"><Icon name="close" /></button></div>
      <p className="settings-intro">困难难度 · 本机前 10 名</p><LeaderboardTable entries={entries} difficulty={FIXED_DIFFICULTY} /><p className="board-footnote">仅保存本机成绩。</p>
    </dialog>

    <dialog ref={dialog} className="settings-dialog graphics-settings-dialog" aria-labelledby="settings-title" onCancel={event => { event.preventDefault(); event.stopPropagation(); closeSettings(); }} onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }}>
      <div className="dialog-heading"><div><h2 id="settings-title">哨站设置</h2></div><button className="icon-button" onClick={closeSettings} aria-label="关闭设置"><Icon name="close" /></button></div>
      <div className="settings-layout"><section className="settings-basic" aria-labelledby="controls-title"><h3 id="controls-title">声音与操控</h3>
      <label className="toggle-row"><span>游戏声音</span><input type="checkbox" checked={state.sound} onChange={event => game.current?.setSound(event.target.checked)} /><i /></label>
      <div className="volume-control"><label htmlFor="volume">总音量 <b>{Math.round(state.volume * 100)}%{!state.sound && ' · 已静音'}</b></label><input id="volume" type="range" min="0" max="100" step="1" value={Math.round(state.volume * 100)} onChange={event => game.current?.setVolume(Number(event.target.value) / 100)} /></div>
      <div className="sensitivity-control"><div className="sensitivity-heading"><label htmlFor="sensitivity-range">鼠标灵敏度</label><div><input aria-label="鼠标灵敏度数值" type="number" min="10" max="200" step="1" value={sensitivityInput} onChange={event => { const value = event.target.value; setSensitivityInput(value); const number = Number(value); if (value.trim() && Number.isFinite(number) && number >= 10 && number <= 200) game.current?.setSensitivity(number); }} onBlur={commitSensitivityInput} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /><span>%</span></div></div><input id="sensitivity-range" aria-label="鼠标灵敏度滑块" type="range" min="10" max="200" step="1" value={state.sensitivity} onChange={event => game.current?.setSensitivity(event.target.valueAsNumber)} /></div>
      </section><section className="graphics-panel" aria-labelledby="graphics-title">
        <div className="graphics-heading"><div><h3 id="graphics-title">画质设置</h3></div><output>当前：{state.graphicsPreset === 'custom' ? '自定义' : graphicsPresets.find(item => item.id === state.graphicsPreset)?.label}</output></div>
        <div className="quality-presets" role="group" aria-label="画质预设">{graphicsPresets.map(preset => <button key={preset.id} type="button" aria-pressed={state.graphicsPreset === preset.id} onClick={() => game.current?.applyGraphicsPreset(preset.id)}>{preset.label}</button>)}</div>

        <div className="graphics-grid">
          <label><span>渲染比例</span><select aria-label="渲染比例" value={state.graphics.resolutionScale} onChange={event => game.current?.setGraphicsOption('resolutionScale', Number(event.target.value) as ResolutionScale)}><option value="0.5">50%</option><option value="0.67">67%</option><option value="0.75">75%</option><option value="1">100% 原生</option></select></label>
          <label><span>抗锯齿</span><select aria-label="抗锯齿" value={state.graphics.antiAliasing} onChange={event => game.current?.setGraphicsOption('antiAliasing', event.target.value as AntiAliasing)}><option value="off">关闭</option><option value="fxaa">FXAA · 快速</option><option value="smaa">SMAA · 精细</option></select></label>
          <label><span>阴影质量</span><select aria-label="阴影质量" value={state.graphics.shadows} onChange={event => game.current?.setGraphicsOption('shadows', event.target.value as ShadowQuality)}><option value="off">关闭</option><option value="low">低</option><option value="medium">中</option><option value="high">高</option><option value="ultra">极高</option></select></label>
          <label><span>特效质量</span><select aria-label="特效质量" value={state.graphics.effects} onChange={event => game.current?.setGraphicsOption('effects', event.target.value as EffectsQuality)}><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label>
          <label><span>视距</span><select aria-label="视距" value={state.graphics.viewDistance} onChange={event => game.current?.setGraphicsOption('viewDistance', event.target.value as ViewDistance)}><option value="near">近</option><option value="medium">中</option><option value="far">远</option></select></label>
          <label><span>帧率上限</span><select aria-label="帧率上限" value={state.graphics.frameLimit} onChange={event => game.current?.setGraphicsOption('frameLimit', Number(event.target.value) as FrameLimit)}><option value="30">30 FPS</option><option value="60">60 FPS</option><option value="120">120 FPS</option><option value="0">不限</option></select></label>
        </div>
        <label className="toggle-row pixel-toggle"><span>粗颗粒像素</span><input type="checkbox" checked={state.graphics.pixelated} onChange={event => game.current?.setPixelated(event.target.checked)} /><i /></label>
      </section>
      </div>
      <details className="settings-help"><summary>操作按键与渲染信息</summary>        <div className="render-status"><span>实际渲染 <b>{state.renderResolution.width} × {state.renderResolution.height}</b></span><span><b>{state.fps}</b> FPS</span><small>GPU：{state.renderResolution.gpu}{/SwiftShader|llvmpipe|software/i.test(state.renderResolution.gpu) && <strong>检测到软件渲染，请开启显卡硬件加速。</strong>}</small></div><div className="settings-controls"><span><kbd>WASD</kbd> 移动</span><span><kbd>空格</kbd> 跳跃</span><span><kbd>右键</kbd> 瞄准</span><span><kbd>左键</kbd> 射击</span><span><kbd>R</kbd> 换弹</span><span><kbd>M</kbd> 静音</span><span><kbd>ESC</kbd> 暂停</span></div>
      </details><button className="start-button dialog-done" onClick={closeSettings}>返回哨站 <Icon name="arrow" /></button>
    </dialog>

    {error && !multiplayer && <div className="error-notice" role="alert"><p>{error}</p><button className="text-button" onClick={() => setError('')}>关闭提示</button><button className="text-button" onClick={() => location.reload()}>重新加载</button></div>}
    <div className="mobile-notice">建议使用电脑横屏，搭配鼠标和键盘游玩。</div>
  </main>;
}
