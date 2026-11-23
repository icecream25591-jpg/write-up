// Nút cô Mai (60px, viền xanh lá) nằm trong thanh nút dưới, góc phải.
// Chạm: mở/đóng bong bóng "Ms Mai’s tip". Bong bóng không che ô đang gõ.
let seq = 0;

export function createMai({ title = 'Ms Mai’s tip', html = '' } = {}) {
  const id = `mai-tip-${++seq}`;
  const wrap = document.createElement('div');
  wrap.className = 'mai';
  wrap.innerHTML = `
    <div class="mai-bubble" id="${id}" role="dialog" aria-label="Ms Mai’s tip" hidden>
      <h2>${title}</h2><p></p>
    </div>
    <button type="button" class="mai-btn" aria-label="Ms Mai’s tip" aria-expanded="false" aria-controls="${id}">
      <img src="img/comai-face.webp" alt="" width="60" height="60" decoding="async">
    </button>`;
  const bubble = wrap.querySelector('.mai-bubble');
  const btn = wrap.querySelector('.mai-btn');
  bubble.querySelector('p').innerHTML = html;

  const scroller = () => wrap.closest('.screen')?.querySelector('.sess-body');
  const headH = () => document.querySelector('.sess-head')?.getBoundingClientRect().bottom || 0;
  const isField = (el) => el && el.matches?.('textarea, input:not([type=checkbox]):not([type=radio]), [contenteditable="true"]');

  function open() {
    bubble.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    avoidField();
  }
  function close() {
    if (bubble.hidden) return;
    bubble.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    const body = scroller();
    if (body) body.style.paddingBottom = '';
  }
  const toggle = () => (bubble.hidden ? open() : close());

  // Nếu đang gõ trong một ô mà bong bóng đè lên: chừa chỗ dưới và cuộn ô lên trên bong bóng.
  function avoidField() {
    const body = scroller();
    const el = isField(document.activeElement) ? document.activeElement : lastField;
    if (!body || !isField(el) || !body.contains(el)) return;
    // Tính theo kích thước thật (bỏ qua hiệu ứng phóng to khi bong bóng hiện ra).
    const bubbleTop = () => btn.getBoundingClientRect().bottom - 76 - bubble.offsetHeight;
    body.style.paddingBottom = `${bubble.offsetHeight + 24}px`;
    const overlap = el.getBoundingClientRect().bottom + 8 - bubbleTop();
    if (overlap > 0) window.scrollBy({ top: overlap });
    // Cuộn rồi mà vẫn đè (ô quá cao hoặc màn quá thấp): ưu tiên việc gõ, đóng bong bóng.
    const r = el.getBoundingClientRect();
    if (r.bottom + 4 > bubbleTop() || r.top < headH() - 1) {
      close();
      el.scrollIntoView({ block: 'center' });
    }
  }

  const ac = new AbortController();
  const opt = { signal: ac.signal };
  // Ô vừa gõ gần nhất (chạm nút có thể làm ô mất focus trên một số máy).
  let lastField = null;
  document.addEventListener('focusout', (e) => {
    if (!isField(e.target)) return;
    lastField = e.target;
    setTimeout(() => { if (lastField === e.target) lastField = null; }, 600);
  }, opt);
  // Không lấy focus khỏi ô đang gõ: bàn phím vẫn mở, đọc mẹo xong gõ tiếp.
  btn.addEventListener('mousedown', (e) => { if (isField(document.activeElement)) e.preventDefault(); }, opt);
  btn.addEventListener('click', toggle, opt);
  // Bắt đầu gõ khi bong bóng đang mở -> đóng để không che ô viết.
  document.addEventListener('focusin', (e) => { if (isField(e.target) && !wrap.contains(e.target)) close(); }, opt);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !bubble.hidden) { close(); btn.focus(); } }, opt);

  return {
    el: wrap,
    close,
    destroy: () => ac.abort(),
    setTip(newTitle, newHtml) {
      bubble.querySelector('h2').textContent = newTitle;
      bubble.querySelector('p').innerHTML = newHtml;
    },
  };
}
