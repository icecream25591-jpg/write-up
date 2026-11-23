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
import { codeLabel } from '../codes.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const laneStyle = (c) => `--lb:var(--${c}-bg);--lc:var(--${c});--li:var(--${c}-ink)`;
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export function mountWrite(s, { n, data, p, config = {} }) {
  // S22 thi thử (write.exam): đề do giáo viên nhập ở config.json → examPrompt, chỉ hiện khi bấm «Bắt đầu»;
  // trước khi viết phải ghi «năm dòng» cho đề thật; 40 phút; không gợi ý, không bài mẫu.
  const W0 = data.write;
  const exam = !!W0.exam;
  const I = data.ideas || {};
  const key = data.session.toLowerCase();
  // Thi thử có HAI mục: «Tự luyện thi thử» (đề có sẵn trong write.practice) và «Bài thi cô giao» (config.examPrompt).
  // Mỗi đề lưu riêng trong p.write.exams[mã đề]: mốc bắt đầu, năm dòng, bản nháp, Self-check, bảng sửa, bài đã nộp.
  const PR = W0.practice || { prompts: [] };
  const assigned = String(config.examPrompt || '').trim();
  const hashStr = (t) => { let h = 0; for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) | 0; return (h >>> 0).toString(36).toUpperCase(); };
  const ASSIGNED_ID = assigned ? `GV-${hashStr(assigned)}` : null;
  const W1 = p.write;
  W1.exams ||= {};
  const examId = exam ? W1.examId : null;
  const practiceItem = PR.prompts.find((x) => x.id === examId);
  const W = !exam ? W0 : { ...W0, prompt: practiceItem ? practiceItem.text : examId === ASSIGNED_ID ? assigned : '', requirement: practiceItem ? PR.requirementEn : '' };
  const st = exam ? (examId ? (W1.exams[examId] ||= {}) : {}) : p.write;
  st.level ||= 'core'; st.text ??= ''; st.ticks ||= {}; st.lines ||= {};
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
  const LINES = data.analysis?.lines || [];
  const linesOk = () => LINES.every((_, i) => (st.lines[i] || '').trim().length >= 2);
  const planRows = exam
    ? `<ol class="an-lines exam-lines">${LINES.map((l, i) => `<li><label for="ex-${i}"><b>${esc(l.label)}</b></label>
        <textarea id="ex-${i}" rows="1" lang="en" data-line="${i}" placeholder="${esc(l.whatVi)}">${esc(st.lines[i] || '')}</textarea></li>`).join('')}</ol>`
    : plan?.lanes?.length
    ? plan.lanes.map((l) => `<div class="pr" style="${laneStyle(l.color)}"><span class="tag">${esc(l.en)}</span>
        <span class="v${l.items.length ? '' : ' none'}" ${l.items.length ? 'lang="en"' : ''}>${l.items.length ? l.items.map(esc).join(' · ') : 'chưa chọn'}</span></div>`).join('')
    : `<p class="pc-empty">Chưa lập dàn ý. <a href="${href.stage(n, 2)}">Mở Idea Workshop</a> để chọn ý trước khi viết.</p>`;
  const order = plan?.lanes?.map((l) => l.en).join(' → ');

  s.setTitle('Write & Check');
  s.body.innerHTML = `
    <div class="write">
      <aside class="w-side">
        <div class="card plan-card">
          <div class="pc-head"><b>${exam ? 'Five lines · đề thi' : 'My plan'}</b><span class="pc-from">${exam ? 'ghi trước khi viết' : 'từ Idea Workshop'}</span>
            ${exam ? '<button type="button" class="pc-edit pc-switch" data-act="switch">Đổi đề</button>' : `<a class="pc-edit" href="${href.stage(n, 2)}">Edit plan</a>`}</div>
          ${W.requirement ? `<p class="pc-req" lang="en">${esc(W.requirement)}</p>` : ''}<p class="pc-task" lang="en">${esc(W.prompt)}</p>
          ${W.topicSentence ? `<p class="pc-ts"><span class="lbl">Topic sentence</span> <span lang="en">${esc(W.topicSentence)}</span></p>` : ''}
          ${planRows}
          <p class="pc-hint">${esc(W.taskVi || '')}${order ? ` Viết theo thứ tự ${esc(order)}.` : ''}</p>
        </div>
      </aside>
      <div class="w-main">
        <div class="w-head">
          <label for="w-ta" class="w-lbl">Your paragraph</label>
          <span class="timer" hidden aria-live="off"></span>
          <div class="lvl" role="radiogroup" aria-label="Level" ${exam ? 'hidden' : ''}>
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
              <span class="box" aria-hidden="true"></span><span class="q">${esc(c.vi)}</span><span class="code" title="${esc(c.round)}">${String(c.code).split(/\s*,\s*/).map((x) => esc(codeLabel(x))).join('<br>')}</span>
            </button>`).join('')}</div>
        </div>
        ${exam ? `<div class="card edits">
          <div class="sc-head"><b>Em đã sửa gì?</b><span class="sc-sub">ghi lại chỗ em tự sửa trong 4 phút cuối (mã lỗi · trước → sau)</span></div>
          <div class="ed-list"></div>
          <div class="ed-act"><button type="button" class="btn2 sm" data-act="ed-add">+ Thêm dòng</button>
            <label class="ed-none"><input type="checkbox" data-act="ed-none"> Em không thấy chỗ nào cần sửa</label></div>
        </div>` : ''}
        <div class="model-wrap"></div>
      </div>
    </div>`;
  const $ = (q) => s.body.querySelector(q);
  const ta = $('#w-ta');
  // thi thử: chưa bấm Bắt đầu → che đề và ô viết
  if (exam && (!examId || !st.startedAt || !W.prompt)) {
    // chọn mục: Tự luyện (chọn đề 1–10) hoặc Bài thi cô giao. Đề chỉ hiện sau khi bấm Bắt đầu.
    const stateOf = (id) => { const e = W1.exams[id]; return !e?.startedAt ? '' : e.submitted ? ' · đã nộp' : ' · đang làm'; };
    const sel = PR.prompts.some((x) => x.id === W1.practicePick) ? W1.practicePick : (PR.defaultId || PR.prompts[0]?.id);
    const btnFor = (id) => (W1.exams[id]?.startedAt ? (W1.exams[id].submitted ? 'Xem lại' : 'Tiếp tục') : 'Bắt đầu');
    s.body.innerHTML = `<div class="exam-modes">
      <div class="card exam-start">
        <h2>Tự luyện thi thử · 40 minutes</h2>
        <p>Chọn một đề. Đề chỉ hiện khi em bấm <b>Bắt đầu</b>; đồng hồ chạy ngay, 4 phút cuối tự đọc và sửa. Không có tranh, gợi ý hay bài mẫu.</p>
        <label for="ex-pick" class="lbl">Đề tự luyện</label>
        <select id="ex-pick" class="ex-pick">${PR.prompts.map((x, i) => `<option value="${esc(x.id)}" ${x.id === sel ? 'selected' : ''}>Đề ${i + 1}${stateOf(x.id)}</option>`).join('')}</select>
        <button type="button" class="btn" data-act="start" data-id="practice">${btnFor(sel)}</button>
      </div>
      <div class="card exam-start">
        <h2>Bài thi cô giao</h2>
        ${ASSIGNED_ID ? `<p>Đề cô giao cho lớp. Làm như thi thật: ghi năm dòng, viết, tự soát rồi nộp.</p>
          <button type="button" class="btn" data-act="start" data-id="${ASSIGNED_ID}">${btnFor(ASSIGNED_ID)}</button>`
        : '<p class="field-msg">Cô chưa giao đề. Em làm mục Tự luyện ở trên nhé.</p>'}
      </div></div>`;
    s.footIn.innerHTML = '<span class="hint">Chuẩn bị giấy nháp. Chọn đề rồi bấm Bắt đầu khi đã sẵn sàng.</span>';
    s.body.addEventListener('change', (e) => {
      if (!e.target.matches('#ex-pick')) return;
      W1.practicePick = e.target.value; save();
      s.body.querySelector('[data-id="practice"]').textContent = btnFor(e.target.value);
    });
    s.body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act="start"]'); if (!b) return;
      const id = b.dataset.id === 'practice' ? s.body.querySelector('#ex-pick').value : b.dataset.id;
      W1.examId = id; W1.mode = b.dataset.id === 'practice' ? 'practice' : 'assigned';
      const e2 = (W1.exams[id] ||= {});
      e2.startedAt ||= Date.now();
      save();
      dispatchEvent(new HashChangeEvent('hashchange')); // dựng lại màn: hiện đề, năm dòng, ô viết
    });
    return { destroy: () => {} };
  }
  const gateLines = () => { if (!exam || submitted()) return; ta.readOnly = !linesOk(); ta.placeholder = linesOk() ? 'Viết bài ở đây…' : 'Ghi đủ «năm dòng» bên cạnh trước khi viết câu đầu tiên.'; };
  if (exam) s.body.addEventListener('input', (e) => {
    const li = e.target.closest('[data-line]'); if (!li) return;
    st.lines[li.dataset.line] = li.value; saveLater(key, p, 400); gateLines(); renderFoot();
  });

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
  let lastFoot = '';
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
    const editsOk = !exam || st.editsNone || (st.edits || []).some((x) => x.code && (x.before || x.after));
    const ready = k === checks.length && hasText && editsOk;
    const hint = hasText && k === checks.length && !editsOk ? 'Ghi vào bảng «Em đã sửa gì?» (hoặc tick không có chỗ cần sửa) rồi nộp.' : !hasText ? 'Viết bài trước, rồi tick Self-check.' : ready ? 'Sẵn sàng. Bài của em được gửi về cho cô Mai.' : `Kéo xuống tick đủ Self-check để nộp (${k}/${checks.length})`;
    const html = `<span class="hint${ready ? ' ok-hint' : ''}">${hint}</span>
      <button type="button" class="btn submit" data-act="submit" ${ready ? '' : 'disabled aria-disabled="true"'}>Submit</button>`;
    // chỉ vẽ lại khi khác: tránh thay nút Submit đúng lúc học sinh bấm (ô nhập mất con trỏ → change → vẽ lại)
    if (html !== lastFoot) { s.footIn.innerHTML = html; lastFoot = html; }
  }
  function renderModel() {
    const m = $('.model-wrap');
    if (!submitted() || !W.modelAfterSubmit) { m.innerHTML = ''; return; }
    m.innerHTML = `<details class="card model-box"><summary>Model paragraph <span class="pc-from">mở sau khi nộp</span></summary>
      <p lang="en" style="white-space:pre-line">${esc(W.modelAfterSubmit)}</p></details>`;
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
    if (exam && e.target.closest('[data-act="switch"]')) { flush(key, p); W1.examId = null; save(); dispatchEvent(new HashChangeEvent('hashchange')); return; }
    if (exam && e.target.closest('[data-act="ed-add"]') && !submitted()) { (st.edits ||= []).push({ code: '', before: '', after: '' }); save(); renderEdits(); return; }
    const del = e.target.closest('[data-ed-del]'); if (exam && del && !submitted()) { st.edits.splice(+del.dataset.edDel, 1); save(); renderEdits(); return; }
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
      kind: 'draft1', session: data.session, topic: data.topic, prompt: exam ? `[${W1.mode === 'practice' ? `Tự luyện ${examId}` : 'Bài thi cô giao'}] ${W.prompt}` : W.prompt, level: st.level, text: st.text, words,
      ...(exam ? { edits: st.editsNone ? [] : (st.edits || []).filter((x) => x.code), editsNone: !!st.editsNone } : {}),
      plan: exam ? { lanes: LINES.map((l, i) => ({ en: l.label, items: [st.lines[i] || ''] })) } : plan || null, selfCheck: checks.map((c) => c.code),
      student: { name: load('studentName', ''), code: load('studentCode', '') },
      submittedAt: new Date().toISOString(),
    });
    st.submitted = { at: item.submittedAt, id: item.id, words };
    if (exam) W1.submitted ||= st.submitted; // xong chặng Viết (mở Reward) khi nộp bất kỳ đề nào
    save();
    flushQueue(); // gửi ngay nếu có mạng; không thì nằm trong hàng chờ
    location.hash = href.stage(n, 4);
  });

  const CODES = [...new Set(checks.flatMap((c) => String(c.code).split(/\s*,\s*/)))];
  function renderEdits() {
    if (!exam) return;
    st.edits ||= [];
    if (!st.edits.length && !submitted()) st.edits.push({ code: '', before: '', after: '' });
    $('.ed-list').innerHTML = st.edits.map((x, i) => `<div class="ed-row">
        <select data-ed="${i}" data-f="code" aria-label="Mã lỗi" ${submitted() ? 'disabled' : ''}><option value="">Mã</option>${CODES.map((c) => `<option value="${c}" ${x.code === c ? 'selected' : ''}>${esc(codeLabel(c))}</option>`).join('')}</select>
        <input data-ed="${i}" data-f="before" lang="en" placeholder="Trước" value="${esc(x.before)}" ${submitted() ? 'readonly' : ''}>
        <span aria-hidden="true">→</span>
        <input data-ed="${i}" data-f="after" lang="en" placeholder="Sau" value="${esc(x.after)}" ${submitted() ? 'readonly' : ''}>
        ${submitted() ? '' : `<button type="button" class="ed-del" data-ed-del="${i}" aria-label="Xoá dòng">×</button>`}</div>`).join('');
    const none = s.body.querySelector('[data-act="ed-none"]'); none.checked = !!st.editsNone; none.disabled = submitted();
    s.body.querySelector('[data-act="ed-add"]').hidden = submitted();
    renderFoot();
  }
  if (exam) {
    s.body.addEventListener('input', (e) => { const t = e.target.closest('[data-ed]'); if (!t) return; st.edits[t.dataset.ed][t.dataset.f] = t.value; saveLater(key, p, 400); renderFoot(); });
    s.body.addEventListener('change', (e) => {
      const t = e.target.closest('[data-ed]'); if (t) { st.edits[t.dataset.ed][t.dataset.f] = t.value; save(); renderFoot(); return; }
      if (e.target.matches('[data-act="ed-none"]')) { st.editsNone = e.target.checked; save(); renderFoot(); }
    });
  }
  lock(); gateLines(); renderCount(); renderChecks(); renderModel(); renderEdits();
  const offSync = onSync(() => { if (submitted()) renderFoot(); });
  return { destroy: () => { offSync(); clearInterval(timerId); removeEventListener('pagehide', onHide); document.removeEventListener('visibilitychange', onHide); flush(key, p); } };
}
