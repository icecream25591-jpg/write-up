// Thao tác Firestore cho cổng đăng nhập (GĐ 2). Mọi hàm nhận `h` = kết quả loadFirebase().
export const ADMIN_EMAIL = 'meomeo2263@gmail.com';   // trùng firestore.rules; quyền thật do quy tắc bảo mật quyết định
export const isAdminUser = (u) => !!u && u.email === ADMIN_EMAIL && u.emailVerified === true;

export const cleanClassCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const validClassCode = (c) => /^[A-Z0-9]{4,20}$/.test(c);
export const validInviteCode = (c) => /^[A-Z0-9]{10,12}$/.test(c);

/** Vai trò = tài liệu nào tồn tại (teachers/{uid}, students/{uid}). */
export async function getRoles(h, uid) {
  const { db, F } = h;
  const [t, s] = await Promise.all([F.getDoc(F.doc(db, 'teachers', uid)), F.getDoc(F.doc(db, 'students', uid))]);
  return { teacher: t.exists() ? t.data() : null, student: s.exists() ? s.data() : null };
}

/** Tra mã lớp; sai/khoá/hết hạn đều trả null (không gợi ý lớp nào). Quy tắc bảo mật còn kiểm lại lần nữa khi ghi. */
export async function lookupClassCode(h, code) {
  const { db, F } = h;
  let snap;
  try { snap = await F.getDoc(F.doc(db, 'classCodes', code)); } catch (e) { if (e.code === 'permission-denied') return null; throw e; }
  if (!snap.exists()) return null;
  const d = snap.data();
  if (d.active !== true) return null;
  if (d.expiresAt && d.expiresAt.toMillis() <= Date.now()) return null;
  return { classId: d.classId, teacherId: d.teacherId };
}

export class AccountError extends Error { constructor(kind) { super(kind); this.kind = kind; } }
const denied = (e) => e && (e.code === 'permission-denied' || e.code === 'failed-precondition');

/** Học sinh gửi yêu cầu vào lớp. mode 'create' (chưa có hồ sơ) hoặc 'resubmit' (đã có hồ sơ: chờ / bị từ chối / bị gỡ). */
export async function submitJoin(h, user, { realName, nickname, code }, mode) {
  const { db, F } = h;
  const c = cleanClassCode(code);
  if (!validClassCode(c)) throw new AccountError('bad-code');
  const hit = await lookupClassCode(h, c);
  if (!hit) throw new AccountError('bad-code');
  const ref = F.doc(db, 'students', user.uid);
  try {
    if (mode === 'create') {
      await F.setDoc(ref, { email: user.email, realName, nickname, classId: hit.classId, teacherId: hit.teacherId, status: 'pending', joinCode: c, createdAt: F.serverTimestamp() });
    } else {
      await F.updateDoc(ref, { realName, nickname, classId: hit.classId, teacherId: hit.teacherId, joinCode: c, status: 'pending', rejectReason: F.deleteField() });
    }
  } catch (e) { if (denied(e)) throw new AccountError('bad-code'); throw e; }
}

/** Giáo viên dùng mã giáo viên (một lần): một batch tạo teachers/{uid} + đánh dấu mã đã dùng. */
export async function redeemTeacherInvite(h, user, { displayName, code }) {
  const { db, F } = h;
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!validInviteCode(c)) throw new AccountError('bad-invite');
  const b = F.writeBatch(db);
  b.set(F.doc(db, 'teachers', user.uid), { email: user.email, displayName, invite: c, active: true, createdAt: F.serverTimestamp() });
  b.update(F.doc(db, 'teacherInvites', c), { used: true, usedBy: user.uid, usedAt: F.serverTimestamp() });
  try { await b.commit(); } catch (e) { if (denied(e) || e.code === 'not-found') throw new AccountError('bad-invite'); throw e; }
}

/** Quản trị viên tự lập hồ sơ giáo viên để đứng lớp (không cần mã). */
export async function adminCreateOwnTeacher(h, user, displayName) {
  const { db, F } = h;
  await F.setDoc(F.doc(db, 'teachers', user.uid), { email: user.email, displayName, invite: 'ADMIN', active: true, createdAt: F.serverTimestamp() });
}

/** Theo dõi hồ sơ học sinh (cho màn «Đang chờ duyệt» tự đổi khi được duyệt). Trả về hàm huỷ. */
export function watchStudent(h, uid, cb, onErr) {
  const { db, F } = h;
  return F.onSnapshot(F.doc(db, 'students', uid), (s) => cb(s.exists() ? s.data() : null), (e) => onErr && onErr(e));
}
