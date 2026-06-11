// ============================================================
// AI 视频内容生产线 — 后端服务
// 部署到 Vercel 后自动运行，本地用 node server.js 启动
// ============================================================
const express = require('express');
const path = require('path');
const app = express();
app.use(express.json());

// ============ 敏感数据（服务端保护，浏览器看不到）============
const SECRETS = {
  // DeepSeek API Key — Vercel 上用环境变量 DEEPSEEK_KEY
  deepseekKey: process.env.DEEPSEEK_KEY || '',

  // 主 Skill — 提示词生成核心规则
  skills: {
    video: `你是 Seedance 视频提示词导演。把用户给的模板骨架展开成完整的、可直接粘贴到生成平台的英文提示词。

规则（严格遵守）：
- 十个标签块及固定顺序：Scene & Mood / Frame Map / Subject Lock / Cross-Frame Rules / Movement / Last Frame / World Plate / Sound Bed / Capture Realism / Camera Capture。
- 全英文输出。@imageN 标签保留。
- Movement 四层：角色动作（带时间戳）、微动作（呼吸/头发/布料）、环境动作（雾/尘/远景）、相机（通常省略，Camera Capture 覆盖）。
- Last Frame 必须以 "No on-screen text, no captions, no signage typography, no rendered text in the frame." 收尾。
- Sound Bed 只写画内声（脚步、布料、呼吸、环境声），禁止音乐、歌词、配乐描述。
- 单镜头 280-400 词，多镜头不超过 600 词。
- 正向锁定代替负向禁止（"boots stay planted" 而非 "don't drift"）。
- 不出现角色名、品牌名、平台名，不写宽高比（用户在 UI 设）。
- 中文占位全部替换为具体英文视觉描述，合理补全但不发明参考图里没有的细节。
- Capture Realism 四板斧：深度靠悬浮大气（atmosphere between planes）、湿场景才写 moisture-without-shine、皮肤逐区去高光（zero shine on forehead, nose bridge, cheekbones, temples, chin）、对比度曲线三连（shadow lifted / highlight rolled off / specular removed）。
- Camera Capture 只出现一次在末尾，写：capture register + lens + filter + movement + stock + grade + fps + runtime。

只输出提示词正文，不要任何解释、前言、后语、代码围栏。`,

    image: `你是电影剧照提示词导演（Banana Pro / GPT Image 2）。把用户给的模板骨架展开成完整的、可直接粘贴到生成平台的英文提示词。

规则（严格遵守）：
- 电影散文体，五段结构：①开场镜头描述（媒介、构图、主体、机位、情绪）②角色块（从参考图继承身份，写可见姿态/视线/动作）③世界/环境块（写氛围而非建筑列举，参考图有就 "carrying from the attached reference"）④焦点锚⑤相机收尾（capture register + lens character + diffusion + film stock + grain + M-mode + 收尾质量过滤）。
- 收尾质量过滤必须包含："Real photographic frame captured on a real cinema camera… no CGI, no rendered look, no digital cleanliness, no plastic surfaces, no AI smoothness, no skin smoothing, no on-screen text, no rendered text in the frame."
- 全英文输出。@imageN 标签保留（如有）。
- 角色工作（face lock / outfit / 6-panel）用灰底（mid-gray seamless studio，lean Rembrandt close），白底仅用户明确要求时切。
- 皮肤：real pore texture soft fine and even, peach fuzz, subsurface scattering, matte and velvety, 永远不 harsh 不 plastic。
- 头发：strand by strand, flyaways, baby hairs, 响应场景物理（风/静/湿）。
- 不出现角色名、品牌名、不写宽高比。
- 中文占位全部替换为具体英文视觉描述。

只输出提示词正文，不要任何解释、前言、后语、代码围栏。`
  },

  // 灵感聊天 — 板块打法
  ideaBase: `你是一个 OTA 平台抖音短视频团队的内容策划搭档。团队各板块（火车票、门票、机票、酒店）在抖音挂小黄车售卖出行类优惠券做拉新引流。用中文、口语化、像同事聊天一样回答。每次给 2-4 个点子，每个包含：钩子（前 3 秒）、简要分镜思路、形式（IP 剧场 / 痛点奇观 / 攻略图文 / 纯视觉钩子）、预估生成成本量级。

必须遵守的内容战略（不可违背）：
1. 最大限度发挥 AI 视频优势：奇观、不可能画面、IP 角色、现实拍不出或拍不起的镜头；拒绝平庸的 AI 真人口播。
2. 形式反差、利益点不反差：内容可以完全不像广告，但母题必须围绕当前板块的真实消费场景，结尾挂车顺势不硬转。
3. 视频 ≤15 秒，按 10 秒单镜头规划，一个镜头一个主动作。
4. 可用 IP 角色资产（已锁定三视图）：小钻风、孙悟空、唐僧、猪八戒、黄眉、虎先锋。
5. 图文线吃搜索 / 意图流量：攻略型、收藏型内容转化逻辑最硬。
6. 成本纪律：免费额度留成片，便宜模型跑草稿，高价模型不轻碰。
7. 合规：利益点不夸大、AI 内容按平台要求标注、真实地标避免精确还原错误、视频内不生成文字（字幕剪辑后贴）。`,

  ideaSections: {
    train: '板块：火车票。主推 9.9 元购 15 元火车票券（APP 新客，短视频渠道挂车）。母题：抢票、票价、春运与节假日返乡、车站、绿皮车与高铁。小钻风"巡山报信发现 9 块 9"是本板块最成熟的梗。',
    ticket: '板块：景区门票 / 演出票。母题：排队、抢票、景区打卡、园区奇观、亲子周末、避坑攻略。AI 优势打法：景区奇观放大（巨物、缩微世界、IP 角色闯入真实景区）、攻略型图文（路线 / 避坑，吃搜索意图流量）。利益点以本板块实际在售券为准，点子里用"门票券"指代。',
    flight: '板块：机票。母题：特价机票、说走就走、赶飞机、机场、云端。AI 优势打法：云端奇观、巨物飞机、舷窗外的不可能画面、IP 角色的第一次飞行。利益点用"机票券"指代。',
    hotel: '板块：酒店。母题：住宿性价比、旅行落脚、窗外景观、躺平式度假。AI 优势打法：梦幻房型、窗外奇观（推窗见雪山 / 海底 / 云海）、IP 角色入住体验。利益点用"酒店券"指代。',
    copy: '你是短视频文案医生。用户会贴来原始口播文案或脚本，你的输出分三步：\n1) 系统性诊断：钩子强度（前 3 秒能不能留人）、结构节奏（信息密度、转折点位置）、利益点清晰度、口语化程度、人设一致性——逐条说优缺点，直说，不客套。\n2) 修改建议：具体到句，改哪一句、为什么改。\n3) 给出 2-3 版完整改写稿：必须保持原作者的人设和语气，口语化，删掉一切人机味（排比堆砌、"家人们谁懂"式套话、AI 腔的工整对仗、空洞形容词），像真人随口说出来的话；版本之间策略要有差异（例如：钩子前置版 / 悬念版 / 利益点直给版），每版标注策略名。\n约束：不夸大利益点，不编造数据，符合抖音口播节奏（一句一口气），保留原文案里本来有效的记忆点。全程中文。'
  },
  polishSys: `你是 Seedance/Banana Pro 提示词导演。把用户给的模板骨架展开成完整的、可直接粘贴到生成平台的英文提示词。规则：
- 视频提示词：严格保持十个标签块及顺序 Scene & Mood / Frame Map / Subject Lock / Cross-Frame Rules / Movement / Last Frame / World Plate / Sound Bed / Capture Realism / Camera Capture。全英文。@imageN 标签保留。Movement 四层（角色动作+时间戳、微动作、环境动作、相机）。Last Frame 必须以 "No on-screen text, no captions, no signage typography, no rendered text in the frame." 收尾。Sound Bed 只写画内声，禁止音乐和歌词。单镜头 280-400 词。正向锁定代替负向禁止。不出现角色名、品牌名、平台名，不写宽高比。
- 图片提示词：电影散文体，五段结构（开场镜头/角色/世界/焦点锚/相机收尾），全英文，结尾带 "Real photographic frame... no CGI, no plastic, no AI smoothness" 质量过滤，不写宽高比，不出现品牌名与角色名（用视觉描述指代）。
- 中文占位（方括号或中文句子）全部替换为具体的英文视觉描述，合理补全但不发明参考图里没有的细节。
只输出提示词正文，不要任何解释、前言、后语、代码围栏。`,
  polishSysVideo: `你是 Seedance 视频提示词导演。把用户给的模板骨架展开成完整的、可直接粘贴到生成平台的英文提示词。规则：
- 严格保持十个标签块及顺序 Scene & Mood / Frame Map / Subject Lock / Cross-Frame Rules / Movement / Last Frame / World Plate / Sound Bed / Capture Realism / Camera Capture。
- 全英文输出。@imageN 标签保留。
- Movement 四层：角色动作（带时间戳）、微动作（呼吸/头发/布料）、环境动作（雾/尘/远景）、相机。
- Last Frame 必须以 "No on-screen text, no captions, no signage typography, no rendered text in the frame." 收尾。
- Sound Bed 只写画内声，禁止音乐和歌词。单镜头 280-400 词。
- 正向锁定代替负向禁止。不出现角色名、品牌名、平台名，不写宽高比。
- 中文占位全部替换为具体英文视觉描述。
- Capture Realism 四板斧：深度靠悬浮大气、湿场景才写 moisture-without-shine、皮肤逐区去高光、对比度曲线三连。
- Camera Capture 只出现一次在末尾：capture register + lens + filter + movement + stock + grade + fps + runtime。
只输出提示词正文，不要任何解释、前言、后语、代码围栏。`,
  polishSysImage: `你是电影剧照提示词导演（Banana Pro / GPT Image 2）。把用户给的模板骨架展开成完整的、可直接粘贴到生成平台的英文提示词。
规则：
- 电影散文体，五段结构（开场镜头/角色/世界/焦点锚/相机收尾），全英文。
- 收尾质量过滤必须包含："Real photographic frame captured on a real cinema camera… no CGI, no rendered look, no digital cleanliness, no plastic surfaces, no AI smoothness, no skin smoothing, no on-screen text, no rendered text in the frame."
- 角色工作用灰底，白底仅用户明确要求时切。
- 皮肤：real pore texture soft fine and even, peach fuzz, subsurface scattering, matte and velvety。
- 头发：strand by strand, flyaways, baby hairs。
- 不出现角色名、品牌名、不写宽高比。中文占位全部替换为具体英文视觉描述。
只输出提示词正文，不要任何解释、前言、后语、代码围栏。`
};

