// Bảng theo dõi tiến độ, ghi nhận xét, xuất bài nộp / nhập nhận xét (Giai đoạn 5). Dùng chung cho giáo viên (lớp của mình) và quản trị (mọi lớp).
// Tiết kiệm lượt đọc: bảng chỉ đọc tiến độ từng học sinh (1 lượt mỗi em); bài nộp chỉ đọc khi bấm «Tải bài nộp» hoặc mở một học sinh.
import * as S from './staffdata.js';
import * as X from './exchange.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const when = (ts) => { try { return (ts.toDate ? ts.toDate() : new Date(ts)).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const sLabel = (s) => `S${Number(String(s || '').replace(/\D/g, '')) || ''}`;
const STAGES = [['recall', 'Recall'], ['sentences', 'Sentences'], ['ideas', 'Ideas'], ['write', 'Write & Check'], ['reward', 'Reward']];
// «Em đã xem» so với lần cô lưu nhận xét gần nhất: cô sửa lại (hoặc nhập tệp ghi đè) sau khi em xem thì bản mới CHƯA được xem.
const fbLabel = (x) => { const s = X.fbStatus(x); return s.code === 'stale' ? `<b>${esc(s.label)}</b>` : esc(s.label); };
const needsSeen = (x) => ['unseen', 'stale'].includes(X.fbStatus(x).code);
const stageDone = (p, k) => !!(k === 'recall' ? p?.recall?.done : k === 'sentences' ? p?.sentences?.done : k === 'ideas' ? p?.ideas?.done : k === 'write' ? p?.write?.submitted : p?.reward?.at);
/** Tách câu, giữ nguyên khoảng trắng (cùng cách tách với màn Feedback của học sinh). */
const sentences = (text) => String(text).match(/[^.!?]+(?:[.!?]+["”’)]*\s*|$)/g)?.filter((x) => x.length) || [String(text)];

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** trackerPanel(ctx, { classes, students, alive, dialog, errMessage }) — students: học sinh đã duyệt (có classId). */
export function trackerPanel(ctx, { classes, students, alive, dialog, errMessage }) {
  const { h, panel, say, run } = ctx;
  const byId = new Map(students.map((s) => [s.id, s]));
  const sorted = classes.slice().sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  let cur = sorted[0]?.id || null;
  let prog = new Map(), subs = null;                 // subs: null = chưa tải
  const clsOf = () => classes.find((c) => c.id === cur);
  const stuOf = () => students.filter((s) => s.classId === cur).sort((a, b) => String(a.nickname).localeCompare(String(b.nickname), 'vi'));

  const draw = () => {
    if (!alive()) return;
    const stu = stuOf();
    const dot = (p, k) => `<i class="tk-d${stageDone(p, k) ? ' on' : ''}" aria-hidden="true"></i>`;
    const head = Array.from({ length: 22 }, (_, i) => `<th scope="col">S${i + 1}</th>`).join('');
    const rows = stu.map((s) => {
      const p = prog.get(s.id), unreadable = prog.get(s.id) === undefined && prog.has(s.id);
      const doneSessions = p ? Object.values(p.sessions || {}).filter((x) => x?.reward?.at).length : 0;
      const cells = Array.from({ length: 22 }, (_, i) => {
        const sid = 's' + String(i + 1).padStart(2, '0'), sp = p?.sessions?.[sid];
        const state = STAGES.map(([k, lbl]) => `${lbl}: ${stageDone(sp, k) ? 'xong' : 'chưa'}`).join(', ');
        const n = STAGES.filter(([k]) => stageDone(sp, k)).length;
        return `<td><button type="button" class="tk-cell${n === 5 ? ' full' : n ? ' part' : ''}" data-act="cell" data-sid="${esc(s.id)}" data-s="${sid}" aria-label="${esc(s.nickname)} · S${i + 1}: ${state}" title="S${i + 1} — ${n}/5 chặng">${sp ? STAGES.map(([k]) => dot(sp, k)).join('') : '<span class="tk-none">–</span>'}</button></td>`;
      }).join('');
      const nSub = subs ? subs.filter((x) => x.studentId === s.id).length : null, nWait = subs ? subs.filter((x) => x.studentId === s.id && !x.feedback).length : null;
      const nNew = subs ? subs.filter((x) => x.studentId === s.id && needsSeen(x)).length : 0;
      return `<tr data-sid="${esc(s.id)}"><th scope="row"><button type="button" class="tk-who" data-act="student" data-sid="${esc(s.id)}"><b>${esc(s.nickname)}</b><span>${esc(s.realName)}</span></button></th>
        <td class="tk-sum" data-label="Xong">${unreadable ? '?' : p ? doneSessions : 0}/22${nSub != null ? `<br><small>${nSub} bài${nWait ? ` · <b>${nWait} chờ</b>` : ''}${nNew ? ` · <b>${nNew} chưa xem</b>` : ''}</small>` : ''}</td>${cells}</tr>`;
    }).join('');
    const total = subs ? subs.length : null, wait = subs ? subs.filter((x) => !x.feedback) : [], unseen = subs ? subs.filter(needsSeen).length : 0, stale = subs ? subs.filter((x) => X.fbStatus(x).code === 'stale').length : 0;
    panel.innerHTML = `
      <section class="st-sec" aria-labelledby="tk-h"><h2 id="tk-h">Bảng theo dõi tiến độ</h2>
        ${sorted.length ? `<label for="tk-class">Lớp</label><select id="tk-class">${sorted.map((c) => `<option value="${esc(c.id)}"${c.id === cur ? ' selected' : ''}>${esc(c.name)} (${esc(c.schoolYear)})</option>`).join('')}</select>` : '<p class="st-empty">Chưa có lớp nào.</p>'}
        ${cur ? `<p class="st-meta">${stu.length} học sinh đang học. Mỗi ô là một trạm, năm chấm là năm chặng: Recall · Sentences · Ideas · Write &amp; Check (đã nộp) · Reward. Bấm một ô hoặc tên em để xem bài và ghi nhận xét. <button type="button" class="g-link" data-act="reload-prog">Đọc lại tiến độ</button></p>
        ${stu.length ? `<div class="tk-scroll" role="region" aria-label="Bảng tiến độ của lớp, cuộn ngang để xem đủ 22 trạm" tabindex="0"><table class="tk"><thead><tr><th scope="col">Học sinh</th><th scope="col">Xong</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="st-empty">Lớp chưa có học sinh được duyệt.</p>'}` : ''}
      </section>
      ${cur ? `<section class="st-sec" aria-labelledby="tk-s"><h2 id="tk-s">Bài nộp và nhận xét</h2>
        ${subs === null ? '<p class="st-meta">Bấm «Tải bài nộp» để đọc bài của cả lớp (mỗi bài tốn một lượt đọc). Cần tải trước khi xuất hoặc nhập nhận xét.</p>' : `<p class="st-meta"><b>${total}</b> bài nộp · <b>${wait.length}</b> bài chờ nhận xét · ${total - wait.length} bài đã có nhận xét · <b>${unseen}</b> nhận xét em chưa xem${stale ? ` (trong đó <b>${stale}</b> bản mới sửa sau khi em đã xem bản cũ)` : ''}.</p>`}
        <div class="st-acts wrap">
          <button type="button" class="btn2 sm" data-act="load-subs">${subs === null ? 'Tải bài nộp' : 'Tải lại bài nộp'}</button>
          <button type="button" class="btn2 sm" data-act="export-json" ${subs === null ? 'disabled' : ''}>Xuất bài nộp (JSON)</button>
          <button type="button" class="btn2 sm" data-act="export-csv" ${subs === null ? 'disabled' : ''}>Xuất bài nộp (CSV)</button>
          <label class="btn2 sm tk-file" ${subs === null ? 'aria-disabled="true"' : ''}>Nhập nhận xét…<input type="file" accept=".json,.csv,application/json,text/csv" data-act="import" ${subs === null ? 'disabled' : ''}></label>
        </div>
        ${subs && wait.length ? `<h3 class="tk-h3">Bài chờ nhận xét</h3>${wait.slice().sort((a, b) => (a.submittedAt?.toMillis?.() || 0) - (b.submittedAt?.toMillis?.() || 0)).slice(0, 40).map((x) => `<div class="st-row slim" data-subid="${esc(x.id)}"><div class="st-who"><b>${esc(byId.get(x.studentId)?.nickname || '?')}</b><span>${sLabel(x.session)} · Draft ${x.draft === 2 ? 2 : 1} · ${esc(when(x.submittedAt))} · ${x.words || 0} từ</span></div><div class="st-acts"><button type="button" class="btn2 sm" data-act="comment" data-subid="${esc(x.id)}">Nhận xét</button></div></div>`).join('')}${wait.length > 40 ? `<p class="st-meta">…và ${wait.length - 40} bài nữa.</p>` : ''}` : ''}
      </section>` : ''}`;
  };

  const loadProg = async () => {
    const ids = stuOf().map((s) => s.id);
    say(`Đang đọc tiến độ của ${ids.length} học sinh…`);
    prog = await S.loadProgressOf(h, ids);
    say('');
    draw();
  };
  const loadSubs = async () => {
    const ids = stuOf().map((s) => s.id);
    say(`Đang đọc bài nộp của ${ids.length} học sinh…`);
    subs = await S.loadSubmissionsOf(h, ids);
    say(`Đã tải ${subs.length} bài nộp.`);
    draw();
  };
  const ensureSubs = async () => { if (subs === null) await loadSubs(); };

  // Giá trị biểu mẫu → nhận xét lưu lên máy chủ. Ô của mẫu đang ẩn bị bỏ (không lưu nhầm chữ cũ).
  const valuesToFb = (v) => {
    const r = { ...v }; const t = v.mau === 'doan' ? 'doan' : 'cau';
    if (t === 'doan') r.cau_sua = ''; else for (const c of X.CRITERIA) r[c.col] = '';
    return X.rowToFb({ ...r, mau: t });
  };
  // ---------- ghi nhận xét cho một bài
  async function commentDialog(sub, opts = {}) {
    const stu = byId.get(sub.studentId), fb = sub.feedback || {};
    const sents = sentences(sub.text);
    const tpl0 = X.templateOf(sub);
    const area = (id, label, val, ph, max, rows = 2) => `<label for="${id}">${label}</label><textarea id="${id}" name="${id}" rows="${rows}" maxlength="${max}" placeholder="${esc(ph || '')}">${esc(val || '')}</textarea>`;
    const row = (id, label, val, ph, area) => `<label for="${id}">${label}</label>${area ? `<textarea id="${id}" name="${id}" rows="3" maxlength="${X.LIMITS.nhan_xet}" placeholder="${esc(ph || '')}">${esc(val)}</textarea>` : `<input id="${id}" name="${id}" maxlength="${X.LIMITS.cau}" value="${esc(val)}" placeholder="${esc(ph || '')}">`}`;
    const r = await dialog({
      title: `Nhận xét · ${stu?.nickname || '?'} · ${sLabel(sub.session)} · Draft ${sub.draft === 2 ? 2 : 1}`, confirmText: 'Lưu nhận xét', wide: true,
      body: `<p class="st-meta">${esc(stu?.realName || '')} · nộp ${esc(when(sub.submittedAt))} · ${sub.words || 0} từ${sub.feedback ? ` · ${fbLabel(sub)}` : ''}</p>
        ${sub.prompt ? `<p class="tk-prompt"><b>Đề:</b> ${esc(sub.prompt)}</p>` : ''}
        <div class="tk-essay" lang="en" aria-label="Bài viết của em">${sents.map((t, i) => `<button type="button" class="tk-sent" data-i="${i}">${esc(t.trim())}</button> `).join('')}</div>
        <fieldset class="tk-tpl"><legend>Mẫu nhận xét</legend>
          ${Object.entries(X.TEMPLATES).map(([k, t]) => `<label><input type="radio" name="mau" value="${k}"${k === tpl0 ? ' checked' : ''}> ${esc(t)}</label>`).join(' ')}</fieldset>
        <fieldset class="tk-pick"><legend>Bấm một câu trong bài để điền vào ô:</legend>
          <label><input type="radio" name="mode" value="cau_nhan_xet" checked> Câu cần sửa</label> <label><input type="radio" name="mode" value="cau_khen"> Câu khen</label></fieldset>
        ${row('cau_nhan_xet', 'Câu được nhận xét', fb.sentence, 'Câu cần sửa (bấm trong bài ở trên)')}
        <label for="nhanh">Nhánh</label><select id="nhanh" name="nhanh"><option value="">(không chọn)</option>${X.BRANCHES.map((b) => `<option${fb.branch === b ? ' selected' : ''}>${esc(b)}</option>`).join('')}${fb.branch && !X.BRANCHES.includes(fb.branch) ? `<option selected>${esc(fb.branch)}</option>` : ''}</select>
        <div class="tk-grp" data-grp="doan"${tpl0 === 'doan' ? '' : ' hidden'}>
          <p class="st-meta">Chỉ điền tiêu chí có góp ý cụ thể. Chữ trong dấu huyền ngược (\`I don't\`) hiện thành chip cho em.</p>
          ${X.CRITERIA.map((c) => area(c.col, `<span lang="en">${esc(c.en)}</span> · ${esc(c.vi)}`, fb.tc?.[c.key], c.vi === 'Bám đề' ? 'Em có trả lời đúng đề, đủ ý chưa?' : 'Một góp ý cụ thể, dẫn câu hoặc cụm từ của em', X.LIMITS.tc, 3)).join('')}
        </div>
        <div class="tk-grp" data-grp="cau"${tpl0 === 'cau' ? '' : ' hidden'}>
          ${area('cau_sua', 'Câu sửa gợi ý', fb.fix, 'Một câu mẫu tiếng Anh (có thể dùng dấu huyền ngược cho chip)', X.LIMITS.cau_sua, 2)}
        </div>
        ${row('nhan_xet', 'Nhận xét chung', fb.comment, 'Việc cần sửa và gợi ý (tiếng Việt, ngắn)', true)}
        ${area('uu_tien', 'Ưu tiên cho Draft 2', fb.priority, 'Một việc em làm đầu tiên khi viết lại (tối đa hai việc)', X.LIMITS.uu_tien, 2)}
        ${row('cau_khen', 'Câu khen', fb.praiseSentence, 'Câu làm tốt (bấm trong bài ở trên)')}
        ${row('khen', 'Lời khen', fb.praise, 'Điểm mạnh của bài', true)}
        <label for="diem">Điểm</label><input id="diem" name="diem" maxlength="${X.LIMITS.diem}" value="${esc(fb.score == null ? '' : fb.score)}" placeholder="Ví dụ: 8 (không bắt buộc)">
        ${sub.feedback ? '<p class="st-note">Bài đã có nhận xét: lưu sẽ ghi đè và em thấy bản mới.</p>' : ''}`,
      onOpen: (wrap) => { wrap.querySelectorAll('[name=mau]').forEach((r) => r.addEventListener('change', () => wrap.querySelectorAll('.tk-grp').forEach((g) => { g.hidden = g.dataset.grp !== wrap.querySelector('[name=mau]:checked').value; }))); wrap.querySelector('.tk-essay').addEventListener('click', (e) => {
        const b = e.target.closest('.tk-sent'); if (!b) return;
        const mode = wrap.querySelector('[name=mode]:checked').value;
        wrap.querySelector('#' + mode).value = b.textContent.trim().slice(0, X.LIMITS.cau);
        wrap.querySelectorAll('.tk-sent.on-' + mode).forEach((x) => x.classList.remove('on-' + mode));
        b.classList.add('on-' + mode);
      }); },
      validate: (v) => X.checkFeedback(valuesToFb(v)),
    });
    if (!r.ok) return false;
    const f = valuesToFb(r.values);
    await S.saveFeedback(h, sub.id, f);
    sub.feedback = f; sub.feedbackAt = { toMillis: () => Date.now() };
    return true;
  }

  // ---------- xem một học sinh: tiến độ từng trạm + bài nộp
  async function studentDialog(sid, focus) {
    const stu = byId.get(sid); if (!stu) return;
    say('Đang đọc bài nộp của em…');
    let list;
    try { list = subs ? subs.filter((x) => x.studentId === sid) : await S.loadSubmissionsOf(h, [sid]); } catch (e) { say(errMessage(e), true); return; }
    say('');
    if (subs === null) { /* chỉ đọc riêng em này: chưa coi là đã tải cả lớp */ }
    const p = prog.get(sid);
    const sess = Object.entries(p?.sessions || {}).sort(([a], [b]) => a.localeCompare(b));
    const rowsHtml = list.map((x) => `<div class="st-row slim" data-subid="${esc(x.id)}"><div class="st-who"><b>${sLabel(x.session)} · Draft ${x.draft === 2 ? 2 : 1}</b><span>${esc(when(x.submittedAt))} · ${x.words || 0} từ · ${x.feedback ? fbLabel(x) : '<b>chờ nhận xét</b>'}</span></div><div class="st-acts"><button type="button" class="btn2 sm" data-sub="${esc(x.id)}">${x.feedback ? 'Sửa nhận xét' : 'Nhận xét'}</button></div></div>`).join('');
    const r = await dialog({
      title: `${stu.nickname} · ${stu.realName}`, confirmText: 'Đóng', cancelText: 'Đóng', wide: true,
      body: `<h3 class="tk-h3">Tiến độ</h3>${sess.length ? `<ul class="tk-prog">${sess.map(([k, v]) => `<li${focus === k ? ' class="focus"' : ''}><b>S${Number(k.slice(1))}</b> ${STAGES.map(([sk, lbl]) => `<span class="tk-chip${stageDone(v, sk) ? ' on' : ''}">${lbl}</span>`).join('')}</li>`).join('')}</ul>` : '<p class="st-empty">Chưa có tiến độ trên máy chủ.</p>'}
        <h3 class="tk-h3">Bài nộp (${list.length})</h3>${list.length ? rowsHtml : '<p class="st-empty">Em chưa nộp bài nào.</p>'}`,
      onOpen: (wrap) => wrap.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-sub]'); if (!b) return;
        const sub = list.find((x) => x.id === b.dataset.sub);
        wrap.hidden = true;                                           // ẩn hộp này trong lúc mở hộp nhận xét
        let saved = false; try { saved = await commentDialog(sub); } catch (er) { say(errMessage(er), true); }
        wrap.hidden = false;
        if (saved) { say(`Đã lưu nhận xét cho ${stu.nickname}.`); b.textContent = 'Sửa nhận xét'; b.closest('.st-row').querySelector('.st-who span').innerHTML = `${esc(when(sub.submittedAt))} · ${sub.words || 0} từ · ${fbLabel(sub)}`; if (subs) { const i = subs.findIndex((x) => x.id === sub.id); if (i >= 0) subs[i] = sub; } draw(); }
      }),
    });
    void r;
  }

  // ---------- nhập nhận xét từ tệp
  async function importFile(file) {
    let parsed;
    try { parsed = X.parseImport(await file.text(), { knownIds: new Set((subs || []).map((x) => x.id)) }); }
    catch (e) { say(e.message, true); return; }
    const bySub = new Map(subs.map((x) => [x.id, x]));
    const { items, rejected } = parsed;
    if (!items.length) { say(`Không có nhận xét hợp lệ trong tệp (${rejected.length} dòng bị loại: ${rejected.slice(0, 3).map((x) => `dòng ${x.row} ${x.reason}`).join('; ')}).`, true); return; }
    const rej = rejected.length ? `<details class="tk-rej"><summary>${rejected.length} dòng bị loại</summary><ul>${rejected.map((x) => `<li>Dòng ${x.row}${x.id ? ` (${esc(x.id)})` : ''}: ${esc(x.reason)}</li>`).join('')}</ul></details>` : '';
    const r = await dialog({
      title: `Duyệt ${items.length} nhận xét từ «${file.name}»`, confirmText: 'Lưu các nhận xét đã duyệt', wide: true,
      body: `<p class="st-meta">Xem từng bài, sửa nếu cần, tick «Duyệt» rồi mới lưu. Bài đã có nhận xét mặc định KHÔNG tick (lưu sẽ ghi đè).</p>${rej}
        ${items.map((it, n) => { const sub = bySub.get(it.id), stu = byId.get(sub.studentId), has = !!sub.feedback; return `<fieldset class="tk-imp" data-id="${esc(it.id)}"><legend><label><input type="checkbox" name="ok-${n}" ${has ? '' : 'checked'}> Duyệt · <b>${esc(stu?.nickname || '?')}</b> · ${sLabel(sub.session)} · Draft ${sub.draft === 2 ? 2 : 1}</label></legend>
          <p class="tk-snip" lang="en">${esc(String(sub.text).slice(0, 160))}${String(sub.text).length > 160 ? '…' : ''}</p>
          ${has ? `<p class="st-note">Đã có nhận xét: «${esc(String(sub.feedback.comment || sub.feedback.praise || '').slice(0, 80))}». Lưu sẽ ghi đè.</p>` : ''}
          <p class="st-meta">${it.fb.tpl ? `Mẫu: ${esc(X.TEMPLATES[it.fb.tpl] || it.fb.tpl)} · ` : ''}${it.fb.sentence ? `Câu: <i lang="en">${esc(it.fb.sentence)}</i> · ` : ''}${it.fb.branch ? `Nhánh: ${esc(it.fb.branch)} · ` : ''}${it.fb.score != null ? `Điểm: ${esc(it.fb.score)}` : ''}</p>
          <label for="cm-${n}">Nhận xét</label><textarea id="cm-${n}" name="cm-${n}" rows="3" maxlength="${X.LIMITS.nhan_xet}">${esc(it.fb.comment || '')}</textarea>
          ${it.fb.praise ? `<label for="kh-${n}">Lời khen</label><textarea id="kh-${n}" name="kh-${n}" rows="2" maxlength="${X.LIMITS.khen}">${esc(it.fb.praise)}</textarea>` : ''}
          ${X.CRITERIA.filter((c) => it.fb.tc?.[c.key]).map((c) => `<label for="${c.col}-${n}">${esc(c.en)} · ${esc(c.vi)}</label><textarea id="${c.col}-${n}" name="${c.col}-${n}" rows="2" maxlength="${X.LIMITS.tc}">${esc(it.fb.tc[c.key])}</textarea>`).join('')}
          ${it.fb.fix ? `<label for="cs-${n}">Câu sửa gợi ý</label><textarea id="cs-${n}" name="cs-${n}" rows="2" maxlength="${X.LIMITS.cau_sua}">${esc(it.fb.fix)}</textarea>` : ''}
          ${it.fb.priority ? `<label for="up-${n}">Ưu tiên cho Draft 2</label><textarea id="up-${n}" name="up-${n}" rows="2" maxlength="${X.LIMITS.uu_tien}">${esc(it.fb.priority)}</textarea>` : ''}</fieldset>`; }).join('')}`,
      validate: (v) => (items.some((_, n) => v[`ok-${n}`]) ? '' : 'Hãy tick «Duyệt» ít nhất một bài, hoặc bấm Huỷ.'),
    });
    if (!r.ok) { say('Đã huỷ, chưa lưu nhận xét nào.'); return; }
    let okN = 0; const fails = [];
    say('Đang lưu nhận xét…');
    for (const [n, it] of items.entries()) {
      if (!r.values[`ok-${n}`]) continue;
      const val = (k) => String(r.values[`${k}-${n}`] ?? '').trim() || undefined;
      const tc = it.fb.tc ? Object.fromEntries(X.CRITERIA.filter((c) => it.fb.tc[c.key]).map((c) => [c.key, val(c.col)])) : undefined;
      if (tc) Object.keys(tc).forEach((k) => tc[k] === undefined && delete tc[k]);
      const fb = { ...it.fb, comment: val('cm'), ...(it.fb.praise ? { praise: val('kh') } : {}), ...(it.fb.fix ? { fix: val('cs') } : {}), ...(it.fb.priority ? { priority: val('up') } : {}), ...(tc ? { tc: Object.keys(tc).length ? tc : undefined } : {}) };
      Object.keys(fb).forEach((k) => fb[k] === undefined && delete fb[k]);
      const m = X.checkFeedback(fb);
      if (m) { fails.push(`${byId.get(bySub.get(it.id).studentId)?.nickname || it.id}: ${m}`); continue; }
      try { await S.saveFeedback(h, it.id, fb); const sub = bySub.get(it.id); sub.feedback = fb; sub.feedbackAt = { toMillis: () => Date.now() }; okN++; }   // ghi đè bằng tệp cũng là «bản mới»
      catch (e) { fails.push(`${it.id}: ${errMessage(e)}`); }
    }
    say(`Đã lưu ${okN} nhận xét${fails.length ? `; ${fails.length} bài lỗi (${fails.slice(0, 2).join('; ')})` : ''}.`, fails.length > 0 && okN === 0);
    draw();
  }

  // ---------- sự kiện
  panel.onchange = async (e) => {
    if (e.target.id === 'tk-class') { cur = e.target.value; prog = new Map(); subs = null; draw(); await loadProg().catch((er) => say(errMessage(er), true)); return; }
    if (e.target.matches('input[data-act="import"]') && e.target.files?.[0]) { const f = e.target.files[0]; e.target.value = ''; run(async () => { await importFile(f); }, ''); }
  };
  panel.onclick = async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'reload-prog') return run(loadProg, '');
    if (act === 'load-subs') return run(loadSubs, '');
    if (act === 'cell') return run(() => studentDialog(b.dataset.sid, b.dataset.s), '');
    if (act === 'student') return run(() => studentDialog(b.dataset.sid), '');
    if (act === 'comment') {
      const sub = subs.find((x) => x.id === b.dataset.subid);
      return run(async () => { if (await commentDialog(sub)) { say(`Đã lưu nhận xét cho ${byId.get(sub.studentId)?.nickname || ''}.`); draw(); } }, '');
    }
    if (act === 'export-json' || act === 'export-csv') {
      const ex = X.buildExport({ lop: clsOf(), students: stuOf(), submissions: subs });
      if (act === 'export-json') download(ex.base + '.json', JSON.stringify(ex.json, null, 2), 'application/json');
      else download(ex.base + '.csv', ex.csv, 'text/csv;charset=utf-8');
      say(`Đã xuất ${ex.count} bài nộp của lớp ${clsOf().name}. Tệp chỉ dành cho giáo viên: có họ tên thật của học sinh.`);
    }
  };

  draw();
  if (cur) loadProg().catch((er) => say(errMessage(er), true));
}
