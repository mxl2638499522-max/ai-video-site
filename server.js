// ============================================================
// AI 视频内容生产线 — 后端服务
// 部署到 Vercel 后自动运行，本地用 node server.js 启动
// ============================================================
require('dotenv').config();
const express = require('express');
const path = require('path');
const skills = require('./skills');
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '200kb', strict: true }));
app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: '请求内容过大' });
  if (err instanceof SyntaxError && err.status === 400) return res.status(400).json({ error: '请求格式错误' });
  next(err);
});

const ALLOWED_ORIGINS = new Set([
  'https://www.ai-video-lab.xyz',
  'https://ai-video-lab.xyz',
  'https://ai-video-site-iota.vercel.app'
]);
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 30;
const requestBuckets = new Map();

app.use('/api', (req, res, next) => {
  const origin = req.get('origin');
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return res.status(403).json({ error: '不允许跨站调用' });
  }

  const now = Date.now();
  const ip = req.ip || req.get('x-forwarded-for') || 'unknown';
  if (requestBuckets.size > 5000) {
    for (const [key, value] of requestBuckets) {
      if (now - value.startedAt >= RATE_WINDOW_MS) requestBuckets.delete(key);
    }
  }
  const bucket = requestBuckets.get(ip);
  if (!bucket || now - bucket.startedAt >= RATE_WINDOW_MS) {
    requestBuckets.set(ip, { startedAt: now, count: 1 });
  } else {
    bucket.count += 1;
    if (bucket.count > RATE_LIMIT) {
      res.set('Retry-After', String(Math.ceil((RATE_WINDOW_MS - (now - bucket.startedAt)) / 1000)));
      return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
    }
  }

  res.set('Cache-Control', 'no-store');
  next();
});

const IDEA_SECTIONS = new Set(['copy', 'train', 'ticket', 'flight', 'hotel']);
function validMessages(messages) {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 20) return false;
  let total = 0;
  for (const message of messages) {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string') return false;
    if (message.content.length < 1 || message.content.length > 20000) return false;
    total += message.content.length;
  }
  return total <= 50000;
}

// DeepSeek 旗舰模型（可通过环境变量覆盖）
const DS_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro';

// ============ 敏感数据（服务端保护，浏览器看不到）============
const SECRETS = {
  // DeepSeek API Key — Netlify 上用环境变量 DEEPSEEK_KEY
  deepseekKey: process.env.DEEPSEEK_KEY || '',
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

// ============ 博查 Web Search API ============
async function bochaSearch(query) {
  try {
    const r = await fetch('https://api.bocha.cn/v1/web-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (process.env.BOCHA_KEY || '') },
      body: JSON.stringify({ query, freshness: 'pastMonth', summary: true })
    });
    if (!r.ok) return '';
    const j = await r.json();
    if (j.code !== 200 || !j.data?.webPages?.value?.length) return '';
    const results = j.data.webPages.value.slice(0, 6);
    return results.map((p, i) => {
      const title = (p.name || '').trim();
      const url = (p.url || '');
      const snippet = (p.summary || p.snippet || '').trim();
      const date = (p.datePublished || '').slice(0, 10);
      return `[${i + 1}] ${title}\n${snippet}\n${url}${date ? ' · ' + date : ''}`;
    }).join('\n\n');
  } catch (e) {
    return '';
  }
}

// 联网搜索工具定义（给 DeepSeek function calling）
const WEB_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'web_search',
    description: '搜索互联网获取最新信息：当下热点、节日活动、景点真实信息、门票价格、攻略等。注意：今天是2026年6月，搜索时请用2026年作为年份，避免搜到过时信息。',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: '搜索关键词' } },
      required: ['query']
    }
  }
};

// 文案改写默认不需要联网。只有用户明确询问实时信息时才启用搜索工具，
// 避免首轮工具判断阻塞流式输出几十秒。
function needsWebSearch(messages) {
  const latest = [...messages].reverse().find(m => m.role === 'user')?.content || '';
  return /(联网|搜索|查一下|查找|最新|实时|今天|目前|现在的|热搜|新闻|天气|票价|价格|营业时间|开放时间|航班|列车时刻|余票|近期活动)/i.test(latest);
}

