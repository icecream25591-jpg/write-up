// 6 tiếng ngắn tạo bằng Web Audio API (không tải tệp nào): ok, bad, tap, open, done, sticker.
// - Âm lượng mặc định nhỏ; tắt được trong Settings (writeup:sound).
// - Không phát khi máy bật «giảm chuyển động» (prefers-reduced-motion).
// - Chỉ phát sau lần chạm / bấm phím đầu tiên của học sinh (trình duyệt điện thoại chặn tự phát).
import { load } from './store.js';

const VOLUME = 0.14;
let ac = null, master = null, unlocked = false;
// nhật ký để kiểm thử: [{name, played, why}]
const log = (window.__wuSfx ||= []);

function ensure() {
  if (ac) return ac;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ac = new AC();
  master = ac.createGain();
  master.gain.value = VOLUME;
  master.connect(ac.destination);
  return ac;
}

/** Gọi một lần lúc khởi động: mở khoá âm thanh ở lần chạm đầu tiên. */
export function initSfx() {
  const unlock = () => {
    unlocked = true;
    const c = ensure();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
    removeEventListener('pointerdown', unlock, true);
    removeEventListener('keydown', unlock, true);
  };
  addEventListener('pointerdown', unlock, true);
  addEventListener('keydown', unlock, true);
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const soundEnabled = () => load('sound', true) !== false;

// một nốt: tần số đầu → cuối, dạng sóng, thời điểm bắt đầu, độ dài, âm lượng tương đối
function tone(t0, { f, f2 = f, type = 'sine', at = 0, dur = 0.12, gain = 1 }) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0 + at);
  if (f2 !== f) o.frequency.exponentialRampToValueAtTime(f2, t0 + at + dur);
  g.gain.setValueAtTime(0.0001, t0 + at);
  g.gain.exponentialRampToValueAtTime(gain, t0 + at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
  o.connect(g).connect(master);
  o.start(t0 + at);
  o.stop(t0 + at + dur + 0.02);
}

// Mọi tiếng đều dưới 0,4 giây.
export const SOUNDS = {
  ok: { label: 'Đúng', dur: 0.26, play: (t) => { tone(t, { f: 784, dur: 0.11 }); tone(t, { f: 1175, at: 0.09, dur: 0.17 }); } },
  bad: { label: 'Chưa đúng', dur: 0.3, play: (t) => { tone(t, { f: 330, f2: 247, type: 'triangle', dur: 0.28, gain: 0.8 }); } },
  tap: { label: 'Chạm', dur: 0.05, play: (t) => { tone(t, { f: 1400, f2: 900, dur: 0.045, gain: 0.5 }); } },
  open: { label: 'Mở chặng', dur: 0.3, play: (t) => { [523, 659, 784].forEach((f, i) => tone(t, { f, at: i * 0.07, dur: 0.14, gain: 0.7 })); } },
  done: { label: 'Xong chặng', dur: 0.36, play: (t) => { [659, 784, 1047].forEach((f, i) => tone(t, { f, at: i * 0.08, dur: 0.18 })); tone(t, { f: 1319, at: 0.24, dur: 0.12, gain: 0.5 }); } },
  sticker: { label: 'Nhận sticker', dur: 0.38, play: (t) => { [1568, 2093, 1760, 2637].forEach((f, i) => tone(t, { f, at: i * 0.075, dur: 0.1, type: i % 2 ? 'triangle' : 'sine', gain: 0.55 })); } },
};

/** Phát một tiếng. force = bỏ qua công tắc và giảm chuyển động (chỉ dùng ở trang nghe thử). */
export function sfx(name, { force = false } = {}) {
  const s = SOUNDS[name];
  let why = '';
  if (!s) why = 'khong_co';
  else if (!force && !soundEnabled()) why = 'tat';
  else if (!force && reduced()) why = 'giam_chuyen_dong';
  else if (!unlocked && !force) why = 'chua_cham';
  const played = !why && !!ensure();
  log.push({ name, played, why: why || (played ? '' : 'khong_ho_tro') });
  if (log.length > 50) log.shift();
  if (!played) return false;
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  try { s.play(ac.currentTime + 0.01); } catch { return false; }
  return true;
}
