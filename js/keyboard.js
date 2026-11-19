// Bàn phím ảo: khi gõ trong vùng giữa, giữ ô đang gõ ở giữa phần màn hình còn thấy.
// Dùng visualViewport (khi bàn phím bật, chiều cao nhìn thấy giảm) và đánh dấu body.kb-open.
const isField = (el) => el?.matches?.('textarea, input:not([type=checkbox]):not([type=radio]):not([type=button])');

export function initKeyboard() {
  const center = () => {
    const el = document.activeElement;
    if (!isField(el) || !el.closest('.sess-body')) return;
    // Bong bóng cô Mai đang mở thì mai.js đã đặt ô viết lên trên bong bóng – không cuộn lại.
    if (document.querySelector('.mai-bubble:not([hidden])')) return;
    el.scrollIntoView({ block: 'center', behavior: 'auto' });
  };
  document.addEventListener('focusin', (e) => {
    if (!isField(e.target)) return;
    document.body.classList.add('typing');
    setTimeout(center, 300); // chờ bàn phím mở xong
  });
  document.addEventListener('focusout', (e) => {
    if (isField(e.target)) setTimeout(() => { if (!isField(document.activeElement)) document.body.classList.remove('typing'); }, 50);
  });
  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener('resize', () => {
      const open = vv.height < window.innerHeight * 0.8;
      document.body.classList.toggle('kb-open', open);
      document.documentElement.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
      if (open) center();
    });
  }
}
