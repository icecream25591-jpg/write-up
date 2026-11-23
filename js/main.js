// Khởi động Write Up!: đọc config, áp cài đặt, hỏi tên lần đầu, dựng menu, chạy bộ điều hướng hash.
import { start } from './router.js';
import { initNav, setActiveNav, updateStars } from './shell.js';
import { load } from './store.js';
import * as pages from './screens/pages.js';
import { initSync, initCloudSync } from './sync.js';
import { emulatorOn } from './account/fb.js';
// Màn session và My Work chỉ tải khi cần (lần đầu mở trang nhẹ hơn)
const loadSession = () => import('./screens/session.js');
const loadWork = () => import('./screens/work.js');
import { initKeyboard } from './keyboard.js';
import { applyPrefs } from './prefs.js';
import { initSfx } from './sfx.js';

const view = document.getElementById('view');
let current = null;   // màn đang hiện
let firstRender = true;
let seq = 0;          // chống hiện nhầm màn cũ khi tải dữ liệu chậm

const SCREENS = { home: pages.home, journey: pages.journey, settings: pages.settings, work: async (c, r) => (await loadWork()).work(c, r) };

async function loadConfig() {
  try {
    const r = await fetch('config.json', { cache: 'no-cache' });
    if (r.ok) return await r.json();
  } catch { /* mở file trực tiếp hoặc mất mạng: dùng mặc định */ }
  return { sessionsReady: [1, 2, 3], lockOrder: false };
}

async function render(ctx, route) {
  const my = ++seq;
  const isSession = route.name === 'session';
  ctx.studentName = load('studentName', '') || 'bạn';
  const screen = isSession ? await (await loadSession()).session(ctx, route) : await SCREENS[route.name](ctx, route);
  const dispose = (sc) => (sc?.cleanup ? sc.cleanup() : sc?.mai?.destroy());
  if (my !== seq) { dispose(screen); return; }

  dispose(current);
  current = screen;
  document.body.classList.toggle('in-session', isSession);
  setActiveNav(isSession ? null : route.name);

  if (!firstRender) screen.el.classList.add('enter');
  view.replaceChildren(screen.el);
  if (!firstRender) view.focus({ preventScroll: true });
  firstRender = false;
}

applyPrefs();
initSfx();             // âm thanh chỉ mở sau lần chạm đầu tiên
const config = await loadConfig();
const ctx = { config, studentName: load('studentName', '') || 'bạn' };
initNav();
initKeyboard();
// Ô viết bài: không cho dán hoặc kéo thả chữ vào – học sinh tự gõ.
const NO_PASTE = '#w-ta, #sent-ta, #d2-ta';
for (const ev of ['paste', 'drop']) document.addEventListener(ev, (e) => { if (e.target.closest?.(NO_PASTE)) { e.preventDefault(); pages.toast('Hãy tự gõ bài của em.'); } }, true);
// Tài khoản Google (GĐ 2): bật bằng config.accounts=true, hoặc ?accounts=1 / ?emu=1 trên localhost để thử.
// ?accounts=1 bật cổng tài khoản cho riêng người mở đường dẫn đó, KỂ CẢ trên web thật (thử trên điện thoại khi cờ chung config.accounts còn tắt);
// ?emu=1 (nối emulator) chỉ có tác dụng trên localhost.
const accountsOn = config.accounts === true || new URLSearchParams(location.search).get('accounts') === '1' || (['localhost', '127.0.0.1'].includes(location.hostname) && emulatorOn());
if (accountsOn) {
  const { runGate } = await import('./account/gate.js');
  await runGate(ctx);                       // chỉ mở khi học sinh đã được duyệt vào lớp
  ctx.studentName = load('studentName', '') || 'bạn';
  updateStars();                            // sao của tài khoản này (kho dữ liệu đã tách theo UID)
  initCloudSync(ctx, updateStars);          // đồng bộ tiến độ / bài nộp / nhận xét qua Firestore (không dùng Sheet, mã học sinh, mã tiến độ)
} else {
  initSync(config);      // gửi bài đang chờ, hỏi nhận xét mới (nếu đã nối Sheet)
  await pages.welcomeIfNeeded();
}
start((route) => render(ctx, route));
// Tải sẵn phần mã còn lại khi máy rảnh (sau khi trang đầu đã hiện): mất mạng sau đó vẫn mở được mọi màn.
const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
setTimeout(() => idle(() => { loadSession().catch(() => {}); loadWork().catch(() => {}); }), 2500);
