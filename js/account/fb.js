// Tải Firebase (Auth + Firestore) từ CDN chính thức, chỉ khi cần. Không bước build.
const VER = '13.4.0';
const CDN = `https://www.gstatic.com/firebasejs/${VER}/`;
// Chế độ emulator CHỈ bật khi: máy chủ là localhost VÀ địa chỉ có ?emu=1 (dùng cho bộ kiểm thử).
const EMU = { projectId: 'demo-writeup-test', auth: 'http://127.0.0.1:9099', fsHost: '127.0.0.1', fsPort: 8080 };
export const emulatorOn = () =>
  ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && new URLSearchParams(location.search).get('emu') === '1';

let pending = null;
export function loadFirebase() {
  if (!pending) {
    pending = (async () => {
      const emu = emulatorOn();
      const [appM, A, F] = await Promise.all([
        import(CDN + 'firebase-app.js'), import(CDN + 'firebase-auth.js'), import(CDN + 'firebase-firestore.js'),
      ]);
      let cfg;
      if (emu) cfg = { apiKey: 'demo-key', projectId: EMU.projectId, authDomain: 'localhost' };
      else cfg = await (await fetch('firebase-config.json', { cache: 'no-cache' })).json();
      const app = appM.initializeApp(cfg);
      const auth = A.getAuth(app);
      let db;
      try {
        // bộ nhớ offline: ghi khi mất mạng, tự gửi lại khi có mạng
        db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
      } catch { db = F.initializeFirestore(app, {}); } // trình duyệt không hỗ trợ (WebView cũ): chạy không offline
      if (emu) { A.connectAuthEmulator(auth, EMU.auth, { disableWarnings: true }); F.connectFirestoreEmulator(db, EMU.fsHost, EMU.fsPort); }
      return { app, auth, db, A, F, emu };
    })().catch((e) => { pending = null; throw e; }); // lần sau thử tải lại
  }
  return pending;
}
