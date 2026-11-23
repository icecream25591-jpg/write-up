// Cách ly dữ liệu trên máy khi quản trị «Xoá dữ liệu học sinh» (Giai đoạn 4).
//
// Phân biệt hai trường hợp (đừng nhầm):
//  - GỠ KHỎI LỚP (hồ sơ còn, status «removed»): dữ liệu ĐƯỢC GIỮ trên cả máy chủ lẫn máy học sinh. Bài chờ gửi bị đánh dấu «blocked»
//    và TỰ gửi bù khi cô duyệt lại (cloud.js, sự kiện wu:approved).
//  - XOÁ DỮ LIỆU (hồ sơ học sinh bị xoá): máy chủ đã xoá hết. Nếu máy học sinh còn bản sao rồi tự đẩy lại thì dữ liệu «đã xoá» sống lại.
//    Nên khi phát hiện hồ sơ biến mất (đang mở tab, hoặc lần mở sau), máy:
//      · bỏ tiến độ, bản nháp, bài ĐÃ gửi, nhận xét, sao… (máy chủ đã xoá, không giữ bản sao nữa);
//      · giữ bài CHƯA gửi nhưng đánh dấu «wiped»: KHÔNG bao giờ tự gửi; chỉ gửi khi em bấm «Gửi lại bài này» trong My Work.
import { peekFor, saveFor, removeFor, setScope, getScope } from '../store.js';

const DROP = new Set(['feedback', 'feedbackSeen', 'seenSent', 'seenVer', 'fbCursor', 'subsCursor', 'stars', 'streak', 'stickers', 'lastSession', 'fbFetchedAt', 'subsPulled']);

/** Trả về số bài chưa gửi được giữ lại (đã đánh dấu wiped). */
export function quarantineWipe(uid) {
  const at = new Date().toISOString();
  const keep = peekFor(uid, 'queue', []).filter((x) => !x.sent).map((x) => ({ ...x, blocked: null, blockedAt: null, wiped: true, wipedAt: at }));
  saveFor(uid, 'queue', keep);
  removeFor(uid, (k) => k.startsWith('p:') || k.startsWith('draft2:') || DROP.has(k));
  saveFor(uid, 'wasStudent', false);
  saveFor(uid, 'wipedAt', at);
  if (getScope() === uid) setScope(uid);   // bỏ luôn bản sao trong bộ nhớ trang
  return keep.length;
}
