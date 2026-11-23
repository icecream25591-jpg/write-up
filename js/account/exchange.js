// Xuất bài nộp để chấm trên máy giáo viên (skill luyen-viet-cham-bai) và nhập lại nhận xét (Giai đoạn 5). Hàm thuần, kiểm riêng bằng tools/test-exchange.mjs.
//
//  XUẤT  (định dạng «writeup-baonop/1»): JSON và CSV cùng một nội dung, mỗi dòng một bài nộp của học sinh ĐÃ DUYỆT trong lớp.
//  NHẬP  (định dạng «writeup-nhanxet/1»): JSON hoặc CSV, mỗi dòng một nhận xét theo id_bai. CSV xuất ra có sẵn các cột nhận xét nên điền vào đó rồi nhập lại được.
//  Tên cột dùng lại tên cũ của bản Google Sheet (cau_nhan_xet, nhanh, nhan_xet, cau_khen, khen, diem) để skill và web học dùng chung.
//  Không có email học sinh trong tệp xuất (chỉ nick name và họ tên thật mà giáo viên vốn đã xem được).

export const EXPORT_FORMAT = 'writeup-baonop/1';
export const IMPORT_FORMAT = 'writeup-nhanxet/1';
export const BRANCHES = ['Claim', 'How', 'Why', 'Example', 'Result', 'Topic sentence', 'Conclusion', 'Other'];
export const LIMITS = { nhan_xet: 2000, khen: 1000, cau: 600, nhanh: 30, diem: 20 };   // ≤ giới hạn trong firestore.rules (nhận xét 2000, lời khen 1000)

const FB_COLS = ['cau_nhan_xet', 'nhanh', 'nhan_xet', 'cau_khen', 'khen', 'diem'];
export const CSV_COLS = ['id_bai', 'nick', 'ho_ten', 'session', 'luot', 'id_ban_1', 'muc', 'de', 'bai_viet', 'so_tu', 'dan_y', 'tu_soat', 'sua_loi', 'nop_luc', 'da_xem', ...FB_COLS];

const str = (x) => (x == null ? '' : String(x));
const msOf = (t) => { try { if (!t) return 0; if (typeof t.toMillis === 'function') return t.toMillis(); if (typeof t.toDate === 'function') return t.toDate().getTime(); return new Date(t).getTime() || 0; } catch { return 0; } };

/** Trạng thái nhận xét của một bài (so thời điểm nhận xét feedbackAt với lần em xem seenAt):
 *  none = chưa nhận xét · unseen = đã nhận xét, em chưa xem · stale = em đã xem bản CŨ, cô đã sửa lại (bản mới chưa xem) · seen = em đã xem bản hiện tại. */
export function fbStatus(sub) {
  if (!sub?.feedback) return { code: 'none', label: 'chờ nhận xét' };
  const f = msOf(sub.feedbackAt), s = msOf(sub.seenAt);
  if (!s) return { code: 'unseen', label: 'đã nhận xét · em chưa xem' };
  if (s < f) return { code: 'stale', label: 'đã nhận xét · bản mới chưa được em xem' };
  return { code: 'seen', label: 'đã nhận xét · em đã xem' };
}
const iso = (t) => {
  if (!t) return '';
  try {
    if (typeof t.toDate === 'function') return t.toDate().toISOString();
    if (typeof t.toMillis === 'function') return new Date(t.toMillis()).toISOString();
    return new Date(t).toISOString();
  } catch { return ''; }
};
const planText = (plan) => (plan?.lanes || []).map((l) => `${l.en}: ${(l.items || []).join(' · ') || '—'}`).join(' | ');
const editsText = (it) => (it.edits ? (it.editsNone ? 'không có' : it.edits.map((x) => `[${x.code}] ${x.before} → ${x.after}`).join('; ')) : '');

/** Nhận xét trên máy chủ (sentence, branch…) → dạng tên cột (cau_nhan_xet, nhanh…). */
export const fbToRow = (f) => ({
  cau_nhan_xet: str(f?.sentence), nhanh: str(f?.branch), nhan_xet: str(f?.comment), cau_khen: str(f?.praiseSentence), khen: str(f?.praise), diem: f?.score == null ? '' : str(f.score),
});
/** Dạng tên cột → nhận xét để ghi lên máy chủ (bỏ trường rỗng; điểm số giữ là số khi đọc được). */
export function rowToFb(r) {
  const o = {};
  if (str(r.cau_nhan_xet).trim()) o.sentence = str(r.cau_nhan_xet).trim();
  if (str(r.nhanh).trim()) o.branch = str(r.nhanh).trim();
  if (str(r.nhan_xet).trim()) o.comment = str(r.nhan_xet).trim();
  if (str(r.cau_khen).trim()) o.praiseSentence = str(r.cau_khen).trim();
  if (str(r.khen).trim()) o.praise = str(r.khen).trim();
  const d = str(r.diem).trim();
  if (d) o.score = /^-?\d+([.,]\d+)?$/.test(d) ? Number(d.replace(',', '.')) : d;
  return o;
}

