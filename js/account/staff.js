// Trang giáo viên và trang quản trị (Giai đoạn 3). Chạy trong cổng tài khoản (gate.js), không đụng web học.
// Giáo viên: lớp, mã lớp, duyệt / từ chối, duyệt chuyển lớp, «Gỡ khỏi lớp».
// Quản trị: mã giáo viên, giáo viên, mọi lớp và học sinh, «Xoá dữ liệu học sinh». Nhận xét bài và bảng tiến độ làm ở GĐ 5.
import * as S from './staffdata.js';
import * as D from './data.js';
import { trackerPanel } from './tracker.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const dmy = (ts) => { try { return (ts.toDate ? ts.toDate() : new Date(ts)).toLocaleDateString('vi-VN'); } catch { return ''; } };
const expired = (ts) => !!ts && ts.toMillis() <= Date.now();
const STATUS = { pending: ['Chờ duyệt', 'wait'], approved: ['Đang học', 'ok'], rejected: ['Bị từ chối', 'bad'], removed: ['Đã gỡ khỏi lớp', 'bad'] };

// ---------------------------------------------------------------- hộp thoại xác nhận (dùng chung)
/** dialog({title, body, input, requireText, confirmText, danger}) → Promise<{ok, value}> */
export function dialog({ title, body = '', input = null, requireText = null, confirmText = 'Xác nhận', danger = false, cancelText = 'Huỷ', onOpen = null, validate = null, wide = false }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'st-dlg';
    const needsField = input || requireText;
    wrap.innerHTML = `<form class="st-dlg-card${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="st-dlg-t" novalidate>
      <h2 id="st-dlg-t">${esc(title)}</h2>
      <div class="st-dlg-body">${body}</div>
      ${needsField ? `<label for="st-dlg-in">${esc(requireText ? `Gõ lại «${requireText}» để xác nhận` : input.label)}</label>
        ${input && input.area ? `<textarea id="st-dlg-in" rows="3" maxlength="${input.max || 200}" placeholder="${esc(input.placeholder || '')}"></textarea>`
          : `<input id="st-dlg-in" autocomplete="off" maxlength="${input?.max || 60}" placeholder="${esc(input?.placeholder || '')}">`}` : ''}
      <p class="field-msg" aria-live="polite"></p>
      <div class="st-dlg-acts"><button type="button" class="btn2" data-cancel>${esc(cancelText)}</button>
        <button type="submit" class="btn ${danger ? 'st-danger' : ''}" ${requireText ? 'disabled' : ''}>${esc(confirmText)}</button></div></form>`;
    document.body.append(wrap);
    const form = wrap.querySelector('form'), field = wrap.querySelector('#st-dlg-in'), go = form.querySelector('[type=submit]'), msg = wrap.querySelector('.field-msg');
    const prev = document.activeElement;
    if (onOpen) onOpen(wrap);
    const close = (r) => { wrap.remove(); document.removeEventListener('keydown', onKey, true); prev?.focus?.(); resolve(r); };
    const onKey = (e) => { if (e.key === 'Escape' && !wrap.hidden) { e.stopPropagation(); close({ ok: false }); } };   // hộp bị ẩn (đang mở hộp con) thì không đóng
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => (field || go).focus(), 30);
    if (requireText) field.addEventListener('input', () => { go.disabled = field.value.trim() !== requireText; });
    form.querySelector('[data-cancel]').addEventListener('click', () => close({ ok: false }));
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close({ ok: false }); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = field ? field.value.trim() : '';
      if (requireText && value !== requireText) return;
      if (input && input.required && !value) { msg.textContent = input.requiredMsg || 'Hãy nhập nội dung.'; msg.className = 'field-msg bad'; return field.focus(); }
      const extra = {}; wrap.querySelectorAll('select[id]').forEach((x) => { extra[x.id] = x.value; });
      const values = Object.fromEntries([...wrap.querySelectorAll('[name]')].map((el) => [el.name, el.type === 'checkbox' ? el.checked : el.value]));
      if (validate) { const m = validate(values); if (m) { msg.textContent = m; msg.className = 'field-msg bad'; return; } }
      close({ ok: true, value, extra, values });
    });
  });
}

/** Thông báo lỗi cho người dùng (xuất ra để bộ kiểm thử dùng). */
export function errMessage(e) {
  if (e?.kind === 'code-taken') return 'Mã lớp này đã có người dùng. Hãy chọn mã khác.';
  if (e?.kind === 'has-classes') return `Giáo viên còn ${e.count} lớp phụ trách nên chưa xoá được hồ sơ. Hãy khoá giáo viên hoặc bàn giao lớp cho giáo viên khác trước.`;
  if (e?.partial === true) return 'Chưa xoá xong: đã xoá một phần nhưng hồ sơ học sinh VẪN CÒN trong danh sách. Bấm «Xoá dữ liệu học sinh» lần nữa để làm tiếp phần còn lại.';
  if (e?.partial === false) return 'Chưa xoá được, dữ liệu của học sinh vẫn còn nguyên (chưa xoá gì).' + (e.blocked ? ' Hồ sơ em đã chuyển sang «đã gỡ» nên em tạm không nộp thêm được; bấm xoá lại để làm tiếp.' : '') + ' Thử lại sau.';
  if (e?.code === 'permission-denied') return 'Không có quyền làm việc này (hoặc dữ liệu vừa thay đổi). Tải lại trang rồi thử lại.';
  if (e?.code === 'unavailable') return 'Mất mạng. Thử lại khi có mạng.';
  return 'Chưa làm được. Thử lại sau. (' + (e?.code || e?.message || 'lỗi lạ') + ')';
}

