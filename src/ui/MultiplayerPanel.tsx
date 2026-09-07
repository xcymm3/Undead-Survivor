import { useEffect, useRef, useState } from 'react';
import type { Room, SteamStatus } from '../multiplayer/types';

export function MultiplayerPanel({ close, notice = '' }: { close: () => void; notice?: string }) {
  const [status, setStatus] = useState<SteamStatus | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [name, setName] = useState('一起守住哨站');
  const [roomId, setRoomId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [copied, setCopied] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const bridge = window.steamCoop;
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return; setBusy(true); setError('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    if (!bridge) return;
    let active = true;
    void bridge.status().then(s => { if (active) setStatus(s); }).catch(e => { if (active) setError(String(e)); });
    const off = bridge.onEvent(event => { if (event.type === 'status') setStatus(event.status); if (event.type === 'error' || event.type === 'left') setError(event.message); });
    return () => { active = false; off(); };
  }, [bridge]);
  const room = status?.room;
  useEffect(() => setCopied(false), [room?.id]);
  return <section className="multiplayer-screen" role="dialog" aria-modal="true" aria-labelledby="multiplayer-title" onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const nodes = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? [])];
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <div className="multiplayer-panel" ref={panel} tabIndex={-1} aria-busy={busy}>
      <div className="lobby-heading"><div><h2 id="multiplayer-title">{room ? '集结小队' : '多人大厅'}</h2><p>2–4 人合作生存</p></div><button className="icon-button" aria-label={room ? '离开并返回首页' : '返回首页'} disabled={busy} onClick={() => run(async () => { if (room) await bridge?.leave(); close(); })}>×</button></div>
      {!bridge ? <div className="network-note"><span className="network-symbol" aria-hidden="true">↗</span><h3>在 Steam 上集结</h3><p>请在桌面版登录 Steam 后联机。</p></div>
        : !status?.available ? <div className="network-note"><span className="network-symbol" aria-hidden="true">↗</span><h3>{status ? 'Steam 未连接' : '正在连接 Steam…'}</h3><p>{status?.message}</p><button className="start-button" disabled={busy} onClick={() => run(async () => setStatus(await bridge.status()))}>重新连接 Steam <span>↻</span></button></div>
        : <><div className="network-identity"><span className="online-dot" />{status.name}<span>Steam 已连接</span></div>
          {room ? <div className="room-current">
            <div className="room-title"><h3>{room.name}</h3><span>{room.members.length} / 4 人</span></div>
            <div className="room-code"><span>房间号</span><code>{room.id}</code><button className="text-button" disabled={busy} onClick={() => run(async () => { await navigator.clipboard.writeText(room.id); setCopied(true); })}>{copied ? '已复制' : '复制'}</button></div>
            <ul className="squad-seats">{Array.from({ length: 4 }, (_, index) => {
              const member = room.members[index];
              return <li key={member?.id ?? `empty-${index}`} className={member ? 'seat occupied' : 'seat vacant'}>
                <div className="seat-avatar" aria-hidden="true">{member ? <svg viewBox="0 0 100 112"><circle cx="50" cy="34" r="21" /><path d="M12 108V86c0-22 17-34 38-34s38 12 38 34v22Z" /></svg> : '+'}</div>
                <strong title={member?.name}>{member?.name ?? '空位'}</strong>
                <span>{member ? `${member.id === room.owner ? '房主' : '队员'}${member.id === status.id ? ' · 你' : ''}` : '等待加入'}</span>
              </li>;
            })}</ul>
            <div className="room-actions"><p role="status">{room.playing ? '正在进入战斗…' : room.members.length < 2 ? '等待至少一名队友加入' : room.owner === status.id ? '小队已就绪' : '等待房主开始'}</p>
              {room.owner === status.id && <button className="start-button" disabled={busy || room.members.length < 2 || room.playing} onClick={() => run(() => bridge.start())}>开始多人游戏 <span>→</span></button>}
              <button className="text-button" disabled={busy} onClick={() => run(() => bridge.leave())}>离开房间</button>
            </div>
          </div> : <div className="lobby-columns">
            <section className="lobby-browser"><div className="room-search"><h3>寻找小队</h3><button className="text-button" disabled={busy} onClick={() => run(async () => { setRooms(await bridge.search()); setSearched(true); })}>{searched ? '刷新房间' : '搜索房间'} ↻</button></div>
              <div className="room-list">{rooms.map(r => <div key={r.id}><span>{r.name}<small>{r.memberCount ?? r.members.length} / 4 人</small></span><button disabled={busy} onClick={() => run(async () => { const room = await bridge.join(r.id); setStatus({ ...status, room }); })}>加入房间 ↗</button></div>)}{!rooms.length && <p className="lobby-empty">{searched ? '暂无可加入的房间' : '搜索正在等待的小队'}</p>}</div>
              <div className="room-direct"><label htmlFor="room-id">通过房间号加入</label><div><input id="room-id" inputMode="numeric" placeholder="输入房间号" maxLength={20} value={roomId} onChange={e => setRoomId(e.target.value.replace(/\D/g, ''))} /><button disabled={busy || !roomId} onClick={() => run(async () => { const room = await bridge.join(roomId); setStatus({ ...status, room }); })}>加入</button></div></div>
            </section>
            <section className="room-create"><h3>建立你的小队</h3><label htmlFor="room-name">房间名称</label><input id="room-name" maxLength={40} value={name} onChange={e => setName(e.target.value)} /><button disabled={busy} className="start-button" onClick={() => run(async () => { const room = await bridge.create(name); setStatus({ ...status, room }); })}>创建房间 <span>＋</span></button></section>
          </div>}
        </>}
      {(error || notice) && <p role="alert" className="network-error">{error || notice}</p>}
      {busy && <p className="lobby-busy" role="status">连接中…</p>}
    </div>
  </section>;
}
