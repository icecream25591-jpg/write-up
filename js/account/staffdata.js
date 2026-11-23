// Thao tác Firestore cho trang giáo viên và trang quản trị (Giai đoạn 3). `h` = kết quả loadFirebase().
// Quyền thật do firestore.rules quyết định; các hàm ở đây chỉ gửi đúng dạng ghi mà quy tắc cho phép.
import { AccountError } from './data.js';

const denied = (e) => e && (e.code === 'permission-denied' || e.code === 'failed-precondition');
const SAFE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // bỏ O/0/I/1 cho dễ đọc
export const genCode = (n) => { let s = ''; const a = new Uint32Array(n); crypto.getRandomValues(a); for (const x of a) s += SAFE[x % SAFE.length]; return s; };
export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const clearMove = (F) => ({ moveClassId: F.deleteField(), moveTeacherId: F.deleteField(), moveJoinCode: F.deleteField(), moveAt: F.deleteField() });
const docs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

// ------------------------------------------------------------------ giáo viên: lớp và mã lớp
/** Lớp, học sinh của mình, yêu cầu chuyển lớp đang chờ mình duyệt. */
export async function loadTeacherData(h, uid) {
  const { db, F } = h;
  const col = (n) => F.collection(db, n);
  const [classes, students, movers] = await Promise.all([
    F.getDocs(F.query(col('classes'), F.where('teacherId', '==', uid))),
    F.getDocs(F.query(col('students'), F.where('teacherId', '==', uid))),
    F.getDocs(F.query(col('students'), F.where('moveTeacherId', '==', uid))),
  ]);
  const codes = {};
  await Promise.all(docs(classes).map(async (c) => { try { const s = await F.getDoc(F.doc(db, 'classCodes', c.code)); if (s.exists()) codes[c.code] = s.data(); } catch { /* bỏ */ } }));
  return { classes: docs(classes), students: docs(students), movers: docs(movers), codes };
}

/** Tạo lớp + mã lớp trong một batch. Mã trùng người khác → AccountError('code-taken'). */
export async function createClass(h, uid, { name, schoolYear, code }) {
  const { db, F } = h;
  const c = cleanCode(code);
  const cid = F.doc(F.collection(db, 'classes')).id;
  const b = F.writeBatch(db);
  b.set(F.doc(db, 'classes', cid), { teacherId: uid, name, schoolYear, code: c, createdAt: F.serverTimestamp() });
  b.set(F.doc(db, 'classCodes', c), { classId: cid, teacherId: uid, active: true, createdAt: F.serverTimestamp() });
  try { await b.commit(); } catch (e) { if (denied(e)) throw new AccountError('code-taken'); throw e; }
  return cid;
}

export const renameClass = (h, cid, name, schoolYear) => h.F.updateDoc(h.F.doc(h.db, 'classes', cid), { name, schoolYear });

/** Tạo lại mã lớp: mã mới hiện hành, mã cũ tắt. Học sinh đã duyệt không bị ảnh hưởng. */
export async function regenerateCode(h, uid, cls) {
  const { db, F } = h;
  for (let i = 0; i < 4; i++) {
    const c = genCode(6);
    const b = F.writeBatch(db);
    b.set(F.doc(db, 'classCodes', c), { classId: cls.id, teacherId: uid, active: true, createdAt: F.serverTimestamp() });
    b.update(F.doc(db, 'classes', cls.id), { code: c });
    b.update(F.doc(db, 'classCodes', cls.code), { active: false });
    try { await b.commit(); return c; } catch (e) { if (!denied(e)) throw e; }
  }
  throw new AccountError('code-taken');
}
export const setCodeActive = (h, code, active) => h.F.updateDoc(h.F.doc(h.db, 'classCodes', code), { active });
export const setCodeExpiry = (h, code, date) => h.F.updateDoc(h.F.doc(h.db, 'classCodes', code), { expiresAt: date ? h.F.Timestamp.fromDate(date) : null });

