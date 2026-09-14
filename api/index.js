const { app, botStatus } = require('../server');
const https = require('https');
const http = require('http');

const RENDER_BACKEND = process.env.RENDER_BACKEND_URL || 'https://nerd-eth-omemi-wa-bot-n540.onrender.com';

module.exports = (req, res) => {
  // If running on Vercel and local bot is not connected, proxy to live Render bot engine
  if (process.env.VERCEL && !botStatus.connected) {
    try {
      const targetUrl = new URL(req.url, RENDER_BACKEND);
      const isHttps = targetUrl.protocol === 'https:';
      const client = isHttps ? https : http;

      const headers = { ...req.headers };
      delete headers.host;
      headers['host'] = targetUrl.host;

      const proxyReq = client.request(targetUrl, {
        method: req.method,
        headers: headers,
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      });

      proxyReq.on('error', () => {
        return app(req, res);
      });

      if (req.body) {
        if (typeof req.body === 'object') {
          proxyReq.write(JSON.stringify(req.body));
        } else {
          proxyReq.write(req.body);
        }
      }
      proxyReq.end();
      return;
    } catch (e) {
      return app(req, res);
    }
  }

  return app(req, res);
};
