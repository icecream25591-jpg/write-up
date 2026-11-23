// Nhận biết trình duyệt nhúng (Zalo, Facebook, Messenger…): Google chặn đăng nhập ở đây (disallowed_useragent).
// Hàm thuần, không đụng DOM, để kiểm thử bằng nhiều chuỗi User-Agent.
export function inAppBrowser(ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '')) {
  const u = ua || '';
  const ios = /iPhone|iPad|iPod/i.test(u);
  const android = /Android/i.test(u);
  const platform = ios ? 'ios' : android ? 'android' : 'other';
  const apps = [
    ['Zalo', /Zalo/i],
    ['Messenger', /Messenger|FB_IAB\/MESSENGER|FBAN\/Messenger/i],
    ['Facebook', /FBAN|FBAV|FB_IAB|FBIOS/i],
    ['Instagram', /Instagram/i],
    ['TikTok', /musical_ly|BytedanceWebview|TikTok/i],
    ['Line', /\bLine\//i],
    ['Snapchat', /Snapchat/i],
  ];
  for (const [name, re] of apps) if (re.test(u)) return { name, platform };
  // iOS: trình duyệt nhúng (WKWebView) không có 'Safari' hay 'CriOS/FxiOS/EdgiOS' trong UA
  if (ios && !/Safari|CriOS|FxiOS|EdgiOS|OPiOS/i.test(u)) return { name: 'ứng dụng', platform };
  // Android WebView chung: dấu '; wv)' trong UA
  if (android && /; wv\)/i.test(u)) return { name: 'ứng dụng', platform };
  return null;
}

/** Liên kết mở thẳng bằng Chrome trên Android (intent). */
export function chromeIntentUrl(href = location.href) {
  const u = new URL(href);
  const scheme = u.protocol.replace(':', '');
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${scheme};package=com.android.chrome;end`;
}