const copyText = async (t) => { try { await navigator.clipboard.writeText(t); return true; } catch { return false; } };

// ---------------------------------------------------------------- khung chung
/** mountStaff(main, { h, user, teacher, admin, onProfile }) – vẽ vào phần tử main của cổng. */
export function mountStaff(main, { h, user, teacher, admin, onProfile }) {
  main.innerHTML = `<div class="stf" data-role="${admin ? 'admin' : 'teacher'}">
    <h1 class="g-h st-h1" tabindex="-1">${admin ? 'Xin chào, quản trị viên' : `Xin chào, ${esc(teacher.displayName)}`}</h1>
    <p class="field-msg st-msg" aria-live="polite" role="status"></p>
    ${admin ? `<div class="st-tabs" role="tablist" aria-label="Trang quản trị">
      <button type="button" role="tab" data-tab="invites">Mã giáo viên</button>
      <button type="button" role="tab" data-tab="teachers">Giáo viên</button>
      <button type="button" role="tab" data-tab="students">Lớp và học sinh</button>
      <button type="button" role="tab" data-tab="tracker">Theo dõi bài</button>
      <button type="button" role="tab" data-tab="mine">Lớp của tôi</button></div>`
    : `<div class="st-tabs" role="tablist" aria-label="Trang giáo viên">
      <button type="button" role="tab" data-tab="classes">Lớp học</button>
      <button type="button" role="tab" data-tab="tracker">Theo dõi bài</button></div>`}
    <div class="st-panel" role="${admin ? 'tabpanel' : 'region'}" aria-live="off"></div></div>`;
  const root = main.querySelector('.stf'), panel = root.querySelector('.st-panel'), msgEl = root.querySelector('.st-msg');
  root.querySelector('h1').focus({ preventScroll: true });
  const say = (t, bad = false) => { msgEl.textContent = t || ''; msgEl.className = 'field-msg st-msg' + (t ? (bad ? ' bad' : ' ok') : ''); };
  // Các thao tác xếp hàng nối đuôi nhau (bấm nhanh hai nút liên tiếp không bị bỏ sót hay chạy chồng lên nhau).
  let chain = Promise.resolve();
  const exec = async (fn, okText) => {
    say('Đang xử lý…');
    try { await fn(); if (okText !== '') say(okText || 'Đã xong.'); }   // okText '' = hàm tự đặt thông báo (ví dụ hiện mã lớp mới)
    catch (e) { say(errText(e), true); }
  };
  const run = (fn, okText) => (chain = chain.then(() => exec(fn, okText)));
  const errText = errMessage;
  const ctx = { h, user, teacher, admin, panel, say, run, onProfile, seq: 0 };

  const tabs = [...root.querySelectorAll('[data-tab]')];
  const open = (name) => {
    ctx.seq++;
    tabs.forEach((t) => { const on = t.dataset.tab === name; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; });
    say('');
    ({ invites: invitesPanel, teachers: teachersPanel, students: studentsPanel, mine: minePanel, tracker: trackerTab, classes: teacherPanel })[name](ctx);
  };
  tabs.forEach((t) => t.addEventListener('click', () => open(t.dataset.tab)));
  root.querySelector('.st-tabs').addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0 || !['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
    const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); n.click(); e.preventDefault();
  });
  open(admin ? 'invites' : 'classes');
}

/** Tab «Theo dõi bài»: giáo viên thấy lớp của mình, quản trị thấy mọi lớp. */
async function trackerTab(ctx) {
  const { h, user, panel, admin } = ctx;
  const my = ctx.seq, alive = () => ctx.seq === my;
  panel.innerHTML = '<div class="g-spin" aria-hidden="true"></div>';
  let data;
  try { data = admin ? await S.loadAdminData(h) : await S.loadTeacherData(h, user.uid); }
  catch (e) { if (alive()) { panel.innerHTML = nodata('Chưa tải được danh sách lớp.'); } return; }
  if (!alive()) return;
  trackerPanel(ctx, { classes: data.classes, students: data.students.filter((s) => s.status === 'approved' && s.classId), alive, dialog, errMessage });
}

const badge = (label, kind) => `<span class="st-badge ${kind}">${esc(label)}</span>`;
const nodata = (t) => `<p class="st-empty">${esc(t)}</p>`;
const studentWho = (s) => `<div class="st-who"><b>${esc(s.nickname)}</b><span>${esc(s.realName)}</span></div>`;

