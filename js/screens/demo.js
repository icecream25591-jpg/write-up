// MÀN GIẢ của Phần 0 – chỉ để thử khung, menu, điều hướng, cô Mai.
// Các phần sau sẽ thay bằng màn thật đọc từ data/sXX.json.
import { pageScreen, sessionScreen } from '../shell.js';
import { STAGES, href } from '../router.js';

const filler = (k) => Array.from({ length: k }, (_, i) =>
  `<div class="card demo"><b>Khối thử ${i + 1}</b><p>Nội dung giả để kiểm tra vùng giữa cuộn dọc mà thanh trên và thanh nút dưới vẫn đứng yên.</p></div>`).join('');

export function home(ctx) {
  const { el, body } = pageScreen('Home');
  const s = ctx.demo;
  body.innerHTML = `
    <div class="hero"><h1>Hi ${ctx.studentName}!</h1>
      <p>Hôm nay mình viết về <b style="color:var(--primary-shadow)">${s.topic}</b>. Khoảng 25 phút là xong một trạm.</p></div>
    <div class="card demo">
      <div class="lbl">Now learning · Station ${s.n} / 22</div>
      <b style="font-size:1.25rem">${s.topic}</b>
      <a class="btn" href="${href.stage(s.n, 0)}">Continue</a>
    </div>
    <div class="card demo"><b>Thử nhanh các chặng</b>
      <div class="link-list">${STAGES.map((st, i) => `<a class="btn2" href="${href.stage(s.n, i)}">${st.name}</a>`).join('')}</div>
    </div>
    ${filler(3)}`;
  return { el };
}

export function journey(ctx) {
  const { el, body } = pageScreen('Journey · 22 stations');
  body.insertAdjacentHTML('beforeend', `<p class="demo" style="padding:0;margin:0;color:var(--ink-2)">Màn giả: bản đồ 22 trạm sẽ làm ở phần sau.</p>
    <div class="link-list">${Array.from({ length: 22 }, (_, i) =>
      `<a class="btn2" href="${href.stage(i + 1, 0)}">S${i + 1}</a>`).join('')}</div>`);
  return { el };
}

export function work() {
  const { el, body } = pageScreen('My Work');
  body.insertAdjacentHTML('beforeend', `<div class="card demo"><b>Feedback · Draft 2</b><p>Màn giả: nhập mã để xem nhận xét của cô (làm ở phần sau).</p></div>${filler(2)}`);
  return { el };
}

export function settings(ctx) {
  const { el, body } = pageScreen('Settings');
  body.insertAdjacentHTML('beforeend', `<div class="card demo">
      <label for="st-name"><b>Your name</b></label>
      <input id="st-name" value="${ctx.studentName}" style="min-height:44px;border-radius:12px;border:2px solid var(--border);padding:0 12px" disabled>
      <p>Màn giả: tên, mã học sinh, âm thanh, cỡ chữ, xuất / nhập tiến độ sẽ làm ở phần sau.</p></div>`);
  return { el };
}

const TIPS = [
  ['Recall', 'Đọc kỹ cả câu trước khi chọn. Sai cũng không sao – xem lý do rồi làm câu tiếp.'],
  ['Sentences', 'Mỗi câu phải có <b>chủ ngữ + động từ chính</b>. Chạm chip cụm từ để chèn vào ô viết.'],
  ['Ideas', 'Chọn <b>MỘT</b> hướng (Claim) rồi mới tìm How → Example → Result cùng nhánh.'],
  ['allow / enable + O + to V', '<i>A recorded lesson <b>allows students to pause</b>…</i> Sau allow / enable là tân ngữ rồi <b>to V</b>. Sau giới từ (by, for…) là V-ing.'],
  ['Reward', 'Giỏi lắm! Nhớ vào My Work xem nhận xét của cô để viết bản 2.'],
];

// Session chưa có dữ liệu (S4…): toàn bộ màn giả.
export function session(ctx, route) {
  const { n, stage } = route;
  const topic = `Session ${n}`;
  const done = new Set(Array.from({ length: stage }, (_, i) => i));
  const [tipT, tipH] = TIPS[stage];
  const s = sessionScreen({ n, topic, stage, done, tip: stage < 4 ? { title: `Ms Mai’s tip · ${tipT}`, html: tipH } : null });
  s.body.insertAdjacentHTML('afterbegin', `<div class="card demo"><b>S${n} chưa có nội dung</b><p>Dữ liệu data/s${String(n).padStart(2, '0')}.json chưa soạn. Đây là màn giả để thử khung.</p></div>`);
  fillStage(s, { n, stage });
  return s;
}

// Chặng chưa làm (Ideas, Write & Check, Reward) của session đã có dữ liệu: màn giả.
export function fillStage(s, { n, stage }) {
  const plan = `<div class="card demo"><b>My plan <span class="lbl" style="text-transform:none;letter-spacing:0">(4 màu nhánh)</span></b>
      <div class="branch-row b-claim"><b>Claim</b><span>replay a recorded lesson</span></div>
      <div class="branch-row b-how"><b>How</b><span>pause and rewind the hard step</span></div>
      <div class="branch-row b-example"><b>Example</b><span>Vy · a maths video</span></div>
      <div class="branch-row b-result"><b>Result</b><span>finish homework without help</span></div></div>`;
  const writing = `<div class="card demo"><label for="demo-ta"><b>Your paragraph</b></label>
      <textarea id="demo-ta" placeholder="Gõ thử ở đây rồi chạm cô Mai: bong bóng không được che ô đang gõ."></textarea></div>`;
  const pic = `<div class="demo-block" style="aspect-ratio:3/2;height:auto">Tranh ${STAGES[stage].name} (giữ chỗ 3:2)</div>`;

  s.body.insertAdjacentHTML('beforeend', `<div class="cols">
      <div class="col-l">${pic}${stage === 2 || stage === 3 ? plan : ''}</div>
      <div class="col-r">${stage === 3 ? writing : ''}${filler(4)}</div>
    </div>`);

  const next = stage < 4 ? href.stage(n, stage + 1) : '#/home';
  s.footIn.innerHTML = `<span class="hint">Màn giả · chặng ${stage + 1}/5</span>
    <a class="btn" href="${next}">${stage < 4 ? 'Continue' : 'Home'}</a>`;
}
