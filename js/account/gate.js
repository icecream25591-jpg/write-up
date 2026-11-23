// Cổng tài khoản (Giai đoạn 2): đăng nhập Google → chọn vai trò → học sinh gửi yêu cầu vào lớp / giáo viên nhập mã.
// Chỉ khi học sinh đã được duyệt thì cổng mở ra và web học chạy như cũ. Giáo viên / quản trị tạm dừng ở trang chờ (làm ở GĐ 3).
import { loadFirebase } from './fb.js';
import * as D from './data.js';
import { inAppBrowser, chromeIntentUrl } from './env.js';
import { save, setScope, peekFor, saveFor } from '../store.js';
import { quarantineWipe } from './quarantine.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const CHECKING = 'Đang kiểm tra đăng nhập…';
// «Dấu hồ sơ» = thời điểm tạo hồ sơ học sinh (students/{uid}.createdAt). «Gỡ khỏi lớp» và vào lại KHÔNG đổi dấu này (vẫn là một hồ sơ);
// quản trị «Xoá dữ liệu học sinh» rồi học sinh xin vào lại thì hồ sơ được TẠO MỚI nên dấu đổi. Máy nào còn kho của hồ sơ cũ phải cách ly nó.
const epochOf = (s) => [s?.createdAt?.seconds || 0, s?.createdAt?.nanoseconds || 0];
const sameEpoch = (a, b) => a[0] === b[0] && a[1] === b[1];
const unknownEpoch = (e) => !e[0] && !e[1];

