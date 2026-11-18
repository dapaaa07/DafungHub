// server.js - cPanel Node.js / Phusion Passenger Entrypoint
const { createServer } = require('http');
const { parse } = require('url');
const fs = require('fs');
const path = require('path');
const next = require('next');

// Auto-load .env for standalone execution
try {
  process.loadEnvFile?.();
} catch {
  // Ignore
}

const dev = false;
const hostname = process.env.HOSTNAME || '127.0.0.1';
const port = parseInt(process.env.PORT, 10) || 3000;

function loadErrorHtml(code) {
  try {
    return fs.readFileSync(path.join(__dirname, 'public', 'errors', `${code}.html`), 'utf8');
  } catch {
    return null;
  }
}

const fallback500Html = loadErrorHtml(500) || loadErrorHtml(503);
const fallback400Html = loadErrorHtml(400);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    createServer(async (req, res) => {
      try {
        let parsedUrl;
        try {
          parsedUrl = parse(req.url || '/', true);
        } catch {
          res.statusCode = 400;
          if (req.url && req.url.startsWith('/api/')) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ success: false, error: 'Format URL permintaan tidak valid.' }));
          } else if (fallback400Html) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(fallback400Html);
          } else {
            res.end('Bad Request');
          }
          return;
        }
        await handle(req, res, parsedUrl);
      } catch (err) {
        console.error('[cPanel Server Error]:', req.url, err);
        res.statusCode = 500;
        if (req.url && req.url.startsWith('/api/')) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ success: false, error: 'Terjadi kesalahan sementara pada server.' }));
        } else if (fallback500Html) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(fallback500Html);
        } else {
          res.end('Internal Server Error');
        }
      }
    })
      .once('error', (err) => {
        console.error('[cPanel HTTP Error]:', err);
        process.exit(1);
      })
      .listen(port, () => {
        console.log(`> DaFung Hub is running on port ${port} (PID: ${process.pid})`);
      });
  })
  .catch((err) => {
    console.error('[Next.js Boot Error]:', err);
    process.exit(1);
  });
