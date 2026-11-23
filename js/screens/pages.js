// Home, Journey (mẫu Main, M2-HanhTrinh; máy tính D1: Home và Journey cùng một trang) và Settings.
import { load, save } from '../store.js';
import { stations, MAP_XY } from '../stations.js';
import { loadSession, sx } from '../data.js';
import { icons } from '../icons.js';
import { updateStars } from '../shell.js';
import { FONT_SCALES, applyPrefs, soundOn, setSound, exportCode, parseCode, importCode, cleanCode, validCode } from '../prefs.js';
import { flushQueue, fetchFeedback, unseenCount, updateBadges, getConfig } from '../sync.js';

// Mã tiến độ NGẮN (11 ký tự, ví dụ K7P3Q-9XM2A): tiến độ lưu trên Google Sheet của cô, mã chỉ là chìa khoá.
// Không nối được Sheet (mất mạng, chưa cập nhật Apps Script) thì dùng mã dài WU1.… như cũ.
const SHORT_RE = /^[A-Z0-9]{5}-?[A-Z0-9]{5}$/;
async function sheetCall(opts, params) {
  const url = getConfig().sheetUrl;
  if (!url) return null;
  try {
    const u = new URL(url, location.href);
    for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, v);
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 15000);
    const r = await fetch(u, { redirect: 'follow', signal: ctl.signal, ...opts });
    clearTimeout(tm);
    return await r.json();
  } catch { return null; }
}
const saveShort = (long) => sheetCall({ method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ loai: 'tien_do', du_lieu: long }) });
const loadShort = (code) => sheetCall({}, { tien_do: code.slice(0, 5) + '-' + code.slice(-5) });
import { sfx } from '../sfx.js';
import { lastNonSettings } from '../router.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ico = (k, cls = '') => `<img class="ico ${cls}" src="img/icon-bo-${k}-96.webp" alt="" width="40" height="40" decoding="async">`;
const ICON = { streak: 1, stations: 12, feedback: 10, stickers: 8 };

// ---------- thông báo ngắn (không dùng cửa sổ bật lên – trình duyệt Zalo) ----------
let toastT = null;
export function toast(text) {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), 3200);
}

// ---------- bản đồ 22 trạm ----------
function mapHtml(st) {
  const cur = st.current;
  return `<div class="jmap">
    <img class="jmap-bg" src="img/nen-hanhtrinh-doc-720.webp" alt="Bản đồ hành trình 22 trạm" width="720" height="2160" decoding="async" fetchpriority="high">
    ${st.list.map((s) => {
      const [x, y] = MAP_XY[s.n - 1];
      const pos = `left:${x}%;top:${y}%`;
      if (s.n === cur.n && s.ready && !s.locked) {
        return `<a class="stn now" href="${s.resume}" style="${pos}" aria-label="Trạm ${s.n}: ${esc(s.topic)} – đang học, ${s.stages}/5 chặng. ${s.done ? 'Review' : 'Continue'}">
          <img src="img/nv-lan-camxuc-1-256.webp" alt="" width="50" height="50"></a>`;
      }
      if (s.done) return `<a class="stn done" href="${s.resume}" style="${pos}" aria-label="Trạm ${s.n}: ${esc(s.topic)} – đã xong">${icons.check(16)}</a>`;
      if (s.ready && !s.locked) return `<a class="stn open" href="${s.resume}" style="${pos}" aria-label="Trạm ${s.n}: ${esc(s.topic)} – mở">${s.n}</a>`;
      const why = s.locked ? 'Hoàn thành trạm trước để mở khoá.' : 'Coming soon';
      return `<button type="button" class="stn ${s.locked ? 'locked' : 'soon'}" style="${pos}" data-info="S${s.n} · ${esc(s.topic)} – ${why}"
        aria-label="Trạm ${s.n}: ${esc(s.topic)} – ${why}">${s.n}</button>`;
    }).join('')}
  </div>`;
}