// ============ 公开数据（浏览器可见，只读展示）============
const PUBLIC = {
  platforms: [
    { id: 'flova', name: 'Flova', balance: 900, unit: '积分' },
    { id: 'doubao', name: '豆包', balance: 5, unit: '次', note: '免费额度，每次最多 10s' }
  ],
  models: [
    { id: 'm_db_fast', platformId: 'doubao', kind: 'video', name: '豆包 · Seedance 2.0 Fast', desc: '免费额度优先消耗，最多 10s', price: 1, per: '次', free: true, maxSec: 10, tag: '免费' },
    { id: 'm_sd2f', platformId: 'flova', kind: 'video', name: 'Flova · Seedance 2.0 Fast 720p', desc: '最强性价比，跨镜头一致性好', price: 18, per: '秒', tag: 'SOTA' },
    { id: 'm_sd15', platformId: 'flova', kind: 'video', name: 'Flova · Seedance 1.5 Pro 1080p', desc: '草稿验证用，便宜跑构图和动作', price: 10, per: '秒' },
    { id: 'm_sd2', platformId: 'flova', kind: 'video', name: 'Flova · Seedance 2.0 1080p', desc: '最强画质，预算批下来前慎用', price: 52, per: '秒', tag: '压轴用' },
    { id: 'm_kling', platformId: 'flova', kind: 'video', name: 'Flova · Kling 3.0 Silent 1080p', desc: '备选视频模型', price: 12, per: '秒' },
    { id: 'm_vidu', platformId: 'flova', kind: 'video', name: 'Flova · Vidu Q3 1080p', desc: '备选视频模型', price: 12, per: '秒' },
    { id: 'm_gpt2', platformId: 'flova', kind: 'image', name: 'Flova · GPT Image 2 (1K/2K)', desc: '本项目默认生图引擎', price: 5, per: '张', tag: '默认' },
    { id: 'm_gpt2_4k', platformId: 'flova', kind: 'image', name: 'Flova · GPT Image 2 (4K)', desc: '高清交付用', price: 10, per: '张' },
    { id: 'm_seedream', platformId: 'flova', kind: 'image', name: 'Flova · Seedream 4.5', desc: '国风质感备选', price: 5, per: '张' },
    { id: 'm_nb2', platformId: 'flova', kind: 'image', name: 'Flova · Nano Banana 2 (1K)', desc: '复杂构图备选', price: 7, per: '张' },
    { id: 'm_nbp', platformId: 'flova', kind: 'image', name: 'Flova · Nano Banana Pro (1K/2K)', desc: '高保真备选', price: 14, per: '张' }
  ],
  skus: [
    { id: 'sku99', name: '9.9 元券', desc: '15 元火车票券 · APP 新客 · 短视频渠道主推' },
    { id: 'sku169', name: '16.9 元券', desc: '20 元火车票券 · 不区分新老客' },
    { id: 'sku199', name: '19.9 元券', desc: '25 元火车票券 · APP 新客 · 直播渠道' }
  ],
  chars: [
    { id: 'c1', name: '小钻风', alias: '巡山小妖', refs: ['六宫格超高清三视图'] },
    { id: 'c2', name: '孙悟空', alias: '悟空,猴王', refs: ['六宫格超高清三视图'] },
    { id: 'c3', name: '唐僧', alias: '唐三藏,师父', refs: ['六宫格超高清三视图'] },
    { id: 'c4', name: '猪八戒', alias: '八戒', refs: ['六宫格超高清三视图'] },
    { id: 'c5', name: '黄眉', alias: '黄眉大王', refs: ['六宫格超高清三视图'] },
    { id: 'c6', name: '虎先锋', alias: '', refs: ['六宫格超高清三视图'] }
  ]
};