// ------------------------------------------------------------------ duyệt, chuyển lớp, gỡ (giáo viên và quản trị dùng chung)
export const approveJoin = (h, sid) => h.F.updateDoc(h.F.doc(h.db, 'students', sid), { status: 'approved', decidedAt: h.F.serverTimestamp() });
export const rejectJoin = (h, sid, reason) => h.F.updateDoc(h.F.doc(h.db, 'students', sid), { status: 'rejected', rejectReason: reason, decidedAt: h.F.serverTimestamp() });

/** Giáo viên lớp đích duyệt chuyển lớp: dữ liệu cũ đi theo học sinh. */
export const approveMove = (h, s, uid) => h.F.updateDoc(h.F.doc(h.db, 'students', s.id), {
  classId: s.moveClassId, teacherId: uid, joinCode: s.moveJoinCode, decidedAt: h.F.serverTimestamp(), ...clearMove(h.F) });
export const rejectMove = (h, sid, reason) => h.F.updateDoc(h.F.doc(h.db, 'students', sid), {
  decidedAt: h.F.serverTimestamp(), moveRejectReason: reason, ...clearMove(h.F) });

/** «Gỡ khỏi lớp»: giữ tài khoản, tiến độ, bài nộp, nhận xét; chỉ học sinh đã duyệt (quy tắc kiểm lại). */
export const removeFromClass = (h, s, reason) => h.F.updateDoc(h.F.doc(h.db, 'students', s.id), {
  status: 'removed', classId: null, teacherId: null, prevClassId: s.classId, prevTeacherId: s.teacherId,
  removedAt: h.F.serverTimestamp(), ...(reason ? { removeReason: reason } : {}), ...clearMove(h.F) });

// ------------------------------------------------------------------ quản trị
export async function loadAdminData(h) {
  const { db, F } = h;
  const all = (n) => F.getDocs(F.collection(db, n));
  const [teachers, invites, classes, students] = await Promise.all([all('teachers'), all('teacherInvites'), all('classes'), all('students')]);
  return { teachers: docs(teachers), invites: docs(invites), classes: docs(classes), students: docs(students) };
}

/** Tạo mã giáo viên 12 ký tự. days = 0 → không hạn. */
export async function createInvite(h, { note, days }) {
  const { db, F } = h;
  const code = genCode(12);
  const expiresAt = days > 0 ? F.Timestamp.fromMillis(Date.now() + days * 86400000) : null;
  await F.setDoc(F.doc(db, 'teacherInvites', code), { used: false, usedBy: null, usedAt: null, revoked: false, expiresAt, note: note || '', createdAt: F.serverTimestamp() });
  return code;
}
export const setInviteRevoked = (h, code, revoked) => h.F.updateDoc(h.F.doc(h.db, 'teacherInvites', code), { revoked });
export const deleteInvite = (h, code) => h.F.deleteDoc(h.F.doc(h.db, 'teacherInvites', code));
export const setTeacherActive = (h, uid, active) => h.F.updateDoc(h.F.doc(h.db, 'teachers', uid), { active });

/** Quản trị đưa học sinh vào một lớp bất kỳ (chuyển lớp, hoặc xếp lại học sinh bị gỡ / bị từ chối). Dữ liệu cũ đi theo. */
export const adminPlaceStudent = (h, s, cls) => h.F.updateDoc(h.F.doc(h.db, 'students', s.id), {
  status: 'approved', classId: cls.id, teacherId: cls.teacherId, joinCode: cls.code, decidedAt: h.F.serverTimestamp(),
  rejectReason: h.F.deleteField(), ...clearMove(h.F) });

/** Số liệu thật sẽ bị xoá (hiện trong hộp xác nhận «Xoá dữ liệu học sinh»). */
export async function studentDataSummary(h, uid) {
  const { db, F } = h;
  const [subs, prog] = await Promise.all([
    F.getDocs(F.query(F.collection(db, 'submissions'), F.where('studentId', '==', uid))),
    F.getDoc(F.doc(db, 'progress', uid)),
  ]);
  const list = subs.docs.map((d) => d.data());
  return {
    submissions: list.length,
    draft1: list.filter((x) => x.draft === 1).length,
    draft2: list.filter((x) => x.draft === 2).length,
    feedback: list.filter((x) => x.feedback).length,
    progressExists: prog.exists(),
    progressSessions: prog.exists() ? Object.keys(prog.data().sessions || {}).length : 0,
  };
}