const pct = (a, b) => `${Math.round((a / b) * 100)}%`;

// ---------- Home + Journey ----------
async function homeJourney(ctx, view) {
  const st = await stations(ctx.config);
  const cur = st.current;
  const data = cur?.ready ? await loadSession(cur.n, ctx.config.sessionsReady) : null;
  const name = load('studentName', '') || 'bạn';
  const stars = load('stars', 0), streak = load('streak', { days: 0 }).days || 0;
  const stickers = load('stickers', []).length;
  const W = data?.write;
  const kind = W ? `${{ sentences: 'Sentences', paragraph: 'Paragraph', intro: 'Introduction', body: 'Body paragraph', essay: 'Essay' }[W.kind] || 'Writing'} · ${W.words.core ? `${W.words.core[0]}–${W.words.core[1]} words` : `${W.core?.sentences} sentences`}` : '';
  const topic = cur?.topic || '';

  const el = document.createElement('section');
  el.className = 'screen';
  el.innerHTML = `
    <div class="page hj" data-view="${view}">
      <div class="h-panel">
        <div class="hero">
          <img class="hero-bg" src="img/nen-trangchu-720.webp" srcset="img/nen-trangchu-720.webp 720w, img/nen-trangchu-1440.webp 1440w" sizes="(min-width: 768px) 820px, 100vw" alt="" decoding="async">
          <div class="hero-top">
            <span class="brand-pill">Write <span>Up!</span></span>
            <span class="pill">${ico(ICON.streak, 'sm')}<span>${streak}</span><span class="sr-only"> ngày liên tiếp</span></span>
            <span class="pill">${icons.star(24)}<span>${stars}</span><span class="sr-only"> stars</span></span>
          </div>
          <img class="hero-lan" src="img/nv-lan-camxuc-1-320.webp" srcset="img/nv-lan-camxuc-1-320.webp 320w, img/nv-lan-camxuc-1-512.webp 512w"
            sizes="(min-width: 768px) 190px, 150px" alt="Lan" width="190" height="285">
          <div class="hero-say">
            <h1>Hi ${esc(name)}!</h1>
            <p>Hôm nay mình viết về <b lang="en">${esc(topic)}</b>.</p>
          </div>
        </div>
        <div class="h-body">
          <div class="card nowcard">
            <div class="now-row">
              ${cur?.ready ? `<img class="now-pic" src="img/${sx(cur.n)}-cau-1-160.webp" alt="" width="64" height="64" loading="lazy">` : ''}
              <div class="now-txt"><div class="lbl">Now learning · Station ${cur?.n ?? 1} / 22</div>
                <div class="now-topic" lang="en">${esc(topic)}</div>
                ${kind ? `<div class="now-kind">${esc(kind)}</div>` : ''}</div>
            </div>
            <div class="now-prog"><div class="bar"><i style="width:${pct(cur?.stages || 0, 5)}"></i></div><span>${cur?.stages || 0}/5 stages</span></div>
            ${cur?.ready ? `<a class="btn now-go" href="${cur.resume}">${cur.done ? 'Review' : 'Continue'}</a>` : '<p class="muted">Chưa có trạm nào mở. Hỏi cô Mai nhé.</p>'}
          </div>
          <div class="stats">
            <a class="card stat" href="#/journey">${ico(ICON.stations)}<b>${st.doneCount}/22</b><span>stations</span></a>
            <a class="card stat" href="#/work">${unseenCount() ? `<span class="badge" aria-label="${unseenCount()} nhận xét mới">${unseenCount()}</span>` : ''}${ico(ICON.feedback)}<b>Feedback</b><span>from Ms Mai</span></a>
            <button type="button" class="card stat" data-open="stickers">${ico(ICON.stickers)}<b>${stickers}</b><span>${stickers === 1 ? 'sticker' : 'stickers'}</span></button>
          </div>
        </div>
      </div>
      <aside class="j-panel">
        <div class="j-head">
          <h2 class="j-title">Journey · 22 stations</h2>
          <span class="j-count">${st.doneCount}/22</span>
        </div>
        <div class="j-bar"><i style="width:${pct(st.doneCount, 22)}"></i></div>
        <p class="j-legend"><span class="lg done"></span>Done <span class="lg now"></span>Now <span class="lg open"></span>Open <span class="lg soon"></span>Coming soon${ctx.config.lockOrder ? ' <span class="lg locked"></span>Locked' : ''}</p>
        ${cur?.ready ? `<div class="j-now"><img src="img/nv-lan-camxuc-1-256.webp" alt="" width="40" height="40">
          <span class="j-now-txt"><span class="lbl">Now · Station ${cur.n}</span><b lang="en">${esc(topic)}</b></span>
          <a class="btn j-now-go" href="${cur.resume}">${cur.done ? 'Review' : 'Continue'}</a></div>` : ''}
        ${mapHtml(st)}
      </aside>
    </div>`;

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-info]');
    if (b) toast(b.dataset.info);
    if (e.target.closest('[data-open="stickers"]')) openStickers(ctx);
  });
  // Journey trên điện thoại: cuộn tới trạm đang học
  if (view === 'journey') requestAnimationFrame(() => setTimeout(() => {
    if (!matchMedia('(min-width: 768px)').matches) el.querySelector('.stn.now, .stn.open')?.scrollIntoView({ block: 'center' });
  }, 50));
  return { el };
}