// ============ DeepSeek 流式 API 调用 ============
async function callDeepSeekStream(systemPrompt, messages, maxTokens, onChunk, tools, round) {
  round = round || 0;
  const msgs = [];
  if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt });
  msgs.push(...messages);

  // 如果需要工具调用，第一轮用非流式（稳定处理 tool_calls），
  // 工具结果追加后再用流式生成最终回答
  if (tools && round === 0) {
    const body0 = { model: DS_MODEL, max_tokens: maxTokens, messages: msgs, tools: [tools] };
    const r0 = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SECRETS.deepseekKey },
      body: JSON.stringify(body0)
    });
    if (!r0.ok) {
      const err = await r0.text();
      throw new Error('DeepSeek HTTP ' + r0.status + ': ' + err.slice(0, 200));
    }
    const j0 = await r0.json();
    const msg0 = (j0.choices || [])[0]?.message || {};
    const reasoning0 = msg0.reasoning_content || '';
    const cacheHit0 = (j0.usage?.prompt_cache_hit_tokens) || 0;
    let tcArr = msg0.tool_calls || [];

    // deepseek-v4-pro 在 thinking 模式可能把 tool_calls 写成 XML 嵌入 content/reasoning
    const xmlText = (msg0.content || '') + (msg0.reasoning_content || '');
    const xmlTcMatch = xmlText.match(/<tool_calls>([\s\S]*?)<\/tool_calls>/);
    if (!tcArr.length && xmlTcMatch) {
      const invokes = xmlTcMatch[0].matchAll(/<invoke name="web_search">\s*<parameter name="query"[^>]*>([\s\S]*?)<\/parameter>\s*<\/invoke>/g);
      tcArr = [];
      for (const m of invokes) {
        const q = m[1].trim();
        tcArr.push({ id: 'call_xml_' + tcArr.length, type: 'function', function: { name: 'web_search', arguments: JSON.stringify({ query: q }) } });
      }
      // 从 content 中剥离 XML tool_calls 块
      msg0.content = (msg0.content || '').replace(/<tool_calls>[\s\S]*?<\/tool_calls>\n?/g, '').trim();
    }

    // 有 tool_calls 时执行搜索并递归
    if (tcArr.length > 0) {
      if (reasoning0) onChunk({ type: 'reasoning', text: reasoning0 });
      msgs.push({ role: 'assistant', reasoning_content: reasoning0, tool_calls: tcArr });
      for (const tc of tcArr) {
        if (tc.function?.name === 'web_search') {
          let query = '';
          try { query = JSON.parse(tc.function.arguments || '{}').query || ''; } catch (e) {}
          if (query) {
            const sr = await bochaSearch(query);
            msgs.push({ role: 'tool', tool_call_id: tc.id, content: sr || '(未找到相关结果)' });
          }
        }
      }
      if (msgs.some(m => m.role === 'tool')) {
        return await callDeepSeekStream(null, msgs.slice(1), maxTokens, onChunk, tools, round + 1);
      }
    }
    // 无 tool_calls，直接返回内容（非流式结果）
    let content0 = msg0.content || '', reasoningFinal = reasoning0;
    const tm = content0.match(/<think>([\s\S]*?)<\/think>/);
    if (tm) { reasoningFinal = (reasoningFinal ? reasoningFinal + '\n' : '') + tm[1].trim(); content0 = content0.replace(/<think>[\s\S]*?<\/think>\n?/g, '').trim(); }
    if (content0) onChunk({ type: 'content', text: content0 });
    return { content: content0, reasoning: reasoningFinal, model: j0.model || DS_MODEL, cacheHit: cacheHit0 };
  }

  // 无工具或已执行过工具调用 → 流式输出
  const body = { model: DS_MODEL, max_tokens: maxTokens, messages: msgs, stream: true };
  const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SECRETS.deepseekKey },
    body: JSON.stringify(body)
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error('DeepSeek HTTP ' + r.status + ': ' + err.slice(0, 200));
  }

  let content = '', reasoning = '', model = DS_MODEL, cacheHit = 0;
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith('data: ')) continue;
      const jsonStr = s.slice(6);
      if (jsonStr === '[DONE]') continue;
      try {
        const json = JSON.parse(jsonStr);
        const delta = (json.choices || [])[0]?.delta || {};
        if (delta.content) {
          content += delta.content;
          onChunk({ type: 'content', text: delta.content });
        }
        if (delta.reasoning_content) {
          reasoning += delta.reasoning_content;
          onChunk({ type: 'reasoning', text: delta.reasoning_content });
        }
        if (json.model) model = json.model;
        if (json.usage?.prompt_cache_hit_tokens) cacheHit = json.usage.prompt_cache_hit_tokens;
      } catch (e) { /* skip malformed chunks */ }
    }
  }

  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
  if (thinkMatch) {
    reasoning = (reasoning ? reasoning + '\n' : '') + thinkMatch[1].trim();
    content = content.replace(/<think>[\s\S]*?<\/think>\n?/g, '').trim();
  }

  return { content, reasoning, model, cacheHit };
}

// SSE 辅助：向客户端写一条 SSE 事件
function sse(res, data) {
  res.write('data: ' + JSON.stringify(data) + '\n\n');
}

// ============ API 路由 ============

