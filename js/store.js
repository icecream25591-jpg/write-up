// Lưu tiến độ trên máy học sinh. Mọi lần đọc/ghi đều bọc try/catch
// (trình duyệt trong Zalo, chế độ riêng tư có thể chặn localStorage).
//
// Tách theo tài khoản: khi bật tài khoản, cổng gọi setScope(uid) ngay khi học sinh được vào web;
// từ đó mọi khoá (tiến độ, nháp, bài chờ gửi, nhận xét, sao…) nằm dưới «wu-u:<uid>:» nên hai học sinh
// dùng chung một trình duyệt không thấy dữ liệu của nhau. Không bật tài khoản thì giữ nguyên «writeup:».
// Cài đặt của THIẾT BỊ (cỡ chữ, âm thanh) vẫn dùng chung, không theo tài khoản.
const LEGACY = 'writeup:';
const DEVICE_KEYS = new Set(['fontScale', 'sound']);
let prefix = LEGACY;
const mem = new Map(); // dự phòng khi localStorage không dùng được; khoá = tên khoá đầy đủ

const full = (key) => (DEVICE_KEYS.has(key) ? LEGACY : prefix) + key;

/** Chuyển sang kho riêng của một tài khoản (uid), hoặc về kho cũ nếu uid rỗng. */
export function setScope(uid) {
  prefix = uid ? `wu-u:${uid}:` : LEGACY;
  mem.clear();
}
const listeners = new Set();
/** Đăng ký nghe mọi lần ghi (key, value). Trả về hàm huỷ. */
export function onSave(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export const getScope = () => (prefix === LEGACY ? null : prefix.slice(5, -1));

export function load(key, fallback = null) {
  const k = full(key);
  try {
    const raw = localStorage.getItem(k);
    return raw == null ? (mem.has(k) ? mem.get(k) : fallback) : JSON.parse(raw);
  } catch {
    return mem.has(k) ? mem.get(k) : fallback;
  }
}

/** Mọi khoá của kho hiện tại → object (dùng cho xuất mã tiến độ). */
export function dumpAll() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) { try { out[k.slice(prefix.length)] = JSON.parse(localStorage.getItem(k)); } catch { /* bỏ khoá hỏng */ } }
    }
  } catch { /* localStorage bị chặn */ }
  for (const [k, v] of mem) if (k.startsWith(prefix) && !((k.slice(prefix.length)) in out)) out[k.slice(prefix.length)] = v;
  return out;
}
/** Ghi đè toàn bộ tiến độ của kho hiện tại bằng object (nhập mã tiến độ). */
export function restoreAll(obj) {
  try {
    const old = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(prefix)) old.push(k); }
    for (const k of old) localStorage.removeItem(k);
  } catch { /* ignore */ }
  for (const k of [...mem.keys()]) if (k.startsWith(prefix)) mem.delete(k);
  for (const [k, v] of Object.entries(obj)) save(k, v);
}

export function save(key, value) {
  const k = full(key);
  mem.set(k, value);
  let okk = false;
  try { localStorage.setItem(k, JSON.stringify(value)); okk = true; } catch { /* kho đầy hoặc bị chặn: vẫn giữ trong bộ nhớ trang */ }
  for (const f of listeners) { try { f(key, value); } catch { /* người nghe lỗi không được làm hỏng việc lưu */ } }
  return okk;
}

// ----- thao tác trên kho của một tài khoản cụ thể (không đổi kho đang dùng; cổng dùng khi chưa vào web) -----
const pfx = (uid) => `wu-u:${uid}:`;
export function peekFor(uid, key, fallback = null) {
  try { const r = localStorage.getItem(pfx(uid) + key); return r == null ? fallback : JSON.parse(r); } catch { return fallback; }
}
export function saveFor(uid, key, value) {
  try { localStorage.setItem(pfx(uid) + key, JSON.stringify(value)); return true; } catch { return false; }
}
/** Xoá mọi khoá của tài khoản mà test(tênKhoáKhôngTiềnTố) trả true. */
export function removeFor(uid, test) {
  try {
    const del = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(pfx(uid)) && test(k.slice(pfx(uid).length))) del.push(k); }
    del.forEach((k) => localStorage.removeItem(k));
  } catch { /* localStorage bị chặn */ }
}