export const home = (ctx) => homeJourney(ctx, 'home');
export const journey = (ctx) => homeJourney(ctx, 'journey');

// ---------- Bộ sưu tập sticker (bấm ô «stickers» ở Home) ----------
function openStickers(ctx) {
  const mine = load('stickers', []);
  const topics = new Map((ctx.config.sessionsReady || []).map((n) => [`sticker-1#${n}`, n]));
  const wrap = document.createElement('div');
  wrap.className = 'welcome sticker-pop';
  wrap.innerHTML = `
    <div class="welcome-card sticker-card" role="dialog" aria-modal="true" aria-labelledby="stk-t">
      <h2 id="stk-t">My stickers <span class="stk-n">${mine.length}</span></h2>
      ${mine.length ? `<div class="stk-grid">${mine.map((id) => {
        const [sheet, idx] = String(id).split('#');
        return `<figure><img src="img/${sheet}-${idx}-256.webp" alt="Sticker ${esc(idx)}" width="96" height="96" loading="lazy"><figcaption>S${topics.get(id) ?? esc(idx)}</figcaption></figure>`;
      }).join('')}</div>` : `<p class="stk-empty">Chưa có sticker nào. Hoàn thành một trạm (nộp bài ở Write &amp; Check) để nhận sticker đầu tiên!</p>`}
      <button type="button" class="btn" data-close>Close</button>
    </div>`;
  document.body.append(wrap);
  const app = document.querySelector('.app');
  app.setAttribute('inert', '');
  const close = () => { app.removeAttribute('inert'); wrap.remove(); removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  addEventListener('keydown', onKey);
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  wrap.querySelector('[data-close]').focus();
}

// ---------- Settings ----------
export function settings(ctx) {
  const el = document.createElement('section');
  el.className = 'screen';
  const scale = load('fontScale', 'm');
  el.innerHTML = `
    <div class="page settings">
      <div class="set-top">
        <a class="btn2 set-back" href="${lastNonSettings}" data-back>${icons.back ? icons.back(18) : '←'} Back</a>
        <h1 class="page-title">Settings</h1>
      </div>
      <form class="card set-card" data-form="student" novalidate>
        <h2>Student</h2>
        <label for="st-name">Your name</label>
        <input id="st-name" name="name" autocomplete="name" maxlength="40" value="${esc(load('studentName', ''))}" placeholder="Ví dụ: Bảo Ngọc">
        <label for="st-code">Student code <span class="opt-note">(cô Mai cấp)</span></label>
        <input id="st-code" name="code" autocomplete="off" autocapitalize="characters" maxlength="20" value="${esc(load('studentCode', ''))}" placeholder="Ví dụ: 11A-07">
        <p class="field-msg" aria-live="polite"></p>
        <button type="submit" class="btn">Save</button>
      </form>

      <div class="card set-card">
        <h2>Sound</h2>
        <button type="button" class="switch" role="switch" aria-checked="${soundOn()}" data-act="sound">
          <span class="knob" aria-hidden="true"></span><span class="sw-lbl">${soundOn() ? 'On' : 'Off'}</span></button>
        <p class="muted">Tiếng đúng / sai, xếp cụm, chúc mừng khi xong trạm (âm lượng nhỏ).</p>
        <p class="muted credit">Sound effects: «Interface Sounds» by <a href="https://kenney.nl/assets/interface-sounds" target="_blank" rel="noopener">Kenney</a> (kenney.nl), licence CC0 (public domain).</p>
      </div>

      <div class="card set-card">
        <h2>Text size</h2>
        <div class="seg" role="radiogroup" aria-label="Text size">
          ${FONT_SCALES.map(([k, lbl]) => `<button type="button" role="radio" data-scale="${k}" aria-checked="${k === scale}">${lbl}</button>`).join('')}
        </div>
      </div>

      <div class="card set-card">
        <h2>Progress code</h2>
        <p class="muted">Trình duyệt (nhất là trong Zalo) có thể xoá tiến độ. Tạo mã rồi gửi cho chính mình để lưu; đổi máy thì dán mã vào ô dưới.</p>
        <button type="button" class="btn2" data-act="export">Create my code</button>
        <div class="code-out" hidden>
          <output class="code-big" lang="en" hidden></output>
          <p class="field-msg ok code-info" aria-live="polite"></p>
          <div class="btn-row">
            <button type="button" class="btn2" data-act="copy">Copy code</button>
            <button type="button" class="btn2" data-act="share" hidden>Share</button>
          </div>
          <details class="code-show" hidden><summary>Show code</summary>
            <textarea id="code-out" readonly rows="2" aria-label="Your code"></textarea></details>
        </div>
        <label for="code-in">Paste a code</label>
        <textarea id="code-in" rows="1" placeholder="Ví dụ: K7P3Q-9XM2A" autocapitalize="characters" spellcheck="false"></textarea>
        <p class="field-msg imp-msg" aria-live="polite"></p>
        <button type="button" class="btn2" data-act="import">Import</button>
      </div>
    </div>`;
  const $ = (q) => el.querySelector(q);

  // Có tài khoản: thay thẻ «Student» (tên + mã học sinh cũ) bằng thẻ Account
  if (ctx?.account) {
    const a = ctx.account, st = a.student || {};
    $('[data-form="student"]').style.display = 'none';
    // tiến độ nằm trong tài khoản (đồng bộ tự động): không cần mã tiến độ
    for (const c of el.querySelectorAll('.set-card')) if (c.querySelector('h2')?.textContent === 'Progress code') c.style.display = 'none';
    const card = document.createElement('div');
    card.className = 'card set-card';
    card.innerHTML = '<h2>Account</h2><p class="muted">' + esc(a.email) + '</p><p class="muted">Nick name: <b>' + esc(st.nickname || '') + '</b> · Mã lớp: <b>' + esc(st.joinCode || '') + '</b></p><button type="button" class="btn2" data-act="signout">Sign out</button>';
    $('.set-top').after(card);
    card.querySelector('[data-act=signout]').addEventListener('click', async () => { try { await a.h.A.signOut(a.h.auth); } catch { /* bỏ qua */ } location.reload(); });
  }

  $('[data-form="student"]').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#st-name').value.trim(), code = cleanCode($('#st-code').value);
    const msg = $('[data-form="student"] .field-msg');
    if (!name) { msg.textContent = 'Nhập tên của em.'; msg.className = 'field-msg bad'; $('#st-name').focus(); return; }
    if (!validCode(code)) { msg.textContent = 'Mã chỉ gồm chữ, số, dấu gạch (2–20 ký tự).'; msg.className = 'field-msg bad'; $('#st-code').focus(); return; }
    save('studentName', name); save('studentCode', code);
    $('#st-code').value = code;
    msg.textContent = 'Đã lưu.'; msg.className = 'field-msg ok';
    flushQueue().then(() => fetchFeedback()); // có mã rồi thì gửi các bài đang chờ
  });

  let armed = false, fetched = null;
  el.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-act], [data-scale]');
    if (!t) return;
    if (t.dataset.scale) {
      save('fontScale', t.dataset.scale); applyPrefs();
      for (const b of el.querySelectorAll('[data-scale]')) b.setAttribute('aria-checked', String(b === t));
      return;
    }
    const act = t.dataset.act;
    if (act === 'sound') {
      const on = !soundOn(); setSound(on);
      if (on) sfx('tap');
      t.setAttribute('aria-checked', String(on)); t.querySelector('.sw-lbl').textContent = on ? 'On' : 'Off';
    } else if (act === 'export') {
      const long = exportCode();
      t.disabled = true;
      $('.code-out').hidden = false; $('.code-big').hidden = true; $('.code-show').hidden = true;
      $('.code-info').className = 'field-msg code-info'; $('.code-info').textContent = 'Đang tạo mã…';
      const j = await saveShort(long);
      t.disabled = false;
      if (j?.ok && j.ma) {
        $('#code-out').value = j.ma;
        $('.code-big').textContent = j.ma; $('.code-big').hidden = false;
        $('.code-info').textContent = 'Chép mã này gửi cho chính mình. Đổi máy thì nhập mã vào ô bên dưới.';
      } else {
        $('#code-out').value = long; $('.code-show').hidden = false;
        $('.code-info').textContent = `Chưa nối được Sheet của cô (mất mạng?) nên dùng mã dài ${long.length.toLocaleString('vi-VN')} ký tự. Bấm Copy rồi dán vào tin nhắn gửi cho chính mình.`;
      }
      $('.code-info').className = 'field-msg ok code-info';
      if (navigator.share) $('[data-act="share"]').hidden = false;
    } else if (act === 'share') {
      try { await navigator.share({ title: 'Write Up! progress code', text: $('#code-out').value }); } catch { /* đã huỷ */ }
    } else if (act === 'copy') {
      const ta = $('#code-out');
      try { await navigator.clipboard.writeText(ta.value); toast('Đã chép mã tiến độ.'); }
      catch { $('.code-show').open = true; ta.select(); document.execCommand?.('copy'); toast('Đã chọn mã – giữ để chép.'); }
    } else if (act === 'import') {
      const msg = $('.imp-msg');
      let raw = $('#code-in').value.trim().toUpperCase().replace(/s+/g, '');
      if (SHORT_RE.test(raw)) { // mã ngắn: hỏi Sheet lấy tiến độ
        if (fetched?.code !== raw) {
          msg.textContent = 'Đang tìm mã…'; msg.className = 'field-msg imp-msg';
          const j = await loadShort(raw);
          if (!j?.ok) { msg.textContent = j?.loi === 'khong_thay' ? 'Không tìm thấy mã này. Kiểm tra lại từng ký tự.' : 'Chưa nối được Sheet của cô (mất mạng?). Thử lại sau.'; msg.className = 'field-msg imp-msg bad'; armed = false; t.textContent = 'Import'; return; }
          fetched = { code: raw, long: j.du_lieu };
        }
        raw = fetched.long;
      } else raw = $('#code-in').value;
      const r = parseCode(raw);
      if (!r.ok) { msg.textContent = r.msg; msg.className = 'field-msg imp-msg bad'; armed = false; t.textContent = 'Import'; return; }
      if (!armed) { // bấm 2 lần thay cho hộp xác nhận (trình duyệt Zalo chặn cửa sổ bật lên)
        armed = true; t.textContent = 'Bấm lần nữa để thay tiến độ';
        msg.textContent = `${r.msg} Tiến độ hiện tại trên máy này sẽ bị thay.`; msg.className = 'field-msg imp-msg';
        return;
      }
      importCode(raw);
      applyPrefs(); updateStars(); updateBadges();
      msg.textContent = 'Đã nhập tiến độ.'; msg.className = 'field-msg imp-msg ok';
      armed = false; t.textContent = 'Import';
      $('#st-name').value = load('studentName', ''); $('#st-code').value = load('studentCode', '');
    }
  });
  $('#code-in').addEventListener('input', () => { armed = false; $('[data-act="import"]').textContent = 'Import'; });
  return { el };
}

