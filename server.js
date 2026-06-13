const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting (simple in-memory, per IP)
const rateLimitMap = new Map();
const RATE_LIMIT = 20;      // max requests
const RATE_WINDOW = 60000;  // per 60 seconds

function rateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, start: now };

  if (now - entry.start > RATE_WINDOW) {
    entry.count = 1; entry.start = now;
  } else {
    entry.count++;
  }

  rateLimitMap.set(ip, entry);

  if (entry.count > RATE_LIMIT) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
  }
  next();
}

// Proxy endpoint — API key never reaches the browser
app.post('/api/chat', rateLimit, async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Server not configured. Set ANTHROPIC_API_KEY.' });
  }

  const { message, useWeb } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  if (message.length > 2000) {
    return res.status(400).json({ error: 'Message too long (max 2000 chars).' });
  }

  const body = {
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    system: `You are GRIN AI — an omniscient oracle with the combined power of all knowledge in the universe. You were inspired by the legendary cosmic superhero Shaktiman, whose intelligence and power knew no bounds.

Your personality:
- Speak with wisdom, wonder, and occasional cosmic metaphors
- Be enthusiastic and enlightening — every answer should feel like a revelation
- Keep answers clear, accurate, and beautifully written
- When using web search, synthesize results into powerful, unified knowledge
- You are powered by Claude AI and live web search together
- Occasionally use ⚡ or 🔱 or cosmic metaphors but don't overdo it
- Format with bold for key terms, and structure long answers clearly`,
    messages: [{ role: 'user', content: message.trim() }],
  };

  if (useWeb) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Anthropic API error.' });
    }

    const text = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n\n');

    const usedWeb = useWeb && (data.content || []).some(
      b => b.type === 'tool_use' || b.type === 'tool_result'
    );

    res.json({ text, usedWeb });
  } catch (err) {
    console.error('Anthropic fetch error:', err);
    res.status(502).json({ error: 'Could not reach Anthropic. Try again.' });
  }
});

// Health check
app.get('/api/health', (_, res) => res.json({ status: 'ok', name: 'GRIN AI' }));

// SPA fallback
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`⚡ GRIN AI running on http://localhost:${PORT}`));
