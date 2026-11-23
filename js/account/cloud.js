// Đồng bộ tiến độ, bài nộp và nhận xét giữa máy học sinh và Firestore (Giai đoạn 4). Chỉ chạy khi học sinh đã được duyệt.
//
// Nguyên tắc:
//  - Dữ liệu LUÔN lưu trước trên máy (kho riêng theo UID, store.js); Firestore là bản đồng bộ. Mất mạng thì bài nằm trong hàng chờ trên máy
//    (queue.js) và tự gửi khi có mạng. Không dựa vào hàng chờ ghi của Firestore để khỏi treo khi offline.
//  - Nhiều máy cùng một tài khoản: tiến độ được GỘP (merge.js) rồi mới ghi, trong một giao dịch (đọc bản trên máy chủ → gộp với bản trên máy → ghi),
//    nên máy B không ghi đè trạm máy A vừa làm. Bản nháp mới thắng bản cũ (kể cả khi ngắn hơn); mốc (xong chặng, đã nộp) chỉ tiến.
//  - Tiết kiệm lượt ghi (hạn mức Spark 20.000 ghi/ngày): tiến độ chỉ đẩy khi đổi MỐC, khi rời trang / ẩn tab, và tối đa 5 phút một lần
//    khi còn thay đổi; không ghi mỗi lần gõ phím. Gộp xong mà không có gì mới so với máy chủ thì KHÔNG ghi.
//  - Bài nộp: tạo một lần (id = id trong hàng chờ). Bị từ chối (chưa duyệt, bị gỡ) thì đánh dấu «blocked», giữ nguyên bài trên máy, không thử lại
//    vô hạn; được duyệt lại thì tự gửi bù. Khi quản trị XOÁ dữ liệu: cách ly (quarantine.js), KHÔNG tự gửi lại.
//  - Bài mới nộp từ máy khác: kéo về bằng con trỏ submittedAt (kể cả bài chưa có nhận xét); nhận xét mới: con trỏ feedbackAt.
import { load, save, dumpAll, onSave } from '../store.js';
import { queue, updateItem } from '../queue.js';
import { mergeSessions, mergeSession, same } from './merge.js';
import { quarantineWipe } from './quarantine.js';
import { observe } from '../hlc.js';

let ctxRef = null;
let hooks = { emit() {}, onFeedback() {}, afterPull() {} };
let busy = false, pushing = false, dirty = false, suppress = false, lastSig = null, pushTimer = null, localVer = 0, lastPullAt = 0;
let progressBlocked = false;

export const on = () => !!ctxRef;
export const isActive = () => !!ctxRef && ctxRef.account?.active !== false;
const acc = () => ctxRef.account;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'timeout' })), ms))]);
const plain = (x) => JSON.parse(JSON.stringify(x ?? null));
const isOffline = (e) => !e || e.code === 'timeout' || e.code === 'unavailable' || e.code === 'deadline-exceeded' || /offline/i.test(e.message || '');
// con trỏ thời gian chính xác (giây, nano) để không bỏ sót hai tài liệu cùng mili giây
const curOf = (key) => { const c = load(key, [0, 0]); return Array.isArray(c) ? c : [0, 0]; };
const tsOf = (F, key) => { const [s, n] = curOf(key); return new F.Timestamp(s, n); };
const later = (key, ts) => { if (!ts || !ts.seconds) return; const [s, n] = curOf(key); if (ts.seconds > s || (ts.seconds === s && ts.nanoseconds > n)) save(key, [ts.seconds, ts.nanoseconds]); };

// ------------------------------------------------------------------ hồ sơ học sinh hiện tại (lớp, giáo viên)
/** Đọc lại hồ sơ từ máy chủ và cập nhật bản trên máy; trả true nếu hồ sơ còn «approved». (Người gọi so lớp / giáo viên trước-sau để quyết định thử lại.) */
async function refreshStudent() {
  const a = acc(), { db, F } = a.h;
  try {
    const s = await F.getDocFromServer(F.doc(db, 'students', a.uid));
    if (!s.exists() || s.data().status !== 'approved') return false;
    a.student = { ...a.student, ...s.data() };
    return true;
  } catch { return false; }
}

