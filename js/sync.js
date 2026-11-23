// Gửi bài về Google Sheet (Apps Script) và lấy nhận xét về.
// - POST text/plain (không preflight CORS), có client_id để Sheet không ghi trùng.
// - Mất mạng: bài nằm lại trong hàng chờ, tự gửi khi có mạng ('online'), khi mở web và mỗi 60 giây.
// - Nhận xét: GET ?ma_hs=…&khoa=… → chỉ bài của đúng em đó (khoá bí mật tạo trên máy em).
import { load, save } from './store.js';
import { queue, updateItem } from './queue.js';
import * as cloud from './account/cloud.js';

let CONFIG = {};
let busy = false;
const subs = new Set();
const emit = () => subs.forEach((f) => { try { f(); } catch { /* bỏ qua */ } });
export const onSync = (fn) => { subs.add(fn); return () => subs.delete(fn); };
export const getConfig = () => CONFIG;

/** Khoá bí mật của máy học sinh (28 ký tự), lưu cùng tiến độ – có trong «mã tiến độ». */
export function studentKey() {
  let k = load('studentKey', null);
  if (!k) {
    const a = new Uint8Array(21);
    crypto.getRandomValues(a);
    k = [...a].map((b) => (b % 36).toString(36)).join('') + Date.now().toString(36).slice(-7);
    save('studentKey', k);
  }
  return k;
}

const planText = (plan) => (plan?.lanes || []).map((l) => `${l.en}: ${(l.items || []).join(' · ') || '—'}`).join(' | ');

/** sent · pending (chờ mạng) · nocode (chưa có mã HS) · noserver (chưa nối Sheet) · error (Sheet từ chối) */
export function itemStatus(it) {
  if (it.sent) return 'sent';
  if (cloud.on()) return it.wiped ? 'wiped' : it.blocked ? 'blocked' : 'pending';   // tài khoản: không còn mã học sinh / Sheet
  if (!CONFIG.sheetUrl) return 'noserver';
  if (!load('studentCode', '')) return 'nocode';
  if (it.error) return 'error';
  return 'pending';
}
export const STATUS_TEXT = {
  sent: 'Đã gửi', blocked: 'Chưa gửi được · hồ sơ chưa được duyệt', wiped: 'Quản trị đã xoá dữ liệu · không tự gửi', pending: 'Chờ gửi', nocode: 'Chờ gửi · cần mã học sinh', noserver: 'Lưu trên máy · chưa nối Sheet', error: 'Chưa gửi được',
};

function payload(it) {
  return {
    client_id: it.id, ma_hs: load('studentCode', ''), ten: load('studentName', ''), khoa: studentKey(),
    session: it.session, chu_de: it.topic || '', luot: it.kind === 'draft2' ? 2 : 1, id_ban_1: it.draft1Id || '',
    muc: it.level || '', de: it.prompt || '', bai_viet: it.text, dan_y: planText(it.plan), so_tu: it.words || 0,
    tu_soat: (it.selfCheck || []).map((c) => `${c} ✓`).join(' ')
      + (it.edits ? ` | Em đã sửa: ${it.editsNone ? 'không có' : it.edits.map((x) => `[${x.code}] ${x.before} → ${x.after}`).join('; ')}` : ''),
  };
}

/** Gửi mọi bài chưa gửi. Trả về số bài đã gửi được lần này. */
export async function flushQueue() {
  if (cloud.on()) return cloud.flush();
  if (busy || !CONFIG.sheetUrl || !load('studentCode', '')) return 0;
  busy = true;
  let n = 0;
  try {
    for (const it of queue().filter((x) => !x.sent)) {
      let j;
      try {
        const r = await fetch(CONFIG.sheetUrl, {
          method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload(it)), redirect: 'follow',
        });
        j = await r.json();
      } catch {
        break; // mất mạng hoặc Sheet không trả lời: để lần sau
      }
      if (j?.ok) { updateItem(it.id, { sent: true, sentAt: new Date().toISOString(), error: null }); n++; }
      else { updateItem(it.id, { error: j?.loi || 'loi' }); if (j?.loi === 'ma_hs') break; }
    }
  } finally {
    busy = false;
    emit();
  }
  return n;
}

// ---------- nhận xét ----------
const fbKey = (f) => `${f.id}|${f.v || ''}|${(f.nhan_xet || '').length}|${(f.khen || '').length}|${f.cau_nhan_xet || ''}`.slice(0, 300);   // f.v = phiên bản (feedbackAt): cô sửa lại dù cùng độ dài vẫn là bản mới
export const feedbackList = () => load('feedback', { list: [] }).list || [];
export const feedbackFor = (id) => feedbackList().find((f) => f.id === id) || null;
export const isNew = (f) => !load('feedbackSeen', []).includes(fbKey(f));
export const unseenCount = () => feedbackList().filter(isNew).length;
export function markSeen(f) {
  const seen = new Set(load('feedbackSeen', []));
  seen.add(fbKey(f)); save('feedbackSeen', [...seen]);
  updateBadges();
  if (cloud.on()) cloud.markSeen(f);     // ghi seenAt lên máy chủ (1 lượt ghi cho mỗi nhận xét)
}

/** Hỏi Sheet nhận xét mới. Trả về danh sách hoặc null (chưa nối / mất mạng). */
export async function fetchFeedback() {
  if (cloud.on()) { const r = await cloud.fetchFeedback(); updateBadges(); emit(); return r; }
  const code = load('studentCode', '');
  if (!CONFIG.sheetUrl || !code) return null;
  try {
    const u = new URL(CONFIG.sheetUrl, location.href);
    u.searchParams.set('ma_hs', code);
    u.searchParams.set('khoa', studentKey());
    const j = await (await fetch(u, { redirect: 'follow' })).json();
    if (!j?.ok) return null;
    save('feedback', { at: Date.now(), list: j.list || [] });
    updateBadges(); emit();
    return j.list;
  } catch {
    return null;
  }
}

/** Chấm đỏ ở mục My Work (menu dưới, menu ngang) khi có nhận xét chưa xem. */
export function updateBadges() {
  const n = unseenCount();
  for (const a of document.querySelectorAll('[data-nav] a[data-key="work"]')) {
    a.classList.toggle('has-new', n > 0);
    a.setAttribute('aria-label', n > 0 ? `My Work – ${n} nhận xét mới` : 'My Work');
  }
}

/** Có tài khoản: đồng bộ tiến độ / bài nộp / nhận xét qua Firestore (thay Google Sheet). */
export function initCloudSync(ctx, updateStars) {
  CONFIG = ctx.config || {};
  updateBadges();
  cloud.start(ctx, { emit, onFeedback: updateBadges, afterPull: () => { updateStars?.(); updateBadges(); } });
}
export const isCloud = () => cloud.on();
/** Em chủ động gửi lại một bài đã bị cách ly sau khi quản trị xoá dữ liệu (không bao giờ tự làm). */
export async function resendWiped(id) { updateItem(id, { wiped: null, wipedAt: null }); emit(); return flushQueue(); }

export function initSync(config) {
  CONFIG = config || {};
  studentKey();
  updateBadges();
  const tick = () => { flushQueue().then(() => fetchFeedback()); };
  addEventListener('online', tick);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });
  setInterval(() => { if (document.visibilityState === 'visible' && queue().some((x) => !x.sent)) flushQueue(); }, 60000);
  tick();
}