/** Giới hạn của Firestore: tối đa 500 thao tác ghi trong một batch. */
export const BATCH_LIMIT = 500;

/** «Xoá dữ liệu học sinh» (xoá vĩnh viễn). KHÔNG xoá tài khoản đăng nhập Firebase Authentication (xoá riêng trong Firebase Console).
 *  - Đủ giới hạn (bài nộp + tiến độ + hồ sơ ≤ 500): MỘT batch duy nhất, tất cả hoặc không gì cả.
 *  - Quá giới hạn: xoá bớt bài nộp theo từng batch trước; batch CUỐI gồm phần bài nộp còn lại + tiến độ + hồ sơ.
 *    Hồ sơ luôn xoá sau cùng nên nếu đứt giữa chừng, hồ sơ học sinh vẫn còn trong danh sách và làm lại là xong (không để bài mồ côi).
 *  BƯỚC 0 (GĐ 4): nếu học sinh đang «approved» thì khoá ghi TRƯỚC (chuyển sang «removed», như «Gỡ khỏi lớp»). Từ lúc đó quy tắc chặn mọi lần nộp bài /
 *  ghi tiến độ của em, nên bài nộp không thể phát sinh giữa lúc liệt kê và lúc xoá (không còn bài mồ côi). Nếu đứt giữa chừng em vẫn bị khoá ghi.
 *  Lỗi ném ra có `partial` (đã có batch trước đó thành công), `batches` (số batch đã xong) và `blocked` (đã khoá ghi ở bước 0). */
export async function deleteStudentData(h, uid) {
  const { db, F } = h;
  const sref = F.doc(db, 'students', uid);
  let blocked = false;
  const sd = await F.getDoc(sref);
  if (sd.exists() && sd.data().status === 'approved') {
    const s = sd.data();
    await F.updateDoc(sref, { status: 'removed', classId: null, teacherId: null, prevClassId: s.classId ?? null, prevTeacherId: s.teacherId ?? null, removedAt: F.serverTimestamp() });
    blocked = true;
  }
  if (h.afterBlock) await h.afterBlock();           // (chỉ dùng trong bộ kiểm thử: chen một thao tác của học sinh vào đúng lúc này)
  const subs = await F.getDocs(F.query(F.collection(db, 'submissions'), F.where('studentId', '==', uid)));
  const refs = subs.docs.map((d) => d.ref);
  let done = 0;
  try {
    while (refs.length > BATCH_LIMIT - 2) {            // còn quá nhiều: chỉ xoá bài nộp, giữ hồ sơ
      const b = F.writeBatch(db);
      refs.splice(0, BATCH_LIMIT).forEach((r) => b.delete(r));
      await b.commit(); done++;
    }
    const b = F.writeBatch(db);                         // batch cuối (hoặc duy nhất): phần còn lại + tiến độ + hồ sơ
    refs.forEach((r) => b.delete(r));
    b.delete(F.doc(db, 'progress', uid)); b.delete(F.doc(db, 'students', uid));
    await b.commit(); done++;
  } catch (e) { e.partial = done > 0; e.batches = done; e.blocked = blocked; throw e; }
  return done;
}

// ------------------------------------------------------------------ giáo viên còn lớp: chặn xoá, bàn giao lớp
/** Các lớp mà giáo viên đang phụ trách (đọc mới từ máy chủ, không dựa vào danh sách đã tải). */
export async function teacherClasses(h, tid) {
  const { db, F } = h;
  return docs(await F.getDocs(F.query(F.collection(db, 'classes'), F.where('teacherId', '==', tid))));
}

/** Số học sinh (mọi trạng thái) đang thuộc các lớp đã cho, đọc mới từ máy chủ. */
export async function countStudentsInClasses(h, classIds) {
  const { db, F } = h;
  let n = 0;
  for (const id of classIds) n += (await F.getDocs(F.query(F.collection(db, 'students'), F.where('classId', '==', id)))).size;
  return n;
}