// ------------------------------------------------------------------ bài nộp
function toDoc(it, a) {
  const F = a.h.F, s = a.student;
  const d = {
    studentId: a.uid, classId: s.classId, teacherId: s.teacherId, session: String(it.session || ''), draft: it.kind === 'draft2' ? 2 : 1,
    level: it.level || '', prompt: it.prompt || '', text: String(it.text || ''), words: Number(it.words) || 0,
    selfCheck: plain(it.selfCheck) || [], submittedAt: F.serverTimestamp(),
  };
  if (it.draft1Id) d.draft1Id = it.draft1Id;
  if (it.plan) d.plan = plain(it.plan);
  if (it.edits) d.edits = plain(it.edits);
  if (it.editsNone) d.editsNone = true;
  return d;
}
const markSent = (it) => updateItem(it.id, { sent: true, sentAt: new Date().toISOString(), blocked: null, error: null });

/** 'sent' · 'offline' (thử lại sau) · 'blocked' (máy chủ từ chối, đã đánh dấu). */
async function sendOne(it) {
  if (navigator.onLine === false) return 'offline';
  const a = acc(), { db, F } = a.h;
  for (let attempt = 0; attempt < 2; attempt++) {
    const used = [a.student.classId, a.student.teacherId];          // lớp / giáo viên dùng cho lần ghi này
    try {
      await withTimeout(F.setDoc(F.doc(db, 'submissions', it.id), toDoc(it, a)), 15000);
      markSent(it); return 'sent';
    } catch (e) {
      if (isOffline(e)) return 'offline';
      if (e.code !== 'permission-denied') return 'offline';          // lỗi lạ: để lần sau, không đánh dấu nhầm
      // bị từ chối: hoặc bài đã có sẵn (lần gửi trước thành công nhưng máy chưa ghi nhận), hoặc không được phép.
      // Đọc thẳng tài liệu: bài CỦA EM đã có thì đọc được; chưa có thì quy tắc trả «từ chối» (không đọc được tài liệu không tồn tại).
      try {
        const g = await withTimeout(F.getDocFromServer(F.doc(db, 'submissions', it.id)), 10000);
        if (g.exists()) { markSent(it); return 'sent'; }
      } catch (e2) { if (e2.code !== 'permission-denied') return 'offline'; }
      // lớp vừa đổi (hồ sơ trên máy lệch so với máy chủ): đọc lại hồ sơ, nếu lớp / giáo viên khác lần vừa ghi thì thử lại một lần
      if (attempt === 0 && (await refreshStudent()) && (a.student.classId !== used[0] || a.student.teacherId !== used[1])) continue;
      updateItem(it.id, { blocked: 'denied', blockedAt: new Date().toISOString() });
      return 'blocked';
    }
  }
  return 'offline';
}

/** Gửi mọi bài chưa gửi (bỏ qua bài «blocked» và bài «wiped»). Trả về số bài gửi được. */
export async function flush() {
  if (!isActive() || busy) return 0;
  busy = true; let n = 0;
  try {
    for (const it of queue().filter((x) => !x.sent && !x.blocked && !x.wiped)) {
      const r = await sendOne(it);
      if (r === 'sent') n++;
      else if (r === 'offline') break;
    }
  } finally { busy = false; hooks.emit(); }
  if (n) schedulePush(500);
  return n;
}