// ---------------------------------------------------------------- GIÁO VIÊN
async function teacherPanel(ctx) {
  const { h, user, panel, say, run } = ctx;
  const my = ctx.seq, alive = () => ctx.seq === my;
  panel.innerHTML = '<div class="g-spin" aria-hidden="true"></div>';
  let data;
  const load = async () => { data = await S.loadTeacherData(h, user.uid); };
  try { await load(); } catch (e) { if (!alive()) return; panel.innerHTML = `<p class="st-empty">Chưa tải được dữ liệu lớp.</p><button type="button" class="btn2" data-retry>Thử lại</button>`; panel.querySelector('[data-retry]').addEventListener('click', () => teacherPanel(ctx)); return; }
  if (!alive()) return;
  const render = () => {
    if (!alive()) return;
    const cname = Object.fromEntries(data.classes.map((c) => [c.id, c.name]));
    const pending = data.students.filter((s) => s.status === 'pending');
    const approved = data.students.filter((s) => s.status === 'approved');
    const reqCount = pending.length + data.movers.length;
    panel.innerHTML = `
      <section class="st-sec" aria-labelledby="t-req"><h2 id="t-req">Yêu cầu chờ xử lý ${reqCount ? `<span class="st-n">${reqCount}</span>` : ''}</h2>
        ${reqCount ? '' : nodata('Chưa có yêu cầu nào.')}
        ${pending.map((s) => `<article class="st-row" data-sid="${esc(s.id)}">${studentWho(s)}
          <div class="st-meta">Xin vào lớp <b>${esc(cname[s.classId] || '—')}</b> · mã ${esc(s.joinCode)}</div>
          <div class="st-acts"><button type="button" class="btn2 sm" data-act="approve">Duyệt</button><button type="button" class="btn2 sm" data-act="reject">Từ chối</button></div></article>`).join('')}
        ${data.movers.map((s) => `<article class="st-row" data-sid="${esc(s.id)}">${studentWho(s)}
          <div class="st-meta">Xin chuyển sang lớp <b>${esc(cname[s.moveClassId] || '—')}</b> · mã ${esc(s.moveJoinCode)}${s.teacherId === user.uid ? ` (đang học lớp ${esc(cname[s.classId] || '—')})` : ' (đang học lớp của giáo viên khác)'}</div>
          <div class="st-acts"><button type="button" class="btn2 sm" data-act="move-ok">Duyệt chuyển lớp</button><button type="button" class="btn2 sm" data-act="move-no">Từ chối</button></div></article>`).join('')}
      </section>
      <section class="st-sec" aria-labelledby="t-cls"><h2 id="t-cls">Lớp của tôi</h2>
        ${data.classes.length ? '' : nodata('Chưa có lớp nào. Tạo lớp ở bên dưới để lấy mã lớp cho học sinh.')}
        ${data.classes.map((c) => classCard(c, data.codes[c.code], approved.filter((s) => s.classId === c.id))).join('')}
      </section>
      <section class="st-sec" aria-labelledby="t-new"><h2 id="t-new">Tạo lớp mới</h2>
        <form class="g-form st-newclass" novalidate>
          <label for="nc-name">Tên lớp</label><input id="nc-name" name="name" maxlength="60" required placeholder="Ví dụ: HSG Anh 11">
          <label for="nc-year">Năm học</label><input id="nc-year" name="year" maxlength="20" value="2026-2027">
          <label for="nc-code">Mã lớp <span class="opt-note">(để trống: tự tạo; ít nhất 4 chữ/số)</span></label>
          <input id="nc-code" name="code" maxlength="20" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="Ví dụ: HSG11">
          <button type="submit" class="btn">Tạo lớp</button></form></section>`;
  };
  const classCard = (c, code, students) => {
    const active = code?.active === true, exp = code?.expiresAt;
    const state = !code ? ['Chưa có mã', 'bad'] : !active ? ['Mã đang tắt', 'bad'] : expired(exp) ? ['Mã hết hạn', 'bad'] : ['Mã đang bật', 'ok'];
    return `<article class="st-class" data-cid="${esc(c.id)}" data-code="${esc(c.code)}">
      <header><h3>${esc(c.name)} <span class="st-year">${esc(c.schoolYear)}</span></h3></header>
      <div class="st-codebox"><span class="st-code" aria-label="Mã lớp ${esc(c.code)}">${esc(c.code)}</span> ${badge(state[0], state[1])}
        ${exp && !expired(exp) ? `<span class="st-meta">hết hạn ${esc(dmy(exp))}</span>` : ''}</div>
      <div class="st-acts wrap">
        <button type="button" class="btn2 sm" data-act="copy-code">Sao chép mã</button>
        <button type="button" class="btn2 sm" data-act="regen">Tạo lại mã</button>
        <button type="button" class="btn2 sm" data-act="toggle-code">${active ? 'Tắt mã' : 'Bật mã'}</button>
        <button type="button" class="btn2 sm" data-act="rename">Đổi tên lớp</button></div>
      <div class="st-expiry"><label for="ex-${esc(c.id)}">Hạn dùng mã</label>
        <input id="ex-${esc(c.id)}" type="date" value="${exp ? exp.toDate().toISOString().slice(0, 10) : ''}">
        <button type="button" class="btn2 sm" data-act="expiry">Lưu hạn</button></div>
      <h4>Học sinh đang học (${students.length})</h4>
      ${students.length ? students.map((s) => `<div class="st-row slim" data-sid="${esc(s.id)}">${studentWho(s)}
        <div class="st-acts"><button type="button" class="btn2 sm danger" data-act="remove">Gỡ khỏi lớp</button></div></div>`).join('') : nodata('Chưa có học sinh được duyệt.')}
    </article>`;
  };
  render();

  panel.onclick = async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act, row = b.closest('[data-sid]'), card = b.closest('[data-cid]');
    const stu = row && [...data.students, ...data.movers].find((s) => s.id === row.dataset.sid);
    const cls = card && data.classes.find((c) => c.id === card.dataset.cid);
    const refresh = async () => { await load(); render(); };
    if (act === 'approve') return run(async () => { await S.approveJoin(h, stu.id); await refresh(); }, `Đã duyệt ${stu.nickname} vào lớp.`);
    if (act === 'reject') {
      const r = await dialog({ title: `Từ chối ${stu.nickname}?`, body: '<p>Em sẽ thấy lý do này và có thể sửa rồi gửi lại.</p>', input: { label: 'Lý do (ngắn)', area: true, max: 200, required: true, requiredMsg: 'Hãy nhập lý do để em biết cần sửa gì.' }, confirmText: 'Từ chối' });
      if (r.ok) run(async () => { await S.rejectJoin(h, stu.id, r.value); await refresh(); }, `Đã từ chối ${stu.nickname}.`);
      return;
    }
    if (act === 'move-ok') return run(async () => { await S.approveMove(h, stu, user.uid); await refresh(); }, `Đã duyệt ${stu.nickname} chuyển sang lớp của bạn; bài và tiến độ cũ đi theo em.`);
    if (act === 'move-no') {
      const r = await dialog({ title: `Từ chối chuyển lớp của ${stu.nickname}?`, input: { label: 'Lý do (ngắn)', area: true, max: 200, required: true }, confirmText: 'Từ chối' });
      if (r.ok) run(async () => { await S.rejectMove(h, stu.id, r.value); await refresh(); }, 'Đã từ chối chuyển lớp.');
      return;
    }
    if (act === 'remove') {
      const r = await dialog({
        title: `Gỡ ${stu.nickname} khỏi lớp ${cls?.name || ''}?`, danger: true, confirmText: 'Gỡ khỏi lớp',
        body: `<p><b>${esc(stu.nickname)}</b> (${esc(stu.realName)}) sẽ rời danh sách đang học và bạn không xem được hồ sơ, bài của em nữa.</p>
          <p>Tài khoản, tiến độ, bài nộp và nhận xét của em <b>được giữ nguyên</b>. Em có thể nhập mã lớp để xin vào lại hoặc vào lớp khác.</p>`,
        input: { label: 'Lý do (không bắt buộc)', area: true, max: 200 } });
      if (r.ok) run(async () => { await S.removeFromClass(h, stu, r.value); await refresh(); }, `Đã gỡ ${stu.nickname} khỏi lớp.`);
      return;
    }
    if (act === 'copy-code') return say((await copyText(cls.code)) ? `Đã sao chép mã ${cls.code}.` : 'Không sao chép được; hãy chép tay mã trên màn hình.', false);
    if (act === 'regen') {
      const r = await dialog({ title: 'Tạo lại mã lớp?', body: `<p>Mã mới sẽ thay mã <b>${esc(cls.code)}</b>. Mã cũ hết hiệu lực. Học sinh đã được duyệt vẫn ở lại lớp.</p>`, confirmText: 'Tạo mã mới' });
      if (r.ok) run(async () => { const c = await S.regenerateCode(h, user.uid, cls); await refresh(); say(`Mã mới của lớp ${cls.name}: ${c}`); }, '');
      return;
    }
    if (act === 'toggle-code') return run(async () => { await S.setCodeActive(h, cls.code, !(data.codes[cls.code]?.active === true)); await refresh(); }, 'Đã cập nhật mã lớp.');
    if (act === 'expiry') {
      const v = card.querySelector('input[type=date]').value;
      return run(async () => { await S.setCodeExpiry(h, cls.code, v ? new Date(v + 'T23:59:59') : null); await refresh(); }, v ? 'Đã đặt hạn dùng mã.' : 'Đã bỏ hạn dùng mã.');
    }
    if (act === 'rename') {
      const r = await dialog({ title: 'Đổi tên lớp', input: { label: 'Tên lớp mới', max: 60, required: true, requiredMsg: 'Nhập tên lớp.' }, confirmText: 'Lưu' });
      if (r.ok) run(async () => { await S.renameClass(h, cls.id, r.value, cls.schoolYear); await refresh(); }, 'Đã đổi tên lớp.');
    }
  };
  panel.onsubmit = async (e) => {
    const f = e.target.closest('.st-newclass'); if (!f) return;
    e.preventDefault();
    const name = f.name.value.trim().replace(/\s+/g, ' '), year = f.year.value.trim();
    let code = S.cleanCode(f.code.value);
    if (!name) { say('Nhập tên lớp.', true); return f.name.focus(); }
    if (code && !D.validClassCode(code)) { say('Mã lớp gồm chữ và số, ít nhất 4 ký tự.', true); return f.code.focus(); }
    if (!code) code = S.genCode(6);
    run(async () => { await S.createClass(h, user.uid, { name, schoolYear: year, code }); await load(); render(); say(`Đã tạo lớp ${name}. Mã lớp: ${code}`); }, '');
  };
}