// 公开配置（定价信息 — 只读）
app.get('/api/config', (req, res) => {
  res.json(PUBLIC);
});

// AI 润色（SSE 流式）
app.post('/api/polish', async (req, res) => {
  try {
    const { kind, prompt } = req.body;
    if (!['video', 'image'].includes(kind) || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: '请求参数无效' });
    }
    if (prompt.length > 20000) return res.status(413).json({ error: '请求内容过大' });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write(': connected\n\n');

    const sys = skills.getPolishSystem(kind);
    const { content, model } = await callDeepSeekStream(sys, [{ role: 'user', content: prompt }], 3000,
      (chunk) => { if (chunk.type === 'content') sse(res, { type: 'content', text: chunk.text }); }
    );

    sse(res, { type: 'done', model });
    res.end();
  } catch (e) {
    if (!res.headersSent) {
      res.status(500).json({ error: e.message });
    } else {
      sse(res, { type: 'error', message: e.message });
      res.end();
    }
  }
});

// 灵感聊天（SSE 流式）
app.post('/api/idea', async (req, res) => {
  try {
    const { section, messages } = req.body;
    if (!IDEA_SECTIONS.has(section) || !validMessages(messages)) {
      return res.status(400).json({ error: '请求参数无效' });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write(': connected\n\n');

    const systemPrompt = skills.getIdeaSystem(section);
    const searchTool = needsWebSearch(messages) ? WEB_SEARCH_TOOL : null;
    const { reasoning, model, cacheHit } = await callDeepSeekStream(systemPrompt, messages, 4000,
      (chunk) => {
        if (chunk.type === 'content') sse(res, { type: 'content', text: chunk.text });
        else if (chunk.type === 'reasoning') sse(res, { type: 'reasoning', text: chunk.text });
      },
      searchTool
    );

    sse(res, { type: 'done', model, reasoning, cacheHit });
    res.end();
  } catch (e) {
    if (!res.headersSent) {
      res.status(500).json({ error: e.message });
    } else {
      sse(res, { type: 'error', message: e.message });
      res.end();
    }
  }
});

// 更多话题（博查直接搜 + DS 提炼短语）
app.post('/api/more-topics', async (req, res) => {
  try {
    const { section, season } = req.body;
    if (!IDEA_SECTIONS.has(section) || section === 'copy') return res.status(400).json({ error: '请求参数无效' });
    const pname = {train:'火车票',ticket:'景区门票',flight:'机票',hotel:'酒店'}[section]||'出行';
    const nodes = (season&&season.节点||['暑假','毕业季']).join('、');
    const crowds = (season&&season.人群||['学生','亲子']).join('、');

    // 博查搜 3 个方向，合并结果
    const queries = [`${nodes} ${pname}`, `${crowds} ${pname} 推荐`, `${pname} 最新优惠 旅游热搜`];
    let searchResults = '';
    for (const q of queries) {
      const sr = await bochaSearch(q);
      if (sr) searchResults += sr + '\n\n';
    }

    const sysPrompt = `你是话题提炼助手。根据搜索结果，为${pname}品类提炼4-6个话题短语（4-8字）。只返回JSON字符串数组如["短语1","短语2"]，不要任何解释。`;
    const msgs = [
      { role: 'system', content: sysPrompt },
      { role: 'user', content: searchResults ? `搜索结果：\n${searchResults.slice(0, 4000)}\n\n为${pname}提炼话题短语：` : `直接给${pname}品类4-6个话题短语` }
    ];
    const r2 = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SECRETS.deepseekKey },
      body: JSON.stringify({ model: DS_MODEL, max_tokens: 400, messages: msgs, stream: false })
    });
    if (!r2.ok) { const err = await r2.text(); return res.status(502).json({ error: err.slice(0, 100) }); }
    const j2 = await r2.json();
    const raw = ((j2.choices || [])[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    let topics = [];
    try {
      let js = raw;
      const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/); if (m) js = m[1].trim();
      const a = js.match(/\[[\s\S]*?\]/); if (a) js = a[0];
      topics = JSON.parse(js); if (!Array.isArray(topics)) topics = [];
    } catch (e) {
      topics = raw.split(/[\n,，]+/).map(s => s.replace(/["\[\]\d\.\s\-]/g, '').trim()).filter(s => s.length>=2&&s.length<=14).slice(0, 6);
    }
    res.json({ topics: topics.slice(0, 6) });
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

// 启动（仅本地开发时监听，Vercel 通过 api/index.js 加载）
if (require.main === module) {
  const PORT = process.env.PORT || 3456;
  app.listen(PORT, () => {
    console.log(`Server: http://localhost:${PORT}`);
    console.log(`Skills protected. Pricing visible.`);
  });
}

module.exports = app;
