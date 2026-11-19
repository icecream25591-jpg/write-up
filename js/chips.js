// Cụm gợi ý: nhận biến thể ngữ pháp tự nhiên (dùng chung cho web và tools/check-data.mjs).
// Động từ đầu cụm thêm -s/-es/-ed/-ing; one's = his/her/their/my/your/our.
export function chipRegex(chip) {
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ws = chip.toLowerCase().trim().split(/\s+/).map((w, i) => {
    if (w === "one's") return "(?:one's|his|her|their|my|your|our)";
    if (i === 0) {
      const stem = w.replace(/e$/, '');
      return `(?:${esc(w)}|${esc(w)}s|${esc(w)}es|${esc(stem)}ed|${esc(stem)}ing|${esc(w)}ing)`;
    }
    return esc(w);
  });
  return new RegExp(`\\b${ws.join('\\s+')}\\b`, 'i');
}

export const countWords = (s) => (String(s).trim().match(/[A-Za-z0-9'’-]+/g) || []).length;

/** Chèn cụm vào ô viết tại con trỏ, tự thêm khoảng trắng hai bên. */
export function insertAtCursor(ta, text) {
  const v = ta.value;
  const a = ta.selectionStart ?? v.length, b = ta.selectionEnd ?? v.length;
  const before = v.slice(0, a), after = v.slice(b);
  const pre = before && !/\s$/.test(before) ? ' ' : '';
  const post = after && !/^[\s.,;!?]/.test(after) ? ' ' : '';
  ta.value = before + pre + text + post + after;
  const pos = (before + pre + text).length;
  ta.setSelectionRange(pos, pos);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Tự kiểm một câu theo checks trong sXX.json. Trả về [{ok, msg}] và pass. */
export function runChecks(text, item) {
  const rows = [];
  if (!text.trim()) return { pass: false, rows: [{ ok: false, msg: 'Viết một câu trước đã.' }] };
  for (const c of item.checks || []) {
    if (c.kind === 'regex' || c.kind === 'notRegex') {
      let ok = false;
      try { ok = new RegExp(c.pattern, c.flags || '').test(text); } catch { ok = true; }
      if (c.kind === 'notRegex') ok = !ok;
      rows.push({ ok, msg: c.msgVi });
    } else if (c.kind === 'anyChip') {
      rows.push({ ok: (item.chips || []).some((ch) => chipRegex(ch).test(text)), msg: c.msgVi });
    } else if (c.kind === 'words') {
      const n = countWords(text);
      rows.push({ ok: n >= (c.min ?? 0) && n <= (c.max ?? 999), msg: c.msgVi || `Câu nên có từ ${c.min} đến ${c.max} từ (đang có ${n}).` });
    }
  }
  return { pass: rows.every((r) => r.ok), rows };
}