// ---------------------------------------------------------------- QUẢN TRỊ
async function invitesPanel(ctx) {
  const { h, panel, say, run } = ctx;
  const my = ctx.seq, alive = () => ctx.seq === my;
  panel.innerHTML = '<div class="g-spin" aria-hidden="true"></div>';
  let data; let fresh = '';
  const load = async () => { data = await S.loadAdminData(h); };
  try { await load(); } catch { if (alive()) panel.innerHTML = nodata('Chưa tải được dữ liệu.'); return; }
  if (!alive()) return;
  const status = (i) => i.used ? ['Đã dùng', 'ok'] : i.revoked ? ['Đã thu hồi', 'bad'] : expired(i.expiresAt) ? ['Hết hạn', 'bad'] : ['Chưa dùng', 'wait'];
  const teacherOf = (i) => data.teachers.find((t) => t.id === i.usedBy);
  const render = () => {
    if (!alive()) return;
    const list = data.invites.slice().sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    panel.innerHTML = `
      <section class="st-sec" aria-labelledby="i-new"><h2 id="i-new">Tạo mã giáo viên</h2>
        <p class="g-p left">«Mã giáo viên» dùng một lần, do bạn cấp cho giáo viên. Khác với «mã lớp» của học sinh.</p>
        <form class="g-form st-newinvite" novalidate>
          <label for="iv-note">Ghi chú (ví dụ tên giáo viên)</label><input id="iv-note" name="note" maxlength="100" placeholder="Ví dụ: Cô Lan – tổ Anh">
          <label for="iv-days">Hạn dùng</label>
          <select id="iv-days" name="days"><option value="14" selected>14 ngày</option><option value="7">7 ngày</option><option value="30">30 ngày</option><option value="0">Không hạn</option></select>
          <button type="submit" class="btn">Tạo mã giáo viên</button></form>
        ${fresh ? `<div class="st-fresh" role="status"><span>Mã vừa tạo (chỉ hiện lúc này, hãy gửi cho giáo viên):</span><b class="st-code big">${esc(fresh)}</b>
          <button type="button" class="btn2 sm" data-act="copy-fresh">Sao chép mã</button></div>` : ''}
      </section>
      <section class="st-sec" aria-labelledby="i-list"><h2 id="i-list">Các mã giáo viên (${list.length})</h2>
        ${list.length ? '' : nodata('Chưa có mã nào.')}
        ${list.map((i) => { const st = status(i), t = teacherOf(i); return `<article class="st-row" data-code="${esc(i.id)}">
          <div class="st-who"><b class="st-code">${esc(i.id)}</b><span>${esc(i.note || 'Không ghi chú')}</span></div>
          <div class="st-meta">${badge(st[0], st[1])} ${i.used ? `dùng bởi ${esc(t ? t.displayName : i.usedBy)}` : i.expiresAt ? `hạn ${esc(dmy(i.expiresAt))}` : 'không hạn'}</div>
          <div class="st-acts wrap">${!i.used ? `<button type="button" class="btn2 sm" data-act="copy">Sao chép</button><button type="button" class="btn2 sm" data-act="revoke">${i.revoked ? 'Mở lại' : 'Thu hồi'}</button>` : ''}
            <button type="button" class="btn2 sm danger" data-act="del">Xoá</button></div></article>`; }).join('')}
      </section>`;
  };
  render();
  panel.onsubmit = (e) => {
    const f = e.target.closest('.st-newinvite'); if (!f) return; e.preventDefault();
    run(async () => { fresh = await S.createInvite(h, { note: f.note.value.trim(), days: Number(f.days.value) }); await load(); render(); }, 'Đã tạo mã giáo viên.');
  };
  panel.onclick = async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const row = b.closest('[data-code]'), code = row?.dataset.code, inv = code && data.invites.find((i) => i.id === code);
    const refresh = async () => { await load(); render(); };
    if (b.dataset.act === 'copy-fresh') return say((await copyText(fresh)) ? 'Đã sao chép mã.' : 'Không sao chép được; hãy chép tay.');
    if (b.dataset.act === 'copy') return say((await copyText(code)) ? 'Đã sao chép mã.' : 'Không sao chép được; hãy chép tay.');
    if (b.dataset.act === 'revoke') return run(async () => { await S.setInviteRevoked(h, code, !inv.revoked); await refresh(); }, inv.revoked ? 'Đã mở lại mã.' : 'Đã thu hồi mã.');
    if (b.dataset.act === 'del') {
      const r = await dialog({ title: 'Xoá mã giáo viên?', danger: true, confirmText: 'Xoá mã', body: `<p>Mã <b>${esc(code)}</b> sẽ bị xoá khỏi danh sách${inv.used ? '. Giáo viên đã dùng mã này vẫn giữ tài khoản.' : ' và không dùng được nữa.'}</p>` });
      if (r.ok) run(async () => { await S.deleteInvite(h, code); await refresh(); }, 'Đã xoá mã.');
    }
  };
}

