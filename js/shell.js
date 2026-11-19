// Khung giao diện: menu (Home · Journey · My Work · Settings) và khung một session
// (thanh trên, thanh 5 chặng, vùng giữa cuộn dọc, thanh nút dưới cố định + cô Mai).
import { icons } from './icons.js';
import { STAGES, href } from './router.js';
import { createMai } from './mai.js';
import { load } from './store.js';

export const MENU = [
  { key: 'home', label: 'Home', icon: icons.home },
  { key: 'journey', label: 'Journey', icon: icons.journey },
  { key: 'work', label: 'My Work', icon: icons.work },
  { key: 'settings', label: 'Settings', icon: icons.settings },
];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function initNav() {
  for (const nav of document.querySelectorAll('[data-nav]')) {
    const top = nav.closest('.topnav');
    // Menu ngang trên máy tính: Settings là nút bánh răng bên phải.
    const items = top ? MENU.filter((m) => m.key !== 'settings') : MENU;
    nav.innerHTML = items.map((m) =>
      `<a href="#/${m.key}" data-key="${m.key}">${m.icon(top ? 20 : 24)}<span>${m.label}</span></a>`).join('');
  }
  document.querySelector('[data-settings-link]').innerHTML = icons.settings(20);
  updateStars();
}

export function setActiveNav(key) {
  for (const a of document.querySelectorAll('[data-nav] a')) {
    if (a.dataset.key === key) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  const gear = document.querySelector('[data-settings-link]');
  if (key === 'settings') gear.setAttribute('aria-current', 'page'); else gear.removeAttribute('aria-current');
}

export function updateStars() {
  const n = load('stars', 0);
  for (const el of document.querySelectorAll('[data-stars]')) el.innerHTML = `${icons.star(24)}<span>${n}</span><span class="sr-only"> stars</span>`;
}

/** Trang thường: trả về { el, body } */
export function pageScreen(title) {
  const el = document.createElement('section');
  el.className = 'screen';
  el.innerHTML = `<div class="page"><h1 class="page-title">${esc(title)}</h1></div>`;
  return { el, body: el.querySelector('.page') };
}

/**
 * Màn một session.
 * opts: { n, topic, stage, done: Set<index>, tip: {title, html} }
 * trả về { el, body, foot, mai }
 */
export function sessionScreen({ n, topic, stage, done = new Set(), tip, title }) {
  const el = document.createElement('section');
  el.className = 'screen session';
  const stars = load('stars', 0);
  el.innerHTML = `
    <header class="sess-head">
      <div class="sess-row">
        <a class="icon-btn" href="#/home" aria-label="Thoát về Home">${icons.close(20)}</a>
        <div class="sess-title">
          <div class="lbl">S${n} · ${esc(topic)}</div>
          <h1>${esc(title || STAGES[stage].name)}</h1>
        </div>
        <div class="stars">${icons.star(26)}<span>${stars}</span><span class="sr-only"> stars</span></div>
      </div>
      <ol class="stages" aria-label="Stage ${stage + 1} of 5: ${esc(STAGES[stage].name)}">
        ${STAGES.map((s, i) => {
          // chặng đang mở vẫn mang thêm 'done' nếu đã xong (đường nối sang chặng sau tô xanh)
          const cls = [i === stage ? 'cur' : '', done.has(i) ? 'done' : ''].filter(Boolean).join(' ');
          const mark = done.has(i) && i !== stage ? icons.check(14) : i + 1;
          return `<li class="${cls}"><a href="${href.stage(n, i)}" ${i === stage ? 'aria-current="step"' : ''}>
            <span class="dot">${mark}</span><span class="name">${s.name}${done.has(i) ? '<span class="sr-only"> (done)</span>' : ''}</span></a></li>`;
        }).join('')}
      </ol>
    </header>
    <div class="sess-body"></div>
    <footer class="sess-foot"><div class="foot-in"></div></footer>`;
  const foot = el.querySelector('.sess-foot');
  // Chặng không có thẻ tip (ví dụ Reward) thì không có nút cô Mai.
  const mai = tip ? createMai(tip) : null;
  if (mai) foot.append(mai.el); else foot.classList.add('no-mai');
  const h1 = el.querySelector('.sess-title h1');
  return {
    el, mai, foot,
    body: el.querySelector('.sess-body'),
    footIn: foot.querySelector('.foot-in'),
    setTitle: (t) => { if (h1.textContent !== t) h1.textContent = t; },
  };
}

/** Thẻ tip trong sXX.json → nội dung bong bóng cô Mai. */
export function tipFrom(tips, key) {
  const t = tips?.[key];
  if (!t) return null;
  return {
    title: `Ms Mai’s tip · ${esc(t.titleEn)}`,
    html: `${esc(t.vi)}${t.exampleEn ? `<span class="tip-ex" lang="en">${esc(t.exampleEn)}</span>` : ''}`,
  };
}
