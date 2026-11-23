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
  // Bước 1: xem tranh + đề. Bước 2 (My plan) chỉ hiện khi học sinh bấm «My plan» (hoặc đã lên ý từ trước).
  st.planOpen ||= !!(st.claim || Object.keys(st.pick).length || Object.keys(st.sorted).length);
  const ui = { open: null, page: 0, active: null, sel: null };
  const orders = new Map();

  const lanes = (I.lanes?.length ? I.lanes : DEFAULT_LANES.map(([id, en]) => ({ id, en })))
    .map((l) => ({ ...l, color: l.color || l.id }));
  const laneOf = (id) => lanes.find((l) => l.id === id);
  // Thẻ gợi ý phụ (spot.hint) không tính vào bài chọn/xếp: «tap» = thẻ gợi ý chung bấm mới mở, «afterCheck» = thẻ tuỳ chọn sau Check
  const hints = (I.spots || []).filter((sp) => sp.hint);
  const spots = (I.spots || []).filter((sp) => !sp.hint && !(mode === 'sort' && sp.compare));
  const sortCompares = mode === 'sort' ? (I.spots || []).filter((sp) => sp.compare) : [];
  // chooseOne: điểm «đối chiếu» (spot.compare = nhãn tiếng Anh, ví dụ "If we only watch") – xem được, không chọn làm Claim
  const compares = spots.filter((sp) => sp.compare);
  // chooseOne: các hướng (Claim + How/Example/Result). Dữ liệu mới: ideas.directions [{id, panel|null, claim, how, example, result}];
  // dữ liệu cũ: spots có direction. Một vùng tranh có thể có nhiều hướng; hướng panel null chỉ chọn bằng thẻ.
  const dirs = [
    ...(I.directions || []).map((d) => ({ id: d.id, panel: d.panel ?? null, direction: { claim: d.claim, how: d.how, example: d.example, result: d.result } })),
    ...spots.filter((sp) => sp.direction).map((sp) => ({ id: sp.id, panel: sp.panel, qVi: sp.qVi, direction: sp.direction })),
  ];
  const dirOf = (id) => dirs.find((d) => d.id === id);
  const byPanel = new Map();
  for (const sp of [...spots, ...sortCompares, ...dirs.filter((d) => !spots.includes(d))]) if (sp.panel != null) byPanel.set(sp.panel, [...(byPanel.get(sp.panel) || []), sp]);
  const cards = spots.filter((sp) => sp.panel == null && !sp.direction);
  if (typeof st.claim === 'number') st.claim = dirs.find((d) => d.panel === st.claim)?.id || null; // tiến độ cũ lưu số khung
  const inputLanes = mode === 'chooseOne' ? BR : mode === 'pick' ? lanes.filter((l) => !l.prefilled).map((l) => l.id) : lanes.map((l) => l.id);
  const panelsUsed = P.panels.filter((pn) => byPanel.has(pn.n));

  // ---------- khung trang ----------
  s.setTitle('Idea Workshop');
  const ratio = P.ratio || 1.5;
  s.body.innerHTML = `
    <div class="ideas mode-${mode}">
      <details class="wtask" open><summary>Writing task</summary><p lang="en">${esc(I.prompt)}</p>
        ${I.topicSentence ? `<p class="ts"><span class="lbl">Topic sentence</span> <span lang="en">${esc(I.topicSentence)}</span></p>` : ''}</details>
      ${I.onDemand ? `<div class="card od-card"><p>Tự lập ý trên giấy nháp khoảng 5 phút. Tranh và các điểm chạm chỉ mở khi em cần.</p>
        <button type="button" class="btn2" data-act="hint">Cần gợi ý</button></div>` : ''}
      <div class="pic">
        <div class="scene" style="aspect-ratio:${ratio}">
          <img class="scene-img" src="img/${I.image}-800.webp" srcset="img/${I.image}-800.webp 800w, img/${I.image}-1600.webp 1600w"
            sizes="(min-width: 768px) 760px, 100vw" alt="Tranh lập ý, ${panelsUsed.length} khung. Chạm số để phóng to." decoding="async">
          <div class="dots"></div>
          <div class="zoom" role="dialog" aria-label="Khung phóng to" hidden></div>
        </div>
        ${cards.map((c) => `<div class="hint-card"><span class="lbl">Gợi ý chung</span><p>${esc(c.qVi)}</p>
          <p class="hc-chips" lang="en">${(c.chips || []).map(esc).join(' · ')}</p></div>`).join('')}
        ${hints.filter((h) => h.hint === 'tap').map((h) => `<details class="hint-card hint-tap"><summary><span class="lbl">${esc(h.labelVi || 'Gợi ý chung')}</span> <span class="hc-open">Chạm để xem</span></summary>
          <p>${esc(h.qVi)}</p><p class="hc-chips" lang="en">${(h.chips || []).map(esc).join(' · ')}</p></details>`).join('')}
        <p class="pic-hint">${mode === 'chooseOne' ? 'Chạm số trên tranh để xem từng vùng. Xem hết rồi chọn MỘT hướng làm Claim.' : 'Chạm số trên tranh để phóng to từng khung.'}</p>
      </div>
      <div class="planbox" hidden>
        <div class="lbl">My plan</div>
        <div class="plan"></div>
        <div class="tray"></div>
        <div class="choices"></div>
        <div class="check-row"><span class="msg" aria-live="polite"></span>
          <button type="button" class="btn sm" data-act="check" hidden>Check</button></div>
        ${compares.length ? `<div class="hint-card hint-after hint-cmp" hidden><span class="lbl">${esc(compares[0].compare)} · đối chiếu (không bắt buộc)</span>
          <p class="hc-chips" lang="en">${compares.flatMap((c) => c.chips || []).map(esc).join(' · ')}</p></div>` : ''}
        ${hints.filter((h) => h.hint === 'afterCheck').map((h) => `<div class="hint-card hint-after" hidden><span class="lbl">${esc(h.labelVi || 'Gợi ý thêm')}</span>
          <p>${esc(h.qVi)}</p><p class="hc-chips" lang="en">${(h.chips || []).map(esc).join(' · ')}</p></div>`).join('')}
      </div>
    </div>`;
  const $ = (q) => s.body.querySelector(q);
  const scene = $('.scene'), dotsEl = $('.dots'), zoom = $('.zoom');

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
      const cp = dirOf(st.claim)?.panel;
      if (mode === 'chooseOne') cls = st.claim && cp === k ? 'claim' : st.claim ? 'other' : st.seen.includes(k) ? 'seen' : '';
      else if (st.seen.includes(k)) cls = 'seen';
      const lab = `Khung ${k}${st.claim && cp === k ? ' – Claim của em' : st.seen.includes(k) ? ' – đã xem' : ''}`;
      return `<button type="button" class="pdot ${cls}" data-panel="${k}" style="left:${pn.x + 2.5}%;top:${pn.y + 5}%" aria-label="${lab}">${k}</button>`;
    }).join('');
  }

  // ---------- khung phóng to (đè lên tranh, cùng kích thước) ----------
  const seenCount = () => panelsUsed.filter((pn) => st.seen.includes(pn.n)).length;
  const seenAll = () => seenCount() >= panelsUsed.length;
  function openPanel(k, page = 0) {
    ui.open = k; ui.page = page;
    if (matchMedia('(max-width: 767px), (max-width: 950px) and (max-height: 500px)').matches) { document.body.append(zoom); document.documentElement.classList.add('zoom-open'); }
    if (!st.seen.includes(k)) { st.seen.push(k); save(); }
    renderZoom(); renderDots();
    if (!st.planOpen) renderFoot();
    if (mode === 'sort') { renderTray(); renderFoot(); }
    zoom.querySelector('.z-close').focus({ preventScroll: true });
  }
  function closeZoom() {
    const k = ui.open;
    ui.open = null; zoom.hidden = true; zoom.innerHTML = '';
    if (zoom.parentElement === document.body) scene.append(zoom);
    document.documentElement.classList.remove('zoom-open');
    dotsEl.querySelector(`[data-panel="${k}"]`)?.focus({ preventScroll: true });
  }
  function renderZoom(barOnly = false) {
    const k = ui.open, pn = P.panels.find((x) => x.n === k);
    if (!pn) return;
    const f = Math.min(100 / pn.w, 72 / pn.h); // chừa chỗ dưới cho thanh chữ, chữ không đè tranh
    const iw = pn.w * f, ih = pn.h * f;
    const big = innerWidth < 768 || scene.clientWidth * (100 / pn.w) * (devicePixelRatio || 1) > 900;
    let bar = '';
    if (mode === 'chooseOne') {
      const ds = dirs.filter((d) => d.panel === k);
      // điểm chạm của vùng (câu hỏi + cụm gợi ý), điểm đối chiếu có nhãn riêng, nhắc riêng (noteVi)
      // gọn: mỗi lần chỉ hiện MỘT điểm chạm (‹ › để xem điểm khác), để chữ không che tranh
      const info = spots.filter((sp) => sp.panel === k && !sp.direction);
      const pg = Math.min(ui.page, Math.max(0, info.length - 1));
      const c = info[pg];
      const pager = info.length > 1 ? `<span class="z-pager">
          <button type="button" class="z-nav" data-act="prev" aria-label="Gợi ý trước" ${pg === 0 ? 'disabled' : ''}>‹</button>
          <span>${pg + 1}/${info.length}</span>
          <button type="button" class="z-nav" data-act="nxt" aria-label="Gợi ý sau" ${pg >= info.length - 1 ? 'disabled' : ''}>›</button></span>` : '';
      const infoHtml = c ? ` · ${c.compare ? `<b class="z-ctag">${esc(c.compare)}</b> ` : ''}${esc(c.qVi || '')}
          <span class="z-chips" lang="en">${(c.chips || []).map((x) => `<i>${esc(x)}</i>`).join('')}</span>${c.noteVi ? `<span class="z-note">${esc(c.noteVi)}</span>` : ''}` : '';
      const has = Object.keys(st.pick).length > 0;
      const dirHtml = ds.map((d) => {
        let b = '';
        if (!seenAll()) b = '';
        else if (!st.claim) b = `<button type="button" class="z-btn" data-act="choose" data-dir="${esc(d.id)}">Choose as Claim</button>`;
        else if (st.claim === d.id) b = `<span class="z-mine">Claim của em ✓</span>`;
        else b = `<button type="button" class="z-btn ghost" data-act="choose" data-dir="${esc(d.id)}">↺ Switch Claim</button>`;
        return `${d.qVi ? `<span class="z-cmp">${esc(d.qVi)}</span>` : ""}<span class="z-dir"><span class="z-dclaim" lang="en">${esc(d.direction.claim)}</span>${b}</span>`;
      }).join('');
      let act = '';
      if (ds.length && !seenAll()) act = `<span class="z-warn">Xem hết ${panelsUsed.length} khung rồi mới chọn Claim (đã xem ${seenCount()}).</span>`;
      else if (ds.length && st.claim && ds.some((d) => d.id !== st.claim)) act = `<span class="z-warn">${has ? 'Đổi Claim sẽ xóa How / Example / Result đã chọn.' : 'Em có thể đổi sang hướng này.'}</span>`;
      else if (!ds.length && info.some((c) => c.compare)) act = `<span class="z-warn">Ý đối chiếu – không chọn làm Claim.</span>`;
      bar = `<div class="z-q"><b>${k}</b>${pager}${infoHtml}</div>${dirHtml ? `<span class="z-dirs">${dirHtml}</span>` : ''}${act}`;
    } else {
      const list = byPanel.get(k) || [];
      const sp = list[ui.page] || list[0];
      const pager = list.length > 1 ? `<span class="z-pager">
          <button type="button" class="z-nav" data-act="prev" aria-label="Câu trước" ${ui.page === 0 ? 'disabled' : ''}>‹</button>
          <span>${ui.page + 1}/${list.length}</span>
          <button type="button" class="z-nav" data-act="nxt" aria-label="Câu sau" ${ui.page >= list.length - 1 ? 'disabled' : ''}>›</button></span>` : '';
      bar = `<div class="z-q"><b>${k}</b>${pager} · ${sp?.compare ? `<b class="z-ctag">${esc(sp.compare)}</b> ` : ''}${sp?.whoEn ? `<b class="who">${esc(sp.whoEn)}</b> ` : ''}${esc(sp?.qVi || '')}
          <span class="z-chips" lang="en">${(sp?.chips || []).map((c) => `<i>${esc(c)}</i>`).join('')}</span></div>`;
    }
    // ‹ › chỉ đổi chữ: giữ nguyên ảnh đang hiện (không tải lại, không nháy)
    if (barOnly && zoom.dataset.k === String(k) && zoom.querySelector('.z-bar')) { zoom.querySelector('.z-bar').innerHTML = bar; return; }
    zoom.dataset.k = k;
    zoom.innerHTML = `
      <div class="z-stage"><div class="z-frame" style="--l:${(100 - iw) / 2}%;--t:2%;--w:${iw}%;--h:${ih}%;--ar:${((pn.w * ratio) / pn.h).toFixed(4)}">
        ${pn.zoomImg // ảnh riêng của vùng, cắt từ ảnh gốc độ phân giải cao (tools/cat-vung.mjs)
          ? `<img src="img/${I.image}-v${k}.webp" alt="Khung ${k} phóng to" style="width:100%;height:100%;left:0;top:0;object-fit:cover">`
          : `<img src="img/${I.image}-${big ? 1600 : 800}.webp" alt="Khung ${k} phóng to"
          style="width:${10000 / pn.w}%;height:${10000 / pn.h}%;left:${(-pn.x / pn.w) * 100}%;top:${(-pn.y / pn.h) * 100}%">`}</div></div>
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
        .concat(others.map((d) => ({ text: d.direction[lane], ok: false,
          why: I.otherWhy?.[lane] || `Thuộc hướng «${d.direction.claim}», không phải hướng em chọn. Đoạn văn chỉ giữ MỘT ý.` })));
      if (I.vague?.[lane]) list.push({ text: I.vague[lane].en, ok: false, why: I.vague[lane].whyVi || 'Quá chung chung: chưa gắn với hướng em chọn và với tranh.' });
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
      else text = 'Chọn MỘT hướng bên dưới (hoặc chạm vùng tranh)';
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
          return `<button type="button" class="placed${wrong ? ' wrong' : ''}" data-unsort="${sp.id}" lang="en" aria-label="${esc((sp.chips || []).join(', '))} – chạm để gỡ ra">${sp.whoEn ? `<b class="who">${esc(sp.whoEn)}</b> ` : ''}${esc((sp.chips || []).join(' · '))}</button>`;
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

  // Thẻ hướng: mọi hướng thật + thẻ hướng nhiễu (ideas.decoy), thứ tự xáo một lần
  let claimOrder = null;
  function claimCards() {
    claimOrder ||= shuffle([...dirs.map((d) => ({ id: d.id, text: d.direction.claim })), ...(I.decoy ? [{ decoy: true, text: I.decoy.en }] : [])]);
    return claimOrder;
  }
  function renderChoices() {
    const box = $('.choices');
    if (mode === 'chooseOne' && !st.claim && st.planOpen) {
      box.innerHTML = `<span class="lbl c-lbl" style="${laneStyle(laneOf('claim').color)}">Choose ONE <b>${esc(laneOf('claim').en)}</b>:</span>
        <div class="pchips" role="group" aria-label="Choose one Claim">${claimCards().map((c, i) =>
          `<button type="button" class="pchip${ui.decoyTried && c.decoy ? ' tried' : ''}" style="${laneStyle(laneOf('claim').color)}" data-claim="${i}" lang="en">${esc(c.text)}</button>`).join('')}</div>`;
      return;
    }
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
      <div class="tchips">${open.map((sp) => `<button type="button" class="tchip${ui.sel === sp.id ? ' sel' : ''}" data-sel="${sp.id}" lang="en" aria-pressed="${ui.sel === sp.id}">${sp.whoEn ? `<b class="who">${esc(sp.whoEn)}</b> ` : ''}${esc((sp.chips || []).join(' · '))}</button>`).join('')
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
      ? (mode === 'chooseOne' && !st.claim ? 'Chọn MỘT hướng làm Claim trước.' : allIn ? 'Điền đủ rồi, bấm Check.' : `Đã ${mode === 'sort' ? 'xếp' : 'chọn'} ${filled} / ${total}`)
      : allRight ? 'Dàn ý khớp! Sang Write.'
        : `${right} / ${total} đúng. ${mode === 'sort' ? 'Chạm cụm đỏ để gỡ ra và xếp lại.' : 'Chạm hàng đỏ để chọn lại.'}`;
    $('[data-act="check"]').hidden = !(allIn && !st.checked);
    for (const el of s.body.querySelectorAll('.hint-after')) el.hidden = !st.checked && !st.done; // thẻ tuỳ chọn: chỉ hiện sau khi bấm Check
  }

  function renderFoot() {
    // Từ S16 (ideas.onDemand): tự lập ý trên giấy nháp; tranh chỉ mở khi bấm «Cần gợi ý»; lập ý xong thì sang Write
    if (I.onDemand && !st.done && (!st.hintOpen || !st.planOpen)) {
      s.footIn.innerHTML = `<span class="hint">${st.hintOpen ? 'Xem tranh nếu cần. Lập ý xong thì sang Write (hoặc bấm My plan để xếp cụm).' : 'Lập ý trên giấy nháp khoảng 5 phút. Bí ý thì bấm «Cần gợi ý».'}</span>
        ${st.hintOpen && seenAll() ? '<button type="button" class="btn2" data-act="plan">My plan</button>' : ''}
        <button type="button" class="btn" data-act="selfdone">Write</button>`;
      return;
    }
    if (!st.planOpen) {
      // Phải mở xem hết các khung tranh rồi mới lên ý
      const seen = seenCount(), need = panelsUsed.length;
      s.footIn.innerHTML = seen < need
        ? `<span class="hint">Chạm số trên tranh, xem hết các khung (đã xem ${seen} / ${need}) rồi mới lên ý.</span>
          <button type="button" class="btn" disabled aria-disabled="true">My plan</button>`
        : `<span class="hint">Em đã xem hết tranh. Nghĩ xem em sẽ viết gì, rồi bấm My plan.</span>
          <button type="button" class="btn" data-act="plan">My plan</button>`;
      return;
    }
    const total = mode === 'sort' ? spots.length : lanes.length;
    const done = mode === 'sort' ? filledCount() : (mode === 'chooseOne' ? (st.claim ? 1 : 0) : lanes.filter((l) => l.prefilled).length) + filledCount();
    s.footIn.innerHTML = `
      <div class="prog"><div class="bar"><i style="width:${Math.round((done / total) * 100)}%"></i></div>
        <span>Plan ${done} / ${total}</span></div>
      ${st.done ? `<a class="btn btn-ok" href="${href.stage(n, 3)}">Write</a>` : `<button type="button" class="btn" disabled aria-disabled="true" title="Hoàn thành My plan trước">Write</button>`}`;
  }

  function openPlan() {
    st.planOpen = true; save();
    $('.planbox').hidden = false;
    renderAll();
    $('.planbox').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  const renderAll = () => {
    $('.planbox').hidden = !st.planOpen;
    if (I.onDemand) { $('.pic').hidden = !st.hintOpen; const od = $('.od-card'); if (od) od.hidden = !!st.hintOpen; }
    renderDots(); renderPlan(); renderTray(); renderChoices(); renderCheck(); renderFoot(); };

  // ---------- thao tác ----------
  function chooseClaim(id) {
    if (!id || !dirOf(id)) return;
    st.claim = id; st.pick = {}; st.checked = false; st.done = false; st.planOpen = true;
    ui.active = BR[0]; ui.decoyTried = false;
    sfx('ok');
    save(); if (ui.open) closeZoom(); renderAll();
  }
  // chọn Claim bằng thẻ: thẻ hướng nhiễu → báo lý do, không nhận
  function pickClaim(i) {
    const c = claimCards()[i];
    if (!c) return;
    if (!c.decoy) return chooseClaim(c.id);
    ui.decoyTried = true; sfx('bad');
    renderChoices();
    const msg = $('.msg'); msg.className = 'msg bad'; msg.textContent = I.decoy.whyVi || 'Hướng này không khớp đề và tranh.';
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
    sfx(st.done ? 'ok' : 'bad');
    // hàng sai đầu tiên thành hàng đang chọn để chọn lại ngay
    if (mode !== 'sort') ui.active = inputLanes.find((l) => !st.pick[l]?.ok) || null;
    save(); renderPlan(); renderChoices(); renderCheck(); renderFoot();
  }

  const onClick = (e) => {
    const t = e.target;
    const dot = t.closest('.pdot'); if (dot) return openPanel(+dot.dataset.panel);
    const act = t.closest('[data-act]')?.dataset.act;
    if (act === 'hint') { st.hintOpen = true; save(); renderAll(); $('.pic').scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    if (act === 'plan') return seenAll() && openPlan();
    if (act === 'close') return closeZoom();
    if (act === 'choose') return chooseClaim(t.closest('[data-dir]')?.dataset.dir || dirs.find((d) => d.panel === ui.open)?.id);
    const cc = t.closest('[data-claim]'); if (cc) return pickClaim(+cc.dataset.claim);
    if (act === 'prev' || act === 'nxt') { ui.page += act === 'nxt' ? 1 : -1; renderZoom(true); zoom.querySelector(`.z-nav[data-act="${act}"]:not(:disabled)`)?.focus({ preventScroll: true }); return; }
    if (act === 'change') { st.claim = null; st.pick = {}; st.checked = false; st.done = false; ui.active = null; save(); return renderAll(); }
    if (act === 'check') return check();
    const opt = t.closest('[data-opt]'); if (opt) return pickOpt(+opt.dataset.opt);
    const sel = t.closest('[data-sel]'); if (sel) { ui.sel = ui.sel === sel.dataset.sel ? null : sel.dataset.sel; renderTray(); renderPlan(); return; }
    const un = t.closest('[data-unsort]');
    if (un && !ui.sel) { delete st.sorted[un.dataset.unsort]; st.checked = false; st.done = false; save(); renderPlan(); renderTray(); renderCheck(); renderFoot(); return; }
    const row = t.closest('.row[data-lane]'); if (row) return tapRow(row.dataset.lane);
  };
  s.body.addEventListener('click', onClick);
  s.footIn.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="plan"]') && seenAll()) openPlan();
    if (e.target.closest('[data-act="selfdone"]')) { st.done = true; st.selfPlanned = true; save(); location.hash = href.stage(n, 3); } // tự lập ý trên giấy
  });
  // Trên điện thoại khung phóng to được đưa ra <body> (để phủ cả màn hình): tự nghe chạm ở đó
  zoom.addEventListener('click', (e) => { if (!s.body.contains(zoom)) onClick(e); });
  zoom.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.open) { e.stopPropagation(); closeZoom(); } });
  s.el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ui.open) { e.stopPropagation(); closeZoom(); return; }
    const row = e.target.closest?.('.row[role="button"]');
    if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tapRow(row.dataset.lane); }
  });

  if (mode === 'chooseOne' && st.claim) ui.active = nextEmpty() || BR.find((l) => !st.pick[l]?.ok) || 'how';
  if (mode === 'pick') ui.active = nextEmpty();
  save();
  renderAll();
  return { destroy: () => { zoom.remove(); document.documentElement.classList.remove('zoom-open'); } };
}
