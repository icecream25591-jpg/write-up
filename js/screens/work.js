// My Work (danh sách bài đã nộp, trạng thái gửi, chấm đỏ khi có nhận xét mới)
// và Feedback → Draft 2 (mẫu M9-SuaBan2, D5-SuaBan2).
import { load, save } from '../store.js';
import { queue, findItem, enqueue } from '../queue.js';
import { itemStatus, STATUS_TEXT, flushQueue, fetchFeedback, feedbackFor, feedbackList, isNew, markSeen, onSync, getConfig } from '../sync.js';
import { countWords } from '../structures.js';
import { icons } from '../icons.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const when = (iso) => { try { return new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
// màu nhánh theo nhãn giáo viên chọn trong Sheet
const LANE_COLOR = { claim: 'claim', how: 'how', why: 'amber', example: 'example', result: 'result', 'topic sentence': 'claim', conclusion: 'teal', other: 'coral' };
const laneColor = (n) => LANE_COLOR[String(n || '').trim().toLowerCase()] || 'coral';
const laneStyle = (c) => `--lb:var(--${c}-bg);--lc:var(--${c});--li:var(--${c}-ink)`;
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const sLabel = (s) => `S${Number(String(s || '').replace(/\D/g, '')) || ''}`; // "S01" → "S1"

// ---------- My Work ----------
export function workList() {
  const el = document.createElement('section');
  el.className = 'screen';
  el.innerHTML = `<div class="page mywork"><h1 class="page-title">My Work</h1>
    <p class="mw-note">Bài của em được gửi về cho cô Mai. Nhận xét của cô sẽ hiện ở đây.</p>
    <div class="mw-status"></div>
    <p class="mw-info" aria-live="polite" hidden></p>
    <div class="mw-actions"><button type="button" class="btn2" data-act="refresh">Check feedback</button>
      <button type="button" class="btn2" data-act="send" hidden>Send now</button></div>
    <div class="mw-list"></div></div>`;
  const $ = (q) => el.querySelector(q);

  function render() {
    const cfg = getConfig();
    const items = queue().slice().reverse();
    const waiting = items.filter((x) => !x.sent).length;
    const st = $('.mw-status');
    if (!cfg.sheetUrl) st.innerHTML = '<p class="mw-warn">Web chưa nối Google Sheet: bài đang lưu trên máy này.</p>';
    else if (!load('studentCode', '')) st.innerHTML = '<p class="mw-warn">Nhập <a href="#/settings">mã học sinh</a> để gửi bài cho cô.</p>';
    else if (waiting) st.innerHTML = `<p class="mw-warn">${waiting} bài chờ gửi – sẽ tự gửi khi có mạng.</p>`;
    else st.innerHTML = '';
    $('[data-act="send"]').hidden = !(waiting && cfg.sheetUrl && load('studentCode', ''));
    $('[data-act="refresh"]').hidden = !cfg.sheetUrl;
    if (!items.length) { $('.mw-list').innerHTML = '<div class="card mw-empty">Chưa có bài nào. Làm xong <b>Write &amp; Check</b> rồi bấm Submit.</div>'; return; }
    $('.mw-list').innerHTML = items.map((it) => {
      const stt = itemStatus(it);
      const fb = it.kind === 'draft1' ? feedbackFor(it.id) : null;
      const neu = fb && isNew(fb);
      const d2 = items.find((x) => x.kind === 'draft2' && x.draft1Id === it.id);
      const tag = it.kind === 'draft2' ? 'Draft 2' : 'Draft 1';
      const body = `<div class="mw-top"><span class="lbl">${sLabel(it.session)} · ${esc(it.topic || '')}</span></div>
        <div class="mw-mid"><b>${tag}</b><span>${when(it.submittedAt || it.queuedAt)} · ${it.words || countWords(it.text)} words</span></div>
        <div class="mw-chips"><span class="st st-${stt}">${stt === 'sent' ? icons.check(12) : ''}${STATUS_TEXT[stt]}</span>
          ${fb ? `<span class="st st-fb">${neu ? '<i class="dot-new" aria-hidden="true"></i>' : ''}Feedback${neu ? ' · mới' : ''}</span>` : ''}
          ${d2 ? '<span class="st st-d2">Draft 2 đã nộp</span>' : ''}</div>`;
      return fb ? `<a class="card mw-item${neu ? ' new' : ''}" href="#/work/${encodeURIComponent(it.id)}" aria-label="${sLabel(it.session)} ${tag} – ${neu ? 'có nhận xét mới' : 'xem nhận xét'}">${body}</a>`
        : `<div class="card mw-item">${body}</div>`;
    }).join('');
  }

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    b.disabled = true;
    if (b.dataset.act === 'send') await flushQueue();
    if (b.dataset.act === 'refresh') {
      await flushQueue();
      const r = await fetchFeedback();
      const info = $('.mw-info');
      info.textContent = r === null ? 'Chưa kết nối được Sheet. Thử lại khi có mạng.' : r.length ? `Có ${r.length} bài đã được cô nhận xét.` : 'Cô chưa nhận xét bài nào.';
      info.hidden = false;
    }
    b.disabled = false;
    render();
  });
  const off = onSync(render);
  render();
  fetchFeedback(); // lặng lẽ hỏi nhận xét mới khi mở My Work
  return { el, cleanup: off };
}

