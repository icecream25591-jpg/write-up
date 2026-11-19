// Tiến độ từng session trong localStorage (qua store.js, đã bọc try/catch).
// writeup:p:s01 = { recall: {i, ans:{id:{pick, ok}}, done}, sentences: {i, items:{id:{text, tries, passed, model}}, done} }
import { load, save } from './store.js';

const key = (s) => `p:${s}`;
// ideas = { mode, claim, pick:{lane:{text, ok, why}}, sorted:{spotId: lane}, seen:[panel], checked, done,
//           plan: {mode, lanes:[{id, en, color, items:[text]}], ok} }  ← chặng Write đọc dàn ý ở đây
// write = { level:'core'|'extension', text, ticks:{code:true}, startedAt, submitted:{at, id, words} }
// reward = { at, stars }
const blank = () => ({ recall: { i: 0, ans: {}, done: false }, sentences: { i: 0, items: {}, done: false }, ideas: {}, write: {}, reward: {} });

export function getProgress(s) {
  const p = load(key(s), null);
  if (!p || typeof p !== 'object') return blank();
  const b = blank();
  return { ...b, ...p, recall: { ...b.recall, ...p.recall }, sentences: { ...b.sentences, ...p.sentences },
    ideas: { ...(p.ideas || {}) }, write: { ...(p.write || {}) }, reward: { ...(p.reward || {}) } };
}

export function saveProgress(s, p) { save(key(s), p); }

/** Ghi trễ (gõ phím): gom nhiều lần gõ thành một lần ghi. */
const timers = new Map();
export function saveLater(s, p, ms = 300) {
  clearTimeout(timers.get(s));
  timers.set(s, setTimeout(() => { timers.delete(s); saveProgress(s, p); }, ms));
}
export function flush(s, p) { if (timers.has(s)) { clearTimeout(timers.get(s)); timers.delete(s); saveProgress(s, p); } }

export const doneStages = (p) => {
  const d = new Set();
  if (p.recall.done) d.add(0);
  if (p.sentences.done) d.add(1);
  if (p.ideas?.done) d.add(2);
  if (p.write?.submitted) d.add(3);
  if (p.reward?.at) d.add(4);
  return d;
};

/** Dàn ý đã lập ở Ideas (cho chặng Write & Check). */
export const getPlan = (s) => getProgress(s).ideas?.plan || null;
