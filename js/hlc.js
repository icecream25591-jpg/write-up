// Đồng hồ lai (hybrid logical clock) cho thứ tự các lần sửa tiến độ giữa nhiều máy của cùng một tài khoản.
//
// Mỗi lần lưu một trạm, progress.saveProgress đóng dấu _t = tick(): max(giờ máy, mốc lớn nhất ĐÃ THẤY + 1).
// Mốc «đã thấy» được cập nhật mỗi khi máy này nhận (gộp) tiến độ từ máy khác (observe) và được lưu trong kho của tài khoản.
// Nhờ vậy, nếu máy B đã nhìn thấy bản sửa của máy A thì mọi bản sửa SAU ĐÓ của B luôn có _t lớn hơn của A, kể cả khi đồng hồ máy B chạy chậm;
// và bản sửa sau thắng bản sửa trước dù máy đó lưu ít lần hơn. Chỉ khi hai máy sửa HOÀN TOÀN ĐỘC LẬP (chưa thấy nhau) thì giờ máy mới phân thắng bại.
import { load, save } from './store.js';

let last = 0;
const stored = () => Number(load('hlc', 0)) || 0;

/** Ghi nhận một mốc _t thấy từ máy khác. */
export function observe(t) {
  const n = Number(t) || 0;
  if (n > Math.max(last, stored())) { last = n; save('hlc', n); }
}

/** Mốc cho một lần sửa mới của máy này. */
export function tick() {
  const n = Math.max(Date.now(), last + 1, stored() + 1);
  last = n; save('hlc', n);
  return n;
}