// ---------- Feedback → Draft 2 ----------
/** Tách câu, giữ nguyên khoảng trắng để ghép lại không đổi bài. */
function sentences(text) {
  return String(text).match(/[^.!?]+(?:[.!?]+["”’)]*\s*|$)/g)?.filter((x) => x.length) || [text];
}
/** Vị trí câu được nhận xét trong bài (so khớp bỏ khoảng trắng thừa). */
function locate(text, quote) {
  const q = norm(quote);
  if (!q) return -1;
  const parts = sentences(text);
  let i = parts.findIndex((p) => norm(p) === q);
  if (i < 0) i = parts.findIndex((p) => norm(p).includes(q) || (q.length > 20 && q.includes(norm(p))));
  return i;
}

export function feedbackPage(ctx, route) {
  const el = document.createElement('section');
  el.className = 'screen';
  const fb = feedbackFor(route.id) || feedbackList().find((f) => f.id === route.id);
  const local = findItem(route.id);
  if (!fb) {
    el.innerHTML = `<div class="page"><h1 class="page-title">Feedback</h1><div class="card mw-empty">Chưa có nhận xét cho bài này. <a href="#/work">Quay lại My Work</a></div></div>`;
    return { el };
  }
  markSeen(fb);
  const text = fb.bai_viet || local?.text || '';
  const parts = sentences(text);
  const weakI = locate(text, fb.cau_nhan_xet);
  const goodI = locate(text, fb.cau_khen);
  const color = laneColor(fb.nhanh);
  const lane = fb.nhanh || 'Sentence';
  const d2Key = `draft2:${fb.id}`;
  const done = queue().find((x) => x.kind === 'draft2' && x.draft1Id === fb.id);
  const original = weakI >= 0 ? norm(parts[weakI]) : norm(text);
  let rewrite = load(d2Key, null) ?? (done?.rewrite?.to || original);
  let full = weakI < 0;

  // tô màu đúng phần chữ của câu, khoảng trắng sau câu để ngoài
  const mark = (i, s) => {
    const body = s.replace(/\s+$/, ''), tail = s.slice(body.length);
    if (i === weakI) return `<mark class="hl" style="${laneStyle(color)}" title="${esc(lane)}">${esc(body)}</mark>${esc(tail)}`;
    if (i === goodI) return `<mark class="hl" style="${laneStyle('claim')}" title="Good">${esc(body)}</mark>${esc(tail)}`;
    return esc(s);
  };
  const draftHtml = () => {
    if (full || weakI < 0) return parts.map((s, i) => mark(i, s)).join('');
    const a = Math.max(0, weakI - 1), b = Math.min(parts.length - 1, weakI + 1);
    return `${a > 0 ? '… ' : ''}${parts.slice(a, b + 1).map((s, k) => mark(a + k, s)).join('')}${b < parts.length - 1 ? ' …' : ''}`;
  };
  const draft2 = () => (weakI >= 0 ? parts.map((s, i) => (i === weakI ? rewrite.trim() + (/\s$/.test(s) ? ' ' : '') : s)).join('') : rewrite.trim());

  el.innerHTML = `
    <div class="page fbk">
      <div class="fbk-head"><div class="lbl">My Work · ${sLabel(fb.session)} ·${esc(fb.chu_de || local?.topic || '')}</div>
        <div class="fbk-title"><h1>Feedback → Draft 2</h1><span class="chip-st">${done ? 'Draft 2 · submitted' : 'Draft 1 · marked'}</span></div></div>
      <div class="fbk-cols">
        <div class="fbk-l">
          <div class="card fbk-draft"><span class="lbl">Draft 1</span><p class="d1" lang="en"></p>
            ${weakI < 0 && fb.cau_nhan_xet ? `<p class="fbk-q">Câu cô nhận xét: <i lang="en">${esc(fb.cau_nhan_xet)}</i></p>` : ''}</div>
          <div class="fbk-box">
            <img src="img/comai-face.webp" alt="Ms Mai" width="60" height="60">
            <div class="fbk-txt"><b class="fbk-who">Ms Mai’s feedback</b>
              ${fb.khen ? `<div class="fbk-row"><span class="tagc" style="${laneStyle('claim')}">Good</span><span>${esc(fb.khen)}</span></div>` : ''}
              ${fb.nhan_xet ? `<div class="fbk-row"><span class="tagc" style="${laneStyle(color)}">${esc(lane)}</span><span>${esc(fb.nhan_xet)}</span></div>` : ''}
              ${fb.diem ? `<div class="fbk-row"><span class="tagc" style="${laneStyle('teal')}">Score</span><span>${esc(fb.diem)}</span></div>` : ''}</div>
          </div>
        </div>
        <div class="fbk-r">
          <label for="d2-ta" class="fbk-lbl">${weakI >= 0 ? `Rewrite the ${esc(lane)} sentence` : 'Rewrite your paragraph'}</label>
          <textarea id="d2-ta" class="d2-ta" lang="en" style="${laneStyle(color)}" ${done ? 'readonly' : ''}>${esc(rewrite)}</textarea>
          <p class="fbk-hint">${done ? `Đã nộp bản 2 · <b class="d2-st"></b>` : 'Sửa đúng câu được tô màu, giữ ý của em. Bản 2 = bản 1 với câu này đã viết lại.'}</p>
          <details class="card fbk-prev"><summary>Draft 2 preview</summary><p lang="en" class="d2p"></p></details>
          <div class="fbk-actions">
            <button type="button" class="btn2" data-act="view">${weakI >= 0 ? 'View Draft 1' : 'Hide Draft 1'}</button>
            <button type="button" class="btn grow" data-act="submit2" ${done ? 'disabled' : ''}>Submit Draft 2</button>
          </div>
        </div>
      </div>
    </div>`;
  const $ = (q) => el.querySelector(q);
  const ta = $('#d2-ta');

  function paint() {
    $('.d1').innerHTML = draftHtml();
    $('.d2p').textContent = draft2();
    const btn = $('[data-act="submit2"]');
    if (!done) btn.disabled = !norm(rewrite) || norm(rewrite) === original;
    if (done) { const it = findItem(done.id); const stt = it ? itemStatus(it) : 'pending'; $('.d2-st').textContent = STATUS_TEXT[stt]; }
  }
  ta.addEventListener('input', () => { rewrite = ta.value; save(d2Key, rewrite); paint(); });
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    if (b.dataset.act === 'view') {
      full = !full;
      b.textContent = full ? 'Hide Draft 1' : 'View Draft 1';
      paint();
      $('.fbk-draft').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else if (b.dataset.act === 'submit2') {
      const t = draft2();
      const it = enqueue({
        kind: 'draft2', session: fb.session, topic: fb.chu_de || local?.topic || '', prompt: local?.prompt || '', level: local?.level || '',
        text: t, words: countWords(t), draft1Id: fb.id, rewrite: { from: original, to: norm(rewrite), lane },
        submittedAt: new Date().toISOString(),
      });
      b.disabled = true; ta.readOnly = true;
      $('.chip-st').textContent = 'Draft 2 · submitted';
      $('.fbk-hint').innerHTML = 'Đã nộp bản 2 · <b class="d2-st"></b>';
      await flushQueue();
      const st = itemStatus(findItem(it.id));
      $('.d2-st').textContent = STATUS_TEXT[st] + (st === 'sent' ? ' ✓' : st === 'pending' ? ' – sẽ gửi khi có mạng' : '');
    }
  });
  paint();
  return { el };
}

export function work(ctx, route) { return route?.id ? feedbackPage(ctx, route) : workList(); }