/** Kéo về các bài đã nộp từ MÁY KHÁC (submittedAt mới hơn con trỏ), kể cả bài chưa có nhận xét. Lần đầu (con trỏ 0) = kéo hết. */
export async function pullNewSubmissions() {
  if (!isActive()) return 0;
  const a = acc(), { db, F } = a.h;
  let snap;
  try {
    snap = await withTimeout(F.getDocsFromServer(F.query(F.collection(db, 'submissions'), F.where('studentId', '==', a.uid), F.where('submittedAt', '>', tsOf(F, 'subsCursor')))), 20000);
  } catch { return 0; }
  if (snap.empty) return 0;
  const items = queue().slice(), have = new Set(items.map((x) => x.id));
  let added = 0;
  for (const d of snap.docs) {
    later('subsCursor', d.data().submittedAt);
    if (have.has(d.id)) continue;
    const x = d.data(), at = x.submittedAt?.toDate?.().toISOString() || new Date().toISOString();
    items.push({ id: d.id, queuedAt: at, submittedAt: at, sent: true, sentAt: at, kind: x.draft === 2 ? 'draft2' : 'draft1', session: x.session, topic: '', prompt: x.prompt, level: x.level,
      text: x.text, words: x.words, plan: x.plan || null, selfCheck: x.selfCheck || [], ...(x.draft1Id ? { draft1Id: x.draft1Id } : {}), ...(x.edits ? { edits: x.edits } : {}), ...(x.editsNone ? { editsNone: true } : {}) });
    added++;
  }
  if (added) save('queue', items);
  mergeFeedback(snap.docs.map((d) => [d.id, d.data()]));
  hooks.onFeedback(); hooks.emit();
  return added;
}

// ------------------------------------------------------------------ nhận xét
const topicOf = (id) => queue().find((x) => x.id === id)?.topic || '';
const verOf = (ts) => (ts && ts.seconds != null ? `${ts.seconds}.${ts.nanoseconds}` : '');   // phiên bản nhận xét = thời điểm cô lưu (feedbackAt)
function toFeedback(id, d) {
  const f = d.feedback || {};
  return { id, kind: d.draft === 2 ? 'draft2' : 'draft1', v: verOf(d.feedbackAt), session: d.session, chu_de: topicOf(id), bai_viet: d.text || '', cau_nhan_xet: f.sentence || '', cau_khen: f.praiseSentence || '',
    nhanh: f.branch || '', nhan_xet: f.comment || '', khen: f.praise || '', diem: f.score != null ? String(f.score) : '',
    mau: f.tpl || '', task_response: f.tc?.task || '', coherence: f.tc?.coh || '', vocabulary: f.tc?.vocab || '', grammar: f.tc?.gram || '', uu_tien: f.priority || '', cau_sua: f.fix || '' };
}
function mergeFeedback(docs) {
  const withFb = docs.filter(([, d]) => d.feedback);
  if (!withFb.length) return;
  const cur = load('feedback', { list: [] }).list || [];
  const by = new Map(cur.map((f) => [f.id, f]));
  for (const [id, d] of withFb) { by.set(id, toFeedback(id, d)); later('fbCursor', d.feedbackAt); }
  save('feedback', { at: Date.now(), list: [...by.values()] });
}

/** Lấy bài mới từ máy khác + nhận xét MỚI (feedbackAt > con trỏ). Trả về danh sách nhận xét trên máy, hoặc null nếu mất mạng / chưa được phép. */
export async function fetchFeedback() {
  if (!isActive()) return null;
  const a = acc(), { db, F } = a.h;
  try {
    await pullNewSubmissions();
    const q = F.query(F.collection(db, 'submissions'), F.where('studentId', '==', a.uid), F.where('feedbackAt', '>', tsOf(F, 'fbCursor')));
    const snap = await withTimeout(F.getDocsFromServer(q), 15000);
    if (!snap.empty) mergeFeedback(snap.docs.map((d) => [d.id, d.data()]));
    hooks.onFeedback(); hooks.emit();
    return load('feedback', { list: [] }).list;
  } catch { return null; }
}

/** Ghi seenAt khi em mở một nhận xét: 1 lượt ghi cho MỖI PHIÊN BẢN nhận xét (cô sửa lại thì phiên bản mới, em mở lại sẽ ghi lại seenAt).
 *  Lặng lẽ bỏ qua khi mất mạng (lần mở sau thử lại). */