// ------------------------------------------------------------------ CSV
const needsQuote = /[",\r\n]/;
export const csvCell = (v) => { const s = str(v); return needsQuote.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCSV = (cols, rows) => '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\r\n') + '\r\n';

/** Đọc CSV (RFC 4180: ô có dấu ngoặc kép, dấu phẩy, xuống dòng; bỏ BOM; chịu cả CRLF và LF). Trả về mảng các mảng ô. */
export function parseCSV(text) {
  const s = String(text).replace(/^﻿/, '');
  const rows = []; let row = [], cell = '', q = false, i = 0, any = false;
  while (i < s.length) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i += 2; continue; } q = false; i++; continue; }
      cell += c; i++; continue;
    }
    if (c === '"') { q = true; any = true; i++; continue; }
    if (c === ',') { row.push(cell); cell = ''; any = true; i++; continue; }
    if (c === '\r' || c === '\n') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (any || row.length > 1 || row[0] !== '') rows.push(row);
      row = []; any = false; i++; continue;
    }
    cell += c; any = true; i++;
  }
  if (any || cell !== '' || row.length) { row.push(cell); rows.push(row); }
  if (q) throw new Error('Tệp CSV bị thiếu dấu ngoặc kép đóng.');
  return rows;
}

// ------------------------------------------------------------------ XUẤT
const slug = (s) => String(s || 'lop').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'lop';

/** students: [{id, nickname, realName}], submissions: [{id, studentId, session, draft, draft1Id, level, prompt, text, words, plan, selfCheck, edits, editsNone, submittedAt, seenAt, feedback}].
 *  Chỉ giữ bài của học sinh có trong `students` (đã duyệt trong lớp). */
export function buildExport({ lop, students, submissions, now = new Date() }) {
  const by = new Map(students.map((s) => [s.id, s]));
  const rows = submissions.filter((x) => by.has(x.studentId)).map((x) => {
    const s = by.get(x.studentId);
    return {
      id_bai: x.id, nick: s.nickname, ho_ten: s.realName, session: str(x.session), luot: x.draft === 2 ? 2 : 1, id_ban_1: str(x.draft1Id), muc: str(x.level), de: str(x.prompt),
      bai_viet: str(x.text), so_tu: x.words || 0, dan_y: planText(x.plan), tu_soat: (x.selfCheck || []).join(' '), sua_loi: editsText(x), nop_luc: iso(x.submittedAt), da_xem: ['seen'].includes(fbStatus(x).code) ? 'có' : '',
      ...fbToRow(x.feedback),
    };
  }).sort((a, b) => String(a.nick).localeCompare(String(b.nick), 'vi') || String(a.session).localeCompare(String(b.session)) || a.luot - b.luot || String(a.nop_luc).localeCompare(String(b.nop_luc)));
  const json = {
    dinhDang: EXPORT_FORMAT, xuatLuc: now.toISOString(), lop: { id: lop.id, ten: lop.name, namHoc: lop.schoolYear },
    huongDan: 'Chấm theo skill luyen-viet-cham-bai (references/feedback.md). Trả về tệp «writeup-nhanxet/1»: JSON {"dinhDang":"writeup-nhanxet/1","nhanXet":[{"id_bai","cau_nhan_xet","nhanh","nhan_xet","cau_khen","khen","diem"}]} hoặc CSV có cột id_bai và các cột nhận xét.',
    baiNop: rows.map((r) => ({
      id_bai: r.id_bai, hoc_sinh: { nick: r.nick, ho_ten: r.ho_ten }, session: r.session, luot: r.luot, id_ban_1: r.id_ban_1 || null, muc: r.muc, de: r.de, bai_viet: r.bai_viet, so_tu: r.so_tu,
      dan_y: r.dan_y, tu_soat: r.tu_soat, sua_loi: r.sua_loi, nop_luc: r.nop_luc, da_xem: !!r.da_xem,
      nhan_xet_hien_co: r.nhan_xet || r.khen ? Object.fromEntries(FB_COLS.map((c) => [c, r[c]])) : null,
    })),
  };
  const d = now.toISOString().slice(0, 10).replace(/-/g, '');
  return { json, csv: toCSV(CSV_COLS, rows), count: rows.length, base: `write-up-bai-nop-${slug(lop.name)}-${d}` };
}