// ---------- Lần đầu mở web: hỏi tên và mã ----------
export function welcomeIfNeeded() {
  if (load('studentName', '')) return Promise.resolve();
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'welcome';
    wrap.innerHTML = `
      <form class="welcome-card" role="dialog" aria-modal="true" aria-labelledby="wl-t" novalidate>
        <img src="img/comai-face.webp" alt="" width="72" height="72" class="wl-mai">
        <h2 id="wl-t">Chào mừng đến <span class="brand-w">Write <span>Up!</span></span></h2>
        <p>Cô Mai cần biết em là ai để nhận bài.</p>
        <label for="wl-name">Your name</label>
        <input id="wl-name" autocomplete="name" maxlength="40" placeholder="Ví dụ: Bảo Ngọc" required>
        <label for="wl-code">Student code <span class="opt-note">(cô Mai cấp)</span></label>
        <input id="wl-code" autocomplete="off" autocapitalize="characters" maxlength="20" placeholder="Ví dụ: 11A-07">
        <p class="field-msg" aria-live="polite">Chưa có mã? Để trống, nhập sau trong Settings.</p>
        <button type="submit" class="btn">Start</button>
      </form>`;
    document.body.append(wrap);
    const app = document.querySelector('.app');
    app.setAttribute('inert', ''); app.setAttribute('aria-hidden', 'true');
    const f = wrap.querySelector('form'), msg = wrap.querySelector('.field-msg');
    setTimeout(() => wrap.querySelector('#wl-name').focus(), 50);
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = f.querySelector('#wl-name').value.trim(), code = cleanCode(f.querySelector('#wl-code').value);
      if (!name) { msg.textContent = 'Nhập tên của em nhé.'; msg.className = 'field-msg bad'; f.querySelector('#wl-name').focus(); return; }
      if (!validCode(code)) { msg.textContent = 'Mã chỉ gồm chữ, số, dấu gạch (2–20 ký tự).'; msg.className = 'field-msg bad'; f.querySelector('#wl-code').focus(); return; }
      save('studentName', name); if (code) save('studentCode', code);
      flushQueue();
      // Bước 2: lời chào, rồi sang bản đồ hành trình để chọn trạm 1
      f.innerHTML = `
        <img src="img/nv-lan-camxuc-1-320.webp" alt="" width="120" height="180" class="wl-lan">
        <h2 id="wl-t">Welcome to the English Writing Class, ${esc(name)}!</h2>
        <p lang="vi">Chào mừng em tới với lớp học luyện viết tiếng Anh.</p>
        <button type="button" class="btn wl-go">Start your journey!</button>`;
      f.querySelector('.wl-go').focus();
      f.querySelector('.wl-go').addEventListener('click', () => {
        app.removeAttribute('inert'); app.removeAttribute('aria-hidden');
        wrap.remove();
        location.hash = '#/journey';
        resolve();
      });
    });
  });
}