export async function markSeen(f) {
  if (!isActive()) return;
  const ver = f.v || '1', seen = load('seenVer', {});
  if (seen[f.id] === ver) return;
  const a = acc(), { db, F } = a.h;
  try {
    await withTimeout(F.updateDoc(F.doc(db, 'submissions', f.id), { seenAt: F.serverTimestamp() }), 10000);
    seen[f.id] = ver; save('seenVer', seen);
  } catch { /* lần mở sau sẽ thử lại */ }
}

// ------------------------------------------------------------------ tiến độ
function collect() {
  const sessions = {};
  for (const [k, v] of Object.entries(dumpAll())) { const m = /^p:(s\d{2})$/.exec(k); if (m) sessions[m[1]] = plain(v); }
  return sessions;
}
const sigOf = (sessions) => Object.keys(sessions).sort().map((s) => {
  const p = sessions[s];
  return s + [p.recall?.done, p.sentences?.done, p.ideas?.done, p.write?.submitted?.id, p.reward?.at].map((x) => (x ? 1 : 0)).join('');
}).join('|');

/** Áp bản đã gộp vào kho trên máy, nhưng KHÔNG đè phần em vừa gõ thêm (gộp lại với bản hiện tại: bản mới hơn thắng). Trả true nếu có đổi. */
function applyMerged(merged) {
  let changed = false;
  suppress = true;
  try {
    for (const [sid, rp] of Object.entries(merged)) {
      observe(rp?._t);                              // đã thấy mốc này: bản sửa sau của máy này sẽ có _t lớn hơn
      const cur = load('p:' + sid, null);
      const nm = mergeSession(cur, rp);
      if (!same(nm, cur)) { save('p:' + sid, nm); changed = true; }
    }
  } finally { suppress = false; }
  return changed;
}

function schedulePush(ms = 1500) { clearTimeout(pushTimer); pushTimer = setTimeout(() => { pushProgress(); }, ms); }

/** Đẩy tiến độ: giao dịch «đọc bản máy chủ → gộp với bản trên máy → ghi nếu có gì mới». */
export async function pushProgress() {
  if (!isActive() || pushing || progressBlocked || !dirty) return false;
  if (navigator.onLine === false) return false;
  pushing = true;
  const v0 = localVer;                              // nếu em gõ thêm trong lúc đang lưu, localVer sẽ lớn hơn v0
  try {
    const a = acc(), { db, F } = a.h;
    for (let attempt = 0; attempt < 2; attempt++) {
      const used = [a.student.classId, a.student.teacherId];
      try {
        const merged = await withTimeout(F.runTransaction(db, async (tx) => {
          const ref = F.doc(db, 'progress', a.uid);
          const snap = await tx.get(ref);
          const remote = snap.exists() ? snap.data().sessions || {} : {};
          const m = mergeSessions(collect(), remote);
          if (a.h.emu && globalThis.__wuPushDelay) await sleep(globalThis.__wuPushDelay);   // (chỉ kiểm thử) kéo dài lần lưu để thử «gõ tiếp khi lần lưu trước chưa xong»
          if (Object.keys(m).length > 22) throw Object.assign(new Error('quá 22 trạm'), { code: 'too-many' });
          if (Object.keys(m).length && (!snap.exists() || !same(m, remote))) tx.set(ref, { studentId: a.uid, classId: a.student.classId, teacherId: a.student.teacherId, sessions: m, updatedAt: F.serverTimestamp() });
          return m;
        }), 25000);
        applyMerged(merged);                        // máy này cũng nhận phần máy khác đã làm
        if (localVer === v0) dirty = false; else schedulePush(300);     // gõ thêm trong lúc lưu: giữ cờ, lưu tiếp ngay sau đó
        lastSig = sigOf(collect());
        hooks.afterPull();
        return true;
      } catch (e) {
        if (isOffline(e) || e.code === 'too-many') return false;
        if (e.code === 'permission-denied' && attempt === 0 && (await refreshStudent()) && (a.student.classId !== used[0] || a.student.teacherId !== used[1])) continue;
        if (e.code === 'permission-denied') progressBlocked = true;   // chưa được duyệt / hồ sơ bị xoá: dừng tới khi được duyệt lại
        return false;
      }
    }
    return false;
  } finally { pushing = false; }
}

