// Chặng 3 · Ideas – Idea Workshop (mẫu M5-XuongY, D3-XuongY).
// Tranh sXX-y tỉ lệ cố định, chấm số ở góc trên trái mỗi khung (panels.json), chạm → khung phóng to đè lên tranh.
// Ba chế độ theo ideas.mode (schema «Trường mở rộng»):
//   chooseOne – chọn MỘT khung làm Claim, rồi chọn cụm How / Example / Result (1 đúng hướng, 2 hướng khác, 1 vague), Check.
//   pick      – Claim cho sẵn (câu chủ đề); mỗi nhánh chọn 1 trong 4 cụm của ideas.picks, Check.
//   sort      – mở khung để lấy cụm của từng điểm chạm, xếp cụm vào đúng nhánh (spots[].lane là đáp án), Check.
// Dàn ý lưu vào progress.ideas.plan để chặng Write & Check đọc lại.
import { loadPanels } from '../data.js';
import { saveProgress } from '../progress.js';
import { href } from '../router.js';
import { icons } from '../icons.js';
import { sfx } from '../sfx.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const BR = ['how', 'example', 'result'];
const DEFAULT_LANES = [['claim', 'Claim'], ['how', 'How'], ['example', 'Example'], ['result', 'Result']];
const laneStyle = (c) => `--lb:var(--${c}-bg);--lc:var(--${c});--li:var(--${c}-ink)`;

