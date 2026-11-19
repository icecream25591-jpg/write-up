// Chặng 5 · Reward (mẫu M8-Thuong): nền nen-thuong, confetti, sticker và câu khen của session, +sao, chuỗi ngày.
// Thưởng chỉ cộng một lần cho mỗi session (lần đầu vào Reward sau khi đã nộp bài).
import { saveProgress } from '../progress.js';
import { load, save } from '../store.js';
import { href } from '../router.js';
import { updateStars } from '../shell.js';
import { sfx } from '../sfx.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const STARS_PER_SESSION = 30;
const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD theo giờ máy
const dayDiff = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Chuỗi ngày học: hôm nay đã học thì giữ, hôm qua học thì +1, cách xa hơn thì về 1. */
function bumpStreak() {
  const s = load('streak', { last: null, days: 0 });
  const t = today();
  if (s.last === t) return s.days;
  const days = s.last && dayDiff(s.last, t) === 1 ? s.days + 1 : 1;
  save('streak', { last: t, days });
  return days;
}

export function mountReward(s, { n, data, p }) {
  const key = data.session.toLowerCase();
  const [sheet, idx] = String(data.sticker || '').split('#');
  const stickerSrc = (w) => `img/${sheet}-${idx}-${w}.webp`;
  s.el.classList.add('reward-screen');
  s.setTitle('Reward');

  if (!p.write?.submitted) {
    s.body.innerHTML = `<div class="rw locked"><div class="rw-pill">Station ${n}</div>
      <p class="rw-lock">Nộp bài ở <b>Write &amp; Check</b> để nhận sticker và sao của trạm này.</p></div>`;
    s.footIn.innerHTML = `<a class="btn grow" href="${href.stage(n, 3)}">Write &amp; Check</a>`;
    return null;
  }

  let fresh = false;
  if (!p.reward?.at) {
    fresh = true;
    const stars = load('stars', 0) + STARS_PER_SESSION;
    save('stars', stars);
    const coll = new Set(load('stickers', []));
    coll.add(data.sticker); save('stickers', [...coll]);
    p.reward = { at: new Date().toISOString(), stars: STARS_PER_SESSION, streak: bumpStreak() };
    saveProgress(key, p);
    updateStars();
    s.el.querySelector('.sess-head .stars span').textContent = stars;
    s.el.querySelector('.stages li:last-child')?.classList.add('done'); // thanh chặng: Reward cũng xong
    sfx('sticker');
  }
  const streak = load('streak', { days: p.reward.streak || 1 }).days || 1;
  const name = load('studentName', '') || 'bạn';

  s.body.innerHTML = `
    <div class="rw">
      <img class="rw-bg" src="img/nen-thuong-720.webp" srcset="img/nen-thuong-720.webp 720w, img/nen-thuong-1440.webp 1440w" sizes="100vw" alt="" decoding="async">
      <div class="rw-in">
        <div class="rw-pill">Station ${n} complete</div>
        <h2 class="rw-title">Well done,<br>${esc(name)}!</h2>
        <div class="rw-stk${fresh && !reduced() ? ' pop' : ''}"><span class="rw-disc"></span>
          <img src="${stickerSrc(512)}" srcset="${stickerSrc(256)} 256w, ${stickerSrc(512)} 512w" sizes="180px" alt="Sticker: ${esc(data.reward?.stickerVi || '')}" width="180" height="180"></div>
        <p class="rw-new">New sticker!</p>
        <div class="rw-badges">
          <span class="rw-b"><svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" fill="#FFD43B" stroke="#E0A800" stroke-width="1.4" stroke-linejoin="round"/></svg>+${p.reward.stars}</span>
          <span class="rw-b"><span aria-hidden="true">🔥</span>${streak} ${streak === 1 ? 'day' : 'days'}</span>
        </div>
        <p class="rw-praise" lang="en">“${esc(data.praiseEn)}”</p>
      </div>
    </div>`;
  s.footIn.innerHTML = `<a class="btn2 grow" href="#/journey">Journey</a><a class="btn grow" href="#/home">Home</a>`;

  // Confetti (canvas-confetti, ISC, lưu cùng site). Bỏ qua khi người dùng tắt hiệu ứng chuyển động.
  let fx = null, gone = false;
  if (!reduced()) {
    import('../vendor/confetti.module.mjs').then(({ default: confetti }) => {
      if (gone) return;
      fx = confetti;
      const opts = { disableForReducedMotion: true, colors: ['#2F5BEA', '#3DBE8B', '#FFD43B', '#E2739D', '#9466E8'] };
      confetti({ ...opts, particleCount: fresh ? 120 : 50, spread: 75, origin: { y: 0.55 } });
      if (fresh) setTimeout(() => !gone && confetti({ ...opts, particleCount: 70, spread: 110, origin: { y: 0.45 } }), 350);
    }).catch(() => {});
  }
  // rời màn Reward: dừng và xoá confetti đang bay
  return { destroy: () => { gone = true; fx?.reset(); } };
}