/** Kéo tiến độ từ máy chủ về máy, gộp theo từng trạm (nội dung mới hơn thắng, mốc chỉ tiến). Trả về true nếu máy này có thay đổi. */
export async function pullProgress() {
  if (!isActive()) return false;
  lastPullAt = Date.now();
  const a = acc(), { db, F } = a.h;
  let snap;
  try { snap = await withTimeout(F.getDocFromServer(F.doc(db, 'progress', a.uid)), 15000); } catch { return false; }
  const remote = snap.exists() ? snap.data().sessions || {} : {};
  const local = collect();
  const merged = mergeSessions(local, remote);
  const changed = applyMerged(merged);
  const sum = Object.values(remote).reduce((t, p) => t + (Number(p?.reward?.stars) || 0), 0);
  suppress = true; try { if (sum > load('stars', 0)) { save('stars', sum); } } finally { suppress = false; }
  lastSig = sigOf(collect());
  if (Object.keys(merged).length && (!snap.exists() || !same(merged, remote))) { dirty = true; schedulePush(800); }   // máy này có thứ máy chủ chưa có
  if (changed || sum) hooks.afterPull();
  return changed;
}

// ------------------------------------------------------------------ khởi động / vòng đời
/** Gọi một lần sau khi học sinh được vào web. hooks: { emit, onFeedback, afterPull }. */
export function start(ctx, h) {
  if (ctxRef) return;
  ctxRef = ctx; hooks = { ...hooks, ...h };
  save('wasStudent', true);                          // để lần mở sau nhận ra «hồ sơ đã bị xoá» (xem quarantine.js)
  onSave((key) => {
    if (suppress || !/^p:s\d{2}$/.test(key)) return;
    dirty = true; localVer++;
    const sig = sigOf(collect());
    if (sig !== lastSig) schedulePush(1500);          // đổi mốc (xong chặng, nộp bài…) → ghi sớm
  });
  // force = true (có mạng lại, bấm làm mới): luôn kéo; khi tab hiện lại thì chỉ kéo nếu đã quá 20 giây (tiết kiệm lượt đọc)
  const tick = async (force = true) => {
    if (!isActive()) return;
    if (force || Date.now() - lastPullAt > 20000) await pullProgress();
    await flush(); await fetchFeedback(); await pushProgress();
  };
  addEventListener('online', () => tick(true));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') pushProgress(); else tick(false); });
  addEventListener('pagehide', () => { pushProgress(); });
  // được duyệt lại sau khi bị gỡ / chờ duyệt: mở khoá và gửi bù những gì đang kẹt (KHÔNG đụng bài «wiped»)
  addEventListener('wu:approved', async () => {
    progressBlocked = false;
    for (const it of queue().filter((x) => x.blocked)) updateItem(it.id, { blocked: null, blockedAt: null });
    hooks.emit(); await tick(true);
  });
  // hồ sơ bị XOÁ (quản trị «Xoá dữ liệu học sinh») khi đang mở tab: cách ly ngay, ngừng đẩy mọi thứ lên
  addEventListener('wu:wiped', () => {
    progressBlocked = true; dirty = false; clearTimeout(pushTimer);
    quarantineWipe(acc().uid);
    hooks.emit();
  });
  let n = 0;                                          // mỗi 60 giây gửi bù bài chờ; tiến độ đang đổi dở thì đẩy tối đa 5 phút một lần
  setInterval(() => { n++; if (document.visibilityState === 'visible' && isActive()) { if (queue().some((x) => !x.sent && !x.blocked && !x.wiped)) flush(); if (dirty && n % 5 === 0) pushProgress(); } }, 60000);
  (async () => { await pullProgress(); await tick(true); })();
}
