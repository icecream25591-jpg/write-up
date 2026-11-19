# Write Up! – trang web luyện viết HSG lớp 11

Web tĩnh: HTML + CSS + JavaScript thuần (ES modules), không bước build, miễn phí (GitHub Pages + Google Sheets).

## Chạy thử trên máy
Bấm đúp `CHAY-THU-WEB.bat` ở thư mục dự án, hoặc:
```
node tools/serve.mjs
```
Mở `http://localhost:5173/`. Điện thoại cùng wifi: mở địa chỉ `http://<IP máy tính>:5173/` mà cửa sổ in ra. (Cũng chạy được bằng `npx serve site` hoặc Live Server.)

Trang kiểm tra nội bộ: `dev/anh.html` (soát ảnh, khung tranh, dung lượng), `dev/am-thanh.html` (nghe thử 6 tiếng).

## Đăng lên GitHub Pages
1. Tạo repo trên GitHub, đẩy **nội dung thư mục `site/`** lên nhánh `main` (index.html nằm ở gốc repo).
2. Repo → **Settings → Pages** → Source: *Deploy from a branch* → Branch `main`, thư mục `/ (root)` → Save.
3. Sau 1–2 phút có link dạng `https://<tên>.github.io/<repo>/`. Gửi link cho học sinh (mở được trong Zalo).

## Nối Google Sheet (thu bài, trả nhận xét)
Xem `docs/huong-dan-google-sheet.md`. Dán URL Ứng dụng web vào `config.json → sheetUrl`.

## Cấu hình (`config.json`)
- `sessionsReady`: các session đã có dữ liệu và được mở, ví dụ `[1, 2, 3]`.
- `lockOrder`: `true` = học sinh học theo thứ tự trạm; `false` = mở tự do.
- `sheetUrl`: URL Apps Script; để trống thì bài chỉ lưu trên máy học sinh.

## Thêm một session (ví dụ S4)
1. Soạn `data/s04.json` bằng skill `luyen-viet-soan-bai` (bám `content/noi-dung-S1-S22.md`).
2. Xuất ảnh `s04-cau`, `s04-y` bằng skill `luyen-viet-hinh-tieng`, soát `img/panels.json`, rồi `node tools/make-thumbs.mjs`.
3. Kiểm: `node tools/check-data.mjs` và `node tools/kiem-trung.mjs`.
4. Thêm `4` vào `config.json → sessionsReady`.
5. Chạy lại toàn bộ kiểm: `node tools/nghiem-thu.mjs`.

## Thay ảnh
Đặt PNG mới vào `Write_Up_Chinh_Mau/` (giữ đúng tên), chạy
```
node .claude/skills/luyen-viet-hinh-tieng/scripts/process-images.mjs --src Write_Up_Chinh_Mau --out site/img --only <tên ảnh>
node tools/make-thumbs.mjs
node tools/anh-manifest.mjs
```
rồi mở `dev/anh.html` để soát.

## Cấu trúc
- `index.html` · `config.json`
- `css/` – `tokens.css` (màu), `app.css` (khung), `stages.css`, `ideas.css`, `write.css`, `home.css`, `work.css`
- `js/` – `main.js` khởi động · `router.js` · `shell.js` · `screens/` (các màn) · `sync.js` (gửi bài, nhận xét) · `sfx.js` (âm thanh) · `store.js`, `progress.js` (lưu trên máy)
- `data/` – `sXX.json`, `index.json` · `img/` – WebP · `fonts/` – Nunito · `dev/` – trang kiểm
- Ghi nguồn: `CREDITS.md`