// ------------------------------------------------------------------ NHẬP
const KEYS = ['id_bai', ...FB_COLS];
const norm = (k) => String(k).trim().toLowerCase().replace(/\s+/g, '_');

/** Đọc tệp nhận xét (JSON hoặc CSV). knownIds (Set) nếu có: id ngoài tập này bị loại («không thuộc lớp này»).
 *  Trả về { format, items: [{id, row, fb}], rejected: [{row, id, reason}] } hoặc ném Error với thông báo tiếng Việt cho tệp hỏng. */
export function parseImport(text, { knownIds = null } = {}) {
  const raw = String(text ?? '').replace(/^﻿/, '').trim();
  if (!raw) throw new Error('Tệp trống.');
  let list, format;
  if (raw[0] === '{' || raw[0] === '[') {
    let j; try { j = JSON.parse(raw); } catch { throw new Error('Tệp JSON bị hỏng (không đọc được). Kiểm tra dấu ngoặc và dấu phẩy.'); }
    format = 'json';
    if (!Array.isArray(j)) {
      if (j.dinhDang && j.dinhDang !== IMPORT_FORMAT) throw new Error(`Định dạng «${j.dinhDang}» không đúng; cần «${IMPORT_FORMAT}».`);
      list = j.nhanXet || j.nhan_xet || j.bai;
      if (!Array.isArray(list)) throw new Error('Không thấy danh sách nhận xét (khoá «nhanXet»).');
    } else list = j;
    list = list.map((o) => (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [norm(k), v])) : {}));
  } else {
    format = 'csv';
    const rows = parseCSV(raw);
    if (rows.length < 2) throw new Error('Tệp CSV cần dòng tiêu đề và ít nhất một dòng nhận xét.');
    const head = rows[0].map(norm);
    if (!head.includes('id_bai')) throw new Error('Tệp CSV thiếu cột «id_bai».');
    list = rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
  }
  const items = [], rejected = [], seen = new Set();
  list.forEach((o, i) => {
    const row = i + 1, id = str(o.id_bai).trim();
    const bad = (reason) => rejected.push({ row, id, reason });
    if (!id) return bad('thiếu id_bai');
    if (knownIds && !knownIds.has(id)) return bad('bài này không thuộc lớp đang xem');
    if (seen.has(id)) return bad('trùng id_bai trong tệp (giữ dòng đầu)');
    const fbRow = Object.fromEntries(FB_COLS.map((c) => [c, o[c]]));
    const fb = rowToFb(fbRow);
    if (!fb.comment && !fb.praise) return bad('thiếu nhận xét (cần «nhan_xet» hoặc «khen»)');
    if ((fb.comment || '').length > LIMITS.nhan_xet) return bad(`«nhan_xet» dài ${fb.comment.length} ký tự, tối đa ${LIMITS.nhan_xet}`);
    if ((fb.praise || '').length > LIMITS.khen) return bad(`«khen» dài ${fb.praise.length} ký tự, tối đa ${LIMITS.khen}`);
    if ((fb.sentence || '').length > LIMITS.cau || (fb.praiseSentence || '').length > LIMITS.cau) return bad(`câu trích dài quá ${LIMITS.cau} ký tự`);
    if ((fb.branch || '').length > LIMITS.nhanh) return bad(`«nhanh» dài quá ${LIMITS.nhanh} ký tự`);
    if (String(fb.score ?? '').length > LIMITS.diem) return bad(`«diem» dài quá ${LIMITS.diem} ký tự`);
    seen.add(id);
    items.push({ id, row, fb });
  });
  return { format, items, rejected };
}

/** Kiểm nhận xét nhập tay trong biểu mẫu; trả về thông báo lỗi hoặc ''. */
export function checkFeedback(fb) {
  if (!fb.comment && !fb.praise) return 'Hãy nhập nhận xét hoặc lời khen.';
  if ((fb.comment || '').length > LIMITS.nhan_xet) return `Nhận xét dài quá ${LIMITS.nhan_xet} ký tự.`;
  if ((fb.praise || '').length > LIMITS.khen) return `Lời khen dài quá ${LIMITS.khen} ký tự.`;
  if ((fb.sentence || '').length > LIMITS.cau || (fb.praiseSentence || '').length > LIMITS.cau) return `Câu trích dài quá ${LIMITS.cau} ký tự.`;
  if ((fb.branch || '').length > LIMITS.nhanh) return 'Tên nhánh quá dài.';
  if (String(fb.score ?? '').length > LIMITS.diem) return 'Điểm quá dài.';
  return '';
}
