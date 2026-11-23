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
  [/V-ing sau giới từ|preposition \+ V-ing/i, 'preposition + V-ing', /\b(instead of|without|before|after|by|of|for|about|from|at|in|on)\s+[a-z]+ing\b/i],
  // S8–S21 (nhận diện gần đúng; mục không dò được thì chỉ nhắc)
  [/câu bị động/i, 'passive (be + V3)', /\b(?:is|are|was|were|be|been|being)\s+(?:[a-z]+ly\s+)?(?:[a-z]+ed|taught|given|grown|made|shown|told|kept|built|taken|written|seen|done|known)\b/i],
  [/động từ tường thuật/i, 'reporting verb + that', /\b(?:argue|claim|believe|say|point out|explain|suggest|warn|admit|insist)s?\s+that\b|\b(?:argued|claimed|believed|said|pointed out|explained|suggested|warned|admitted|insisted)\s+that\b/i],
  [/giả định cách/i, 'recommend / suggest that + S + V', /\b(?:recommend|suggest|insist|demand|propose)(?:s|ed)?\s+that\s+[\w'-]+(?:\s+[\w'-]+){0,4}\s+(?:be|not\s+be|[a-z]+)\b/i],
  [/điều kiện loại 2/i, 'If + past, would', /\bif\b[^.]*\b(?:would|could|might)\b|\b(?:would|could)\b[^.]*\bif\b|\bShould\s+[a-z]+/i],
  [/unless hoặc provided that/i, 'unless / provided that', /\b(?:unless|provided(?:\s+that)?)\b/i],
  [/nhân quả/i, 'lead to / result in + because of', /\b(?:lead|leads|led)\s+to\b|\bresults?\s+in\b|\bresulted\s+in\b|\bcaus(?:e|es|ed)\b/i],
  [/mức chắc chắn/i, 'may / can / tend to', /\b(?:may|might|can|could|tends?\s+to|likely)\b/i],
  [/so sánh có mức độ/i, 'far / much / slightly + comparative', /\b(?:far|much|slightly|considerably|a little)\s+(?:more|less|[a-z]+er)\b/i],
  [/outweigh\s*\/\s*be offset by|outweigh kèm phạm vi/i, 'outweigh / be offset by', /\b(?:outweighs?|outweighed|offset\s+by|at the cost of)\b/i],
  [/câu chẻ/i, 'It is … that / What … is', /\bIt\s+(?:is|was)\b[^.]*\bthat\b|(?:^|[.!?]\s+)What\b[^.]*\b(?:is|was)\b/],
  [/đảo ngữ/i, 'Not only … but also / inversion', /\bNot only\s+(?:does|do|did|is|are|was|were|has|have|can|will)\b|\b(?:Rarely|Seldom|Never|Only then|Only by|Should)\s+(?:do|does|did|is|are|was|were|has|have|can|will|[a-z]+)\b/],
  [/phản biện/i, 'Admittedly / Some may argue …, but …', /\b(?:Admittedly|Some (?:people )?(?:may|might) argue|It is true that|Critics)\b/i],
  [/quy chiếu/i, 'this / these / such + noun', /\b(?:This|These|Such|this|these|such)\s+(?!is\b|are\b|was\b|were\b)[a-z]+\b/],
  [/cụm nêu quan điểm/i, 'From my perspective / It seems to me', /\b(?:From my perspective|It seems (?:to me|clear)|In my view|As I see it|I would argue|I (?:largely|partly|strongly|fully) (?:agree|disagree))\b/i],
  [/mẫu tường thuật/i, 'It is often argued that / Supporters of … claim that', /\bIt is (?:often|widely|commonly)\s+(?:argued|claimed|said|believed)\s+that\b|\b(?:Supporters|Opponents|Critics|Advocates)\s+of\b[^.]*\b(?:claim|argue|believe|say)\s+that\b/i],
  [/chuyển sang đánh giá/i, 'While …, … / However, …', /(?:^|[.!?]\s+)(?:While|Although|However)\b/],
  [/nêu tiêu chí/i, 'The key question is …', /\b(?:the key question is|what matters (?:most )?is|the (?:main|real) issue is|the deciding factor is|depends on)\b/i],
  [/provided that\s*\/\s*as long as|điều kiện với provided/i, 'provided that / as long as', /\b(?:provided(?:\s+that)?|as long as)\b/i],
  [/đề xuất chủ động và một đề xuất bị động/i, 'active + passive proposal', /\b(?:should|could|can|must)\s+(?:also\s+)?(?!be\b)[a-z]+[\s\S]*\b(?:should|could|can|must)\s+(?:also\s+)?be\s+[a-z]+(?:ed|en|t|wn)\b|\b(?:should|could|can|must)\s+(?:also\s+)?be\s+[a-z]+(?:ed|en|t|wn)\b[\s\S]*\b(?:should|could|can|must)\s+(?:also\s+)?(?!be\b)[a-z]+/i],
  [/nguyên nhân chính và phụ/i, 'main reason + secondary reason', /\b(?:main|chief|primary)\s+(?:reason|cause)\b[\s\S]*\b(?:secondary|another|minor|second)\s+(?:reason|cause|factor)\b/i],
  [/đánh giá có lý do/i, 'positive / negative + because', /\b(?:positive|negative|good|bad|beneficial|harmful)\b[^.]*\b(?:because|since|as|if)\b/i],
  // S6–S11 (nhận diện gần đúng để nhắc, không chấm điểm)
  [/phân từ sau danh từ/i, 'participle after noun', /\b[a-z]+\s+(?:[a-z]+ed|caught|left|thrown|built|made|kept|held|sold|found|taken|given|eaten)\s+(?:in|on|into|across|by|at|from|near|along|under|over|to)\b/i],
  [/V-ing nêu kết quả/i, ', V-ing (result)', /,\s*[a-z]+ing\b/i],
  [/hiện tại hoàn thành/i, 'present perfect', /\b(?:has|have)\s+(?:just\s+|already\s+|recently\s+|never\s+|ever\s+)?(?:[a-z]+ed|[a-z]+en|got|made|had|bought|sent|spent|lost|found|left|paid|kept)\b/i],
  [/chừng mực|làm mềm/i, 'can / may (hedging)', /\b(?:can|may|tends?\s+to|likely\s+to)\s+[a-z]+/i],
  [/be likely to/i, 'be likely to', /\b(?:is|are|am|be|was|were|been)\s+(?:more\s+|less\s+|very\s+)?likely\s+to\s+[a-z]+/i],
  [/should\s*\/\s*should not/i, 'should / should not', /\bshould(?:\s+not|n't)?\s+[a-z]+/i],
  [/whereas\s*\/\s*while/i, 'whereas / while + Unlike / Compared with', /\b(?:whereas|while)\b[\s\S]*\b(?:Unlike|Compared (?:with|to))\b|\b(?:Unlike|Compared (?:with|to))\b[\s\S]*\b(?:whereas|while)\b/],
  [/nhượng bộ/i, 'although / even though', /\b(?:although|though|even though|despite|in spite of)\b/i],
  [/không xác định|non-defining/i, ', who / , which', /,\s*(who|which)\s+[a-z]+/i],
  [/quan hệ xác định|defining relative/i, 'who / that / which (defining)', /[^,\s]\s+(who|that|which)\s+[a-z]+/i],
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
