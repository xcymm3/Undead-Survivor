import { useEffect, useRef, useState } from 'react';
import { Game } from './game/Game';
import { WEAPONS } from './game/weapons';
import { DIFFICULTIES, FIXED_DIFFICULTY } from './game/config';
import type { GameMode, GameSnapshot, RenderQuality } from './game/config';
import { formatDuration, LeaderboardStore, personalRecord } from './game/leaderboard';
import type { PersonalRecord } from './game/leaderboard';
import { BreachOverlay, DeploymentPanel, LeaderboardTable, ResultPanel } from './ui/SessionPanels';
import { MultiplayerPanel } from './ui/MultiplayerPanel';

const initialState: GameSnapshot = { wave: 1, wavesCleared: 0, waveTotal: 9, waveSpawned: 0, intermission: 0, grounded: true, playerHeight: 0, health: 100, hurt: false, pointerLocked: false, weaponsReady: false, weaponIndex: 0, requestedWeapon: 0, switching: false, reloadQueued: false, inventory: WEAPONS.map(gun => gun.capacity), phase: 'ready', mode: 'practice', difficulty: FIXED_DIFFICULTY, survived: 0, alive: 4, zombieCounts: { normal: 4, cone: 0, bucket: 0 }, nearest: null, spawnRate: 0, speed: 0, result: null, ammo: 30, reloading: false, shots: 0, hits: 0, kills: 0, fps: 0, yaw: 0, pitch: 0, sound: true, volume: 1, breach: null, pixelated: false, renderQuality: 'native', renderResolution: { width: 1, height: 1, scale: 1, gpu: '未识别' } };

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
  const [error, setError] = useState('');
  const [settings, setSettings] = useState(false);
  const [multiplayer, setMultiplayer] = useState(false);
  const [feedback, setFeedback] = useState<{ head: boolean; killed: boolean; armorBroken: boolean; key: number } | null>(null);
  const [record, setRecord] = useState<PersonalRecord | null>(null);
  const hitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [fullscreen, setFullscreen] = useState(false);
  const [mode, setMode] = useState<GameMode>('practice');
  const scoreDialog = useRef<HTMLDialogElement>(null);
  const [leaderboard] = useState(() => new LeaderboardStore());
  const [entries, setEntries] = useState(() => leaderboard.read());
  const [saved, setSaved] = useState(leaderboard.persistent);

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
      if (event.type === 'start') { setError(''); setFeedback(null); setMultiplayer(false); game.current?.beginCoop(event.match, data => window.steamCoop?.send(data)); }
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
  const leaveCoop = async () => {
    try { await window.steamCoop?.leave(); } catch (cause) { setError(String(cause)); }
    game.current?.menu(); setMultiplayer(true);
  };
  const pendingWeapon = state.requestedWeapon !== state.weaponIndex;

  return <main className={`game-shell phase-${state.phase}`}>
    <div ref={host} className={`viewport ${state.pixelated ? 'pixelated' : ''}`}>
      {state.phase === 'playing' && <div className={`crosshair ${feedback ? 'is-hit' : ''} ${state.reloading ? 'is-reloading' : ''}`} aria-hidden="true"><i /><i /><i /><i /><b />{feedback && <span className="hit-mark" key={feedback.key}>×</span>}</div>}
    </div>
    <div className="vignette" aria-hidden="true" /><div className={`damage-vignette ${state.hurt ? 'active' : ''}`} aria-hidden="true" />

    {multiplayer && <MultiplayerPanel notice={error} close={() => setMultiplayer(false)} />}
    <header className="topbar" inert={state.phase === 'breaching'}>
      <div className="brand"><span className="brand-mark"><Icon name="tower" size={27} /></span><div>UNDEAD SURVIVOR<small>灰松哨站 · PINE RIDGE</small></div></div>
      {state.phase !== 'ready' && <div className="compass" aria-label="当前朝向"><div className="compass-ticks"><b>{['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round((((-state.yaw % 360) + 360) % 360) / 45) % 8]}</b><span>{Math.round(((-state.yaw % 360) + 360) % 360)}°</span></div><span className="compass-notch" /><small>北 / 东侧来袭</small></div>}
      <div className="top-actions">
        <span className="build-label">SURVIVAL <b>ARSENAL</b></span>
        <button className="icon-button sound-button" onClick={() => game.current?.setSound(!state.sound)} aria-label={state.sound ? '关闭声音' : '开启声音'} title={state.sound ? '关闭声音 · M' : '开启声音 · M'}><Icon name={state.sound ? 'sound' : 'mute'} /></button>
        <button className="icon-button" onClick={toggleFullscreen} aria-label={fullscreen ? '退出全屏' : '进入全屏'} title="切换全屏"><Icon name="expand" /></button>
        <button className="icon-button" onClick={openSettings} aria-label="游戏设置" title="游戏设置"><Icon name="settings" /></button>
        {state.phase === 'playing' && <button className="icon-button" onClick={() => game.current?.pause()} aria-label="暂停游戏" title="暂停 · Esc"><Icon name="pause" /></button>}
      </div>
    </header>

    {state.phase === 'ready' && <section className="intro mode-menu" aria-labelledby="game-title">
      <div className="intro-copy">
        <div className="field-tag"><span /> 灰松哨站 / 尸群正在逼近</div>
        <h1 id="game-title">UNDEAD<br /><span>SURVIVOR</span><b>.</b></h1>
        <p className="intro-line">在封锁区移动，活到最后。</p>
        <p className="intro-description">森林边缘有了动静。<br />跨过河流，守住一波又一波尸群。</p>
        <div className="intro-controls"><span><kbd>WASD</kbd> 移动</span><span><kbd>空格</kbd> 跳跃</span><span><kbd>鼠标</kbd> 转向</span><span><kbd>左键</kbd> 开火</span><span><kbd>R</kbd> 换弹</span><span><kbd>1–6 / 滚轮</kbd> 切枪</span></div>
      </div>
      <DeploymentPanel onMultiplayer={() => { setError('' ); setMultiplayer(true); }} mode={mode} onMode={setMode} onStart={() => { setFeedback(null); game.current?.begin(mode); }} disabled={Boolean(error) || !state.weaponsReady} onLeaderboard={() => { setEntries(leaderboard.read()); scoreDialog.current?.showModal(); }} />
      {!state.weaponsReady && !error && <div className="weapon-loading" role="status">正在准备六款枪械…</div>}
      <div className="intro-foot"><span className="signal-dot" /> 自由移动 · 僵尸生存 <span className="intro-foot-right">有限场地 / LOW-POLY WORLD</span></div>
    </section>}

    {(state.phase === 'playing' || state.phase === 'paused') && <div className="hud" aria-label="游戏状态">
      <aside className="objective"><span className="label">{state.mode === 'practice' ? 'FIELD TRAINING' : `SURVIVAL / ${DIFFICULTIES[state.difficulty].label}`}</span><h2>{state.mode === 'practice' ? '僵尸练习靶场' : '在封锁区生存'}</h2><p><span className="tiny-square" /> {state.mode === 'practice' ? '僵尸静止站位，击倒后复位' : '北 / 东侧来袭 · 僵尸只能走桥'}</p><div className="objective-score"><span><b>{String(state.kills).padStart(2, '0')}</b> 击杀</span><span><b>{state.hits}</b> 命中</span><span><b>{state.shots ? Math.round(state.hits / state.shots * 100) : '—'}{state.shots > 0 && '%'}</b> 命中率</span></div></aside>
      {state.mode === 'survival' && <><div className="survival-clock"><span>{state.intermission > 0 ? '准备下一波' : '当前波次'}</span><strong data-testid="wave-number">第 {state.intermission > 0 ? state.wave + 1 : state.wave} 波</strong><small data-testid="wave-progress">{state.intermission > 0 ? `${Math.ceil(state.intermission)} 秒后开始` : `本波 ${state.waveTotal} 只 · 剩余 ${state.waveTotal - state.waveSpawned + state.alive}`}</small><small>已守住 {state.wavesCleared} 波 · <span data-testid="survival-clock">{formatDuration(state.survived)}</span></small></div><aside className="horde-status"><span className="label">INCOMING WAVE</span><p><b>{state.alive}</b> 只僵尸在场</p><small>普通 {state.zombieCounts.normal} · 路障 {state.zombieCounts.cone} · 铁桶 {state.zombieCounts.bucket}</small><small>已出现 {state.waveSpawned} / {state.waveTotal} · 移速 {state.speed.toFixed(2)} m/s</small></aside><div className={`proximity ${state.nearest !== null && state.nearest < 4 ? 'danger' : ''}`}>{state.intermission > 0 ? '本波清空 · 整理弹药，准备下一波' : state.nearest === null ? '转向北侧或东侧，让入口保持在前方' : state.nearest < 4 ? '僵尸近身！移动或起跳躲避' : '守住本波 · 清空后进入下一波'}</div></>}
      <div className="terrain-hint"><kbd>空格</kbd> {state.grounded ? '跳跃过河' : '腾空中'}<small>两座桥可通行 · 落水立即失败</small></div>
      <div className={`health-panel ${state.health <= 30 ? 'critical' : ''}`} aria-label="玩家生命值"><span className="label">生命值 / HEALTH</span><div><strong data-testid="player-health">{state.health}</strong><span>/ 100</span></div><progress value={state.health} max={100} aria-label="剩余生命值" /><small>{state.mode === 'practice' ? '练习模式 · 不受伤害' : state.health <= 30 ? '生命垂危 · 保持距离' : '接触攻击每次造成 10 点伤害'}</small></div>
      {state.phase === 'playing' && !state.pointerLocked && <div className="pointer-hint">点击场景捕获鼠标 · WASD 移动 · ESC 暂停</div>}
      {feedback && state.phase === 'playing' && <div className={`hit-feedback ${feedback.head ? 'headshot' : ''}`} key={feedback.key}>{feedback.armorBroken ? '护甲击落' : feedback.head ? '精准命中' : feedback.killed ? '目标击倒' : '命中目标'}<small>{feedback.armorBroken ? 'ARMOR OFF · 继续射击' : feedback.head ? 'HEADSHOT' : feedback.killed ? 'TARGET DOWN' : 'TARGET HIT'}</small></div>}
      <div className={`ammo-panel ${state.ammo === 0 ? 'empty' : ''}`}><div className="weapon-label"><RifleIcon /><span data-testid="weapon-name">{weapon.label}<small>{weapon.short} · {weapon.automatic ? '按住连发' : '单次射击'}</small></span></div><div className="ammo-count"><strong data-testid="ammo">{String(state.ammo).padStart(2, '0')}</strong><span>/ {weapon.capacity}<small>哨站备弹 ∞</small></span></div><div className="ammo-bars" aria-hidden="true">{Array.from({ length: weapon.capacity }, (_, i) => <i key={i} className={i < state.ammo ? 'loaded' : ''} />)}</div><span className="reload-hint">{state.switching ? '切换中…' : pendingWeapon ? `动作结束后切换 · ${WEAPONS[state.requestedWeapon].label}` : state.reloadQueued ? '准备装填…' : state.reloading ? weapon.shellReload ? '逐发装填中…' : '正在更换弹匣…' : state.ammo === 0 ? '弹匣已空 · 按 R 换弹' : <><kbd>R</kbd> 换弹</>}</span></div>
      <div className="weapon-slots" role="group" aria-label="切换武器">{WEAPONS.map((gun, index) => <button key={gun.id} disabled={state.phase !== 'playing'} aria-label={`切换到${gun.label}`} aria-pressed={index === state.weaponIndex} data-pending={pendingWeapon && index === state.requestedWeapon} onClick={() => game.current?.switchWeapon(index)} title={`${index + 1} · ${gun.label}`}><kbd>{index + 1}</kbd><span>{gun.short}</span><small>{state.inventory[index]}</small></button>)}<p>数字键 1–6 / 滚轮切换</p></div>
      {state.reloading && <div className="reload-progress" role="status"><span>装填中</span><i /></div>}
      <footer className="play-footer"><div><span className="signal-dot" /><span>{state.fps} FPS</span><span className="footer-divider" /><span>自由视角 · 44 × 62 m</span></div><div><span><kbd>WASD</kbd> 移动</span><span><kbd>空格</kbd> 跳跃</span><span><kbd>鼠标</kbd> 转向</span><span><kbd>左键</kbd> {weapon.automatic ? '按住连发' : '单次射击'}</span><span><kbd>ESC</kbd> 暂停</span></div></footer>
    </div>}

    {state.phase === 'paused' && !settings && !state.coop && <section className="pause-screen" aria-label="暂停菜单"><div className="pause-content"><Icon name="tower" size={36} /><span className="label">WATCH ON HOLD</span><h2>哨站已暂停</h2><p>准备好后，继续移动与战斗。{state.mode === 'survival' && '坚守计时已暂停。'}</p><button className="start-button" onClick={() => game.current?.start()}>继续游戏 <Icon name="arrow" /></button><button className="text-button" onClick={() => { setFeedback(null); game.current?.reset(); }}>{state.mode === 'practice' ? '重新开始训练' : '重新开始坚守'}</button><button className="text-button" onClick={() => { setFeedback(null); game.current?.menu(); }}>返回主菜单</button><small>按 ESC 继续</small></div></section>}

    {state.coop && state.phase !== 'failed' && <aside className="coop-team" aria-label="双人小队">
      <span className="label">双人协作 · {state.coop.host ? '房主' : '队员'}</span>
      {state.coop.players.map(player => <div key={player.id} className={player.health === 0 ? 'fallen' : ''}>
        <span>{player.name}{player.id === state.coop!.localId ? '（你）' : ''}</span><b>{player.health === 0 ? '已阵亡' : `${player.health} HP`}</b>
        <progress max={100} value={player.health} aria-label={`${player.name}生命值`} />
      </div>)}
    </aside>}
    {state.coop?.spectating && state.phase === 'playing' && <div className="coop-spectating" role="status"><strong>你已阵亡 · 正在观战队友</strong><span>队友仍可继续守波，两人都阵亡才结束。</span></div>}
    {state.coop && state.phase === 'paused' && !settings && <section className="pause-screen" aria-label="联机菜单"><div className="pause-content">
      <span className="label">TEAM STILL IN ACTION</span><h2>联机对局仍在继续</h2><p>打开菜单不会暂停尸群，你仍会受到攻击。</p>
      <button className="start-button" onClick={() => game.current?.start()}>返回{state.coop.spectating ? '观战' : '战斗'} <Icon name="arrow" /></button>
      <button className="text-button" onClick={leaveCoop}>离开对局</button>
    </div></section>}
    {state.coop && state.phase === 'failed' && state.result && <section className="pause-screen" aria-label="双人结算"><div className="pause-content">
      <span className="label">BOTH SURVIVORS DOWN</span><h2>小队全员阵亡</h2><p>共同守住 <strong>{state.result.waves}</strong> 波 · 击杀 <strong>{state.result.kills}</strong> 只</p>
      <p>坚守 {formatDuration(state.result.duration)} · 双人成绩不计入单人排行榜</p>
      <button className="start-button" onClick={leaveCoop}>返回多人大厅 <Icon name="arrow" /></button>
    </div></section>}
    {state.phase === 'breaching' && state.breach && <BreachOverlay breach={state.breach} />}
    {state.phase === 'failed' && state.result && !state.coop && <ResultPanel result={state.result} entries={entries} saved={saved} record={state.mode === 'survival' ? record : null} breach={state.breach} onRetry={() => game.current?.reset()} onMenu={() => game.current?.menu()} />}

    <dialog ref={scoreDialog} className="settings-dialog leaderboard-dialog" aria-labelledby="leaderboard-title" onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }}>
      <div className="dialog-heading"><div><span className="label">LOCAL RECORDS</span><h2 id="leaderboard-title">波次排行榜</h2></div><button className="icon-button" onClick={() => scoreDialog.current?.close()} aria-label="关闭排行榜"><Icon name="close" /></button></div>
      <p className="settings-intro">困难难度 · 本机前 10 名</p><LeaderboardTable entries={entries} difficulty={FIXED_DIFFICULTY} /><p className="board-footnote">按已清完的波数排名，未清完的一波不计入。<br />成绩保存在当前浏览器，清除网站数据会移除纪录。</p>
    </dialog>

    <dialog ref={dialog} className="settings-dialog" aria-labelledby="settings-title" onCancel={event => { event.preventDefault(); event.stopPropagation(); closeSettings(); }} onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }}>
      <div className="dialog-heading"><div><span className="label">FIELD PREFERENCES</span><h2 id="settings-title">哨站设置</h2></div><button className="icon-button" onClick={closeSettings} aria-label="关闭设置"><Icon name="close" /></button></div>
      <p className="settings-intro">鼠标控制自由视角，准星保持在屏幕中心。</p>
      <div className="view-limits"><Icon name="aim" /><p>水平 360°<span>垂直 ±85°</span><small>WASD 移动，空格跳跃。点击捕获鼠标，ESC 暂停。</small></p></div>
      <label className="toggle-row"><span>游戏声音<small>射击、护甲、死亡与低音量背景音乐</small></span><input type="checkbox" checked={state.sound} onChange={event => game.current?.setSound(event.target.checked)} /><i /></label>
      <div className="volume-control"><label htmlFor="volume">总音量 <b>{Math.round(state.volume * 100)}%{!state.sound && ' · 已静音'}</b></label><input id="volume" type="range" min="0" max="100" step="1" value={Math.round(state.volume * 100)} onChange={event => game.current?.setVolume(Number(event.target.value) / 100)} /><small>自动保存音量与静音设置</small></div>
      <label className="quality-row"><span>渲染清晰度<small>{state.renderResolution.width} × {state.renderResolution.height} · {state.fps} FPS<br />GPU：{state.renderResolution.gpu}{/SwiftShader|llvmpipe|software/i.test(state.renderResolution.gpu) && <strong>检测到软件渲染，请开启显卡硬件加速。</strong>}</small></span><select aria-label="渲染清晰度" value={state.renderQuality} onChange={event => game.current?.setRenderQuality(event.target.value as RenderQuality)}><option value="native">原生（最高 4K）</option><option value="balanced">平衡（最高 1440p）</option><option value="performance">性能（最高 1080p）</option></select></label>
      <label className="toggle-row"><span>粗颗粒像素<small>降低渲染分辨率，保留清晰的界面</small></span><input type="checkbox" checked={state.pixelated} onChange={event => game.current?.setPixelated(event.target.checked)} /><i /></label>
      <div className="settings-controls"><span><kbd>左键</kbd> 射击</span><span><kbd>R</kbd> 换弹</span><span><kbd>M</kbd> 静音</span><span><kbd>ESC</kbd> 暂停</span></div>
      <button className="start-button dialog-done" onClick={closeSettings}>返回哨站 <Icon name="arrow" /></button>
    </dialog>

    {error && !multiplayer && <div className="error-notice" role="alert"><p>{error}</p><button className="text-button" onClick={() => setError('')}>关闭提示</button><button className="text-button" onClick={() => location.reload()}>重新加载</button></div>}
    <div className="mobile-notice">建议使用电脑横屏，搭配鼠标和键盘游玩。</div>
  </main>;
}