export function runGate(ctx) {
  return new Promise((resolve) => {
    const app = document.querySelector('.app');
    const root = document.createElement('div');
    root.className = 'gate';
    root.innerHTML = `<div class="gate-in"><header class="gate-top"><span class="gate-brand">Write&nbsp;<span>Up!</span></span><span class="gate-who" hidden></span></header><main class="gate-card" id="gate-main" tabindex="-1" aria-live="polite"></main></div>`;
    document.body.append(root);
    document.body.classList.add('gated');
    app.setAttribute('inert', ''); app.setAttribute('aria-hidden', 'true');
    const main = root.querySelector('.gate-card');
    const who = root.querySelector('.gate-who');
    const $ = (q) => main.querySelector(q);

    let h = null, user = null, unsub = null, seq = 0, finished = false;

    const show = (html, { focus = 'h1' } = {}) => {
      root.classList.remove('wide');
      main.innerHTML = html;
      const f = main.querySelector(focus === 'h1' ? 'h1' : focus);
      if (f) { if (f.tagName === 'H1') f.setAttribute('tabindex', '-1'); f.focus({ preventScroll: true }); }
      main.scrollTop = 0; root.scrollTop = 0;
    };
    const setWho = () => {
      if (user) { who.hidden = false; who.innerHTML = `<span class="g-email">${esc(user.email)}</span> <button type="button" class="g-link" data-out>Đăng xuất</button>`; }
      else { who.hidden = true; who.innerHTML = ''; }
    };
    root.addEventListener('click', (e) => { if (e.target.closest('[data-out]')) signOut(); });
    const signOut = async () => { try { await h?.A.signOut(h.auth); } catch { /* bỏ qua */ } };
    const msg = (text, bad = true) => { const m = $('.field-msg'); if (m) { m.textContent = text; m.className = 'field-msg' + (bad ? ' bad' : ' ok'); } };

    // ---------- các màn ----------
    const splash = (text = CHECKING) => show(`<img class="g-mai" src="img/comai-face.webp" alt="" width="72" height="72"><h1 class="g-h">${esc(text)}</h1><div class="g-spin" aria-hidden="true"></div>`);

    const errorScreen = (retry, text) => {
      show(`<h1 class="g-h">Không kết nối được</h1><p class="g-p">${esc(text || 'Em kiểm tra mạng rồi bấm thử lại nhé.')}</p>
        <button type="button" class="btn" data-retry>Thử lại</button>`);
      $('[data-retry]').addEventListener('click', retry);
    };

    const PRIV = `
      <section class="g-priv" aria-labelledby="g-priv-t">
        <h2 id="g-priv-t">Write Up! lưu những gì?</h2>
        <ul>
          <li><b>Thu:</b> email Google, họ tên, nick name, tiến độ học và bài viết của em.</li>
          <li><b>Ai xem được:</b> chỉ giáo viên của lớp em và người quản trị hệ thống. Các bạn khác không xem được.</li>
          <li><b>Dùng để:</b> cô theo dõi tiến độ và nhận xét bài.</li>
          <li><b>Muốn xoá dữ liệu:</b> nhắn cho cô.</li>
        </ul>
      </section>`;

    const loginScreen = () => {
      const iab = inAppBrowser();
      if (iab) {
        const android = iab.platform === 'android';
        show(`<h1 class="g-h">Mở bằng ${android ? 'Chrome' : 'Safari'} để đăng nhập</h1>
          <p class="g-p">Em đang mở Write Up! trong ${esc(iab.name === 'ứng dụng' ? 'một ứng dụng khác' : iab.name)}. Google không cho đăng nhập ở đây.</p>
          <ol class="g-steps">
            <li>Bấm dấu <b>⋯</b> (hoặc nút chia sẻ) ở góc trên.</li>
            <li>Chọn <b>${android ? 'Mở bằng Chrome' : 'Mở bằng Safari'}</b> (hoặc <i>Open in browser</i>).</li>
          </ol>
          ${android ? '<a class="btn" data-chrome href="#">Mở bằng Chrome</a>' : ''}
          <button type="button" class="btn2" data-copy>Sao chép liên kết</button>
          <p class="field-msg" aria-live="polite"></p>
          ${PRIV}`);
        const a = $('[data-chrome]'); if (a) a.href = chromeIntentUrl();
        $('[data-copy]').addEventListener('click', async () => {
          try { await navigator.clipboard.writeText(location.href.split('#')[0]); msg('Đã sao chép. Dán vào Chrome hoặc Safari.', false); }
          catch { msg('Không sao chép được. Hãy giữ vào địa chỉ trên thanh trình duyệt để sao chép.'); }
        });
        return;
      }
      show(`<img class="g-mai" src="img/comai-face.webp" alt="" width="72" height="72">
        <h1 class="g-h">Chào mừng đến Write&nbsp;Up!</h1>
        <p class="g-p">Đăng nhập bằng tài khoản Google để vào lớp.</p>
        ${PRIV}
        <button type="button" class="btn g-google" data-login>Đăng nhập bằng Google</button>
        <p class="field-msg" aria-live="polite"></p>`);
      const btn = $('[data-login]');
      btn.addEventListener('click', async () => {
        btn.disabled = true; btn.textContent = 'Đang mở Google…'; msg('', false);
        const { A, auth } = h; const provider = new A.GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' });
        try { await A.signInWithPopup(auth, provider); }
        catch (e) {
          btn.disabled = false; btn.textContent = 'Đăng nhập bằng Google';
          const c = e && e.code;
          if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') return;
          if (c === 'auth/popup-blocked') { msg('Trình duyệt chặn cửa sổ đăng nhập, đang chuyển trang…', false); try { await A.signInWithRedirect(auth, provider); } catch { msg('Không đăng nhập được. Hãy cho phép cửa sổ bật lên rồi thử lại.'); } return; }
          if (c === 'auth/network-request-failed') return msg('Mất mạng. Em kiểm tra mạng rồi thử lại.');
          if (c === 'auth/unauthorized-domain') return msg('Tên miền này chưa được cho phép đăng nhập. Nhắn cô giúp em nhé.');
          msg('Không đăng nhập được. Em thử lại, hoặc nhắn cô. (' + (c || 'lỗi lạ') + ')');
        }
      });
    };

    const roleScreen = () => {
      show(`<h1 class="g-h">Em là ai?</h1><p class="g-p">Chọn một vai trò. Mỗi tài khoản chỉ có một vai trò.</p>
        <div class="g-roles">
          <button type="button" class="g-role" data-role="student"><b>Học sinh</b><span>Vào lớp bằng mã lớp của cô.</span></button>
          <button type="button" class="g-role" data-role="teacher"><b>Giáo viên</b><span>Dùng mã giáo viên do quản trị cấp.</span></button>
        </div>`);
      main.querySelectorAll('[data-role]').forEach((b) => b.addEventListener('click', () => (b.dataset.role === 'student' ? studentForm({ mode: 'create' }) : teacherForm())));
    };

    /** Form học sinh. variant: 'new' | 'pending' (đổi mã lớp) | 'rejected' | 'removed'. */
    const studentForm = ({ mode, student = null, variant = 'new' }) => {
      const head = {
        new: ['Thông tin của em', 'Nhập đúng họ tên thật để cô duyệt. Họ tên thật chỉ em, giáo viên phụ trách lớp và quản trị viên hệ thống xem được.'],
        pending: ['Nhập mã lớp khác', 'Em nhập lại thông tin và mã lớp, cô của lớp đó sẽ duyệt.'],
        rejected: ['Yêu cầu chưa được duyệt', 'Em sửa lại thông tin rồi gửi lại nhé.'],
        removed: ['Em đã được gỡ khỏi lớp', 'Bài làm và tiến độ cũ của em vẫn được giữ. Nhập mã lớp để xin vào lại hoặc vào lớp khác; khi cô duyệt, bài cũ sẽ đi theo em.'],
      }[variant];
      const reason = variant === 'rejected' && student?.rejectReason ? `<p class="g-reason" role="note"><b>Lý do:</b> ${esc(student.rejectReason)}</p>` : '';
      show(`<h1 class="g-h">${esc(head[0])}</h1><p class="g-p">${esc(head[1])}</p>${reason}
        <form class="g-form" novalidate>
          <label for="g-rn">Họ và tên (tên thật)</label>
          <input id="g-rn" name="realName" autocomplete="name" maxlength="80" required value="${esc(student?.realName || '')}" placeholder="Ví dụ: Nguyễn Bảo Ngọc">
          <label for="g-nn">Nick name <span class="opt-note">(tên hiển thị trong web)</span></label>
          <input id="g-nn" name="nickname" autocomplete="nickname" maxlength="30" required value="${esc(student?.nickname || '')}" placeholder="Ví dụ: Ngọc">
          <label for="g-cc">Mã lớp <span class="opt-note">(cô giáo cung cấp)</span></label>
          <input id="g-cc" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="20" required placeholder="Ví dụ: HSG11">
          <p class="field-msg" aria-live="polite"></p>
          <button type="submit" class="btn">${variant === 'removed' ? 'Xin vào lớp' : 'Gửi yêu cầu vào lớp'}</button>
          ${variant === 'new' ? '<button type="button" class="btn2" data-back>Quay lại</button>' : ''}
        </form>`, { focus: variant === 'new' || variant === 'removed' ? '#g-rn' : '#g-cc' });
      if (variant !== 'new') setTimeout(() => $('#g-cc')?.focus(), 30);
      $('[data-back]')?.addEventListener('click', roleScreen);
      const f = $('form');
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const realName = f.realName.value.trim().replace(/\s+/g, ' '), nickname = f.nickname.value.trim().replace(/\s+/g, ' ');
        const code = D.cleanClassCode(f.code.value);
        if (realName.length < 2) { msg('Nhập họ và tên thật của em (ít nhất 2 chữ cái).'); return f.realName.focus(); }
        if (!nickname) { msg('Nhập nick name của em.'); return f.nickname.focus(); }
        if (!D.validClassCode(code)) { msg('Mã lớp gồm chữ và số, ít nhất 4 ký tự.'); return f.code.focus(); }
        const go = f.querySelector('.btn'); go.disabled = true; msg('Đang gửi…', false);
        try {
          await D.submitJoin(h, user, { realName, nickname, code }, mode);
          if (mode === 'create') decide(user); // đọc lại hồ sơ vừa tạo → màn chờ duyệt
        } catch (err) {
          go.disabled = false;
          if (err.kind === 'bad-code') { msg('Mã lớp không đúng.'); f.code.focus(); }
          else msg('Chưa gửi được. Em kiểm tra mạng rồi thử lại.');
        }
      });
    };

    const pendingScreen = (student) => {
      show(`<img class="g-mai" src="img/comai-face.webp" alt="" width="72" height="72"><h1 class="g-h">Đang chờ cô duyệt</h1>
        <p class="g-p">Yêu cầu của em đã gửi. Khi cô duyệt, trang này tự mở ra, em không cần làm gì thêm.</p>
        <dl class="g-sum"><dt>Nick name</dt><dd>${esc(student.nickname)}</dd><dt>Mã lớp</dt><dd>${esc(student.joinCode)}</dd></dl>
        <button type="button" class="btn2" data-other>Nhập mã lớp khác</button>`);
      $('[data-other]').addEventListener('click', () => studentForm({ mode: 'resubmit', student, variant: 'pending' }));
    };

    const teacherForm = () => {
      show(`<h1 class="g-h">Mã giáo viên</h1>
        <p class="g-p">Nhập <b>mã giáo viên</b> do quản trị cấp (dùng một lần). Đây không phải «mã lớp» của học sinh.</p>
        <form class="g-form" novalidate>
          <label for="g-tn">Tên hiển thị</label>
          <input id="g-tn" name="displayName" autocomplete="name" maxlength="60" required placeholder="Ví dụ: Cô Mai">
          <label for="g-tc">Mã giáo viên</label>
          <input id="g-tc" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="14" required placeholder="10–12 chữ và số">
          <p class="field-msg" aria-live="polite"></p>
          <button type="submit" class="btn">Xác nhận</button>
          <button type="button" class="btn2" data-back>Quay lại</button>
        </form>`, { focus: '#g-tn' });
      $('[data-back]').addEventListener('click', roleScreen);
      const f = $('form');
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const displayName = f.displayName.value.trim().replace(/\s+/g, ' ');
        const code = f.code.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!displayName) { msg('Nhập tên hiển thị.'); return f.displayName.focus(); }
        if (!D.validInviteCode(code)) { msg('Mã giáo viên không đúng.'); return f.code.focus(); }
        const go = f.querySelector('.btn'); go.disabled = true; msg('Đang kiểm tra…', false);
        try { await D.redeemTeacherInvite(h, user, { displayName, code }); decide(user); }
        catch (err) {
          go.disabled = false;
          if (err.kind === 'bad-invite') { msg('Mã giáo viên không đúng hoặc đã được dùng.'); f.code.focus(); }
          else msg('Chưa gửi được. Em kiểm tra mạng rồi thử lại.');
        }
      });
    };

    const blockedScreen = (text) => show(`<h1 class="g-h">Tài khoản chưa dùng được</h1><p class="g-p">${esc(text)}</p>`);

    // Trang giáo viên / quản trị (GĐ 3) nằm trong staff.js, tải khi cần; cổng được nới rộng cho bảng danh sách.
    const mountStaffUi = async (opts) => {
      const my = seq;
      const m = await import('./staff.js');
      if (my !== seq) return;
      root.classList.add('wide');
      m.mountStaff(main, { h, user, onProfile: () => decide(user), ...opts });
    };
    const teacherHome = (t) => mountStaffUi({ teacher: t, admin: false });
    const adminHome = (t) => mountStaffUi({ teacher: t, admin: true });

    // ---------- mở cổng cho học sinh đã được duyệt ----------
    const unmount = () => {
      root.remove(); document.body.classList.remove('gated');
      app.removeAttribute('inert'); app.removeAttribute('aria-hidden');
    };
    // Học sinh đang học mà bị gỡ / hồ sơ đổi: dựng lại cổng đè lên web (web bị khoá, không bấm/gõ/nộp bài được)
    const remount = () => {
      if (root.isConnected) return;
      if (ctx.account) ctx.account.active = false;                       // đồng bộ tạm dừng ghi lên máy chủ
      document.body.append(root); document.body.classList.add('gated');
      app.setAttribute('inert', ''); app.setAttribute('aria-hidden', 'true');
    };
    const finish = (student) => {
      if (finished) {                                                    // được duyệt lại sau khi bị gỡ: học tiếp ngay tại chỗ
        const a = epochOf(ctx.account.student), b = epochOf(student);
        if (!unknownEpoch(a) && !unknownEpoch(b) && !sameEpoch(a, b)) {   // hồ sơ đã bị xoá và TẠO LẠI trong lúc tab này mở (không kịp thấy lúc bị xoá)
          dispatchEvent(new Event('wu:wiped'));
          return lockAndReload('wiped', null, 'Hồ sơ của em đã được tạo lại sau khi dữ liệu bị xoá. Đang tải lại…');
        }
        ctx.account.student = student; ctx.account.active = true; unmount();
        dispatchEvent(new Event('wu:approved'));                         // đồng bộ mở khoá và gửi bù bài đang kẹt
        return;
      }
      finished = true;
      // Hồ sơ được TẠO LẠI sau khi quản trị xoá dữ liệu (ví dụ học sinh xin vào lại và được duyệt trên điện thoại, còn máy này đóng suốt thời gian đó):
      // kho trên máy này thuộc hồ sơ CŨ → cách ly TRƯỚC khi đồng bộ, kẻo đẩy dữ liệu đã xoá lên hồ sơ mới.
      const ep = epochOf(student), mine = peekFor(user.uid, 'profileEpoch', null);
      if (!unknownEpoch(ep)) {
        if (mine && !sameEpoch(mine, ep) && peekFor(user.uid, 'wasStudent', false)) quarantineWipe(user.uid);
        saveFor(user.uid, 'profileEpoch', ep);
      }
      // Từ đây mọi dữ liệu lưu trên máy (nháp, tiến độ, My Work, sao…) nằm trong kho riêng của tài khoản này.
      // KHÔNG dừng theo dõi hồ sơ: nếu cô gỡ em khi đang học thì màn tự chuyển (xem handleStudent).
      setScope(user.uid);
      save('studentName', student.nickname);
      ctx.account = { uid: user.uid, email: user.email, student, h, active: true };
      unmount();
      resolve(ctx.account);
    };

    // ---------- quyết định màn theo trạng thái ----------
    // Tab khác trong cùng trình duyệt đổi tài khoản (đăng xuất hoặc đăng nhập UID khác) khi tab này đang học:
    // khoá màn NGAY (web inert, cổng phủ kín) rồi nạp lại trang để khởi tạo theo tài khoản mới
    // (kho dữ liệu, tiến độ, My Work, tên đều đọc lại từ đầu; không giữ lại gì của tài khoản cũ trong bộ nhớ trang).
    let switching = false;
    const lockAndReload = (why, toUid, text) => {
      if (switching) return; switching = true;
      unsub?.(); unsub = null; seq++;
      remount(); splash(text || 'Tài khoản đã thay đổi. Đang tải lại…');
      try { sessionStorage.setItem('wu:switch', JSON.stringify({ why, from: ctx.account.uid, to: toUid || null, locked: app.inert === true && document.body.classList.contains('gated') })); } catch { /* bỏ qua */ }
      requestAnimationFrame(() => requestAnimationFrame(() => location.reload()));
    };

    const decide = async (u) => {
      if (finished) {                                  // đã vào học bằng ctx.account.uid
        if (!u) return lockAndReload('signout', null);
        if (u.uid !== ctx.account.uid) return lockAndReload('switch', u.uid);
        return;                                        // cùng tài khoản (làm mới token): không làm gì
      }
      const my = ++seq;
      unsub?.(); unsub = null;
      user = u; setWho();
      if (!u) return loginScreen();
      splash();
      let roles;
      try { roles = await D.getRoles(h, u.uid); }
      catch { if (my === seq) errorScreen(() => decide(u)); return; }
      if (my !== seq) return;
      // Hồ sơ học sinh đã biến mất trong lúc máy này đóng / mất mạng (quản trị «Xoá dữ liệu học sinh»): cách ly bản sao trên máy
      // TRƯỚC khi cho vào lại, để bài / tiến độ đã xoá không bị đẩy ngược lên máy chủ.
      if (!roles.student && !roles.teacher && peekFor(u.uid, 'wasStudent', false)) quarantineWipe(u.uid);
      if (roles.teacher && roles.student) return blockedScreen('Tài khoản này có cả hồ sơ học sinh và giáo viên. Hãy nhắn cô để được xử lý.');
      if (D.isAdminUser(u) && !roles.student) return adminHome(roles.teacher);
      if (roles.teacher) {
        if (roles.teacher.active !== true) return blockedScreen('Tài khoản giáo viên đang bị khoá. Hãy liên hệ quản trị.');
        return teacherHome(roles.teacher);
      }
      if (roles.student) return handleStudent(u, roles.student, my);
      roleScreen();
    };

    // hồ sơ học sinh có thể đổi (cô duyệt / từ chối / gỡ) → theo dõi để màn tự cập nhật
    const handleStudent = (u, first, my) => {
      const apply = (s) => {
        if (my !== seq) return;
        if (s && s.status === 'approved') return finish(s);
        if (!s && finished) {              // hồ sơ bị XOÁ khi đang học: cách ly dữ liệu trên máy, khoá màn, nạp lại để vào lại từ đầu (không giữ gì trong bộ nhớ trang)
          dispatchEvent(new Event('wu:wiped'));
          return lockAndReload('wiped', null, 'Dữ liệu của em đã bị quản trị xoá. Đang tải lại…');
        }
        if (finished) remount();           // đang học mà không còn được duyệt (bị gỡ, từ chối): hiện màn thông báo ngay, không cần tải lại
        if (!s) { return roleScreen(); }
        if (s.status === 'pending') return pendingScreen(s);
        if (s.status === 'rejected') return studentForm({ mode: 'resubmit', student: s, variant: 'rejected' });
        if (s.status === 'removed') return studentForm({ mode: 'resubmit', student: s, variant: 'removed' });
        blockedScreen('Trạng thái tài khoản không nhận ra được. Hãy nhắn cô.');
      };
      apply(first);
      let n = 0; // bỏ lần gọi đầu (trùng với dữ liệu vừa đọc)
      unsub = D.watchStudent(h, u.uid, (s) => { if (n++ > 0) apply(s); }, () => {});
    };

    // ---------- khởi động ----------
    const boot = async () => {
      splash();
      try { h = await loadFirebase(); }
      catch { return errorScreen(boot, 'Chưa tải được dịch vụ đăng nhập. Em kiểm tra mạng rồi thử lại.'); }
      if (h.emu) {
        // chỉ có trong bộ kiểm thử (localhost + ?emu=1): đăng nhập giả để Playwright điều khiển
        window.__wu = {
          fakeSignIn: (email, name = '') => h.A.signInWithCredential(h.auth, h.A.GoogleAuthProvider.credential(JSON.stringify({ sub: 'sub-' + email, email, email_verified: true, display_name: name }))),
          signOut: () => h.A.signOut(h.auth),
          uid: () => h.auth.currentUser?.uid || null,
          account: () => ctx.account,                   // (kiểm thử) xem / chỉnh trạng thái đồng bộ
        };
      }
      // Firebase có thể phát lại sự kiện cho CÙNG một tài khoản (làm mới thông tin): bỏ qua, kẻo màn đang hiện bị dựng lại
      // đúng lúc người dùng đang gõ / bấm. Đổi tài khoản hoặc đăng xuất thì vẫn xử lý.
      let lastUid;
      h.A.onAuthStateChanged(h.auth, (u) => { const id = u ? u.uid : null; if (lastUid !== undefined && id === lastUid) return; lastUid = id; decide(u); });
    };
    boot();
  });
}
