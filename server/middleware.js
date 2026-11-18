const fs = require('fs');
const path = require('path');

const PACKAGE_ROOT = path.resolve(__dirname, '..');

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body !== undefined) {
      if (typeof req.body === 'string') {
        resolve(req.body);
      } else {
        resolve(JSON.stringify(req.body));
      }
      return;
    }
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function createCteMiddleware(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const mockDir = path.resolve(options.mockDir || path.join(rootDir, 'mock'));
  const bundlePath = options.bundlePath
    ? path.resolve(options.bundlePath)
    : path.join(PACKAGE_ROOT, 'dist', 'click-to-edit.bundle.js');
  const html2canvasPath = options.html2canvasPath
    ? path.resolve(options.html2canvasPath)
    : path.join(PACKAGE_ROOT, 'client', 'html2canvas.min.js');

  return function cteMiddleware(req, res, next) {
    const rawUrl = req.url || '/';
    const urlPath = rawUrl.split('?')[0];

    const isCteRoute =
      urlPath === '/__cte/click-to-edit.js' ||
      urlPath === '/html2canvas.min.js' ||
      urlPath === '/api/screenshot' ||
      urlPath === '/api/edit-request';

    if (!isCteRoute) {
      if (typeof next === 'function') return next();
      return false;
    }

    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return true;
    }

    // 1. Universal Bundle JS
    if (urlPath === '/__cte/click-to-edit.js' && req.method === 'GET') {
      const candidates = [
        bundlePath,
        path.join(rootDir, 'tools', 'click-to-edit.bundle.js')
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          const data = fs.readFileSync(candidate);
          res.writeHead(200, {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Content-Length': data.length,
            'Cache-Control': 'no-store'
          });
          res.end(data);
          return true;
        }
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('click-to-edit.bundle.js not found. Run npm run build.');
      return true;
    }

    // 2. Standalone html2canvas asset (for legacy dev-server.js compatibility)
    if (urlPath === '/html2canvas.min.js' && req.method === 'GET') {
      const candidates = [
        html2canvasPath,
        path.join(rootDir, 'tools', 'html2canvas.min.js'),
        path.join(rootDir, 'node_modules', 'html2canvas', 'dist', 'html2canvas.min.js')
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          const data = fs.readFileSync(candidate);
          res.writeHead(200, {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Content-Length': data.length,
            'Cache-Control': 'public, max-age=86400'
          });
          res.end(data);
          return true;
        }
      }
      if (typeof next === 'function') return next();
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return true;
    }

    // 3. Screenshot Upload
    if (urlPath === '/api/screenshot' && req.method === 'POST') {
      readRequestBody(req)
        .then((body) => {
          try {
            const parsed = JSON.parse(body || '{}');
            if (parsed.image) {
              fs.mkdirSync(mockDir, { recursive: true });
              const base64Data = String(parsed.image).replace(/^data:image\/\w+;base64,/, '');
              const filePath = path.join(mockDir, 'last_screenshot.png');
              fs.writeFileSync(filePath, base64Data, 'base64');
              const relPath = path.relative(rootDir, filePath) || 'mock/last_screenshot.png';
              console.log(`\n[Screen Capture] บันทึกภาพหน้าจอเรียบร้อย: ${relPath}`);
              if (parsed.instruction) {
                console.log(`- คำสั่งประกอบภาพ: ${parsed.instruction}\n`);
              }
            }
          } catch (e) {
            console.error('[Screen Capture] Error:', e);
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true }));
        })
        .catch((e) => {
          console.error('[Screen Capture] Read error:', e);
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: e.message }));
        });
      return true;
    }

    // 4. Edit Request Feedback
    if (urlPath === '/api/edit-request') {
      const feedbackFile = path.join(mockDir, 'last_edit_request.json');
      if (req.method === 'POST') {
        readRequestBody(req)
          .then((body) => {
            try {
              fs.mkdirSync(mockDir, { recursive: true });
              fs.writeFileSync(feedbackFile, body, 'utf-8');
              const relPath = path.relative(rootDir, feedbackFile) || 'mock/last_edit_request.json';
              console.log(`[Click-to-Edit] บันทึกคำสั่งแก้ไขเรียบร้อย: ${relPath}`);
            } catch (e) {
              console.error('[Click-to-Edit] Error:', e);
            }
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: true }));
          })
          .catch((e) => {
            console.error('[Click-to-Edit] Read error:', e);
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: false, error: e.message }));
          });
        return true;
      }

      if (req.method === 'GET') {
        if (fs.existsSync(feedbackFile)) {
          const data = fs.readFileSync(feedbackFile);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(data);
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'No edit request found' }));
        }
        return true;
      }
    }

    if (typeof next === 'function') return next();
    return false;
  };
}

module.exports = { createCteMiddleware };
