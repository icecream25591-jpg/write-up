// Gộp tiến độ của CÙNG một tài khoản từ nhiều máy (hàm thuần, không đụng DOM/Firestore, kiểm riêng bằng tools/test-merge.mjs).
//
// Mỗi trạm (p:sNN) có hai dấu do progress.saveProgress đóng mỗi lần lưu: _t (đồng hồ lai: thời điểm sửa, quyết định bản nào mới hơn) và _v (số lần lưu, chỉ phân thắng bại phụ).
//  - NỘI DUNG (vị trí, bản nháp, câu đang gõ…): lấy bản SỬA SAU (_t lớn hơn; bằng nhau thì _v; bằng nữa thì so chuỗi để kết quả không phụ thuộc thứ tự gộp).
//    _t là đồng hồ lai (hlc.js): máy đã thấy bản của máy kia thì bản sửa tiếp theo của nó luôn có _t lớn hơn, kể cả khi đồng hồ chạy chậm.
//    Nhờ vậy bản sửa sau thắng DÙ máy đó lưu ít lần hơn, và bản nháp mới ngắn hơn bản cũ vẫn thắng (em xoá bớt chữ là ý định thật).
//  - MỐC (xong chặng, đã nộp bài, nhận thưởng): chỉ TIẾN, không lùi. Máy nào đã có mốc thì kết quả có mốc đó, dù bản nội dung thắng chưa có.
// Gộp là idempotent (merge(a, a) = a) và không phụ thuộc thứ tự (merge(a, b) = merge(b, a)).

const stable = (x) => JSON.stringify(x, (_, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v));
export const same = (a, b) => stable(a) === stable(b);
const clone = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
const num = (x) => Number(x) || 0;

/** a mới hơn b? */
export function newer(a, b) {
  if (num(a._t) !== num(b._t)) return num(a._t) > num(b._t);
  if (num(a._v) !== num(b._v)) return num(a._v) > num(b._v);
  return stable(a) >= stable(b);
}

export function mergeSession(a, b) {
  if (!a || typeof a !== 'object') return b ? clone(b) : b;
  if (!b || typeof b !== 'object') return clone(a);
  const hi = newer(a, b) ? a : b, lo = hi === a ? b : a;
  const out = clone(hi);
  let bumped = false;
  // mốc chỉ tiến
  if (lo.recall?.done && !out.recall?.done) { out.recall = { ...(out.recall || {}), done: true }; bumped = true; }
  if (lo.sentences?.done && !out.sentences?.done) { out.sentences = { ...(out.sentences || {}), done: true }; bumped = true; }
  if (lo.ideas?.done && !out.ideas?.done) { out.ideas = clone(lo.ideas); bumped = true; }
  if (lo.write?.submitted && !out.write?.submitted) { out.write = { ...(out.write || {}), submitted: clone(lo.write.submitted) }; bumped = true; }
  if (lo.reward?.at && !out.reward?.at) { out.reward = clone(lo.reward); bumped = true; }
  if ('_v' in a || '_v' in b || bumped) out._v = Math.max(num(a._v), num(b._v));
  if ('_t' in a || '_t' in b) out._t = Math.max(num(a._t), num(b._t));
  if (bumped) { out._v += 1; out._t = num(out._t) + 1; }   // kết quả khác cả hai bên → mới hơn cả hai để mọi máy hội tụ về nó
  return out;
}

/** Gộp hai bản đồ {s01: {...}, s02: {...}}. */
export function mergeSessions(local, remote) {
  const out = {};
  for (const k of new Set([...Object.keys(local || {}), ...Object.keys(remote || {})])) out[k] = mergeSession(local?.[k], remote?.[k]);
  return out;
}
