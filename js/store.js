// Lưu tiến độ trên máy học sinh. Mọi lần đọc/ghi đều bọc try/catch
// (trình duyệt trong Zalo, chế độ riêng tư có thể chặn localStorage).
const PREFIX = 'writeup:';
const mem = new Map(); // dự phòng khi localStorage không dùng được

export function load(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? (mem.has(key) ? mem.get(key) : fallback) : JSON.parse(raw);
  } catch {
    return mem.has(key) ? mem.get(key) : fallback;
  }
}

/** Mọi khoá writeup:* → object (dùng cho xuất mã tiến độ). */
export function dumpAll() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) { try { out[k.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(k)); } catch { /* bỏ khoá hỏng */ } }
    }
  } catch { /* localStorage bị chặn */ }
  for (const [k, v] of mem) if (!(k in out)) out[k] = v;
  return out;
}
/** Ghi đè toàn bộ tiến độ bằng object (nhập mã tiến độ). */
export function restoreAll(obj) {
  try {
    const old = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(PREFIX)) old.push(k); }
    for (const k of old) localStorage.removeItem(k);
  } catch { /* ignore */ }
  mem.clear();
  for (const [k, v] of Object.entries(obj)) save(k, v);
}

export function save(key, value) {
  mem.set(key, value);
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; }
  catch { return false; }
}
