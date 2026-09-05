import { describe, expect, it } from 'vitest';
import { scheduleFrame } from '../../src/game/frameTiming';

describe('帧率调度', () => {
  it.each([75, 144, 165])('在 %d Hz 屏幕上将 60 FPS 保持在目标平均值', refreshRate => {
    let deadline = 0, frames = 0;
    for (let tick = 0; tick <= refreshRate; tick++) {
      const schedule = scheduleFrame(deadline, tick * 1000 / refreshRate, 60);
      deadline = schedule.deadline;
      if (schedule.render) frames++;
    }
    expect(frames).toBeGreaterThanOrEqual(60);
    expect(frames).toBeLessThanOrEqual(61);
  });

  it('无限制帧率时每个刷新周期都绘制', () => {
    expect(scheduleFrame(100, 50, 0)).toEqual({ render: true, deadline: 0 });
  });
});
