import type { ZombieKind } from './config';

/** 原创声带激励 + 两段元音共振，形成短促的“呃—啊”而非电子降调。 */
export function synthesizeDeath(sampleRate: number, variant: number) {
  const duration = .86 + variant * .075;
  const samples = new Float32Array(Math.ceil(sampleRate * duration));
  const states = Array.from({ length: 3 }, () => ({ a: 0, b: 0 }));
  let phase = 0, seed = 1729 + variant * 733, previous = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate, p = t / duration;
    const vowel = Math.max(0, Math.min(1, (p - .23) / .24));
    const pitch = (103 + variant * 9) * (1 - .38 * p) + Math.sin(t * 31) * 3;
    phase = (phase + pitch / sampleRate) % 1;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0xffffffff * 2 - 1;
    // 声门缓开快闭；微分脉冲包含元音所需的宽频谐波。
    const glottis = phase < .65 ? Math.sin(Math.PI * phase / .65) ** 2 : 0;
    const excitation = (glottis - previous) * 7 + noise * (.055 + .11 * p);
    previous = glottis;
    const formants = [390 + vowel * 360, 1150 - vowel * 110, 2350 + variant * 65];
    let voice = 0;
    for (let f = 0; f < 3; f++) {
      const frequency = Math.min(sampleRate * .42, formants[f]);
      const r = Math.exp(-Math.PI * [95, 145, 220][f] / sampleRate);
      const state = states[f];
      const next = excitation * (1 - r) + 2 * r * Math.cos(2 * Math.PI * frequency / sampleRate) * state.a - r * r * state.b;
      state.b = state.a; state.a = next;
      voice += next * [1, .55, .18][f];
    }
    const rasp = .78 + .22 * Math.sin(t * pitch * Math.PI);
    const syllable = 1 - .4 * Math.exp(-(((p - .27) / .065) ** 2));
    const envelope = Math.min(1, t / .025) * Math.min(1, (duration - t) / .16) * (1 - .45 * p) * syllable;
    samples[i] = Math.tanh(voice * 3.6) * rasp * envelope;
  }
  return samples;
}

/** 不等间距模态频率模拟桶壁、盾面和塑料壳的敲击共振，无滑音。 */
export function synthesizeArmor(sampleRate: number, kind: ZombieKind, broken: boolean) {
  const metal = kind === 'bucket', shield = kind === 'shield';
  const duration = metal ? (broken ? .95 : .58) : broken ? .42 : .22;
  const modes = metal ? [487, 803, 1379, 2213, 3467] : shield ? [185, 417, 936, 1681] : kind === 'football' ? [264, 571, 1223] : [173, 389, 827];
  const samples = new Float32Array(Math.ceil(sampleRate * duration));
  let seed = 543 + (metal ? 11 : shield ? 29 : kind === 'football' ? 41 : 0), low = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0xffffffff * 2 - 1; low += (noise - low) * .22;
    let value = 0;
    for (let hit = 0; hit < (broken ? 3 : 1); hit++) {
      const age = t - [0, .13, .27][hit]; if (age < 0) continue;
      const strength = [1, .43, .24][hit];
      value += strength * (metal ? noise - low : low) * Math.exp(-age * (metal ? 105 : 70)) * .38;
      for (let mode = 0; mode < modes.length; mode++) {
        const frequency = Math.min(sampleRate * .43, modes[mode] * (1 + hit * .027));
        const decay = metal ? 7 + mode * 3 : (shield ? 22 : 34) + mode * 12;
        const ring = Math.sin(2 * Math.PI * frequency * age) + (metal ? .25 * Math.sin(2 * Math.PI * (frequency + 7) * age) : 0);
        value += strength * ring * Math.exp(-age * decay) * .28 / (1 + mode * .55);
      }
    }
    samples[i] = Math.tanh(value * 1.3) * Math.min(1, t / .0015) * Math.min(1, (duration - t) / .03);
  }
  return samples;
}

export function synthesizeMusic(sampleRate: number) {
  const beat = 0.6, duration = beat * 16;
  const samples = new Float32Array(Math.round(sampleRate * duration));
  const chords = [[146.83, 174.61, 220], [116.54, 146.83, 174.61], [130.81, 164.81, 196], [110, 146.83, 164.81]];
  const melody = [293.66, 0, 349.23, 329.63, 293.66, 0, 261.63, 220];
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    const chordTime = t % (beat * 4), chordIndex = Math.floor(t / (beat * 4));
    const chordEnvelope = Math.min(1, chordTime / 0.10, (beat * 4 - chordTime) / 0.14);
    const chord = chords[chordIndex];
    let value = chord.reduce((sum, note) => sum + Math.sin(t * note * Math.PI * 2) * 0.10, 0) * chordEnvelope;
    value += Math.sin(t * chord[0] * Math.PI) * 0.10 * chordEnvelope;
    const noteTime = t % (beat * 2), note = melody[Math.floor(t / (beat * 2))];
    if (note) value += Math.sin(noteTime * note * Math.PI * 2) * Math.min(1, noteTime / 0.015) * Math.exp(-noteTime * 4) * 0.16;
    samples[i] = value * Math.min(1, t / 0.025, (duration - t) / 0.025);
  }
  return samples;
}
