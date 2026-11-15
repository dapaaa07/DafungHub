// server.js - cPanel Node.js / Phusion Passenger Entrypoint
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

// Auto-load .env for standalone execution
try {
  process.loadEnvFile?.();
} catch {
  // Ignore
}

const dev = false;
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT, 10) || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    createServer(async (req, res) => {
      try {
        const parsedUrl = parse(req.url, true);
        await handle(req, res, parsedUrl);
      } catch (err) {
        console.error('[cPanel Server Error]:', req.url, err);
        res.statusCode = 500;
        res.end('Internal Server Error');
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