export async function mountIdeas(s, { n, data, p }) {
  const I = data.ideas;
  const mode = I.mode || (I.chooseOne ? 'chooseOne' : 'sort');
  const key = data.session.toLowerCase();
  const P = (await loadPanels())[I.image] || { ratio: 1.5, panels: [] };

  // ---------- trạng thái (lưu) + giao diện tạm (không lưu) ----------
  let st = p.ideas;
  if (!st || st.mode !== mode) st = p.ideas = { mode };
  st.claim ??= null; st.pick ||= {}; st.sorted ||= {}; st.seen ||= []; st.checked ||= false; st.done ||= false;
  const ui = { open: null, page: 0, active: null, sel: null };
  const orders = new Map();

  const lanes = (I.lanes?.length ? I.lanes : DEFAULT_LANES.map(([id, en]) => ({ id, en })))
    .map((l) => ({ ...l, color: l.color || l.id }));
  const laneOf = (id) => lanes.find((l) => l.id === id);
  const spots = I.spots || [];
  const byPanel = new Map();
  for (const sp of spots) if (sp.panel != null) byPanel.set(sp.panel, [...(byPanel.get(sp.panel) || []), sp]);
  const cards = spots.filter((sp) => sp.panel == null);
  const dirs = spots.filter((sp) => sp.direction); // chooseOne: mỗi khung một hướng
  const dirOf = (k) => dirs.find((sp) => sp.panel === k);
  const inputLanes = mode === 'chooseOne' ? BR : mode === 'pick' ? lanes.filter((l) => !l.prefilled).map((l) => l.id) : lanes.map((l) => l.id);
  const panelsUsed = P.panels.filter((pn) => byPanel.has(pn.n));

  // ---------- khung trang ----------
  s.setTitle('Idea Workshop');
  const ratio = P.ratio || 1.5;
  s.body.innerHTML = `
    <div class="ideas mode-${mode}">
      <details class="wtask"><summary>Writing task</summary><p lang="en">${esc(I.prompt)}</p>
        ${I.topicSentence ? `<p class="ts"><span class="lbl">Topic sentence</span> <span lang="en">${esc(I.topicSentence)}</span></p>` : ''}</details>
      <div class="pic">
        <div class="scene" style="aspect-ratio:${ratio}">
          <img class="scene-img" src="img/${I.image}-800.webp" srcset="img/${I.image}-800.webp 800w, img/${I.image}-1600.webp 1600w"
            sizes="(min-width: 768px) 760px, 100vw" alt="Tranh lập ý, ${panelsUsed.length} khung. Chạm số để phóng to." decoding="async">
          <div class="dots"></div>
          <div class="zoom" role="dialog" aria-label="Khung phóng to" hidden></div>
        </div>
        ${cards.map((c) => `<div class="hint-card"><span class="lbl">Gợi ý chung</span><p>${esc(c.qVi)}</p>
          <p class="hc-chips" lang="en">${(c.chips || []).map(esc).join(' · ')}</p></div>`).join('')}
        <p class="pic-hint">${mode === 'chooseOne' ? 'Chạm số trên tranh, chọn MỘT khung làm Claim.' : 'Chạm số trên tranh để phóng to từng khung.'}</p>
      </div>
      <div class="planbox">
        <div class="lbl">My plan</div>
        <div class="plan"></div>
        <div class="tray"></div>
        <div class="choices"></div>
        <div class="check-row"><span class="msg" aria-live="polite"></span>
          <button type="button" class="btn sm" data-act="check" hidden>Check</button></div>
      </div>
    </div>`;
  const $ = (q) => s.body.querySelector(q);
  const scene = $('.scene'), dotsEl = $('.dots'), zoom = $('.zoom');
  if (matchMedia('(min-width: 768px)').matches) $('.wtask').open = true;

  // ---------- dữ liệu ra: dàn ý cho chặng Write ----------
  function itemsOf(l) {
    if (mode === 'chooseOne') {
      if (l.id === 'claim') return st.claim ? [dirOf(st.claim)?.direction.claim].filter(Boolean) : [];
      return st.pick[l.id] ? [st.pick[l.id].text] : [];
    }
    if (mode === 'pick') return l.prefilled ? [I.topicSentence] : st.pick[l.id] ? [st.pick[l.id].text] : [];
    return spots.filter((sp) => st.sorted[sp.id] === l.id).flatMap((sp) => sp.chips || []);
  }
  function save() {
    st.plan = { mode, ok: !!st.done, lanes: lanes.map((l) => ({ id: l.id, en: l.en, color: l.color, items: itemsOf(l) })) };
    saveProgress(key, p);
  }

  // ---------- chấm số ----------
  function renderDots() {
    dotsEl.innerHTML = panelsUsed.map((pn) => {
      const k = pn.n;
      let cls = '';
      if (mode === 'chooseOne') cls = st.claim === k ? 'claim' : st.claim ? 'other' : '';
      else if (st.seen.includes(k)) cls = 'seen';
      const lab = `Khung ${k}${st.claim === k ? ' – Claim của em' : st.seen.includes(k) ? ' – đã xem' : ''}`;
      return `<button type="button" class="pdot ${cls}" data-panel="${k}" style="left:${pn.x + 2.5}%;top:${pn.y + 5}%" aria-label="${lab}">${k}</button>`;
    }).join('');
  }

  // ---------- khung phóng to (đè lên tranh, cùng kích thước) ----------
  function openPanel(k, page = 0) {
    ui.open = k; ui.page = page;
    if (!st.seen.includes(k)) { st.seen.push(k); save(); }
    renderZoom(); renderDots();
    if (mode === 'sort') { renderTray(); renderFoot(); }
    zoom.querySelector('.z-close').focus({ preventScroll: true });
  }
  function closeZoom() {
    const k = ui.open;
    ui.open = null; zoom.hidden = true; zoom.innerHTML = '';
    dotsEl.querySelector(`[data-panel="${k}"]`)?.focus({ preventScroll: true });
  }
  function renderZoom() {
    const k = ui.open, pn = P.panels.find((x) => x.n === k);
    if (!pn) return;
    const f = Math.min(100 / pn.w, 76 / pn.h);
    const iw = pn.w * f, ih = pn.h * f;
    const big = innerWidth < 768 || scene.clientWidth * (100 / pn.w) * (devicePixelRatio || 1) > 900;
    let bar = '';
    if (mode === 'chooseOne') {
      const sp = dirOf(k);
      let act = '';
      if (!st.claim) act = `<button type="button" class="z-btn" data-act="choose">Choose as Claim</button>`;
      else if (st.claim === k) act = `<span class="z-mine">Claim của em ✓</span>`;
      else {
        const has = Object.keys(st.pick).length > 0;
        act = `<span class="z-sw"><button type="button" class="z-btn ghost" data-act="choose">↺ Switch Claim</button>
          <span class="z-warn">${has ? 'Đổi Claim sẽ xóa How / Example / Result đã chọn.' : 'Em có thể đổi sang hướng này.'}</span></span>`;
      }
      bar = `<p class="z-q"><b>${k}</b> · ${esc(sp?.qVi || '')}</p>${act}`;
    } else {
      const list = byPanel.get(k) || [];
      const sp = list[ui.page] || list[0];
      const pager = list.length > 1 ? `<span class="z-pager">
          <button type="button" class="z-nav" data-act="prev" aria-label="Câu trước" ${ui.page === 0 ? 'disabled' : ''}>‹</button>
          <span>${ui.page + 1}/${list.length}</span>
          <button type="button" class="z-nav" data-act="nxt" aria-label="Câu sau" ${ui.page >= list.length - 1 ? 'disabled' : ''}>›</button></span>` : '';
      bar = `<div class="z-q"><b>${k}</b> · ${esc(sp?.qVi || '')}
          <span class="z-chips" lang="en">${(sp?.chips || []).map((c) => `<i>${esc(c)}</i>`).join('')}</span></div>${pager}`;
    }
    zoom.innerHTML = `
      <div class="z-stage"><div class="z-frame" style="--l:${(100 - iw) / 2}%;--t:3%;--w:${iw}%;--h:${ih}%;--ar:${((pn.w * ratio) / pn.h).toFixed(4)}">
        <img src="img/${I.image}-${big ? 1600 : 800}.webp" alt="Khung ${k} phóng to"
          style="width:${10000 / pn.w}%;height:${10000 / pn.h}%;left:${(-pn.x / pn.w) * 100}%;top:${(-pn.y / pn.h) * 100}%"></div></div>
      <div class="z-bar">${bar}</div>
      <button type="button" class="z-close" data-act="close" aria-label="Đóng khung">${icons.close(20)}</button>`;
    zoom.hidden = false;
  }

  // ---------- My plan ----------
  function optsFor(lane) {
    const okey = `${st.claim}:${lane}`;
    if (orders.has(okey)) return orders.get(okey);
    let list = [];
    if (mode === 'chooseOne') {
      if (!st.claim) return [];
      const mine = dirOf(st.claim);
      const others = shuffle(dirs.filter((d) => d !== mine)).slice(0, 2);
      list = [{ text: mine.direction[lane], ok: true }]
        .concat(others.map((d) => ({ text: d.direction[lane], ok: false, why: `Thuộc khung ${d.panel}, hướng khác. Đoạn văn chỉ giữ MỘT ý.` })));
      if (I.vague?.[lane]) list.push({ text: I.vague[lane].en, ok: false, why: I.vague[lane].whyVi });
    } else if (mode === 'pick') {
      list = (I.picks?.[lane] || []).map((o) => ({ text: o.en, ok: !!o.ok, why: o.whyVi || '' }));
    }
    const out = shuffle(list);
    orders.set(okey, out);
    return out;
  }
  const filledCount = () => mode === 'sort' ? spots.filter((sp) => st.sorted[sp.id]).length : inputLanes.filter((l) => st.pick[l]).length;
  const nextEmpty = () => inputLanes.find((l) => !st.pick[l]) || null;

  function rowHtml(l) {
    let text = '', state = 'empty', note = '', extra = '', tappable = true;
    if (mode === 'chooseOne' && l.id === 'claim') {
      tappable = false;
      if (st.claim) { text = dirOf(st.claim)?.direction.claim; state = 'done'; extra = `<button type="button" class="chg" data-act="change">↺ Change</button>`; }
      else text = 'Chạm số trên tranh, chọn MỘT khung';
    } else if (mode === 'pick' && l.prefilled) {
      tappable = false; state = 'done'; text = I.topicSentence;
    } else if (mode === 'chooseOne' && !st.claim) {
      tappable = false; text = 'Chọn Claim trước';
    } else if (mode === 'sort') {
      const mine = spots.filter((sp) => st.sorted[sp.id] === l.id);
      if (mine.length) {
        state = 'done';
        text = mine.map((sp) => {
          const wrong = st.checked && sp.lane !== l.id;
          return `<button type="button" class="placed${wrong ? ' wrong' : ''}" data-unsort="${sp.id}" lang="en" aria-label="${esc((sp.chips || []).join(', '))} – chạm để gỡ ra">${esc((sp.chips || []).join(' · '))}</button>`;
        }).join('');
        if (st.checked && mine.some((sp) => sp.lane !== l.id)) { state = 'wrong'; note = 'Cụm đỏ chưa đúng nhánh – chạm để gỡ ra rồi xếp lại.'; }
      } else text = ui.sel ? 'Chạm để xếp cụm vào đây' : 'Chưa có cụm';
      return `<div class="row ${state}${ui.sel ? ' target' : ''}" style="${laneStyle(l.color)}" data-lane="${l.id}" role="button" tabindex="0" aria-label="${esc(l.en)}${ui.sel ? ' – xếp cụm đã chọn vào đây' : ''}">
        <span class="tag">${esc(l.en)}</span><span class="rtxt"><span class="t items">${text}</span>${note ? `<span class="note">${note}</span>` : ''}</span></div>`;
    } else {
      const pk = st.pick[l.id];
      if (pk) {
        text = pk.text; state = 'done';
        if (st.checked) { if (pk.ok) note = '✓'; else { state = 'wrong'; note = pk.why; } }
      } else text = 'Chạm để chọn cụm từ';
    }
    const on = tappable && ui.active === l.id;
    const t = state === 'done' || state === 'wrong' ? `<span class="t" lang="en">${esc(text)}</span>` : `<span class="t">${esc(text)}</span>`;
    return `<div class="row ${state}${on ? ' on' : ''}${tappable ? '' : ' fixed'}" style="${laneStyle(l.color)}" data-lane="${l.id}"
        ${tappable ? `role="button" tabindex="0" aria-pressed="${on}"` : ''} aria-label="${esc(l.en)}: ${esc(text)}${state === 'wrong' ? ' – chưa đúng, chạm để chọn lại' : ''}">
      <span class="tag">${esc(l.en)}</span><span class="rtxt">${t}${note && note !== '✓' ? `<span class="note">${esc(note)}</span>` : ''}</span>
      ${note === '✓' ? `<span class="okmark" aria-hidden="true">${icons.check(14)}</span>` : ''}${extra}</div>`;
  }
  function renderPlan() { $('.plan').innerHTML = lanes.map(rowHtml).join(''); }

  function renderChoices() {
    const box = $('.choices');
    if (mode === 'sort' || !ui.active || (mode === 'chooseOne' && !st.claim)) { box.innerHTML = ''; return; }
    const l = laneOf(ui.active);
    const cur = st.pick[ui.active]?.text;
    box.innerHTML = `<span class="lbl c-lbl" style="${laneStyle(l.color)}">Choose for <b>${esc(l.en)}</b>:</span>
      <div class="pchips" role="group" aria-label="Choose for ${esc(l.en)}">${optsFor(ui.active).map((o, i) =>
        `<button type="button" class="pchip${cur === o.text ? ' picked' : ''}" style="${laneStyle(l.color)}" data-opt="${i}" lang="en" aria-pressed="${cur === o.text}">${esc(o.text)}</button>`).join('')}</div>`;
  }

  function renderTray() {
    const tray = $('.tray');
    if (mode !== 'sort') { tray.innerHTML = ''; return; }
    const open = spots.filter((sp) => (sp.panel == null || st.seen.includes(sp.panel)) && !st.sorted[sp.id]);
    const unseen = spots.filter((sp) => sp.panel != null && !st.seen.includes(sp.panel)).length;
    tray.innerHTML = `<div class="lbl">Phrases to sort</div>
      <div class="tchips">${open.map((sp) => `<button type="button" class="tchip${ui.sel === sp.id ? ' sel' : ''}" data-sel="${sp.id}" lang="en" aria-pressed="${ui.sel === sp.id}">${esc((sp.chips || []).join(' · '))}</button>`).join('')
        || (unseen ? '' : '<span class="muted">Đã xếp hết cụm.</span>')}</div>
      ${unseen ? `<p class="muted">Mở thêm khung trên tranh để lấy cụm (còn ${unseen} điểm chạm chưa xem).</p>` : ''}
      ${ui.sel ? '<p class="muted sel-hint">Giờ chạm vào một nhánh trong My plan để xếp cụm.</p>' : ''}`;
  }

  function renderCheck() {
    const total = mode === 'sort' ? spots.length : inputLanes.length;
    const filled = filledCount();
    const allIn = filled === total && (mode !== 'chooseOne' || st.claim);
    let right = 0;
    if (mode === 'sort') right = spots.filter((sp) => st.sorted[sp.id] === sp.lane).length;
    else right = inputLanes.filter((l) => st.pick[l]?.ok).length;
    const allRight = st.checked && right === total;
    const msg = $('.msg');
    msg.className = `msg${allRight ? ' ok' : st.checked ? ' bad' : ''}`;
    msg.textContent = !st.checked
      ? (mode === 'chooseOne' && !st.claim ? 'Chọn Claim trên tranh trước.' : allIn ? 'Điền đủ rồi, bấm Check.' : `Đã ${mode === 'sort' ? 'xếp' : 'chọn'} ${filled} / ${total}`)
      : allRight ? 'Dàn ý khớp! Sang Write.'
        : `${right} / ${total} đúng. ${mode === 'sort' ? 'Chạm cụm đỏ để gỡ ra và xếp lại.' : 'Chạm hàng đỏ để chọn lại.'}`;
    $('[data-act="check"]').hidden = !(allIn && !st.checked);
  }

  function renderFoot() {
    const total = mode === 'sort' ? spots.length : lanes.length;
    const done = mode === 'sort' ? filledCount() : (mode === 'chooseOne' ? (st.claim ? 1 : 0) : lanes.filter((l) => l.prefilled).length) + filledCount();
    s.footIn.innerHTML = `
      <div class="prog"><div class="bar"><i style="width:${Math.round((done / total) * 100)}%"></i></div>
        <span>Plan ${done} / ${total}</span></div>
      <a class="btn${st.done ? ' btn-ok' : ''}" href="${href.stage(n, 3)}">Write</a>`;
  }

  const renderAll = () => { renderDots(); renderPlan(); renderTray(); renderChoices(); renderCheck(); renderFoot(); };

  // ---------- thao tác ----------
  function chooseClaim(k) {
    st.claim = k; st.pick = {}; st.checked = false; st.done = false;
    ui.active = 'how';
    sfx('ok');
    save(); closeZoom(); renderAll();
  }
  function pickOpt(i) {
    const o = optsFor(ui.active)[i];
    if (!o) return;
    st.pick[ui.active] = { text: o.text, ok: o.ok, why: o.why || '' };
    st.checked = false; st.done = false;
    sfx('tap');
    ui.active = nextEmpty() || ui.active;
    save(); renderPlan(); renderChoices(); renderCheck(); renderFoot();
  }
  function tapRow(lane) {
    const l = laneOf(lane);
    if (!l) return;
    if (mode === 'sort') {
      if (!ui.sel) return;
      st.sorted[ui.sel] = lane; ui.sel = null; st.checked = false; st.done = false;
      sfx('tap');
      save(); renderPlan(); renderTray(); renderCheck(); renderFoot();
      return;
    }
    if (l.prefilled || l.id === 'claim' || (mode === 'chooseOne' && !st.claim)) return;
    ui.active = lane;
    renderPlan(); renderChoices();
    $('.choices').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function check() {
    st.checked = true;
    const total = mode === 'sort' ? spots.length : inputLanes.length;
    const right = mode === 'sort' ? spots.filter((sp) => st.sorted[sp.id] === sp.lane).length : inputLanes.filter((l) => st.pick[l]?.ok).length;
    st.done = right === total;
    sfx(st.done ? 'done' : 'bad');
    // hàng sai đầu tiên thành hàng đang chọn để chọn lại ngay
    if (mode !== 'sort') ui.active = inputLanes.find((l) => !st.pick[l]?.ok) || null;
    save(); renderPlan(); renderChoices(); renderCheck(); renderFoot();
  }

  s.body.addEventListener('click', (e) => {
    const t = e.target;
    const dot = t.closest('.pdot'); if (dot) return openPanel(+dot.dataset.panel);
    const act = t.closest('[data-act]')?.dataset.act;
    if (act === 'close') return closeZoom();
    if (act === 'choose') return chooseClaim(ui.open);
    if (act === 'prev' || act === 'nxt') { ui.page += act === 'nxt' ? 1 : -1; return renderZoom(); }
    if (act === 'change') { st.claim = null; st.pick = {}; st.checked = false; st.done = false; ui.active = null; save(); return renderAll(); }
    if (act === 'check') return check();
    const opt = t.closest('[data-opt]'); if (opt) return pickOpt(+opt.dataset.opt);
    const sel = t.closest('[data-sel]'); if (sel) { ui.sel = ui.sel === sel.dataset.sel ? null : sel.dataset.sel; renderTray(); renderPlan(); return; }
    const un = t.closest('[data-unsort]');
    if (un && !ui.sel) { delete st.sorted[un.dataset.unsort]; st.checked = false; st.done = false; save(); renderPlan(); renderTray(); renderCheck(); renderFoot(); return; }
    const row = t.closest('.row[data-lane]'); if (row) return tapRow(row.dataset.lane);
  });
  s.el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ui.open) { e.stopPropagation(); closeZoom(); return; }
    const row = e.target.closest?.('.row[role="button"]');
    if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tapRow(row.dataset.lane); }
  });

  if (mode === 'chooseOne' && st.claim) ui.active = nextEmpty() || BR.find((l) => !st.pick[l]?.ok) || 'how';
  if (mode === 'pick') ui.active = nextEmpty();
  save();
  renderAll();
}
