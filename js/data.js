// Tải dữ liệu session (site/data/sXX.json) – chỉ tải khi vào session, giữ trong bộ nhớ.
const cache = new Map();
export const sx = (n) => `s${String(n).padStart(2, '0')}`;

// ready: danh sách config.sessionsReady – session không có trong danh sách thì không tải (tránh lỗi 404).
export async function loadSession(n, ready = null) {
  if (Array.isArray(ready) && !ready.includes(n)) return null;
  if (cache.has(n)) return cache.get(n);
  const p = fetch(`data/${sx(n)}.json`, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  cache.set(n, p);
  const d = await p;
  if (!d) cache.delete(n); // thử lại lần sau (mất mạng)
  return d;
}

// Khung tranh lập ý (site/img/panels.json, % theo ảnh)
let panelsP = null;
export function loadPanels() {
  panelsP ||= fetch('img/panels.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : {})).catch(() => { panelsP = null; return {}; });
  return panelsP;
}

// Nhân vật dẫn chặng Recall, xoay vòng theo session. Ô cảm xúc: 1 giơ ngón cái, 3 suy nghĩ, 4 ngượng (sai), 5 reo vui.
const CHARS = ['lan', 'minh', 'ha', 'khoa', 'vy'];
export const charOf = (n) => CHARS[(n - 1) % CHARS.length];
export const emo = (n, k, w = 256) => `img/nv-${charOf(n)}-camxuc-${k}-${w}.webp`;
export const EMO = { idle: 3, ok: 1, bad: 4, done: 5 };
