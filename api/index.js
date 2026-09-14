const https = require('https');
const http = require('http');

const RENDER_BACKEND = process.env.RENDER_BACKEND_URL || process.env.BACKEND_URL || 'https://nerd-eth-omemi-wa-bot-n540.onrender.com';

module.exports = (req, res) => {
  try {
    const targetUrl = new URL(req.url, RENDER_BACKEND);
    const isHttps = targetUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    const headers = { ...req.headers };
    delete headers.host;
    headers['host'] = targetUrl.host;
    headers['x-forwarded-by'] = 'vercel-proxy';

    const proxyReq = client.request(targetUrl, {
      method: req.method,
      headers: headers,
      timeout: 60000,
    }, (proxyRes) => {
      if (!res.headersSent) {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
      }
      proxyRes.pipe(res);
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      if (!res.headersSent) {
        res.writeHead(504, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Gateway timeout: backend took too long to respond' }));
      }
    });

    proxyReq.on('error', (err) => {
      console.error('[VERCEL PROXY ERROR]:', err.message);
      if (!res.headersSent) {
        if (req.url && (req.url.includes('/public-stats') || req.url.includes('/status'))) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            status: 'waking_up',
            connected: false,
            activeBots: 0,
            totalSessions: 0,
            platformUptime: 'Waking up server...',
            totalMessagesProcessed: 0,
            message: 'Connecting to 24/7 backend engine...'
          }));
        }
        res.writeHead(502, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: false,
          error: 'Bot backend is currently waking up. Please retry in 10-15 seconds.'
        }));
      }
    });

    // Handle POST/PUT/PATCH body
    if (req.body) {
      if (typeof req.body === 'object') {
        proxyReq.write(JSON.stringify(req.body));
      } else {
        proxyReq.write(req.body);
      }
      proxyReq.end();
    } else if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      req.pipe(proxyReq);
    } else {
      proxyReq.end();
    }
  } catch (e) {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Proxy initialization error: ' + e.message }));
    }
  }
};
