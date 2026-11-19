// Bộ điều hướng bằng hash: #/home, #/journey, #/work, #/settings, #/s/4/ideas …
export const STAGES = [
  { slug: 'recall', name: 'Recall' },
  { slug: 'sentences', name: 'Sentences' },
  { slug: 'ideas', name: 'Ideas' },
  { slug: 'write', name: 'Write & Check' },
  { slug: 'reward', name: 'Reward' },
];

export function parse(hash = location.hash) {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [a, b, c] = parts;
  if (a === 's') {
    const n = Number(b);
    const stage = STAGES.findIndex((s) => s.slug === c);
    if (Number.isInteger(n) && n >= 1 && n <= 22) {
      return { name: 'session', n, stage: stage < 0 ? 0 : stage };
    }
  }
  if (a === 'work' && b) return { name: 'work', id: decodeURIComponent(b) }; // #/work/<id bài> – Feedback → Draft 2
  if (['home', 'journey', 'work', 'settings'].includes(a)) return { name: a };
  return { name: 'home' };
}

export const href = {
  stage: (n, i) => `#/s/${n}/${STAGES[i].slug}`,
};

export function start(onRoute) {
  const run = () => onRoute(parse());
  addEventListener('hashchange', run);
  if (!location.hash) history.replaceState(null, '', '#/home');
  run();
}
