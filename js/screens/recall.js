// Chặng 1 · Recall (mẫu M3-NhoNhanh): 5 câu, đáp án xáo mỗi lần hiển thị,
// chọn xong hiện ngay đúng/sai + giải thích + biểu cảm nhân vật, nút Next.
// Câu sửa lỗi (kind "fix-error") không có lựa chọn: bấm Check xem đáp án rồi tự đánh dấu.
import { emo, EMO } from '../data.js';
import { saveProgress } from '../progress.js';
import { href } from '../router.js';
import { icons } from '../icons.js';
import { sfx } from '../sfx.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const norm = (t) => String(t ?? '').toLowerCase().replace(/[^a-z0-9s]/g, ' ').replace(/s+/g, ' ').trim();
const blank = (en, fill, wrong = false) => esc(en).replace(/_{2,}/, `<span class="blank${fill ? ' filled' : ''}${wrong ? ' wrong' : ''}">${fill ? esc(fill) : '&nbsp;'}</span>`);

export function mountRecall(s, { n, data, p }) {
  const items = data.recall || [];
  const R = p.recall;
  const review = n > 1 ? `Review S${n - 1}` : 'Warm-up';
  const save = () => saveProgress(data.session.toLowerCase(), p);

  // ảnh cảm xúc: tải trước để hiện ngay khi trả lời
  for (const k of [EMO.ok, EMO.bad, EMO.done]) { const im = new Image(); im.src = emo(n, k); }

  function show() {
    if (R.done) return summary();
    const i = Math.min(R.i, items.length - 1);
    const q = items[i];
    const a = R.ans[q.id];
    s.setTitle(`Quick Recall · ${i + 1}/${items.length}`);
    const isFix = q.kind === 'fix-error' || q.type === 'fix';
    const ask = isFix ? 'Tìm và sửa lỗi trong câu.' : 'Chọn đáp án đúng để hoàn thành câu.';

    s.body.innerHTML = `
      <div class="recall">
        <div class="guide">
          <img class="guide-pic" src="${emo(n, a ? (a.ok ? EMO.ok : EMO.bad) : EMO.idle)}" alt="" width="84" height="110">
          <p class="guide-say"><b>${review}</b> · ${ask}</p>
        </div>
        <div class="card q-card" lang="en">${isFix ? `<span class="fix-tag">Find the mistake</span>` : ''}${blank(q.en, !isFix && a ? a.pick : '', !!a && !a.ok)}</div>
        <div class="q-area"></div>
      </div>`;
    const area = s.body.querySelector('.q-area');

    if (!isFix) {
      const opts = shuffle(q.options);
      area.innerHTML = `<div class="opts" role="group" aria-label="Options">${opts.map((o, k) => `
        <button type="button" class="opt" data-v="${esc(o)}"><span class="key">${'ABCD'[k]}</span><span class="txt" lang="en">${esc(o)}</span><span class="mark" aria-hidden="true"></span></button>`).join('')}</div>`;
      const tried = (R.first ||= {})[q.id];
      if (tried && !a) markTried(tried);
      area.addEventListener('click', (e) => {
        const b = e.target.closest('.opt');
        if (!b || b.disabled || R.ans[q.id]) return;
        const right = b.dataset.v === q.answer;
        // Sai lần đầu: cho thêm MỘT cơ hội, chưa hiện đáp án
        if (!right && !R.first[q.id]) {
          R.first[q.id] = b.dataset.v; save(); sfx('bad');
          markTried(b.dataset.v);
          return;
        }
        R.ans[q.id] = { pick: b.dataset.v, ok: right, second: !!R.first[q.id] };
        sfx(right ? 'ok' : 'bad');
        save();
        paintChoice(q); feedback(q); swapFace(q);
        const filled = s.body.querySelector('.blank');
        if (filled) { filled.classList.add('filled'); filled.classList.toggle('wrong', !right); filled.textContent = b.dataset.v; }
      });
      if (a) paintChoice(q);
    } else {
      area.innerHTML = `
        <label class="lbl" for="fix-in">Your correction <span class="opt-note">(không bắt buộc)</span></label>
        <input id="fix-in" class="fix-in" lang="en" autocomplete="off" autocapitalize="sentences" spellcheck="false"
          placeholder="Gõ câu đã sửa…" value="${esc(a?.typed || R.typed?.[q.id] || '')}">
        <div class="reveal" ${a || R.revealed?.[q.id] ? '' : 'hidden'}>
          <div class="ans"><span class="lbl">Answer</span> <b lang="en">${esc(q.answer)}</b></div>
          <div class="self" ${a ? 'hidden' : ''}>
            <span>Em sửa đúng chưa?</span>
            <button type="button" class="btn2 sm" data-self="1">${icons.check(16)} I got it</button>
            <button type="button" class="btn2 sm" data-self="0">Not yet</button>
          </div>
        </div>`;
      const inp = area.querySelector('#fix-in');
      inp.addEventListener('input', () => { (R.typed ||= {})[q.id] = inp.value; save(); });
      area.addEventListener('click', (e) => {
        const b = e.target.closest('[data-self]');
        if (!b || R.ans[q.id]) return;
        R.ans[q.id] = { pick: inp.value, ok: b.dataset.self === '1', typed: inp.value };
        sfx(R.ans[q.id].ok ? 'ok' : 'bad');
        save();
        area.querySelector('.self').hidden = true;
        feedback(q); swapFace(q);
      });
    }

    if (a) feedback(q);
    else if (isFix && R.revealed?.[q.id]) foot(`<span class="hint">Tự đánh dấu bên trên rồi đi tiếp.</span>`);
    else if (isFix) {
      foot(`${R.retry?.[q.id] ? `<span class="hint retry">Chưa khớp. Đọc lại và sửa thêm một lần nữa nhé!</span>` : ''}<button type="button" class="btn grow" data-act="reveal">Check</button>`);
    } else foot(R.first?.[q.id] ? `<span class="hint retry">Chưa đúng. Thử lại một lần nữa nhé!</span>` : `<span class="hint">Chạm một đáp án.</span>`);
  }

  function markTried(v) {
    for (const b of s.body.querySelectorAll('.opt')) {
      if (b.dataset.v !== v) continue;
      b.disabled = true; b.classList.add('wrong', 'tried');
      b.querySelector('.mark').innerHTML = icons.close(16);
    }
    foot(`<span class="hint retry">Chưa đúng. Thử lại một lần nữa nhé!</span>`);
  }

  function paintChoice(q) {
    const a = R.ans[q.id];
    for (const b of s.body.querySelectorAll('.opt')) {
      b.disabled = true;
      const right = b.dataset.v === q.answer, mine = b.dataset.v === a.pick;
      b.classList.toggle('right', right);
      b.classList.toggle('wrong', mine && !right);
      b.querySelector('.mark').innerHTML = right ? icons.check(18) : mine ? icons.close(16) : '';
      b.setAttribute('aria-label', `${b.dataset.v}${right ? ' – correct answer' : mine ? ' – your answer, not correct' : ''}`);
    }
  }

  function swapFace(q) {
    const img = s.body.querySelector('.guide-pic');
    if (img) img.src = emo(n, R.ans[q.id].ok ? EMO.ok : EMO.bad);
  }

  function feedback(q) {
    const a = R.ans[q.id];
    const last = R.i >= items.length - 1;
    const isFix = q.kind === 'fix-error' || q.type === 'fix';
    s.foot.classList.toggle('fb-ok', a.ok);
    s.foot.classList.toggle('fb-bad', !a.ok);
    foot(`
      <div class="fb" role="status">
        <img class="fb-face" src="${emo(n, a.ok ? EMO.ok : EMO.bad)}" alt="" width="46" height="46">
        <div class="fb-txt">
          <div class="fb-title">${a.ok ? 'Correct!' : 'Not quite'}</div>
          ${!a.ok && !isFix ? `<div class="fb-ans">Đáp án: <b lang="en">${esc(q.answer)}</b></div>` : ''}
          <div class="fb-why">${esc(q.explainVi)}</div>
        </div>
      </div>
      <button type="button" class="btn grow ${a.ok ? 'btn-ok' : ''}" data-act="next">${last ? 'Finish' : 'Next'}</button>`);
  }

  function foot(html) {
    if (!html.includes('class="fb"')) s.foot.classList.remove('fb-ok', 'fb-bad');
    s.footIn.innerHTML = html;
  }

  function summary() {
    const ok = items.filter((q) => R.ans[q.id]?.ok).length;
    s.setTitle('Quick Recall · Done');
    s.foot.classList.remove('fb-ok', 'fb-bad');
    s.body.innerHTML = `
      <div class="recall">
        <div class="guide">
          <img class="guide-pic" src="${emo(n, EMO.done)}" alt="" width="84" height="110">
          <p class="guide-say"><b>${ok} / ${items.length}</b> câu đúng. ${ok === items.length ? 'Tuyệt vời!' : 'Xem lại câu sai rồi sang Sentences nhé.'}</p>
        </div>
        <ol class="sum">${items.map((q) => `<li class="${R.ans[q.id]?.ok ? 'ok' : 'bad'}"><span class="m">${R.ans[q.id]?.ok ? icons.check(14) : icons.close(12)}</span><span lang="en">${blank(q.en, q.type === 'fix' ? '' : q.answer)}</span>${q.type === 'fix' ? `<span class="sum-ans">Sửa: <b lang="en">${esc(q.answer)}</b></span>` : ''}</li>`).join('')}</ol>
      </div>`;
    foot(`<button type="button" class="btn2" data-act="again">Again</button><a class="btn grow" href="${href.stage(n, 1)}">Sentences</a>`);
  }

  s.footIn.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'reveal') {
      const q = items[R.i];
      const typed = s.body.querySelector('#fix-in')?.value || '';
      if (norm(typed) && norm(typed) === norm(q.answer)) {
        R.ans[q.id] = { pick: typed, ok: true, typed, second: !!R.retry?.[q.id] };
        (R.revealed ||= {})[q.id] = true; save(); sfx('ok');
        const rv = s.body.querySelector('.reveal'); rv.hidden = false; rv.querySelector('.self').hidden = true;
        feedback(q); swapFace(q);
        return;
      }
      if (!(R.retry ||= {})[q.id]) { // chưa khớp lần đầu: thêm một cơ hội
        R.retry[q.id] = true; save(); sfx('bad');
        foot(`<span class="hint retry">Chưa khớp. Đọc lại và sửa thêm một lần nữa nhé!</span><button type="button" class="btn grow" data-act="reveal">Check</button>`);
        s.body.querySelector('#fix-in')?.focus();
        return;
      }
      (R.revealed ||= {})[q.id] = true; save();
      s.body.querySelector('.reveal').hidden = false;
      foot(`<span class="hint">Tự đánh dấu bên trên rồi đi tiếp.</span>`);
      s.body.querySelector('.reveal').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else if (act === 'next') {
      if (R.i >= items.length - 1) { R.done = true; save(); sfx('done'); location.hash = href.stage(n, 1); return; }
      R.i++; save(); show();
      s.body.scrollTop = 0;
    } else if (act === 'again') {
      R.i = 0; R.ans = {}; R.revealed = {}; R.typed = {}; R.first = {}; R.retry = {}; R.done = false; save(); show();
    }
  });

  show();
}