async function teachersPanel(ctx) {
  const { h, user, panel, run } = ctx;
  const my = ctx.seq, alive = () => ctx.seq === my;
  panel.innerHTML = '<div class="g-spin" aria-hidden="true"></div>';
  let data;
  const load = async () => { data = await S.loadAdminData(h); };
  try { await load(); } catch { if (alive()) panel.innerHTML = nodata('Chưa tải được dữ liệu.'); return; }
  if (!alive()) return;
  const render = () => {
    if (!alive()) return;
    panel.innerHTML = `<section class="st-sec" aria-labelledby="g-list"><h2 id="g-list">Giáo viên (${data.teachers.length})</h2>
      ${data.teachers.length ? '' : nodata('Chưa có giáo viên nào.')}
      ${data.teachers.map((t) => { const n = data.classes.filter((c) => c.teacherId === t.id).length, me = t.id === user.uid; return `<article class="st-row" data-tid="${esc(t.id)}">
        <div class="st-who"><b>${esc(t.displayName)}${me ? ' (bạn)' : ''}</b><span>${esc(t.email)}</span></div>
        <div class="st-meta">${badge(t.active ? 'Đang hoạt động' : 'Đã khoá', t.active ? 'ok' : 'bad')} ${n} lớp</div>
        <div class="st-acts wrap"><button type="button" class="btn2 sm" data-act="lock">${t.active ? 'Khoá' : 'Mở khoá'}</button>
          ${n && !me ? '<button type="button" class="btn2 sm" data-act="handover">Bàn giao lớp</button>' : ''}
          ${me ? '' : '<button type="button" class="btn2 sm danger" data-act="del">Xoá hồ sơ giáo viên</button>'}</div></article>`; }).join('')}</section>`;
  };
  render();
  panel.onclick = async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const t = data.teachers.find((x) => x.id === b.closest('[data-tid]').dataset.tid);
    const refresh = async () => { await load(); render(); };
    if (b.dataset.act === 'lock') return run(async () => { await S.setTeacherActive(h, t.id, !t.active); await refresh(); }, t.active ? `Đã khoá ${t.displayName}.` : `Đã mở khoá ${t.displayName}.`);
    if (b.dataset.act === 'handover') return handoverDialog(ctx, data, t, refresh);
    if (b.dataset.act === 'del') {
      // đọc LẠI số lớp từ máy chủ ngay lúc bấm (danh sách trên màn hình có thể đã cũ)
      let cls;
      try { cls = await S.teacherClasses(h, t.id); } catch (e) { say(errMessage(e), true); return; }
      if (cls.length) {
        const r = await dialog({ title: `Chưa xoá được hồ sơ ${t.displayName}`, confirmText: 'Bàn giao lớp', cancelText: 'Đóng',
          body: `<p>Giáo viên còn <b>${cls.length} lớp phụ trách</b>: ${cls.map((c) => esc(c.name)).join(', ')}. Xoá hồ sơ lúc này sẽ làm các lớp và học sinh mất người quản lý.</p>
            <p>Hãy làm một trong hai việc trước:</p>
            <ul class="st-wipe"><li><b>Khoá giáo viên</b> (nút «Khoá»): giữ nguyên lớp và học sinh, giáo viên không quản lý được nữa; xoá hồ sơ sau.</li>
              <li><b>Bàn giao lớp</b> cho giáo viên khác (nút bên dưới): lớp, mã lớp và học sinh chuyển sang người nhận, rồi mới xoá hồ sơ.</li></ul>` });
        if (r.ok) handoverDialog(ctx, data, t, refresh);
        return;
      }
      const r = await dialog({ title: `Xoá hồ sơ giáo viên ${t.displayName}?`, danger: true, confirmText: 'Xoá hồ sơ giáo viên',
        body: '<p>Giáo viên không còn lớp nào. Chỉ xoá <b>hồ sơ giáo viên</b>; tài khoản đăng nhập Google không bị xoá.</p>' });
      if (r.ok) run(async () => { await S.deleteTeacherProfile(h, t.id); await refresh(); }, 'Đã xoá hồ sơ giáo viên.');
    }
  };
}

