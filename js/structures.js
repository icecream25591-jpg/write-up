// Nhận diện cấu trúc đích trong bài viết bằng regex đơn giản (gợi ý, không chấm điểm).
// Mỗi mục write.mustUse (tiếng Việt, theo bản duyệt) được khớp với một bộ dò dưới đây theo từ khoá.
// Thêm cấu trúc mới cho S4…S22: thêm một dòng vào DETECTORS.
const SENT_START = String.raw`(?:^|[.!?]\s+)`;

const DETECTORS = [
  // [nhận ra mục mustUse, nhãn tiếng Anh hiện trên chip, regex dò trong bài]
  [/V-ing làm chủ ngữ|V-ing subject/i, 'V-ing subject', new RegExp(`${SENT_START}(?!During|Morning|Evening|Nothing|Something|Everything|Anything)[A-Z][a-z]+ing\\b`)],
  [/WHY.*because/i, 'WHY + because', /\bbecause\b/i],
  [/because\s*\/\s*when\s*\/\s*if/i, 'because / when / if', /\b(because|when|if)\b/i],
  [/however\s*\/\s*therefore|trạng từ nối/i, 'however / therefore', /[;.]\s*(however|therefore),/i],
  [/help\s*\/\s*let\s*\+\s*O\s*\+\s*V/i, 'help / let + O + V', /\b(help|helps|helped|helping|let|lets|letting)\s+(?:me|you|him|her|us|them|members|students|[A-Z][a-z]+|\w+)\s+(?!to\b)[a-z]+/i],
  [/allow\s*\/\s*enable|enable\s*\+\s*O\s*\+\s*to V/i, 'allow / enable + O + to V', /\b(allow|allows|allowed|enable|enables|enabled)\s+[\w']+(?:\s+[\w']+)?\s+to\s+[a-z]+/i],
  [/by\s*\+\s*V-ing/i, 'by + V-ing', /\bby\s+[a-z]+ing\b/i],
  [/prevent\s*\+\s*O\s*\+\s*from/i, 'prevent + O + from V-ing', /\bprevent(s|ed)?\s+[\w']+(?:\s+[\w']+)?\s+from\s+[a-z]+ing\b/i],
  [/make it\s*\+\s*adj/i, 'make it + adj + to V', /\b(make|makes|made)\s+it\s+\w+(?:\s+for\s+[\w']+)?\s+to\s+[a-z]+/i],
  [/to V chỉ mục đích/i, 'to V (purpose)', /\b(in order\s+)?to\s+[a-z]+\b/i],
];

/** mustUse → [{label, re|null, text}] (re null: không dò được, chỉ nhắc). */
export function structuresFor(mustUse = []) {
  return mustUse.map((text) => {
    const d = DETECTORS.find(([m]) => m.test(text));
    return d ? { text, label: d[1], re: d[2] } : { text, label: text, re: null };
  });
}

export const detect = (list, essay) => list.map((s) => ({ ...s, found: s.re ? s.re.test(essay) : null }));

export const countWords = (s) => (String(s).trim().match(/[A-Za-z0-9'’-]+/g) || []).length;
/** Đếm câu: đoạn kết thúc bằng . ! ? có ít nhất 3 từ. */
export const countSentences = (s) => String(s).split(/(?<=[.!?])\s+/).filter((x) => /[.!?]$/.test(x.trim()) && countWords(x) >= 3).length;