// ============ DeepSeek API 调用 ============
async function callDeepSeek(systemPrompt, messages, maxTokens = 1000) {
  const msgs = [];
  if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt });
  msgs.push(...messages);

  const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SECRETS.deepseekKey },
    body: JSON.stringify({ model: 'deepseek-chat', max_tokens: maxTokens, messages: msgs })
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error('DeepSeek HTTP ' + r.status + ': ' + err.slice(0, 200));
  }

  const j = await r.json();
  return (j.choices || []).map(c => (c.message || {}).content || '').filter(Boolean).join('\n');
}

// ============ API 路由 ============

// 公开配置（定价信息 — 只读）
app.get('/api/config', (req, res) => {
  res.json(PUBLIC);
});

// AI 润色
app.post('/api/polish', async (req, res) => {
  try {
    const { kind, prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: '缺少 prompt' });
    const sys = kind === 'video' ? SECRETS.polishSysVideo : SECRETS.polishSysImage;
    const type = kind === 'video' ? '视频（Seedance）' : '图片';
    const result = await callDeepSeek(sys, [{ role: 'user', content: `类型：${type}\n模板骨架：\n${prompt}` }]);
    res.json({ result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 灵感聊天
app.post('/api/idea', async (req, res) => {
  try {
    const { section, messages } = req.body;
    if (!messages || !messages.length) return res.status(400).json({ error: '缺少消息' });

    const secPrompt = SECRETS.ideaSections[section] || SECRETS.ideaSections.train;
    const isCopy = section === 'copy';
    let systemPrompt;
    if (isCopy) {
      systemPrompt = secPrompt;
    } else {
      systemPrompt = SECRETS.ideaBase + '\n\n当前板块上下文：\n' + secPrompt;
    }

    const result = await callDeepSeek(systemPrompt, messages, 1500);
    res.json({ result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 主 Skill（首页生成用）
app.get('/api/skills', (req, res) => {
  // 只返回 skill 的存在信息，不返回具体内容
  res.json({ video: true, image: true });
});

// 静态文件
app.use(express.static(path.join(__dirname, 'public')));

// 所有其他路由 → index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 启动
const PORT = process.env.PORT || 3456;
app.listen(PORT, () => {
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`Skills protected. Pricing visible.`);
});

module.exports = app;
