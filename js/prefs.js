// Cài đặt người học: cỡ chữ, âm thanh, mã tiến độ (xuất / nhập).
import { load, save, dumpAll, restoreAll } from './store.js';

export const FONT_SCALES = [['s', 'A−', '93.75%'], ['m', 'A', '100%'], ['l', 'A+', '112.5%'], ['xl', 'A++', '125%']];

export function applyPrefs() {
  const f = FONT_SCALES.find(([k]) => k === load('fontScale', 'm')) || FONT_SCALES[1];
  document.documentElement.style.fontSize = f[2];
}

export const soundOn = () => load('sound', true) !== false;
export const setSound = (on) => save('sound', !!on);

// Mã tiến độ: "WU1." + base64(UTF-8 JSON). Chép được qua Zalo / tin nhắn.
const b64e = (s) => { const bytes = new TextEncoder().encode(s); let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin); };
const b64d = (s) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));

export function exportCode() {
  return 'WU1.' + b64e(JSON.stringify({ v: 1, at: new Date().toISOString(), data: dumpAll() }));
}

/** Trả về {ok, msg}. Không ghi gì nếu mã sai. */
export function parseCode(code) {
  const c = String(code || '').replace(/\s+/g, '');
  if (!c.startsWith('WU1.')) return { ok: false, msg: 'Mã không đúng dạng (phải bắt đầu bằng WU1.).' };
  try {
    const obj = JSON.parse(b64d(c.slice(4)));
    if (!obj || obj.v !== 1 || typeof obj.data !== 'object') return { ok: false, msg: 'Mã không đọc được.' };
    const n = Object.keys(obj.data).filter((k) => k.startsWith('p:s')).length;
    return { ok: true, obj, msg: `Mã hợp lệ: tiến độ ${n} trạm, tạo lúc ${new Date(obj.at).toLocaleString('vi-VN')}.` };
  } catch {
    return { ok: false, msg: 'Mã bị thiếu hoặc sai ký tự. Hãy chép lại đủ cả mã.' };
  }
}
export function importCode(code) {
  const r = parseCode(code);
  if (r.ok) restoreAll(r.obj.data);
  return r;
}

export const cleanCode = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, '');
export const validCode = (s) => !s || /^[A-Z0-9-]{2,20}$/.test(s);
