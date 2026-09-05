import { writeFile } from 'node:fs/promises';
import { createServer } from 'vite';

// 与正在试玩的 Vite 服务隔离缓存，防止 SSR 模拟覆盖浏览器依赖的预构建版本。
const server = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-balance', server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  const { evaluateBalance } = await server.ssrLoadModule('/scripts/balance-model.ts');
  const { WEAPONS } = await server.ssrLoadModule('/src/game/weapons.ts');
  const { CONFIG } = await server.ssrLoadModule('/src/game/config.ts');
  const weaponsOnly = process.argv.includes('--weapons-only');
  const result = weaponsOnly ? null : evaluateBalance();
  const weapons = WEAPONS.map(weapon => {
    const damagePerAttack = weapon.kind === 'melee' ? weapon.damage : weapon.damage * weapon.pellets;
    const reload = weapon.shellReload ? weapon.reloadDuration * weapon.capacity : weapon.reloadDuration;
    const burstDps = damagePerAttack / weapon.interval;
    const sustainedDps = weapon.infiniteAmmo ? burstDps : damagePerAttack * weapon.capacity / (weapon.interval * weapon.capacity + reload);
    return { id: weapon.id, label: weapon.label, capacity: weapon.infiniteAmmo ? '∞' : weapon.capacity, damagePerAttack,
      interval: weapon.interval, reload: Number(reload.toFixed(2)), burstDps: Number(burstDps.toFixed(1)), sustainedDps: Number(sustainedDps.toFixed(1)),
      range: weapon.range ?? CONFIG.weapon.range, piercing: Boolean(weapon.piercing) };
  });
  if (result) await writeFile(new URL('../docs/balance-results.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
  await writeFile(new URL('../docs/weapon-balance-results.json', import.meta.url), JSON.stringify(weapons, null, 2) + '\n');
  if (result) console.table(result.groups.map(({ difficulty, profile, fps, median, p10, p90, withinTarget, samples }) => ({ difficulty, profile, fps, median, p10, p90, target: `${withinTarget}/${samples}` })));
  console.table(weapons);
} finally { await server.close(); }
