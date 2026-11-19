// Hàng chờ gửi bài (localStorage: writeup:queue). sync.js gửi dần về Google Sheet;
// mỗi bài có id riêng (client_id) nên gửi lại bao nhiêu lần Sheet cũng chỉ ghi một hàng.
import { load, save } from './store.js';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

export function enqueue(item) {
  const q = load('queue', []);
  const it = { id: uid(), queuedAt: new Date().toISOString(), sent: false, ...item };
  q.push(it);
  save('queue', q);
  return it;
}
export const queue = () => load('queue', []);
export const pending = () => queue().filter((x) => !x.sent);
export const findItem = (id) => queue().find((x) => x.id === id) || null;

export function updateItem(id, patch) {
  const q = load('queue', []);
  const it = q.find((x) => x.id === id);
  if (it) { Object.assign(it, patch); save('queue', q); }
  return it;
}