async function studentsPanel(ctx) {
  const { h, panel, say, run } = ctx;
  const my = ctx.seq, alive = () => ctx.seq === my;
  panel.innerHTML = '<div class="g-spin" aria-hidden="true"></div>';
  let data; let filter = 'all';
  const load = async () => { data = await S.loadAdminData(h); };
  try { await load(); } catch { if (alive()) panel.innerHTML = nodata('Chưa tải được dữ liệu.'); return; }
  if (!alive()) return;
  const render = () => {
    if (!alive()) return;
    const cls = Object.fromEntries(data.classes.map((c) => [c.id, c]));
    const tname = Object.fromEntries(data.teachers.map((t) => [t.id, t.displayName]));
    const sorted = data.classes.slice().sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    const list = data.students.filter((s) => filter === 'all' || (filter === 'none' ? ['removed', 'rejected'].includes(s.status) : s.classId === filter))
      .sort((a, b) => (a.status === 'pending' ? -1 : 0) - (b.status === 'pending' ? -1 : 0) || String(a.nickname).localeCompare(String(b.nickname), 'vi'));
    const opts = sorted.map((c) => `<option value="${esc(c.id)}">${esc(c.name)} – ${esc(tname[c.teacherId] || 'GV ?')}</option>`).join('');
    panel.innerHTML = `
      <section class="st-sec" aria-labelledby="s-cls"><h2 id="s-cls">Các lớp (${sorted.length})</h2>
        ${sorted.length ? '' : nodata('Chưa có lớp nào.')}
        <ul class="st-classes">${sorted.map((c) => `<li><b>${esc(c.name)}</b> ${esc(c.schoolYear)} · GV ${esc(tname[c.teacherId] || '—')} · mã <span class="st-code">${esc(c.code)}</span> · ${data.students.filter((s) => s.classId === c.id && s.status === 'approved').length} học sinh</li>`).join('')}</ul></section>
      <section class="st-sec" aria-labelledby="s-list"><h2 id="s-list">Học sinh (${list.length})</h2>
        <label for="s-filter">Xem</label>
        <select id="s-filter"><option value="all">Tất cả học sinh</option><option value="none">Bị gỡ hoặc bị từ chối</option>${opts}</select>
        ${list.length ? '' : nodata('Không có học sinh nào.')}
        ${list.map((s) => { const st = STATUS[s.status] || [s.status, 'wait'], moving = s.moveTeacherId; return `<article class="st-row" data-sid="${esc(s.id)}">${studentWho(s)}
          <div class="st-meta">${badge(st[0], st[1])} ${esc(s.email)} · ${s.classId ? `lớp ${esc(cls[s.classId]?.name || '—')}` : s.prevClassId ? `lớp cũ ${esc(cls[s.prevClassId]?.name || '—')}` : 'chưa có lớp'}
            ${moving ? `<br>Xin chuyển sang lớp <b>${esc(cls[s.moveClassId]?.name || '—')}</b>` : ''}${s.status === 'rejected' && s.rejectReason ? `<br>Lý do: ${esc(s.rejectReason)}` : ''}</div>
          <div class="st-acts wrap">
            ${s.status === 'pending' ? '<button type="button" class="btn2 sm" data-act="approve">Duyệt</button><button type="button" class="btn2 sm" data-act="reject">Từ chối</button>' : ''}
            ${moving ? '<button type="button" class="btn2 sm" data-act="move-ok">Duyệt chuyển lớp</button><button type="button" class="btn2 sm" data-act="move-no">Từ chối chuyển lớp</button>' : ''}
            ${s.status !== 'pending' && sorted.length ? `<select aria-label="Chọn lớp cho ${esc(s.nickname)}" data-pick>${opts}</select><button type="button" class="btn2 sm" data-act="place">${s.status === 'approved' ? 'Chuyển lớp' : 'Xếp vào lớp'}</button>` : ''}
            ${s.status === 'approved' ? '<button type="button" class="btn2 sm danger" data-act="remove">Gỡ khỏi lớp</button>' : ''}
            <button type="button" class="btn2 sm danger" data-act="wipe">Xoá dữ liệu học sinh</button></div></article>`; }).join('')}</section>`;
    panel.querySelector('#s-filter').value = filter;
  };
  render();
  panel.onchange = (e) => { if (e.target.id === 's-filter') { filter = e.target.value; render(); } };
  panel.onclick = async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const row = b.closest('[data-sid]'), s = data.students.find((x) => x.id === row.dataset.sid);
    const refresh = async () => { await load(); render(); };
    const act = b.dataset.act;
    if (act === 'approve') return run(async () => { await S.approveJoin(h, s.id); await refresh(); }, `Đã duyệt ${s.nickname}.`);
    if (act === 'reject') {
      const r = await dialog({ title: `Từ chối ${s.nickname}?`, input: { label: 'Lý do (ngắn)', area: true, max: 200, required: true, requiredMsg: 'Hãy nhập lý do để em biết cần sửa gì.' }, confirmText: 'Từ chối' });
      if (r.ok) run(async () => { await S.rejectJoin(h, s.id, r.value); await refresh(); }, `Đã từ chối ${s.nickname}.`);
      return;
    }
    if (act === 'move-ok') return run(async () => { await S.approveMove(h, s, s.moveTeacherId); await refresh(); }, `Đã duyệt ${s.nickname} chuyển lớp.`);
    if (act === 'move-no') {
      const r = await dialog({ title: `Từ chối chuyển lớp của ${s.nickname}?`, input: { label: 'Lý do (ngắn)', area: true, max: 200, required: true }, confirmText: 'Từ chối' });
      if (r.ok) run(async () => { await S.rejectMove(h, s.id, r.value); await refresh(); }, 'Đã từ chối chuyển lớp.');
      return;
    }
    if (act === 'place') {
      const c = data.classes.find((x) => x.id === row.querySelector('[data-pick]').value);
      const r = await dialog({ title: `${s.status === 'approved' ? 'Chuyển' : 'Xếp'} ${s.nickname} vào lớp ${c.name}?`, confirmText: 'Đồng ý',
        body: '<p>Bài nộp và tiến độ cũ của em đi theo em. Giáo viên của lớp mới sẽ thấy; giáo viên lớp cũ không thấy nữa.</p>' });
      if (r.ok) run(async () => { await S.adminPlaceStudent(h, s, c); await refresh(); }, `Đã đưa ${s.nickname} vào lớp ${c.name}.`);
      return;
    }
    if (act === 'remove') {
      const r = await dialog({ title: `Gỡ ${s.nickname} khỏi lớp?`, danger: true, confirmText: 'Gỡ khỏi lớp',
        body: '<p>Giữ tài khoản, tiến độ, bài nộp và nhận xét. Giáo viên của lớp không xem được em nữa.</p>', input: { label: 'Lý do (không bắt buộc)', area: true, max: 200 } });
      if (r.ok) run(async () => { await S.removeFromClass(h, s, r.value); await refresh(); }, `Đã gỡ ${s.nickname} khỏi lớp.`);
      return;
    }
    if (act === 'wipe') return wipeDialog(ctx, s, refresh);
  };
}

