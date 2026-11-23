// 4 tiếng ngắn: ok (đúng), bad (sai), tap (chạm chip), win (hoàn thành trạm). Không có tiếng khi chuyển chặng.
// Nguồn chính: tệp OGG/MP3 trong sfx/ (Kenney «Interface Sounds», CC0) phát bằng thẻ <audio>
//   – chạy được trên điện thoại (iPhone/Zalo) kể cả khi Web Audio bị chặn.
// Dự phòng: tiếng tổng hợp bằng Web Audio khi tệp không tải được.
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

// ---- tệp âm thanh (thẻ <audio>) ----
const FILES = {};
const EXT = (() => { try { return new Audio().canPlayType('audio/ogg; codecs="vorbis"') === 'probably' ? 'ogg' : 'mp3'; } catch { return 'mp3'; } })();
function loadFiles() {
  for (const name of Object.keys(SOUNDS)) {
    if (FILES[name]) continue;
    try {
      const a = new Audio(`sfx/${name}.${EXT}`);
      a.preload = 'auto'; a.volume = VOL[name] ?? FILE_VOLUME;
      a.addEventListener('error', () => { FILES[name] = null; });
      FILES[name] = a;
    } catch { FILES[name] = null; }
  }
}
// KHÔNG «mồi» tệp lúc chạm đầu: trên một số điện thoại / Zalo lệnh tắt tiếng bị bỏ qua,
// khiến cả loạt tiếng kêu khi học sinh vừa chạm để cuộn trang.
const FILE_VOLUME = 0.6;
const VOL = { tap: 0.45, bad: 0.5 }; // tiếng xếp cụm và tiếng sai: nhỏ hơn

/** Gọi một lần lúc khởi động: mở khoá âm thanh ở lần chạm đầu tiên. */
export function initSfx() {
  const unlock = () => {
    unlocked = true;
    loadFiles();
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
  win: { label: 'Chúc mừng hoàn thành trạm', dur: 0.5, play: (t) => { [659, 784, 1047].forEach((f, i) => tone(t, { f, at: i * 0.09, dur: 0.2 })); tone(t, { f: 1319, at: 0.28, dur: 0.2, gain: 0.5 }); } },
};

/** Phát một tiếng. force = bỏ qua công tắc và giảm chuyển động (chỉ dùng ở trang nghe thử). */
export function sfx(name, { force = false } = {}) {
  const s = SOUNDS[name];
  let why = '';
  if (!s) why = 'khong_co';
  else if (!force && !soundEnabled()) why = 'tat';
  else if (!force && reduced()) why = 'giam_chuyen_dong';
  else if (!unlocked && !force) why = 'chua_cham';
  // Chỉ phát ngay trong lúc học sinh vừa bấm (không phát muộn, không phát khi đang cuộn)
  else if (!force && name !== 'win' && navigator.userActivation && !navigator.userActivation.isActive) why = 'khong_bam';
  const file = !why && !force ? FILES[name] : (!why ? (loadFiles(), FILES[name]) : null);
  if (file) {
    try {
      file.currentTime = 0;
      const pr = file.play();
      if (pr && pr.catch) pr.catch(() => {}); // bị chặn thì thôi, không phát bù sau
      log.push({ name, played: true, why: '', src: 'file' });
      if (log.length > 50) log.shift();
      return true;
    } catch { /* thử tiếng tổng hợp */ }
  }
  return synth(name, s, why);
}

function synth(name, s, why = '') {
  const played = !why && !!ensure();
  log.push({ name, played, why: why || (played ? '' : 'khong_ho_tro'), src: 'synth' });
  if (log.length > 50) log.shift();
  if (!played) return false;
  // Ngữ cảnh âm thanh chưa chạy thì bỏ qua (nếu xếp lịch lúc này, các tiếng sẽ dồn lại kêu cùng lúc khi nó chạy)
  if (ac.state !== 'running') { ac.resume().catch(() => {}); log.at(-1).played = false; log.at(-1).why = 'chua_san_sang'; return false; }
  try { s.play(ac.currentTime + 0.01); } catch { return false; }
  return true;
}
