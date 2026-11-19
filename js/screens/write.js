// Chặng 4 · Write & Check (mẫu M6-VietThat, D4-VietThat). Trang cuộn dọc, thanh nút dưới cố định.
// Thẻ My plan (đề + dàn ý từ Idea Workshop) · Core/Extension · ô viết tự lưu nháp · đếm từ · nhận diện cấu trúc đích ·
// đồng hồ (nếu write.minutes) · Self-check · Submit xám cho tới khi tick đủ · Model chỉ mở sau khi nộp.
import { saveProgress, saveLater, flush } from '../progress.js';
import { structuresFor, detect, countWords, countSentences } from '../structures.js';
import { enqueue, findItem } from '../queue.js';
import { flushQueue, onSync, itemStatus, STATUS_TEXT } from '../sync.js';
import { sfx } from '../sfx.js';
import { load } from '../store.js';
import { href } from '../router.js';
import { icons } from '../icons.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const laneStyle = (c) => `--lb:var(--${c}-bg);--lc:var(--${c});--li:var(--${c}-ink)`;
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export function mountWrite(s, { n, data, p }) {
  const W = data.write, I = data.ideas || {};
  const key = data.session.toLowerCase();
  const st = p.write;
  st.level ||= 'core'; st.text ??= ''; st.ticks ||= {};
  const plan = p.ideas?.plan;
  const checks = data.selfCheck || [];
  const structs = structuresFor(W.mustUse);
  const submitted = () => !!st.submitted;
  const save = () => saveProgress(key, p);

  const levelLabel = (lv) => {
    if (lv === 'core') return W.words.core ? `Core ${W.words.core[0]}–${W.words.core[1]}` : `Core · ${W.core?.sentences} câu`;
    return `Extension ${W.words.extension[0]}–${W.words.extension[1]}`;
  };

  // ---------- thẻ My plan ----------
  const planRows = plan?.lanes?.length
    ? plan.lanes.map((l) => `<div class="pr" style="${laneStyle(l.color)}"><span class="tag">${esc(l.en)}</span>
        <span class="v${l.items.length ? '' : ' none'}" ${l.items.length ? 'lang="en"' : ''}>${l.items.length ? l.items.map(esc).join(' · ') : 'chưa chọn'}</span></div>`).join('')
    : `<p class="pc-empty">Chưa lập dàn ý. <a href="${href.stage(n, 2)}">Mở Idea Workshop</a> để chọn ý trước khi viết.</p>`;
  const order = plan?.lanes?.map((l) => l.en).join(' → ');

  s.setTitle('Write & Check');
  s.body.innerHTML = `
    <div class="write">
      <aside class="w-side">
        <div class="card plan-card">
          <div class="pc-head"><b>My plan</b><span class="pc-from">từ Idea Workshop</span>
            <a class="pc-edit" href="${href.stage(n, 2)}">Edit plan</a></div>
          <p class="pc-task" lang="en">${esc(W.prompt)}</p>
          ${W.topicSentence ? `<p class="pc-ts"><span class="lbl">Topic sentence</span> <span lang="en">${esc(W.topicSentence)}</span></p>` : ''}
          ${planRows}
          <p class="pc-hint">${esc(W.taskVi || '')}${order ? ` Viết theo thứ tự ${esc(order)}.` : ''}</p>
        </div>
      </aside>
      <div class="w-main">
        <div class="w-head">
          <label for="w-ta" class="w-lbl">Your paragraph</label>
          <span class="timer" hidden aria-live="off"></span>
          <div class="lvl" role="radiogroup" aria-label="Level">
            ${['core', 'extension'].map((lv) => `<button type="button" role="radio" data-lvl="${lv}" aria-checked="${st.level === lv}">${esc(levelLabel(lv))}</button>`).join('')}
          </div>
        </div>
        <textarea id="w-ta" class="w-ta" lang="en" spellcheck="true" autocapitalize="sentences"
          placeholder="Viết đoạn văn tiếng Anh ở đây…">${esc(st.text)}</textarea>
        <div class="w-count"><div class="bar"><i></i></div><span class="wc" aria-live="polite"></span></div>
        <div class="w-struct" aria-label="Target structures"></div>
        <p class="saved" aria-live="polite"></p>
        <div class="card selfcheck">
          <div class="sc-head"><b>Self-check</b><span class="sc-sub">đọc lại bài, tick từng mục</span><span class="sc-n"></span></div>
          <div class="sc-list">${checks.map((c) => `
            <button type="button" class="sc-row" role="checkbox" data-code="${esc(c.code)}" aria-checked="${!!st.ticks[c.code]}">
              <span class="box" aria-hidden="true"></span><span class="q">${esc(c.vi)}</span><span class="code" title="${esc(c.round)}">${esc(c.code)}</span>
            </button>`).join('')}</div>
        </div>
        <div class="model-wrap"></div>
      </div>
    </div>`;
  const $ = (q) => s.body.querySelector(q);
  const ta = $('#w-ta');

  // ---------- đếm từ, cấu trúc ----------
  function renderCount() {
    const text = ta.value;
    let label, frac, cls;
    if (st.level === 'core' && !W.words.core) {
      const target = W.core?.sentences || 5, k = countSentences(text);
      label = `${k} / ${target} sentences`; frac = k / target; cls = k >= target ? 'ok' : 'low';
    } else {
      const [a, b] = st.level === 'core' ? W.words.core : W.words.extension;
      const k = countWords(text);
      label = `${k} / ${a}–${b} words${k > b ? ` · dài hơn ${k - b} từ` : ''}`; frac = k / a; cls = k < a ? 'low' : k <= b ? 'ok' : 'over';
    }
    const bar = $('.w-count');
    bar.className = `w-count ${cls}`;
    bar.querySelector('i').style.width = `${Math.min(100, Math.round(frac * 100))}%`;
    $('.wc').textContent = label;
    $('.w-struct').innerHTML = detect(structs, text).map((x) =>
      `<span class="schip ${x.found === true ? 'ok' : x.found === false ? 'no' : 'na'}" title="${esc(x.text)}">${esc(x.label)} ${x.found === true ? '✓' : x.found === false ? '· chưa có' : ''}</span>`).join('');
  }

  // ---------- Self-check + Submit ----------
  function renderChecks() {
    const k = checks.filter((c) => st.ticks[c.code]).length;
    $('.sc-n').textContent = `${k} / ${checks.length}`;
    for (const b of s.body.querySelectorAll('.sc-row')) {
      b.setAttribute('aria-checked', String(!!st.ticks[b.dataset.code]));
      b.querySelector('.box').innerHTML = st.ticks[b.dataset.code] ? icons.check(14) : '';
      b.disabled = submitted();
    }
    renderFoot();
  }
  function renderFoot() {
    if (submitted()) {
      const it = findItem(st.submitted.id);
      const stt = it ? itemStatus(it) : 'pending';
      s.footIn.innerHTML = `<span class="hint ${stt === 'sent' ? 'ok-hint' : ''}" data-status="${stt}">Đã nộp bản 1 · <b>${STATUS_TEXT[stt]}</b>${stt === 'sent' ? ' ✓' : stt === 'pending' ? ' – sẽ gửi khi có mạng' : ''}</span>
        <a class="btn btn-ok" href="${href.stage(n, 4)}">Reward</a>`;
      return;
    }
    const k = checks.filter((c) => st.ticks[c.code]).length;
    const hasText = countWords(ta.value) > 0;
    const ready = k === checks.length && hasText;
    const hint = !hasText ? 'Viết bài trước, rồi tick Self-check.' : ready ? 'Sẵn sàng. Bài của em được gửi về cho cô Mai.' : `Kéo xuống tick đủ Self-check để nộp (${k}/${checks.length})`;
    s.footIn.innerHTML = `<span class="hint${ready ? ' ok-hint' : ''}">${hint}</span>
      <button type="button" class="btn submit" data-act="submit" ${ready ? '' : 'disabled aria-disabled="true"'}>Submit</button>`;
  }
  function renderModel() {
    const m = $('.model-wrap');
    if (!submitted() || !W.modelAfterSubmit) { m.innerHTML = ''; return; }
    m.innerHTML = `<details class="card model-box"><summary>Model paragraph <span class="pc-from">mở sau khi nộp</span></summary>
      <p lang="en">${esc(W.modelAfterSubmit)}</p></details>`;
  }
  function lock() {
    ta.readOnly = submitted();
    for (const b of s.body.querySelectorAll('.lvl button')) b.disabled = submitted();
    s.body.querySelector('.write').classList.toggle('is-submitted', submitted());
  }

  // ---------- đồng hồ ----------
  let timerId = null;
  // (dừng đồng hồ do destroy() lo khi rời màn – lúc gắn màn, s.el chưa nằm trong trang)
  function tick() {
    const el = $('.timer');
    const total = W.minutes * 60;
    const left = st.startedAt ? Math.max(0, total - Math.floor((Date.now() - st.startedAt) / 1000)) : total;
    el.hidden = false;
    el.textContent = `⏱ ${mmss(left)}`;
    el.classList.toggle('low', left <= 300);
    el.classList.toggle('over', left === 0);
    if (left === 0) { el.textContent = '⏱ Hết giờ'; clearInterval(timerId); }
  }
  if (W.minutes) { tick(); timerId = setInterval(tick, 1000); }

  // ---------- sự kiện ----------
  let savedT = null;
  ta.addEventListener('input', () => {
    st.text = ta.value;
    if (W.minutes && !st.startedAt) { st.startedAt = Date.now(); }
    saveLater(key, p, 400);
    renderCount(); renderFoot();
    clearTimeout(savedT);
    savedT = setTimeout(() => { if (s.el.isConnected) $('.saved').textContent = 'Đã lưu nháp trên máy.'; }, 600);
  });
  ta.addEventListener('blur', () => flush(key, p));
  const onHide = () => flush(key, p);
  addEventListener('pagehide', onHide);
  document.addEventListener('visibilitychange', onHide);

  s.body.addEventListener('click', (e) => {
    const lv = e.target.closest('[data-lvl]');
    if (lv && !submitted()) {
      st.level = lv.dataset.lvl; save();
      for (const b of s.body.querySelectorAll('.lvl button')) b.setAttribute('aria-checked', String(b.dataset.lvl === st.level));
      renderCount(); return;
    }
    const row = e.target.closest('.sc-row');
    if (row && !submitted()) { st.ticks[row.dataset.code] = !st.ticks[row.dataset.code]; save(); renderChecks(); }
  });
  s.footIn.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act="submit"]');
    if (!b || b.disabled) return;
    st.text = ta.value;
    const words = countWords(st.text);
    const item = enqueue({
      kind: 'draft1', session: data.session, topic: data.topic, prompt: W.prompt, level: st.level, text: st.text, words,
      plan: plan || null, selfCheck: checks.map((c) => c.code),
      student: { name: load('studentName', ''), code: load('studentCode', '') },
      submittedAt: new Date().toISOString(),
    });
    st.submitted = { at: item.submittedAt, id: item.id, words };
    save();
    flushQueue(); // gửi ngay nếu có mạng; không thì nằm trong hàng chờ
    sfx('done');
    location.hash = href.stage(n, 4);
  });

  lock(); renderCount(); renderChecks(); renderModel();
  const offSync = onSync(() => { if (submitted()) renderFoot(); });
  return { destroy: () => { offSync(); clearInterval(timerId); removeEventListener('pagehide', onHide); document.removeEventListener('visibilitychange', onHide); flush(key, p); } };
}