/** Bàn giao mọi lớp của một giáo viên cho giáo viên khác đang hoạt động. */
async function handoverDialog(ctx, data, t, refresh) {
  const { h, say, run } = ctx;
  const targets = data.teachers.filter((x) => x.id !== t.id && x.active);
  let mine, nStu;
  try { mine = await S.teacherClasses(h, t.id); nStu = await S.countStudentsInClasses(h, mine.map((c) => c.id)); }   // số liệu mới từ máy chủ, không dùng danh sách đã cũ trên màn hình
  catch (e) { say(errMessage(e), true); return; }
  if (!mine.length) { say('Giáo viên này không còn lớp nào để bàn giao.'); return; }
  if (!targets.length) { say('Chưa có giáo viên nào khác đang hoạt động để nhận bàn giao. Hãy tạo mã giáo viên cho người nhận trước.', true); return; }
  const r = await dialog({ title: `Bàn giao lớp của ${t.displayName}`, confirmText: 'Bàn giao',
    body: `<p>Chuyển <b>${mine.length} lớp</b> (${mine.map((c) => esc(c.name)).join(', ')}) và <b>${nStu} học sinh</b> của các lớp đó sang giáo viên nhận. Mã lớp giữ nguyên.</p>
      <p>Bài nộp, tiến độ, nhận xét của học sinh không bị đổi.</p>
      <label for="st-ho-to">Giáo viên nhận lớp</label>
      <select id="st-ho-to">${targets.map((x) => `<option value="${esc(x.id)}">${esc(x.displayName)} (${esc(x.email)})</option>`).join('')}</select>` });
  if (!r.ok) return;
  const pick = r.extra && r.extra['st-ho-to'];
  const dest = targets.find((x) => x.id === pick) || targets[0];
  run(async () => { const res = await S.handoverClasses(h, t.id, dest.id); await refresh(); say(`Đã bàn giao ${res.classes} lớp và ${res.students} học sinh cho ${dest.displayName}. Giờ có thể xoá hồ sơ ${t.displayName}.`); }, '');
}

