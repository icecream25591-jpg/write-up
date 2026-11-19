// 22 trạm: tên chủ đề (data/index.json), trạng thái từng trạm theo tiến độ, trạm đang học, khoá theo thứ tự.
import { getProgress, doneStages } from './progress.js';
import { sx } from './data.js';
import { href } from './router.js';
import { load, save } from './store.js';

// Toạ độ 22 trạm trên nen-hanhtrinh (%), lấy từ mẫu đã duyệt mau-giao-dien/M2-HanhTrinh.
export const MAP_XY = [
  [49.3, 95.2], [64.0, 78.5], [73.3, 74.0], [58.9, 70.4], [43.6, 69.6], [27.1, 68.1], [14.7, 64.8], [32.4, 54.6],
  [48.9, 52.6], [65.1, 51.0], [76.9, 46.4], [68.4, 41.6], [52.0, 40.0], [35.8, 38.1], [23.6, 34.1], [26.2, 29.8],
  [40.0, 25.9], [54.0, 24.4], [68.2, 22.5], [78.7, 19.6], [66.7, 14.0], [52.9, 14.4],
];

let indexP = null;
export function loadIndex() {
  indexP ||= fetch('data/index.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    .then((j) => { if (!j) indexP = null; return j?.stations || Array.from({ length: 22 }, (_, i) => ({ n: i + 1, topic: `Station ${i + 1}` })); });
  return indexP;
}

/** Ghi lại trạm vừa mở (để Home biết «Now learning»). */
export const rememberSession = (n) => save('lastSession', n);

/**
 * Trạng thái 22 trạm.
 * ready: có dữ liệu và được mở (config.sessionsReady) · done: đã nhận Reward · stages: số chặng xong (0–5)
 * locked: config.lockOrder và còn trạm sẵn sàng phía trước chưa xong · resume: link vào chặng chưa xong đầu tiên
 */
export async function stations(config) {
  const list = await loadIndex();
  const ready = new Set(config.sessionsReady || []);
  let blocked = false;
  const out = list.map(({ n, topic }) => {
    const isReady = ready.has(n);
    const p = isReady ? getProgress(sx(n)) : null;
    const d = p ? doneStages(p) : new Set();
    const done = !!p?.reward?.at;
    const locked = !!config.lockOrder && isReady && blocked;
    if (isReady && !done) blocked = true; // trạm sau trạm chưa xong bị khoá (nếu lockOrder)
    const first = [0, 1, 2, 3, 4].find((i) => !d.has(i)) ?? 4;
    return { n, topic, ready: isReady, done, locked, stages: d.size, resume: href.stage(n, first) };
  });
  // Trạm đang học: trạm mở gần nhất nếu chưa xong, không thì trạm sẵn sàng đầu tiên chưa xong
  const last = load('lastSession', null);
  const can = (s) => s.ready && !s.locked;
  const current = out.find((s) => s.n === last && can(s) && !s.done)
    || out.find((s) => can(s) && !s.done)
    || [...out].reverse().find((s) => s.ready) || out[0];
  return { list: out, current, doneCount: out.filter((s) => s.done).length };
}
