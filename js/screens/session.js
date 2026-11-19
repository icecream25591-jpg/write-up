// Màn một session: tải sXX.json, dựng khung (thanh trên, 5 chặng, cô Mai theo tips), gắn chặng.
// Đủ 5 chặng: Recall, Sentences (Phần 3), Ideas (Phần 4), Write & Check, Reward (Phần 5).
import { sessionScreen, tipFrom } from '../shell.js';
import { STAGES } from '../router.js';
import { loadSession, sx } from '../data.js';
import { getProgress, doneStages } from '../progress.js';
import { mountRecall } from './recall.js';
import { mountSentences } from './sentences.js';
import { mountIdeas } from './ideas.js';
import { mountWrite } from './write.js';
import { mountReward } from './reward.js';
import * as demo from './demo.js';
import { stations, rememberSession } from '../stations.js';
import { sfx } from '../sfx.js';

const TIP_KEY = ['recall', 'sentences', 'ideas', 'write', null]; // Reward không có tip
let lastStageKey = null;

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
  // tiếng «mở chặng» khi chuyển sang chặng khác (không phát khi tải lại cùng chặng)
  const stageKey = `${n}:${stage}`;
  if (lastStageKey && lastStageKey !== stageKey) sfx('open');
  lastStageKey = stageKey;

  const p = getProgress(sx(n));
  const s = sessionScreen({
    n, topic: data.topic, stage, done: doneStages(p),
    tip: TIP_KEY[stage] ? tipFrom(data.tips, TIP_KEY[stage]) : null,
  });
  let mounted = null;
  if (stage === 0) mountRecall(s, { n, data, p });
  else if (stage === 1) mountSentences(s, { n, data, p });
  else if (stage === 2 && data.ideas) await mountIdeas(s, { n, data, p });
  else if (stage === 3 && data.write) mounted = mountWrite(s, { n, data, p });
  else if (stage === 4) mounted = mountReward(s, { n, data, p });
  else demo.fillStage(s, { n, stage });
  // dọn dẹp khi rời màn (đồng hồ, lưu nháp lần cuối)
  s.cleanup = () => { mounted?.destroy?.(); s.mai?.destroy(); };
  return s;
}

export { STAGES };