/** «Xoá dữ liệu học sinh»: liệt kê hồ sơ, tiến độ, bài nộp, nhận xét; xoá tài khoản đăng nhập là việc riêng. */
async function wipeDialog(ctx, s, refresh) {
  const { h, say, run } = ctx;
  say('Đang đếm dữ liệu của em…');
  let sum;
  try { sum = await S.studentDataSummary(h, s.id); } catch { say('Chưa đếm được dữ liệu của em. Thử lại sau.', true); return; }
  say('');
  const body = `<p>Bạn sắp xoá <b>vĩnh viễn</b> dữ liệu của <b>${esc(s.nickname)}</b> (${esc(s.realName)}, ${esc(s.email)}).</p>
    <p class="st-wipe-h">Sẽ bị xoá:</p>
    <ul class="st-wipe">
      <li><b>Hồ sơ</b>: họ tên thật, nick name, lớp.</li>
      <li><b>Tiến độ</b>: ${sum.progressExists ? `${sum.progressSessions} trạm có tiến độ` : 'chưa có tiến độ trên máy chủ'}.</li>
      <li><b>Bài nộp</b>: ${sum.submissions} bài (${sum.draft1} bản 1, ${sum.draft2} Draft 2).</li>
      <li><b>Nhận xét</b> của giáo viên: ${sum.feedback} nhận xét.</li></ul>
    <p><b>Không khôi phục được.</b></p>
    <p class="st-note"><b>Tài khoản đăng nhập Google (Firebase Authentication) KHÔNG bị xoá</b> bằng nút này. Muốn xoá, làm riêng ở Firebase Console → Authentication → Users, tìm theo email hoặc UID:
      <span class="st-uid">${esc(s.id)}</span></p>`;
  const r = await dialog({ title: 'Xoá dữ liệu học sinh', danger: true, confirmText: 'Xoá dữ liệu học sinh', requireText: s.nickname, body });
  if (r.ok) run(async () => {
    try { await S.deleteStudentData(h, s.id); }
    catch (e) { try { await refresh(); } catch { /* giữ nguyên lỗi gốc */ } throw e; }   // đứt giữa chừng: vẽ lại danh sách, hồ sơ còn đó để làm tiếp
    await refresh();
  },`Đã xoá dữ liệu của ${s.nickname}. Tài khoản đăng nhập vẫn còn (xoá riêng trong Firebase Console, UID ${s.id}).`);
}

function minePanel(ctx) {
  const { h, user, teacher, panel, say, run, onProfile } = ctx;
  if (teacher) { teacherPanel(ctx); return; }
  panel.innerHTML = `<section class="st-sec"><h2>Lớp của tôi</h2>
    <form class="g-form" novalidate><p class="g-p left">Muốn tự đứng lớp? Lập hồ sơ giáo viên cho tài khoản này (không cần mã giáo viên).</p>
      <label for="g-an">Tên hiển thị</label><input id="g-an" name="displayName" autocomplete="name" maxlength="60" required placeholder="Ví dụ: Cô Mai">
      <button type="submit" class="btn2">Lập hồ sơ giáo viên</button></form></section>`;
  panel.onsubmit = (e) => {
    e.preventDefault(); const f = e.target;
    const name = f.displayName.value.trim().replace(/\s+/g, ' ');
    if (!name) { say('Nhập tên hiển thị.', true); return f.displayName.focus(); }
    run(async () => { await D.adminCreateOwnTeacher(h, user, name); onProfile && onProfile(); }, 'Đã lập hồ sơ giáo viên.');
  };
}
