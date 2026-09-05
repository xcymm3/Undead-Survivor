import type { WeaponDefinition } from './weapons';

export type ReloadStage = 'prepare' | 'eject' | 'insert' | 'action' | 'return';
export interface ReloadPose { x: number; y: number; z: number; rx: number; ry: number; rz: number; stage: ReloadStage; }
type Transform = Omit<ReloadPose, 'stage'>;
type ReloadProfile = { stages: readonly [number, number, number, number]; focus: Transform; action: Transform };

const PROFILES: Record<string, ReloadProfile> = {
  rifle: { stages: [.12, .34, .70, .87], focus: { x: -.13, y: .12, z: .07, rx: .08, ry: -.30, rz: -.30 }, action: { x: -.08, y: .10, z: .08, rx: -.05, ry: -.18, rz: -.18 } },
  p90: { stages: [.13, .37, .72, .88], focus: { x: -.12, y: .14, z: .10, rx: .12, ry: .28, rz: -.27 }, action: { x: -.07, y: .12, z: .11, rx: -.08, ry: .20, rz: -.17 } },
  pistol: { stages: [.11, .32, .68, .86], focus: { x: -.16, y: .17, z: .13, rx: .05, ry: -.22, rz: -.40 }, action: { x: -.10, y: .14, z: .14, rx: -.10, ry: -.14, rz: -.25 } },
  revolver: { stages: [.14, .38, .69, .87], focus: { x: -.17, y: .16, z: .13, rx: .10, ry: .40, rz: -.44 }, action: { x: -.10, y: .13, z: .12, rx: -.08, ry: .28, rz: -.24 } },
  shotgun: { stages: [.14, .30, .76, .88], focus: { x: -.14, y: .13, z: .07, rx: .14, ry: -.34, rz: -.36 }, action: { x: -.09, y: .11, z: .08, rx: -.02, ry: -.24, rz: -.22 } },
  sniper: { stages: [.13, .35, .68, .88], focus: { x: -.13, y: .11, z: .05, rx: .08, ry: -.28, rz: -.31 }, action: { x: -.07, y: .13, z: .08, rx: -.10, ry: -.18, rz: -.18 } },
  axe: { stages: [.12, .32, .68, .88], focus: { x: -.08, y: .12, z: .04, rx: .08, ry: -.20, rz: -.30 }, action: { x: -.04, y: .10, z: .05, rx: -.06, ry: -.12, rz: -.18 } },
  flamethrower: { stages: [.14, .36, .70, .88], focus: { x: -.15, y: .12, z: .07, rx: .10, ry: .31, rz: -.32 }, action: { x: -.09, y: .10, z: .09, rx: -.08, ry: .22, rz: -.20 } },
  'auto-shotgun': { stages: [.13, .35, .69, .87], focus: { x: -.14, y: .14, z: .08, rx: .12, ry: -.32, rz: -.36 }, action: { x: -.08, y: .11, z: .10, rx: -.07, ry: -.20, rz: -.21 } },
  'heavy-machine-gun': { stages: [.15, .39, .73, .90], focus: { x: -.18, y: .11, z: .10, rx: .14, ry: .36, rz: -.38 }, action: { x: -.11, y: .13, z: .12, rx: -.11, ry: .25, rz: -.24 } },
};
const ZERO: Transform = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
const ease = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
const mix = (from: Transform, to: Transform, amount: number): Transform => Object.fromEntries(Object.keys(ZERO).map(key => [key, from[key as keyof Transform] + (to[key as keyof Transform] - from[key as keyof Transform]) * amount])) as Transform;

export function reloadStage(definition: Pick<WeaponDefinition, 'id'>, progress: number): ReloadStage {
  const [prepare, eject, insert, action] = PROFILES[definition.id].stages;
  return progress < prepare ? 'prepare' : progress < eject ? 'eject' : progress < insert ? 'insert' : progress < action ? 'action' : 'return';
}

export function reloadPose(definition: Pick<WeaponDefinition, 'id'>, progress: number, empty: boolean): ReloadPose {
  const profile = PROFILES[definition.id], [prepare, eject, insert, action] = profile.stages;
  const p = Math.max(0, Math.min(1, progress));
  const actionPose = empty ? profile.action : mix(profile.focus, profile.action, .45);
  let transform: Transform;
  if (p < prepare) transform = mix(ZERO, profile.focus, ease(p / prepare));
  else if (p < eject) transform = profile.focus;
  else if (p < insert) transform = mix(profile.focus, { ...profile.focus, y: profile.focus.y + .025, z: profile.focus.z + .018 }, ease((p - eject) / (insert - eject)));
  else if (p < action) transform = mix(profile.focus, actionPose, ease((p - insert) / (action - insert)));
  else transform = mix(actionPose, ZERO, ease((p - action) / (1 - action)));
  return { ...transform, stage: reloadStage(definition, p) };
}

export function crossedReloadStage(definition: Pick<WeaponDefinition, 'id'>, from: number, to: number, stage: ReloadStage) {
  const profile = PROFILES[definition.id], threshold = { prepare: 0, eject: profile.stages[0], insert: profile.stages[1], action: profile.stages[2], return: profile.stages[3] }[stage];
  return from < threshold && to >= threshold;
}
