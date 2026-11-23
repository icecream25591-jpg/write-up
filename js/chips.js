// Cụm gợi ý: nhận biến thể ngữ pháp tự nhiên (dùng chung cho web và tools/check-data.mjs).
// Động từ đầu cụm thêm -s/-es/-ed/-ing; one's = his/her/their/my/your/our.
// Động từ bất quy tắc hay gặp ở đầu cụm gợi ý
const IRREGULAR = {
  have: ['has', 'had', 'having'], do: ['does', 'did', 'done', 'doing'], go: ['goes', 'went', 'gone', 'going'],
  make: ['makes', 'made', 'making'], take: ['takes', 'took', 'taken', 'taking'], give: ['gives', 'gave', 'given', 'giving'],
  get: ['gets', 'got', 'getting'], keep: ['keeps', 'kept', 'keeping'], find: ['finds', 'found', 'finding'],
  feel: ['feels', 'felt', 'feeling'], learn: ['learns', 'learnt', 'learned', 'learning'], spend: ['spends', 'spent', 'spending'],
  teach: ['teaches', 'taught', 'teaching'], buy: ['buys', 'bought', 'buying'], leave: ['leaves', 'left', 'leaving'],
  bring: ['brings', 'brought', 'bringing'], build: ['builds', 'built', 'building'], choose: ['chooses', 'chose', 'chosen', 'choosing'],
  lose: ['loses', 'lost', 'losing'], pay: ['pays', 'paid', 'paying'], read: ['reads', 'reading'], write: ['writes', 'wrote', 'written', 'writing'],
  run: ['runs', 'ran', 'running'], put: ['puts', 'putting'], set: ['sets', 'setting'], cut: ['cuts', 'cutting'],
  become: ['becomes', 'became', 'becoming'], begin: ['begins', 'began', 'begun', 'beginning'], grow: ['grows', 'grew', 'grown', 'growing'],
  know: ['knows', 'knew', 'known', 'knowing'], see: ['sees', 'saw', 'seen', 'seeing'], meet: ['meets', 'met', 'meeting'],
  sleep: ['sleeps', 'slept', 'sleeping'], understand: ['understands', 'understood', 'understanding'], wear: ['wears', 'wore', 'worn', 'wearing'],
};
export function chipRegex(chip) {
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ws = chip.toLowerCase().trim().split(/\s+/).map((w, i) => {
    if (w === "one's") return "(?:one's|his|her|their|my|your|our)";
    if (/^(?:a|an|the|this|that|these|those)$/.test(w)) return '(?:a|an|the|this|that|these|those|his|her|their|its|my|our|your)';
    if (i === 0 && w === 'be') return "(?:be|is|are|am|was|were|been|being|'s|'re|'m)"; // be easily distracted → is easily distracted
    if (i === 0 && IRREGULAR[w]) return `(?:${[w, ...IRREGULAR[w]].map(esc).join('|')})`;
    if (i === 0) {
      const stem = w.replace(/e$/, '');
      const dbl = /[^aeiou][aeiou][bdgmnprt]$/.test(w) ? `|${esc(w + w.slice(-1))}ed|${esc(w + w.slice(-1))}ing` : ''; // plan → planning
      return `(?:${esc(w)}|${esc(w)}s|${esc(w)}es|${esc(stem)}ed|${esc(stem)}ing|${esc(w)}ing${dbl})`;
    }
    return esc(w);
  });
  // giữa hai từ của cụm được chen tối đa 2 từ (push their homework aside, spend it more carefully)
  return new RegExp(`\\b${ws.join("(?:\\s+[\\w'’-]+){0,2}\\s+")}\\b`, 'i');
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

/** Số cụm gợi ý (khác nhau) có trong câu. */
export const usedChips = (text, chips = []) => chips.filter((ch) => chipRegex(ch).test(text)).length;

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
    } else if (c.kind === 'minChips') {
      const used = usedChips(text, item.chips);
      rows.push({ ok: used >= (c.min ?? 1), msg: c.msgVi || `Dùng ít nhất ${c.min} cụm gợi ý.`, used, soft: !!c.soft }); // soft: chỉ nhắc, không chặn «đạt»
    } else if (c.kind === 'anyChip') {
      rows.push({ ok: (item.chips || []).some((ch) => chipRegex(ch).test(text)), msg: c.msgVi });
    } else if (c.kind === 'words') {
      const n = countWords(text);
      rows.push({ ok: n >= (c.min ?? 0) && n <= (c.max ?? 999), msg: c.msgVi || `Câu nên có từ ${c.min} đến ${c.max} từ (đang có ${n}).` });
    }
  }
  return { pass: rows.every((r) => r.ok || r.soft), rows };
}
