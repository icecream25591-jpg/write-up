// S22 · Chặng 3 «Phân tích đề» (thay cho Idea Workshop): học sinh điền «năm dòng» cho một đề mẫu
// (dạng đề · câu hỏi lõi · từ giới hạn · quan điểm + lý do · việc của từng thân bài), rồi mới xem ví dụ của từng dòng.
// Điền đủ 5 dòng → xong chặng (p.ideas.done) → sang Write (thi thử).
import { saveProgress, saveLater, flush } from '../progress.js';
import { href } from '../router.js';
import { sfx } from '../sfx.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function mountAnalysis(s, { n, data, p }) {
  const A = data.analysis;
  const key = data.session.toLowerCase();
  const st = (p.ideas ||= {});
  st.lines ||= {}; st.shown ||= {};
  const filled = (i) => (st.lines[i] || '').trim().length >= 2;

  s.setTitle('Five lines');
  s.body.innerHTML = `
    <div class="analysis">
      <p class="an-intro">${esc(A.introVi || '')}</p>
      <div class="card an-prompt"><span class="lbl">Đề mẫu</span><p lang="en">${esc(A.prompt)}</p></div>
      <ol class="an-lines">${A.lines.map((l, i) => `
        <li class="card an-row" data-i="${i}">
          <label for="an-${i}"><b>${esc(l.label)}</b><span class="an-what">${esc(l.whatVi)}</span></label>
          <textarea id="an-${i}" rows="2" lang="en" spellcheck="true" placeholder="Em ghi…">${esc(st.lines[i] || '')}</textarea>
          <div class="an-ex" ${st.shown[i] ? '' : 'hidden'}><span class="lbl">Ví dụ cho đề mẫu</span> <span lang="en">${esc(l.example)}</span></div>
          <button type="button" class="btn2 sm an-show" data-show="${i}" ${st.shown[i] ? 'hidden' : ''}>Xem ví dụ</button>
        </li>`).join('')}</ol>
    </div>`;

  function renderRow(i) {
    const row = s.body.querySelector(`.an-row[data-i="${i}"]`);
    const b = row.querySelector('.an-show');
    b.disabled = !filled(i);
    b.title = filled(i) ? '' : 'Ghi dòng của em trước, rồi mới xem ví dụ';
  }
  function renderFoot() {
    const k = A.lines.filter((_, i) => filled(i)).length;
    st.done = k === A.lines.length;
    s.footIn.innerHTML = st.done
      ? `<span class="hint ok-hint">Đủ năm dòng. Vào thi thử, em sẽ ghi năm dòng cho đề thật trước khi viết.</span>
         <a class="btn btn-ok" href="${href.stage(n, 3)}">Write</a>`
      : `<span class="hint">Ghi đủ năm dòng (${k} / ${A.lines.length}). Ghi xong một dòng thì bấm «Xem ví dụ» để so.</span>
         <button type="button" class="btn" disabled aria-disabled="true">Write</button>`;
  }

  s.body.addEventListener('input', (e) => {
    const ta = e.target.closest('textarea'); if (!ta) return;
    const i = Number(ta.closest('.an-row').dataset.i);
    const was = st.done;
    st.lines[i] = ta.value;
    saveLater(key, p, 400);
    renderRow(i); renderFoot();
    if (!was && st.done) { flush(key, p); sfx('ok'); }
  });
  s.body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-show]'); if (!b || b.disabled) return;
    const i = Number(b.dataset.show);
    st.shown[i] = true; saveProgress(key, p);
    b.hidden = true; s.body.querySelector(`.an-row[data-i="${i}"] .an-ex`).hidden = false;
    sfx('tap');
  });
  A.lines.forEach((_, i) => renderRow(i));
  renderFoot();
  return { destroy: () => flush(key, p) };
}
