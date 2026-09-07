import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUDIO_SETTINGS_KEY, GameAudio } from '../../src/game/audio';
import { synthesizeArmor, synthesizeDeath, synthesizeMusic } from '../../src/game/soundSynthesis';

afterEach(() => vi.unstubAllGlobals());
function setup() {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
  const makeNode = () => ({ gain: { value: 0, setValueAtTime(v: number) { this.value = v; }, exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() }, frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn((target: unknown) => target), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() });
  const nodes: ReturnType<typeof makeNode>[] = [];
  function node() { const value = makeNode(); nodes.push(value); return value; }
  vi.stubGlobal('AudioContext', class {
    state = 'running'; currentTime = 0; sampleRate = 100; destination = {};
    createGain = node; createOscillator = node; createBiquadFilter = node;
    createBufferSource = node;
    createBuffer(_channels: number, length: number, rate: number) { const samples = new Float32Array(length); return { getChannelData: () => samples, duration: length / rate }; }
    close() { return Promise.resolve(); }
  });
  return { data, nodes };
}

describe('统一音量与护甲声音', () => {
  it('所有声音经过主音量，零音量和静音不生成音源，恢复保持原音量', () => {
    const { nodes } = setup(); const audio = new GameAudio(); audio.unlock();
    audio.volume = 0.35;
    audio.shot(); audio.armor('bucket', false);
    const master = nodes[0];
    expect(master.gain.value).toBe(0.35);
    expect(nodes.slice(1).filter(n => n.connect.mock.calls.some(([target]) => target === master)).length).toBe(3);
    audio.enabled = false; expect(master.gain.value).toBe(0);
    const count = nodes.length; audio.shot(); audio.armor('cone', true); expect(nodes).toHaveLength(count);
    audio.enabled = true; expect(master.gain.value).toBe(0.35);
    audio.volume = 0; audio.shot(); audio.tone(1, 2, 1); expect(nodes).toHaveLength(count);
    expect(new GameAudio().volume).toBe(0);
  });
  it('护甲命中和脱落有不同音色，持久化且损坏设置不阻止启动', () => {
    const { data } = setup(); const audio = new GameAudio(); audio.unlock();
    audio.armor('cone', false); const cone = synthesizeArmor(24000, 'cone', false);
    audio.armor('bucket', true); const bucket = synthesizeArmor(24000, 'bucket', true);
    expect(cone).not.toBe(bucket);
    expect(audio.diagnostics().lastArmorCue).toEqual({ kind: 'bucket', broken: true });
    audio.volume = 0.42; audio.enabled = false;
    const restored = new GameAudio(); expect(restored.volume).toBe(0.42); expect(restored.enabled).toBe(false);
    data.set(AUDIO_SETTINGS_KEY, '{broken'); expect(new GameAudio().volume).toBe(1);
    vi.stubGlobal('localStorage', { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } });
    const unavailable = new GameAudio(); unavailable.volume = 0.6; expect(unavailable.volume).toBe(0.6);
  });
  it('BGM 仅游玩时单实例循环，战斗压低，暂停/静音停止，恢复不叠加', () => {
    const { nodes } = setup(); const audio = new GameAudio(); audio.unlock();
    expect(audio.diagnostics().musicPlaying).toBe(false);
    audio.setPlaying(true); const count = nodes.length;
    expect(audio.diagnostics().musicPlaying).toBe(true);
    audio.setPlaying(true); audio.unlock(); expect(nodes).toHaveLength(count);
    audio.shot(); expect(audio.diagnostics().musicDucked).toBe(true);
    expect(audio.diagnostics().duckedMusicLevel).toBeLessThan(audio.diagnostics().musicLevel / 3);
    const musicSource = nodes[2];
    audio.setPlaying(false); expect(musicSource.stop).toHaveBeenCalledOnce();
    expect(audio.diagnostics().musicPlaying).toBe(false);
    audio.setPlaying(true); expect(audio.diagnostics().musicPlaying).toBe(true);
    audio.enabled = false; expect(audio.diagnostics().musicPlaying).toBe(false);
    audio.enabled = true; expect(audio.diagnostics().musicPlaying).toBe(true);
    audio.volume = 0; expect(audio.diagnostics().musicPlaying).toBe(false);
    audio.volume = 0.4; audio.resetMusic(); expect(audio.diagnostics().musicPlaying).toBe(false);
    audio.dispose(); audio.setPlaying(true); expect(audio.diagnostics().musicPlaying).toBe(false);
  });
  it('失败声停止背景音乐并经过主音量，静音时不创建失败音源', () => {
    const { nodes } = setup(); const audio = new GameAudio(); audio.unlock();
    audio.volume = 0.37; audio.setPlaying(true);
    const before = nodes.length; audio.failure();
    expect(audio.diagnostics().musicPlaying).toBe(false);
    expect(audio.diagnostics().failureCues).toBe(1);
    expect(nodes[0].gain.value).toBe(0.37);
    expect(nodes.slice(before).filter(n => n.connect.mock.calls.some(([target]) => target === nodes[0]))).toHaveLength(3);
    audio.enabled = false; const mutedCount = nodes.length;
    audio.failure(); expect(nodes).toHaveLength(mutedCount);
  });
  it('死亡低吼有三种变化且最多三声重叠，静音不触发', () => {
    setup(); const audio = new GameAudio(); audio.unlock();
    for (let i = 0; i < 9; i++) audio.death();
    expect(audio.diagnostics().deathCues).toBe(9);
    expect(audio.diagnostics().activeDeaths).toBe(3);
    audio.enabled = false; audio.death(); expect(audio.diagnostics().deathCues).toBe(9);
  });
  it('合成音乐能无声接缝循环，混音能量低于死亡音效且样本不削波', () => {
    const rms = (samples: Float32Array) => Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
    const music = synthesizeMusic(24000), death = synthesizeDeath(24000, 0);
    expect(music.length).toBe(24000 * 9.6);
    expect(music[0]).toBe(0); expect(Math.abs(music[music.length - 1])).toBeLessThan(0.002);
    for (const samples of [music, death]) expect(samples.every(value => Number.isFinite(value) && Math.abs(value) < 1)).toBe(true);
    expect(rms(music) * 0.028).toBeLessThan(rms(death) * 0.12 / 3);
    expect(synthesizeDeath(24000, 1)).not.toEqual(death);
  });
});

it('护甲材质独立、破碎有后续撞击、常用采样率无削波和无效样本', () => {
  for (const rate of [24000, 44100, 48000]) {
    for (const kind of ['bucket', 'cone', 'shield', 'football'] as const) {
      const hit = synthesizeArmor(rate, kind, false), broken = synthesizeArmor(rate, kind, true);
      expect(broken.length).toBeGreaterThan(hit.length);
      expect(hit.every(v => Number.isFinite(v) && Math.abs(v) < 1)).toBe(true);
      expect(broken.every(v => Number.isFinite(v) && Math.abs(v) < 1)).toBe(true);
      expect(Math.abs(hit[0])).toBe(0);
    }
    for (let variant = 0; variant < 3; variant++) expect(synthesizeDeath(rate, variant).every(v => Number.isFinite(v) && Math.abs(v) < 1)).toBe(true);
  }
  const cone = synthesizeArmor(24000, 'cone', false);
  expect(synthesizeArmor(24000, 'football', false)).not.toEqual(cone);
  expect(synthesizeArmor(24000, 'shield', false)).not.toEqual(cone);
});
