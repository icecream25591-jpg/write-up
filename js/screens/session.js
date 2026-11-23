// Màn một session: tải sXX.json, dựng khung (thanh trên, 5 chặng, cô Mai theo tips), gắn chặng.
// Đủ 5 chặng: Recall, Sentences (Phần 3), Ideas (Phần 4), Write & Check, Reward (Phần 5).
import { sessionScreen, tipFrom } from '../shell.js';
import { STAGES, href } from '../router.js';
import { loadSession, sx } from '../data.js';
import { getProgress, doneStages } from '../progress.js';
import { mountRecall } from './recall.js';
import { mountSentences } from './sentences.js';
import { mountIdeas } from './ideas.js';
import { mountWrite } from './write.js';
import { mountReward } from './reward.js';
import { mountAnalysis } from './analysis.js';
import * as demo from './demo.js';
import { stations, rememberSession } from '../stations.js';

const TIP_KEY = ['recall', 'sentences', 'ideas', 'write', null]; // Reward không có tip

export async function session(ctx, route) {
  const { n, stage } = route;
  const data = await loadSession(n, ctx.config.sessionsReady);
  if (!data) return demo.session(ctx, route); // session chưa có dữ liệu: màn giả

  // Khoá theo thứ tự (config.lockOrder): trạm phía trước chưa xong thì không vào được
  if (ctx.config.lockOrder) {
    const st = (await stations(ctx.config)).list.find((x) => x.n === n);
    if (st?.locked) {
      const s = sessionScreen({ n, topic: data.topic, stage, done: new Set(), tip: null });
      s.setTitle('Locked');
      s.body.innerHTML = `<div class="card demo"><b>Trạm ${n} đang khoá</b><p>Cô Mai đặt học theo thứ tự: hoàn thành các trạm trước rồi trạm này sẽ mở.</p></div>`;
      s.footIn.innerHTML = `<a class="btn grow" href="#/journey">Journey</a>`;
      return s;
    }
  }
  rememberSession(n);
  const p0 = getProgress(sx(n));
  // Khoá chặng (config.lockStages, mặc định bật): xong chặng trước mới vào được chặng sau
  let firstOpen = 4;
  if (ctx.config.lockStages !== false) {
    const d0 = doneStages(p0);
    firstOpen = [0, 1, 2, 3, 4].find((i) => !d0.has(i)) ?? 4;
    if (stage > firstOpen) {
      history.replaceState(null, '', href.stage(n, firstOpen));
      return session(ctx, { ...route, stage: firstOpen });
    }
  }
  window.scrollTo(0, 0); // vào chặng mới: về đầu trang (không phát tiếng khi chuyển chặng)

  const p = p0;
  const s = sessionScreen({
    n, topic: data.topic, stage, done: doneStages(p), openUpTo: firstOpen, stageNames: data.analysis ? { 2: 'Five lines' } : {},
    tip: TIP_KEY[stage] ? tipFrom(data.tips, TIP_KEY[stage]) : null,
  });
  let mounted = null;
  if (stage === 0) mountRecall(s, { n, data, p });
  else if (stage === 1) mountSentences(s, { n, data, p });
  else if (stage === 2 && data.ideas) mounted = await mountIdeas(s, { n, data, p });
  else if (stage === 2 && data.analysis) mounted = mountAnalysis(s, { n, data, p }); // S22: Phân tích đề
  else if (stage === 3 && data.write) mounted = mountWrite(s, { n, data, p, config: ctx.config });
  else if (stage === 4) mounted = mountReward(s, { n, data, p });
  else demo.fillStage(s, { n, stage });
  // tải sẵn ảnh của chặng kế tiếp khi máy rảnh: sang chặng mới tranh hiện ngay, không trống một lúc
  const pre = (src) => { const im = new Image(); im.decoding = 'async'; im.src = src; };
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 400));
  idle(() => {
    if (stage === 0) for (const c of data.sentences || []) pre(`img/${c.image}-${c.cell}-480.webp`);
    if (stage <= 1 && data.ideas?.image) pre(`img/${data.ideas.image}-800.webp`);
  });
  // dọn dẹp khi rời màn (đồng hồ, lưu nháp lần cuối)
  s.cleanup = () => { mounted?.destroy?.(); s.mai?.destroy(); };
  return s;
}

export { STAGES };
