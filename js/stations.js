// 22 trạm: tên chủ đề (data/index.json), trạng thái từng trạm theo tiến độ, trạm đang học, khoá theo thứ tự.
import { getProgress, doneStages } from './progress.js';
import { sx } from './data.js';
import { href } from './router.js';
import { load, save } from './store.js';

// Toạ độ 22 trạm (%) trên nền dọc nen-hanhtrinh-doc (1:3, cô duyệt 21/11/2026): S1 ở sân trước cổng trường,
// S2–S22 chia đều theo tâm đường kem (đọc từ mặt nạ màu của ảnh), S22 sát bục cúp. Ở màn 360 px hai trạm gần nhất cách ≥ 56 px.
export const MAP_XY = [
  [50.0, 94.0], [77.5, 78.0], [71.8, 72.8], [54.5, 69.9], [36.7, 67.2], [19.5, 64.3], [19.8, 58.7], [37.6, 56.1],
  [55.6, 53.6], [73.3, 51.0], [80.3, 46.3], [63.4, 43.2], [45.2, 40.9], [27.6, 38.2], [15.5, 34.0], [28.0, 29.6],
  [46.0, 27.2], [64.4, 25.0], [81.1, 21.8], [86.8, 16.9], [68.7, 14.7], [53.5, 11.0],
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
