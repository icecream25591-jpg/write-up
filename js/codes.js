// Nghĩa tiếng Việt ngắn của bộ mã tự sửa (theo bản duyệt S22: Ý → Câu → Từ).
export const CODE_VI = {
  OFF: 'lạc ý', OVER: 'khẳng định quá mức',
  FR: 'câu cụt', CS: 'nối câu bằng dấu phẩy', SV: 'hòa hợp chủ – vị', T: 'thì', VF: 'dạng động từ', LINK: 'từ nối',
  WW: 'dùng sai từ', WF: 'loại từ', REF: 'từ thay thế', A: 'mạo từ', P: 'số ít / số nhiều', SP: 'chính tả', PU: 'dấu câu',
};
export const codeLabel = (c) => (CODE_VI[c] ? `${c} · ${CODE_VI[c]}` : c);
