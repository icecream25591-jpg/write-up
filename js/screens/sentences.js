// Chặng 2 · Sentences (mẫu M4-LuyenCau, D2-LuyenCau): mỗi ô tranh một màn.
// Yêu cầu + Target, chip cụm từ (chạm để chèn), ô viết một câu, Check (tự kiểm theo checks),
// Model chỉ mở sau khi đã Check. Câu đang viết lưu ngay vào localStorage.
import { runChecks, insertAtCursor } from '../chips.js';
import { saveProgress, saveLater, flush } from '../progress.js';
import { href } from '../router.js';
import { icons } from '../icons.js';
import { sfx } from '../sfx.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function mountSentences(s, { n, data, p }) {
  const items = data.sentences || [];
  const S = p.sentences;
  const key = data.session.toLowerCase();
  const save = () => saveProgress(key, p);
  const st = (it) => (S.items[it.id] ||= { text: '', tries: 0, passed: false, model: false });
  const img = (it, w) => `img/${it.image}-${it.cell}-${w}.webp`;

  function show() {
    const i = Math.min(S.i, items.length - 1);
    const it = items[i], my = st(it);
    s.setTitle(`Sentence Practice · ${i + 1}/${items.length}`);
    s.body.innerHTML = `
      <div class="cols sent">
        <div class="col-l">
          <figure class="cell">
            <img class="cell-pic" src="${img(it, 480)}" srcset="${img(it, 480)} 480w, ${img(it, 960)} 960w"
              sizes="(min-width: 768px) 540px, 100vw" width="480" height="480" alt="${esc(it.altVi)}" decoding="async">
            <span class="cell-badge">${i + 1} / ${items.length}</span>
          </figure>
          <div class="thumbs" role="group" aria-label="Pictures">${items.map((x, k) => `
            <button type="button" class="thumb${k === i ? ' cur' : ''}${S.items[x.id]?.passed ? ' ok' : ''}" data-go="${k}" aria-label="Picture ${k + 1}${S.items[x.id]?.passed ? ' (done)' : ''}"${k === i ? ' aria-current="true"' : ''}>
              <img src="${img(x, 480)}" alt="" loading="lazy" width="72" height="72"></button>`).join('')}</div>
        </div>
        <div class="col-r">
          <div class="card task">Viết <span class="hl">một câu</span> về bức tranh. ${esc(it.vi)}
            <span class="target">Target: <b lang="en">${esc(it.target)}</b></span></div>
          <div class="chips-wrap"><div class="lbl">Useful phrases</div>
            <div class="chips">${(it.chips || []).map((c) => `<button type="button" class="chip" data-chip="${esc(c)}" lang="en">+ ${esc(c)}</button>`).join('')}</div></div>
          <label for="sent-ta" class="lbl">Your sentence</label>
          <textarea id="sent-ta" class="sent-ta" lang="en" rows="2" enterkeyhint="done" autocapitalize="sentences" spellcheck="true"
            placeholder="Viết một câu tiếng Anh…">${esc(my.text)}</textarea>
          <div class="checks" aria-live="polite"></div>
          <div class="model" hidden></div>
        </div>
      </div>`;

    const ta = s.body.querySelector('#sent-ta');
    ta.addEventListener('input', () => {
      my.text = ta.value.replace(/\n/g, ' ');
      if (my.checkedText !== undefined && my.checkedText !== my.text) markStale();
      saveLater(key, p);
    });
    ta.addEventListener('blur', () => flush(key, p));
    // Một câu: Enter = Check, không xuống dòng
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); check(); } });

    s.body.querySelector('.chips').addEventListener('click', (e) => {
      const b = e.target.closest('[data-chip]');
      if (!b) return;
      insertAtCursor(ta, b.dataset.chip);
      sfx('tap');
      ta.focus({ preventScroll: true });
      ta.scrollIntoView({ block: 'nearest' });
    });
    s.body.querySelector('.thumbs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-go]');
      if (!b) return;
      go(+b.dataset.go);
    });

    if (my.lastRows) paintChecks(my.lastRows, my.passed, my.checkedText !== my.text);
    if (my.model) showModel(it);
    paintFoot();
  }

  function paintChecks(rows, pass, stale = false) {
    const box = s.body.querySelector('.checks');
    box.classList.toggle('stale', stale);
    box.innerHTML = `
      <ul>${rows.map((r) => `<li class="${r.ok ? 'ok' : 'bad'}"><span class="m" aria-hidden="true">${r.ok ? icons.check(13) : icons.close(11)}</span>${esc(r.msg)}</li>`).join('')}</ul>
      <p class="sum ${pass ? 'ok' : ''}">${stale ? 'Câu đã sửa – bấm Check lại.' : pass ? 'Câu đạt các điểm tự kiểm. Bấm Model để so sánh.' : 'Sửa câu rồi bấm Check lại. Có thể xem Model hoặc làm ô sau.'}</p>`;
  }
  function markStale() {
    const box = s.body.querySelector('.checks');
    if (box.innerHTML && !box.classList.contains('stale')) {
      box.classList.add('stale');
      const sum = box.querySelector('.sum'); if (sum) { sum.className = 'sum'; sum.textContent = 'Câu đã sửa – bấm Check lại.'; }
      paintFoot();
    }
  }

  function showModel(it) {
    const m = s.body.querySelector('.model');
    m.hidden = false;
    m.innerHTML = `<div class="lbl">Model</div><p lang="en">${esc(it.model)}</p>${it.explainVi ? `<p class="why">${esc(it.explainVi)}</p>` : ''}`;
  }

  function check() {
    const it = items[S.i], my = st(it);
    const ta = s.body.querySelector('#sent-ta');
    my.text = ta.value.replace(/\n/g, ' ').trim();
    const r = runChecks(my.text, it);
    my.tries++;
    my.lastRows = r.rows; my.checkedText = ta.value.replace(/\n/g, ' ');
    if (r.pass) my.passed = true;
    if (items.every((x) => S.items[x.id]?.passed)) S.done = true;
    save();
    sfx(r.pass ? 'ok' : 'bad');
    paintChecks(r.rows, r.pass);
    paintFoot();
    s.body.querySelector('.checks').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function paintFoot() {
    const it = items[S.i], my = st(it);
    const ta = s.body.querySelector('#sent-ta');
    const fresh = my.checkedText !== undefined && ta && my.checkedText === ta.value.replace(/\n/g, ' ');
    const last = S.i >= items.length - 1;
    const canModel = my.tries > 0;
    const nextBtn = `<button type="button" class="btn grow" data-act="next">${last ? 'Ideas' : 'Next'}</button>`;
    const checkBtn = `<button type="button" class="btn grow" data-act="check">Check</button>`;
    s.footIn.innerHTML = `
      <button type="button" class="btn2" data-act="model" ${canModel ? '' : 'disabled aria-disabled="true" title="Bấm Check trước"'}>Model</button>
      ${fresh && my.passed ? nextBtn : checkBtn}`;
  }

  function go(k) {
    flush(key, p);
    S.i = Math.max(0, Math.min(items.length - 1, k));
    save(); show();
    s.body.scrollTop = 0;
  }

  s.footIn.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const it = items[S.i], my = st(it);
    if (b.dataset.act === 'check') check();
    else if (b.dataset.act === 'model') { my.model = true; save(); showModel(it); s.body.querySelector('.model').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    else if (b.dataset.act === 'next') {
      // Xong chặng khi đã Check cả 4 ô (đạt hết hoặc đã thử và xem Model)
      if (S.i >= items.length - 1) {
        if (items.every((x) => S.items[x.id]?.tries > 0)) S.done = true;
        if (S.done) sfx('done');
        flush(key, p); save(); location.hash = href.stage(n, 2);
      }
      else go(S.i + 1);
    }
  });

  show();
}
