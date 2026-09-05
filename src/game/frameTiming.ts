export interface FrameSchedule { render: boolean; deadline: number }

/**
 * 将目标帧率映射到显示器的 RAF 节拍，同时保留长期平均帧率。
 * 例如 144 Hz / 60 FPS 会交替使用 2、3 个刷新周期，而不是固定每 3 帧绘制一次降到 48 FPS。
 */
export function scheduleFrame(deadline: number, time: number, frameLimit: number): FrameSchedule {
  if (!frameLimit) return { render: true, deadline: 0 };
  const interval = 1000 / frameLimit;
  if (deadline && time + 0.5 < deadline) return { render: false, deadline };
  let next = deadline || time;
  do next += interval; while (next <= time + 0.5);
  return { render: true, deadline: next };
}