/** Xoá hồ sơ giáo viên; từ chối (AccountError 'has-classes', .count) nếu giáo viên còn lớp phụ trách. */
export async function deleteTeacherProfile(h, tid) {
  const cls = await teacherClasses(h, tid);
  if (cls.length) { const e = new AccountError('has-classes'); e.count = cls.length; throw e; }
  await h.F.deleteDoc(h.F.doc(h.db, 'teachers', tid));
}

/** Bàn giao MỌI lớp của giáo viên `from` cho giáo viên `to`: lớp, mã lớp, và học sinh của các lớp đó (kể cả yêu cầu chuyển lớp đang chờ).
 *  Làm lại được nếu đứt giữa chừng: học sinh ghi trước, mã lớp sau, lớp ghi sau cùng nên lớp chưa xong vẫn còn thuộc `from`. */
export async function handoverClasses(h, from, to) {
  const { db, F } = h;
  const cls = await teacherClasses(h, from);
  const merged = new Map();                             // path → { ref, data }; một học sinh có thể vừa thuộc lớp vừa có yêu cầu chuyển: gộp thay đổi
  const add = (ref, data) => merged.set(ref.path, { ref, data: { ...(merged.get(ref.path)?.data || {}), ...data } });
  for (const c of cls) {
    const st = await F.getDocs(F.query(F.collection(db, 'students'), F.where('classId', '==', c.id)));
    st.docs.forEach((d) => add(d.ref, { teacherId: to }));
  }
  const mv = await F.getDocs(F.query(F.collection(db, 'students'), F.where('moveTeacherId', '==', from)));
  mv.docs.forEach((d) => add(d.ref, { moveTeacherId: to }));
  for (const c of cls) add(F.doc(db, 'classCodes', c.code), { teacherId: to });   // mã lớp, rồi lớp ghi SAU CÙNG
  for (const c of cls) add(F.doc(db, 'classes', c.id), { teacherId: to });
  const list = [...merged.values()];
  for (let i = 0; i < list.length; i += 450) {
    const b = F.writeBatch(db);
    list.slice(i, i + 450).forEach((x) => b.update(x.ref, x.data));
    await b.commit();
  }
  return { classes: cls.length, students: list.filter((x) => x.ref.parent.id === 'students').length };
}

// ------------------------------------------------------------------ bảng theo dõi và nhận xét (GĐ 5)
const inChunks = async (ids, fn, n = 10) => { const out = []; for (let i = 0; i < ids.length; i += n) out.push(...(await Promise.all(ids.slice(i, i + n).map(fn)))); return out; };

/** Tiến độ của từng học sinh (mỗi em 1 lượt đọc). Map id → dữ liệu | null (chưa có tiến độ) | undefined (không đọc được). */
export async function loadProgressOf(h, ids) {
  const { db, F } = h;
  const rs = await inChunks(ids, async (id) => {
    try { const s = await F.getDoc(F.doc(db, 'progress', id)); return [id, s.exists() ? s.data() : null]; } catch { return [id, undefined]; }
  });
  return new Map(rs);
}

/** Bài nộp của các học sinh (mỗi em một truy vấn theo studentId, mới nhất trước). Gộp thành một danh sách {id, ...}. */
export async function loadSubmissionsOf(h, ids) {
  const { db, F } = h;
  const rs = await inChunks(ids, async (id) => docs(await F.getDocs(F.query(F.collection(db, 'submissions'), F.where('studentId', '==', id), F.orderBy('submittedAt', 'desc')))));
  return rs.flat();
}

/** Ghi nhận xét cho một bài (giáo viên của em hoặc quản trị). fb: { sentence, branch, comment, praiseSentence, praise, score }. */
export function saveFeedback(h, subId, fb) {
  return h.F.updateDoc(h.F.doc(h.db, 'submissions', subId), { feedback: fb, feedbackAt: h.F.serverTimestamp() });
}
