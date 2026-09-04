import { useEffect, useRef } from 'react';
import { ARMOR_SPAWNS, DIFFICULTIES, FIXED_DIFFICULTY, ZOMBIE_TYPES } from '../game/config';
import type { Difficulty, GameMode, GameSnapshot, RunResult } from '../game/config';
import { formatDuration } from '../game/leaderboard';
import type { PersonalRecord } from '../game/leaderboard';

export function DeploymentPanel({ mode, onMode, onStart, onLeaderboard, disabled }: {
  mode: GameMode; onMode: (mode: GameMode) => void; onStart: () => void; onLeaderboard: () => void; disabled: boolean;
}) {
  return <div className="deployment-panel">
    <span className="label">PREPARE YOUR WATCH</span><h2>选择你的防守</h2>
    <div className="mode-options" role="group" aria-label="游戏模式">
      <button className="mode-option" aria-pressed={mode === 'practice'} onClick={() => onMode('practice')}><span className="mode-radio" /><span>练习模式<small>静止僵尸靶 · 无限练习</small></span><b>01</b></button>
      <button className="mode-option" aria-pressed={mode === 'survival'} onClick={() => onMode('survival')}><span className="mode-radio" /><span>正式模式<small>固定波次 · 数量与移速递增</small></span><b>02</b></button>
    </div>
    <div className="deployment-detail">
      {mode === 'survival' ? <><span className="practice-note">困难难度 · 波次生存</span><p>{DIFFICULTIES[FIXED_DIFFICULTY].description}。<br />每 {ARMOR_SPAWNS.normalPerCone} 普 → 1 路障；每 {ARMOR_SPAWNS.conesPerBucket} 路障 → 1 铁桶。<br /><strong>清完一波休整 5 秒。空格跳河，落水立即失败。</strong></p></> : <><span className="practice-note">先熟悉你的第一发子弹。</span><p>僵尸固定站位，击倒后自动复位。<br />靶子不攻击；落水仍会失败，不计入排行榜。</p></>}
    </div>
    <button className="start-button" onClick={onStart} disabled={disabled}><span>{mode === 'practice' ? '进入哨站' : '开始坚守'}<small>{mode === 'practice' ? 'ENTER THE RANGE' : 'HOLD THE LINE'}</small></span><span aria-hidden="true">→</span></button>
    <button className="leaderboard-link" onClick={onLeaderboard}>查看排行榜 <span>本机 TOP 10 ↗</span></button>
  </div>;
}

export function LeaderboardTable({ entries, difficulty, highlightId }: { entries: RunResult[]; difficulty: Difficulty; highlightId?: string }) {
  const rows = entries.filter(entry => entry.difficulty === difficulty);
  if (!rows.length) return <div className="empty-leaderboard"><span>—</span><p>还没有坚守纪录<small>完成一局{DIFFICULTIES[difficulty].label}难度的正式模式，留下第一条成绩。</small></p></div>;
  return <div className="leaderboard-scroll"><table className="leaderboard-table"><caption className="sr-only">{DIFFICULTIES[difficulty].label}难度坚守波数排行榜</caption><thead><tr><th scope="col">排名</th><th scope="col">守住波数</th><th scope="col">击杀</th><th scope="col">日期</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.id} className={row.id === highlightId ? 'current-result' : ''}><td>{String(index + 1).padStart(2, '0')}{row.id === highlightId && <small>本次</small>}</td><td>{row.waves} 波<small>{formatDuration(row.duration)}</small></td><td>{row.kills}</td><td>{new Date(row.endedAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</td></tr>)}</tbody></table></div>;
}

export function BreachOverlay({ breach }: { breach: NonNullable<GameSnapshot['breach']> }) {
  return <section className="breach-review" aria-label="突破者特写">
    <div className="breach-title"><span className="label">WATCH LOST</span><h2>防线失守</h2><p>生命值已耗尽</p></div>
    <div className="breach-culprit" data-testid="breached-zombie" data-zombie-id={breach.id}>
      <span>突破者</span><strong>{ZOMBIE_TYPES[breach.kind].label}</strong><small>从{breach.side}发动致命攻击</small>
    </div>
  </section>;
}

export function ResultPanel({ result, entries, saved, record, breach, onRetry, onMenu }: { result: RunResult; entries: RunResult[]; saved: boolean; record: PersonalRecord | null; breach: GameSnapshot['breach']; onRetry: () => void; onMenu: () => void }) {
  const focus = useRef<HTMLHeadingElement>(null);
  useEffect(() => { focus.current?.focus({ preventScroll: true }); }, []);
  const rank = entries.filter(r => r.difficulty === result.difficulty).findIndex(r => r.id === result.id);
  const culprit = result.cause === 'water' ? '落入河流，无法继续生存' : breach ? `${ZOMBIE_TYPES[breach.kind].label}从${breach.side}发动致命攻击` : '生命值已耗尽';
  return <section className="result-screen" aria-label="游戏结束"><div className="result-panel">
    <div className="result-summary"><span className="label">PERIMETER BREACHED</span><h2 ref={focus} tabIndex={-1}>{result.cause === 'water' ? '落水失败' : '防线失守'}</h2><p>{culprit}，游戏失败。</p>
      <span className="result-time-label">{result.mode === 'practice' ? '练习结束' : `已守住 · ${DIFFICULTIES[result.difficulty].label}难度`}</span><strong className="result-time" data-testid="survival-result">{result.mode === 'practice' ? '不计分' : `${result.waves} 波`}</strong>{result.mode === 'survival' && <p>结束于第 {result.wave} 波 · 坚守 {formatDuration(result.duration, true)}</p>}
      {record && <div className={`personal-record ${record.status}`} data-testid="personal-record" role="status"><strong>{record.status === 'first' ? '首次坚守 · 个人纪录已建立' : record.status === 'new' ? '新纪录！突破个人最佳' : record.status === 'tied' ? '追平个人最佳！' : '离个人最佳再近一点'}</strong><small>{record.status === 'first' ? '下一次，试着再清完一波。' : record.status === 'new' ? `比上次最佳多守了 ${record.difference} 波` : record.status === 'tied' ? '再坚持一步，就能刷新纪录。' : `距离个人最佳还差 ${record.difference} 波`}</small>{record.previous !== null && <small>此前最佳 {record.previous} 波</small>}</div>}
      <div className="result-stats"><span><b>{result.kills}</b> 击杀</span><span><b>{result.shots}</b> 发射</span><span><b>{result.shots ? Math.round(result.hits / result.shots * 100) : 0}%</b> 命中率</span></div><p className="record-notice" role="status">{result.mode === 'practice' ? '练习模式，不计入排行榜。' : saved ? rank >= 0 ? `已保存 · 本机${DIFFICULTIES[result.difficulty].label}榜第 ${rank + 1} 名` : '本次未进入前 10 名，继续挑战。' : '浏览器无法保存，本次成绩仅在当前页面保留。'}</p><button className="start-button" onClick={onRetry}>再守一次 <span aria-hidden="true">→</span></button><button className="text-button" onClick={onMenu}>返回主菜单</button></div>
    <div className="result-leaderboard"><div className="board-heading"><h3>波次排行榜</h3><span>{DIFFICULTIES[result.difficulty].label} · 本机前 10</span></div><LeaderboardTable entries={entries} difficulty={result.difficulty} highlightId={result.id} /><p className="board-footnote">按守住波数排序，同波数比较击杀，再比较时长。<br />仅记录正式模式，保存在当前浏览器。</p></div>
  </div></section>;
}
