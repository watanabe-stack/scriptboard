import 'dotenv/config';
import express from 'express';
import fetch from 'node-fetch';
import { getAll, upsert, remove } from './db.js';

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ── SSE（リアルタイム同期） ─────────────────────────────
const clients = new Set();

app.get('/api/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  clients.add(res);
  req.on('close', () => clients.delete(res));
});

function broadcast(event, data) {
  for (const client of clients) {
    client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}

// ── 原稿 CRUD ──────────────────────────────────────

// 全件取得
app.get('/api/scripts', (req, res) => {
  res.json(getAll());
});

// 保存（作成・更新どちらも）
app.post('/api/scripts', (req, res) => {
  const s = req.body;
  if (!s.id || !s.title) return res.status(400).json({ error: 'id and title required' });
  upsert({ id: s.id, title: s.title, body: s.body || '', updatedAt: s.updatedAt || Date.now() });
  res.json({ ok: true });
  broadcast('update', { id: s.id, title: s.title, body: s.body || '', updatedAt: s.updatedAt || Date.now() });
});

// 削除
app.delete('/api/scripts/:id', (req, res) => {
  remove(req.params.id);
  res.json({ ok: true });
  broadcast('delete', { id: req.params.id });
});

// ── Anthropic API プロキシ ──────────────────────────
// フロントエンドからAPIキーを隠し、バックエンド経由で呼ぶ

app.post('/api/ai/extract', async (req, res) => {
  const { messages, system, tools } = req.body;
  try {
    const body = {
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      system,
      messages,
    };
    if (tools) body.tools = tools;

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── URLフェッチ プロキシ ──────────────────────────────
// フロントからのCORS制限を回避してページ本文を取得する

app.post('/api/fetch-url', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ScriptBoard/1.0)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });
    const html = await resp.text();
    res.json({ html });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`ScriptBoard running on http://localhost:${PORT}`));
