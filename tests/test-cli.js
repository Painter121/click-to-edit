const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const { build } = require(path.join(ROOT_DIR, 'scripts', 'build-bundle'));
const { createCteMiddleware } = require(path.join(ROOT_DIR, 'server', 'middleware'));
const CLI_PATH = path.join(ROOT_DIR, 'bin', 'cli.js');

function request(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers: data
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(data)
            }
          : {}
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8')
          });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runTests() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cte-test-'));

  try {
    // 1. Bundle Generation
    build();
    const clientPath = path.join(ROOT_DIR, 'dist', 'click-to-edit.js');
    const bundlePath = path.join(ROOT_DIR, 'dist', 'click-to-edit.bundle.js');

    assert.equal(fs.existsSync(clientPath), true, 'dist/click-to-edit.js should exist');
    assert.equal(fs.existsSync(bundlePath), true, 'dist/click-to-edit.bundle.js should exist');

    const bundleContent = fs.readFileSync(bundlePath, 'utf8');
    assert.ok(bundleContent.includes('html2canvas'), 'bundle should include html2canvas');
    assert.ok(bundleContent.includes('cte-fab'), 'bundle should include #cte-fab');
    assert.ok(bundleContent.includes('isDevOrigin'), 'bundle should include dev origin guard');
    console.log('✓ Test 1 passed: bundle generation & contents');

    // 2. Middleware Endpoints
    const mwDir = path.join(tempRoot, 'mw-project');
    fs.mkdirSync(mwDir, { recursive: true });
    const middleware = createCteMiddleware({ rootDir: mwDir });

    const server = http.createServer((req, res) => {
      middleware(req, res, () => {
        res.writeHead(404);
        res.end('Not Found');
      });
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    try {
      const jsRes = await request(port, 'GET', '/__cte/click-to-edit.js');
      assert.equal(jsRes.status, 200);
      assert.ok(jsRes.headers['content-type'].includes('application/javascript'));
      assert.ok(jsRes.body.includes('cte-fab'));

      // 1x1 transparent PNG in base64
      const tinyPngB64 =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
      const ssRes = await request(port, 'POST', '/api/screenshot', {
        image: tinyPngB64,
        instruction: 'ปรับขนาดปุ่ม',
        selector: '#btn-save'
      });
      assert.equal(ssRes.status, 200);
      assert.deepEqual(JSON.parse(ssRes.body), { ok: true });
      const savedPngPath = path.join(mwDir, 'mock', 'last_screenshot.png');
      assert.equal(fs.existsSync(savedPngPath), true, 'last_screenshot.png should be created');
      assert.ok(fs.statSync(savedPngPath).size > 20);

      const editPayload = { selector: '.nav-item', instruction: 'ขยับขึ้น 4px' };
      const erPostRes = await request(port, 'POST', '/api/edit-request', editPayload);
      assert.equal(erPostRes.status, 200);
      assert.deepEqual(JSON.parse(erPostRes.body), { success: true });

      const erGetRes = await request(port, 'GET', '/api/edit-request');
      assert.equal(erGetRes.status, 200);
      assert.deepEqual(JSON.parse(erGetRes.body), editPayload);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
    console.log('✓ Test 2 passed: middleware endpoints');

    // 3. CLI init & remove on Vite project
    const viteDir = path.join(tempRoot, 'vite-project');
    fs.mkdirSync(viteDir, { recursive: true });
    fs.writeFileSync(
      path.join(viteDir, 'package.json'),
      JSON.stringify({ name: 'test-vite', type: 'module' }, null, 2)
    );
    fs.writeFileSync(path.join(viteDir, '.gitignore'), 'dist/\n');
    const initialViteConfig = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
`;
    fs.writeFileSync(path.join(viteDir, 'vite.config.js'), initialViteConfig);

    execFileSync(process.execPath, [CLI_PATH, 'init', viteDir], { stdio: 'pipe' });

    assert.equal(
      fs.existsSync(path.join(viteDir, 'tools', 'cte-vite-plugin.mjs')),
      true,
      'cte-vite-plugin.mjs should be created'
    );
    assert.equal(
      fs.existsSync(path.join(viteDir, 'tools', 'click-to-edit.bundle.js')),
      true,
      'click-to-edit.bundle.js should be copied'
    );
    const patchedVite = fs.readFileSync(path.join(viteDir, 'vite.config.js'), 'utf8');
    assert.ok(patchedVite.includes("import clickToEdit from './tools/cte-vite-plugin.mjs'"));
    assert.ok(patchedVite.includes('clickToEdit()'));
    execFileSync(process.execPath, ['--check', path.join(viteDir, 'tools', 'cte-vite-plugin.mjs')]);

    // Idempotency check (running init twice should not duplicate plugin)
    execFileSync(process.execPath, [CLI_PATH, 'init', viteDir], { stdio: 'pipe' });
    const patchedTwice = fs.readFileSync(path.join(viteDir, 'vite.config.js'), 'utf8');
    assert.equal(patchedTwice.match(/clickToEdit\(\)/g).length, 1);

    const giText = fs.readFileSync(path.join(viteDir, '.gitignore'), 'utf8');
    assert.ok(giText.includes('mock/last_screenshot.png'));

    execFileSync(process.execPath, [CLI_PATH, 'remove', viteDir], { stdio: 'pipe' });
    const unpatchedVite = fs.readFileSync(path.join(viteDir, 'vite.config.js'), 'utf8');
    assert.equal(unpatchedVite.includes('clickToEdit'), false);
    assert.equal(fs.existsSync(path.join(viteDir, 'tools', 'cte-vite-plugin.mjs')), false);
    console.log('✓ Test 3 passed: CLI init / idempotency / remove on Vite project');

    // 4. CLI init & remove on static HTML project
    const htmlDir = path.join(tempRoot, 'html-project');
    fs.mkdirSync(htmlDir, { recursive: true });
    fs.writeFileSync(
      path.join(htmlDir, 'index.html'),
      '<!doctype html><html><body><h1>Hello</h1></body></html>\n'
    );

    execFileSync(process.execPath, [CLI_PATH, 'init', htmlDir], { stdio: 'pipe' });
    const injectedHtml = fs.readFileSync(path.join(htmlDir, 'index.html'), 'utf8');
    assert.ok(injectedHtml.includes('<script src="./tools/click-to-edit.bundle.js"></script>'));
    assert.equal(fs.existsSync(path.join(htmlDir, 'tools', 'click-to-edit.bundle.js')), true);

    execFileSync(process.execPath, [CLI_PATH, 'remove', htmlDir], { stdio: 'pipe' });
    const cleanedHtml = fs.readFileSync(path.join(htmlDir, 'index.html'), 'utf8');
    assert.equal(cleanedHtml.includes('click-to-edit.bundle.js'), false);
    assert.equal(fs.existsSync(path.join(htmlDir, 'tools', 'click-to-edit.bundle.js')), false);
    console.log('✓ Test 4 passed: CLI init / remove on static HTML project');

    console.log('\nAll tests passed!');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
