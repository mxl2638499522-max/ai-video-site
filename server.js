// ============================================================
// AI 视频内容生产线 — 后端服务
// 部署到 Vercel 后自动运行，本地用 node server.js 启动
// ============================================================
require('dotenv').config();
const express = require('express');
const path = require('path');
const skills = require('./skills');
const app = express();
app.use(express.json());

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

// ============ DeepSeek 流式 API 调用 ============
async function callDeepSeekStream(systemPrompt, messages, maxTokens, onChunk, tools, round) {
  round = round || 0;
  const msgs = [];
  if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt });
  msgs.push(...messages);

  const body = { model: DS_MODEL, max_tokens: maxTokens, messages: msgs, stream: true };
  if (tools && round < 3) body.tools = [tools];

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
  // 累积 tool_calls（流式下发时为增量片段）
  const tcMap = {};
  let finishReason = '';

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
        const choice = (json.choices || [])[0] || {};
        const delta = choice.delta || {};
        if (delta.content) {
          content += delta.content;
          onChunk({ type: 'content', text: delta.content });
        }
        if (delta.reasoning_content) {
          reasoning += delta.reasoning_content;
          onChunk({ type: 'reasoning', text: delta.reasoning_content });
        }
        // 累积 tool_calls 增量
        if (delta.tool_calls) {
          delta.tool_calls.forEach(tc => {
            const idx = tc.index != null ? tc.index : 0;
            if (!tcMap[idx]) tcMap[idx] = { id: '', name: '', args: '' };
            if (tc.id) tcMap[idx].id = tc.id;
            if (tc.function) {
              if (tc.function.name) tcMap[idx].name = tcMap[idx].name + tc.function.name;
              if (tc.function.arguments) tcMap[idx].args = tcMap[idx].args + tc.function.arguments;
            }
          });
        }
        if (choice.finish_reason) finishReason = choice.finish_reason;
        if (json.model) model = json.model;
        if (json.usage?.prompt_cache_hit_tokens) cacheHit = json.usage.prompt_cache_hit_tokens;
      } catch (e) { /* skip malformed chunks */ }
    }
  }

  // 后处理：剥离 <think> 标签
  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
  if (thinkMatch) {
    reasoning = (reasoning ? reasoning + '\n' : '') + thinkMatch[1].trim();
    content = content.replace(/<think>[\s\S]*?<\/think>\n?/g, '').trim();
  }

  // 工具调用循环：搜到结果后追加到 messages，再次调用
  if (finishReason === 'tool_calls' && round < 3) {
    const tcList = Object.values(tcMap);
    for (const tc of tcList) {
      if (tc.name === 'web_search' && tc.id) {
        let query = '';
        try { const args = JSON.parse(tc.args); query = args.query || ''; } catch (e) {}
        if (query) {
          const searchResult = await bochaSearch(query);
          const tcMsg = { role: 'assistant', tool_calls: [{ id: tc.id, type: 'function', function: { name: 'web_search', arguments: tc.args } }] };
          if (reasoning) tcMsg.reasoning_content = reasoning;
          msgs.push(tcMsg);
          msgs.push({ role: 'tool', tool_call_id: tc.id, content: searchResult || '(未找到相关结果)' });
        }
      }
    }
    if (msgs.some(m => m.role === 'tool')) {
      return await callDeepSeekStream(null, msgs.slice(1), maxTokens, onChunk, tools, round + 1);
    }
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
    if (!prompt) return res.status(400).json({ error: '缺少 prompt' });

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
    if (!messages || !messages.length) return res.status(400).json({ error: '缺少消息' });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write(': connected\n\n');

    const systemPrompt = skills.getIdeaSystem(section);
    const { reasoning, model, cacheHit } = await callDeepSeekStream(systemPrompt, messages, 4000,
      (chunk) => {
        if (chunk.type === 'content') sse(res, { type: 'content', text: chunk.text });
        else if (chunk.type === 'reasoning') sse(res, { type: 'reasoning', text: chunk.text });
      },
      WEB_SEARCH_TOOL
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
