import type { SightDefinition } from '../game/sights';

export function SightOverlay({ sight }: { sight: SightDefinition }) {
  const sniper = sight.kind === 'sniper', prism = sight.kind === 'prism';
  return <div className={`sight-overlay sight-${sight.kind}`} aria-label={`${sight.label} · ${sight.magnification} 倍`}>
    <div className="sight-lens">
      <svg className="sight-reticle" viewBox="0 0 400 400" aria-hidden="true">
        {sniper ? <g className="scope-etching">
          <path d="M0 200H192M208 200H400M200 0V192M200 208V400" />
          <path className="scope-post" d="M0 200H80M320 200H400M200 320V400" />
          {[-3, -2, -1, 1, 2, 3].map(tick => <g key={tick}>
            <path d={`M${200 + tick * 26} 195v10M195 ${200 + tick * 26}h10`} />
            <circle cx={200 + tick * 26} cy="200" r="1.7" /><circle cx="200" cy={200 + tick * 26} r="1.7" />
          </g>)}
          <circle className="scope-center" cx="200" cy="200" r="1.5" />
        </g> : prism ? <g className="prism-etching">
          <path d="M190 210L200 200L210 210M200 220V298M185 244H215M178 270H222M170 296H230M116 200H170M230 200H284" />
          <text x="222" y="248">4</text><text x="229" y="274">6</text><text x="237" y="300">8</text>
        </g> : <g className="illuminated-reticle">
          {sight.kind !== 'red-dot' && <circle cx="200" cy="200" r={sight.kind === 'reflex' ? 28 : 19} />}
          {sight.kind === 'holographic' && <path d="M200 173V185M200 215V227M173 200H185M215 200H227" />}
          <circle className="sight-dot" cx="200" cy="200" r="2" />
        </g>}
      </svg>
      <span className="sight-caption">{sight.label} · {sight.magnification}×</span>
    </div>
    {sniper && <div className="scope-instruction">按住右键瞄准 · 松开退出</div>}
  </div>;
}
