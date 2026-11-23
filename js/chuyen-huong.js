/* Chuyển link GitHub Pages cũ sang link chính của web (Firebase Hosting), giữ nguyên đường dẫn, tham số và phần sau dấu #.
 * Chỉ chạy trên tên miền GitHub Pages cũ; trên Firebase hay localhost không làm gì.
 *  - CHUYEN_TAT_CA = false (hiện tại, đợt thử): chỉ chuyển khi địa chỉ có ?accounts=1; link thường vẫn chạy bản cũ tại chỗ
 *    (dữ liệu học lưu trên trình duyệt theo từng tên miền, nên chưa chuyển hàng loạt để học sinh đang học không mất dữ liệu trên máy).
 *  - Khi cô quyết định mở link chính thức: đổi CHUYEN_TAT_CA thành true. */
(function () {
  var CU = 'icecream25591-jpg.github.io', MOI = 'https://write-up-hsg-2026.firebaseapp.com', CHUYEN_TAT_CA = false;
  if (location.hostname !== CU) return;
  if (!CHUYEN_TAT_CA && !/[?&]accounts=1(&|$)/.test(location.search)) return;
  var path = location.pathname.replace(/^\/write-up(\/|$)/, '/');
  location.replace(MOI + path + location.search + location.hash);
})();
