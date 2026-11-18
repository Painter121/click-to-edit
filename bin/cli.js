#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const http = require('http');
const { createCteMiddleware } = require('../server/middleware');

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const DIST_BUNDLE_PATH = path.join(PACKAGE_ROOT, 'dist', 'click-to-edit.bundle.js');
const CLIENT_HTML_PATH = path.join(PACKAGE_ROOT, 'client', 'click-to-edit.html');
const HTML2CANVAS_PATH = path.join(PACKAGE_ROOT, 'client', 'html2canvas.min.js');

const CTE_SCRIPT_MARKER = 'click-to-edit.bundle.js';
const CTE_PLUGIN_FILE_ESM = 'cte-vite-plugin.mjs';
const CTE_PLUGIN_FILE_CJS = 'cte-vite-plugin.cjs';

function ensureDistBuilt() {
  if (!fs.existsSync(DIST_BUNDLE_PATH)) {
    const { build } = require('../scripts/build-bundle');
    build();
  }
}

function printHelp() {
  console.log(`
click-to-edit (cte) - Universal Click-to-Edit & Visual Inspector CLI

คำสั่งที่ใช้งานได้:
  cte init [dir]             ตรวจจับประเภทโปรเจ็กต์อัตโนมัติและติดตั้งตัว Debug
  cte sidecar [--port 4899]  รัน Sidecar Server เพื่อรับไฟล์รูป/คำสั่งลง mock/
  cte remove [dir]           ถอนการติดตั้งตัว Debug ออกจากโปรเจ็กต์
  cte help                   แสดงวิธีใช้งาน

ตัวอย่าง:
  cte init                   ติดตั้งในโฟลเดอร์ปัจจุบัน
  cte init ./web             ติดตั้งในโฟลเดอร์ที่ระบุ
  cte sidecar --port 4899    รัน Sidecar สำหรับโปรเจ็กต์ PHP/Python/HTML ทั่วไป
`);
}

function findViteRoot(baseDir) {
  const candidates = [
    baseDir,
    path.join(baseDir, 'web'),
    path.join(baseDir, 'client'),
    path.join(baseDir, 'frontend')
  ];
  const configNames = ['vite.config.js', 'vite.config.ts', 'vite.config.mjs', 'vite.config.mts'];

  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue;
    for (const cfg of configNames) {
      const cfgPath = path.join(dir, cfg);
      if (fs.existsSync(cfgPath)) {
        return { viteRoot: dir, configPath: cfgPath, configName: cfg };
      }
    }
  }
  return null;
}

function findGasDevServer(baseDir) {
  const devServerPath = path.join(baseDir, 'dev-server.js');
  const indexCandidates = [
    path.join(baseDir, 'src', 'Index.html'),
    path.join(baseDir, 'src', 'index.html')
  ];
  if (fs.existsSync(devServerPath) && indexCandidates.some((p) => fs.existsSync(p))) {
    return { rootDir: baseDir, devServerPath };
  }
  return null;
}

function findHtmlEntry(baseDir) {
  const candidates = [
    { file: 'index.html', scriptSrc: './tools/click-to-edit.bundle.js', toolsBase: baseDir },
    { file: path.join('public', 'index.html'), scriptSrc: '/tools/click-to-edit.bundle.js', toolsBase: path.join(baseDir, 'public') },
    { file: path.join('src', 'index.html'), scriptSrc: './tools/click-to-edit.bundle.js', toolsBase: path.join(baseDir, 'src') },
    { file: path.join('web', 'index.html'), scriptSrc: './tools/click-to-edit.bundle.js', toolsBase: path.join(baseDir, 'web') },
    { file: path.join('app', 'index.html'), scriptSrc: './tools/click-to-edit.bundle.js', toolsBase: path.join(baseDir, 'app') },
    { file: path.join('templates', 'index.html'), scriptSrc: '/static/tools/click-to-edit.bundle.js', toolsBase: path.join(baseDir, 'static') }
  ];

  for (const c of candidates) {
    const full = path.join(baseDir, c.file);
    if (fs.existsSync(full)) {
      return { htmlPath: full, scriptSrc: c.scriptSrc, toolsBase: c.toolsBase, relHtml: c.file };
    }
  }
  return null;
}

function buildSelfContainedVitePlugin({ isEsm }) {
  const header = isEsm
    ? `import fs from 'node:fs';\nimport path from 'node:path';\nimport { fileURLToPath } from 'node:url';\n\nconst __dirname = path.dirname(fileURLToPath(import.meta.url));\n`
    : `const fs = require('node:fs');\nconst path = require('node:path');\n`;

  const body = `
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function clickToEdit(options = {}) {
  let rootDir = options.rootDir ? path.resolve(options.rootDir) : process.cwd();
  const bundlePath = path.join(__dirname, 'click-to-edit.bundle.js');

  return {
    name: 'click-to-edit',
    apply: 'serve',
    configResolved(config) {
      if (!options.rootDir && config && config.root) {
        rootDir = config.root;
      }
    },
    configureServer(server) {
      if (process.env.VITEST) return;
      const mockDir = path.resolve(options.mockDir || path.join(rootDir, 'mock'));

      server.middlewares.use((req, res, next) => {
        const urlPath = (req.url || '/').split('?')[0];
        if (
          urlPath !== '/__cte/click-to-edit.js' &&
          urlPath !== '/api/screenshot' &&
          urlPath !== '/api/edit-request'
        ) {
          return next();
        }

        setCorsHeaders(res);
        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        if (urlPath === '/__cte/click-to-edit.js' && req.method === 'GET') {
          if (!fs.existsSync(bundlePath)) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('click-to-edit.bundle.js not found');
            return;
          }
          const data = fs.readFileSync(bundlePath);
          res.writeHead(200, {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Content-Length': data.length,
            'Cache-Control': 'no-store'
          });
          res.end(data);
          return;
        }

        if (urlPath === '/api/screenshot' && req.method === 'POST') {
          readBody(req)
            .then((body) => {
              try {
                const parsed = JSON.parse(body || '{}');
                if (parsed.image) {
                  fs.mkdirSync(mockDir, { recursive: true });
                  const base64Data = String(parsed.image).replace(/^data:image\\/\\w+;base64,/, '');
                  const filePath = path.join(mockDir, 'last_screenshot.png');
                  fs.writeFileSync(filePath, base64Data, 'base64');
                  console.log('\\n[Screen Capture] บันทึกภาพหน้าจอเรียบร้อย: mock/last_screenshot.png');
                  if (parsed.instruction) {
                    console.log('- คำสั่งประกอบภาพ: ' + parsed.instruction + '\\n');
                  }
                }
              } catch (err) {
                console.error('[Screen Capture] Error:', err);
              }
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ ok: true }));
            })
            .catch(() => {
              res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ ok: false }));
            });
          return;
        }

        if (urlPath === '/api/edit-request') {
          const feedbackFile = path.join(mockDir, 'last_edit_request.json');
          if (req.method === 'POST') {
            readBody(req)
              .then((body) => {
                try {
                  fs.mkdirSync(mockDir, { recursive: true });
                  fs.writeFileSync(feedbackFile, body, 'utf-8');
                  console.log('[Click-to-Edit] บันทึกคำสั่งแก้ไขเรียบร้อย: mock/last_edit_request.json');
                } catch (err) {
                  console.error('[Click-to-Edit] Error:', err);
                }
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: true }));
              })
              .catch(() => {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: false }));
              });
            return;
          }
          if (req.method === 'GET') {
            if (fs.existsSync(feedbackFile)) {
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(fs.readFileSync(feedbackFile));
            } else {
              res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ error: 'No edit request found' }));
            }
            return;
          }
        }

        return next();
      });
    },
    transformIndexHtml(html) {
      if (html.includes('/__cte/click-to-edit.js')) return html;
      const tag = '  <script src="/__cte/click-to-edit.js"></script>\\n';
      if (/<\\/body>/i.test(html)) {
        return html.replace(/<\\/body>/i, tag + '</body>');
      }
      return html + '\\n' + tag;
    }
  };
}
`;

  const footer = isEsm
    ? `\nexport { clickToEdit };\nexport default clickToEdit;\n`
    : `\nmodule.exports = clickToEdit;\nmodule.exports.default = clickToEdit;\nmodule.exports.clickToEdit = clickToEdit;\n`;

  return header + body + footer;
}

function findMatchingBracket(text, openIndex) {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inSingle) {
      if (ch === '\\') { i++; continue; }
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '\\') { i++; continue; }
      if (ch === '"') inDouble = false;
      continue;
    }
    if (inTemplate) {
      if (ch === '\\') { i++; continue; }
      if (ch === '`') inTemplate = false;
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (ch === "'") { inSingle = true; continue; }
    if (ch === '"') { inDouble = true; continue; }
    if (ch === '`') { inTemplate = true; continue; }

    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function patchViteConfig(configPath, isEsm) {
  let content = fs.readFileSync(configPath, 'utf8');
  if (content.includes('cte-vite-plugin') || content.includes('clickToEdit(')) {
    return { updated: false, reason: 'already-configured' };
  }

  const pluginFile = isEsm ? CTE_PLUGIN_FILE_ESM : CTE_PLUGIN_FILE_CJS;
  const importLine = isEsm
    ? `import clickToEdit from './tools/${pluginFile}';`
    : `const clickToEdit = require('./tools/${pluginFile}');`;

  // Insert import after the last top-level import/require line
  const lines = content.split(/\r?\n/);
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  let lastImportIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (
      (isEsm && /^import\s+/.test(trimmed)) ||
      (!isEsm && /^(const|let|var)\s+.*=\s*require\(/.test(trimmed))
    ) {
      lastImportIdx = i;
    }
  }

  if (lastImportIdx >= 0) {
    lines.splice(lastImportIdx + 1, 0, importLine);
  } else {
    lines.unshift(importLine);
  }
  content = lines.join(eol);

  // Add clickToEdit() into plugins: [...]
  const pluginsMatch = /plugins\s*:\s*\[/.exec(content);
  if (pluginsMatch) {
    const openIdx = pluginsMatch.index + pluginsMatch[0].length - 1;
    const closeIdx = findMatchingBracket(content, openIdx);
    if (closeIdx !== -1) {
      const inner = content.slice(openIdx + 1, closeIdx);
      const trimmedInner = inner.trim();
      let replacement;
      if (!trimmedInner) {
        replacement = 'clickToEdit()';
      } else if (inner.includes('\n')) {
        const trailingWsMatch = inner.match(/([ \t]*)$/);
        const indentMatch = inner.match(/\n([ \t]+)\S/);
        const itemIndent = indentMatch ? indentMatch[1] : '    ';
        const beforeClose = inner.replace(/\s*$/, '');
        const needsComma = !beforeClose.endsWith(',');
        const closingIndent = trailingWsMatch ? trailingWsMatch[1] : '';
        replacement = `${beforeClose}${needsComma ? ',' : ''}${eol}${itemIndent}clickToEdit(),${eol}${closingIndent}`;
      } else {
        replacement = `${inner.trimEnd()}, clickToEdit()`;
      }
      content = content.slice(0, openIdx + 1) + replacement + content.slice(closeIdx);
    }
  } else {
    // No plugins property found in defineConfig({ ... }) -> inject plugins: [clickToEdit()],
    const defineMatch = /defineConfig\s*\(\s*\{/.exec(content);
    if (defineMatch) {
      const insertAt = defineMatch.index + defineMatch[0].length;
      content = content.slice(0, insertAt) + `${eol}  plugins: [clickToEdit()],` + content.slice(insertAt);
    } else {
      return { updated: false, reason: 'manual-config-needed' };
    }
  }

  fs.writeFileSync(configPath, content, 'utf8');
  return { updated: true };
}

function unpatchViteConfig(configPath) {
  if (!fs.existsSync(configPath)) return false;
  let content = fs.readFileSync(configPath, 'utf8');
  const original = content;

  content = content
    .replace(/^[ \t]*import\s+clickToEdit\s+from\s+['"]\.\/tools\/cte-vite-plugin\.(mjs|js)['"];?[ \t]*\r?\n?/gm, '')
    .replace(/^[ \t]*(const|let|var)\s+clickToEdit\s*=\s*require\(['"]\.\/tools\/cte-vite-plugin\.(cjs|js)['"]\);?[ \t]*\r?\n?/gm, '')
    .replace(/,\s*clickToEdit\([^)]*\)/g, '')
    .replace(/clickToEdit\([^)]*\)\s*,\s*/g, '')
    .replace(/clickToEdit\([^)]*\)/g, '');

  if (content !== original) {
    fs.writeFileSync(configPath, content, 'utf8');
    return true;
  }
  return false;
}

function updateGitignore(dirs) {
  const entries = ['mock/last_screenshot.png', 'mock/last_edit_request.json'];
  const updatedFiles = [];

  for (const dir of dirs) {
    const giPath = path.join(dir, '.gitignore');
    if (!fs.existsSync(giPath)) continue;

    let text = fs.readFileSync(giPath, 'utf8');
    const lines = text.split(/\r?\n/).map((l) => l.trim());
    const hasMockDir = lines.includes('mock/') || lines.includes('/mock/') || lines.includes('mock');
    if (hasMockDir) continue;

    const missing = entries.filter((entry) => !lines.includes(entry) && !lines.includes('/' + entry));
    if (missing.length > 0) {
      const eol = text.includes('\r\n') ? '\r\n' : '\n';
      if (text.length > 0 && !text.endsWith('\n')) text += eol;
      text += `${eol}# Click-to-Edit debug artifacts${eol}${missing.join(eol)}${eol}`;
      fs.writeFileSync(giPath, text, 'utf8');
      updatedFiles.push(giPath);
    }
  }
  return updatedFiles;
}

function detectIsEsm(viteRoot, configPath) {
  const content = fs.readFileSync(configPath, 'utf8');
  if (/\bexport\s+default\b|\bimport\s+/.test(content)) return true;
  if (configPath.endsWith('.mjs') || configPath.endsWith('.mts') || configPath.endsWith('.ts')) return true;
  const pkgPath = path.join(viteRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.type === 'module') return true;
    } catch (e) {}
  }
  return false;
}

function runInit(targetArg) {
  ensureDistBuilt();
  const targetDir = path.resolve(targetArg || process.cwd());
  if (!fs.existsSync(targetDir)) {
    console.error(`[Click-to-Edit] ไม่พบโฟลเดอร์: ${targetDir}`);
    process.exit(1);
  }

  console.log(`\n[Click-to-Edit] กำลังตรวจสอบโปรเจ็กต์ที่: ${targetDir}`);

  // 1. Vite Project Detection
  const viteInfo = findViteRoot(targetDir);
  if (viteInfo) {
    const toolsDir = path.join(viteInfo.viteRoot, 'tools');
    fs.mkdirSync(toolsDir, { recursive: true });

    const isEsm = detectIsEsm(viteInfo.viteRoot, viteInfo.configPath);
    const pluginFilename = isEsm ? CTE_PLUGIN_FILE_ESM : CTE_PLUGIN_FILE_CJS;

    fs.copyFileSync(DIST_BUNDLE_PATH, path.join(toolsDir, 'click-to-edit.bundle.js'));
    fs.writeFileSync(
      path.join(toolsDir, pluginFilename),
      buildSelfContainedVitePlugin({ isEsm }),
      'utf8'
    );

    const patchResult = patchViteConfig(viteInfo.configPath, isEsm);
    const gitignores = updateGitignore([...new Set([targetDir, viteInfo.viteRoot])]);

    console.log(`\n✅ ตรวจพบโปรเจ็กต์ Vite (${path.relative(targetDir, viteInfo.configPath) || viteInfo.configName})`);
    console.log(`   - คัดลอกไฟล์ไปที่: ${path.relative(targetDir, toolsDir) || 'tools'}/`);
    console.log(`     • click-to-edit.bundle.js`);
    console.log(`     • ${pluginFilename} (ทำงานเฉพาะตอน npm run dev, ไม่ติดเข้า vite build)`);
    if (patchResult.updated) {
      console.log(`   - เพิ่ม plugin clickToEdit() ใน ${viteInfo.configName} เรียบร้อย`);
    } else if (patchResult.reason === 'already-configured') {
      console.log(`   - อัปเดตไฟล์ bundle แล้ว (${viteInfo.configName} มี plugin อยู่แล้ว)`);
    } else {
      console.log(`   ⚠️ กรุณาเพิ่ม clickToEdit() ใน plugins ของ ${viteInfo.configName} ด้วยตนเอง`);
    }
    if (gitignores.length > 0) {
      console.log(`   - อัปเดต .gitignore สำหรับ mock/last_screenshot.png และ mock/last_edit_request.json`);
    }
    printUsageTips();
    return;
  }

  // 2. GAS / Custom dev-server.js Detection
  const gasInfo = findGasDevServer(targetDir);
  if (gasInfo) {
    const toolsDir = path.join(gasInfo.rootDir, 'tools');
    fs.mkdirSync(toolsDir, { recursive: true });
    fs.copyFileSync(CLIENT_HTML_PATH, path.join(toolsDir, 'click-to-edit.html'));
    fs.copyFileSync(HTML2CANVAS_PATH, path.join(toolsDir, 'html2canvas.min.js'));

    const devServerText = fs.readFileSync(gasInfo.devServerPath, 'utf8');
    const alreadyWired = devServerText.includes('click-to-edit.html');
    const gitignores = updateGitignore([gasInfo.rootDir]);

    console.log(`\n✅ ตรวจพบโปรเจ็กต์ GAS Local Server (dev-server.js)`);
    console.log(`   - อัปเดตไฟล์ tools/click-to-edit.html และ tools/html2canvas.min.js เรียบร้อย`);
    if (!alreadyWired) {
      console.log(`   ℹ️ หาก dev-server.js ยังไม่ได้ฝัง tools/click-to-edit.html ให้เพิ่มโค้ดอ่านไฟล์แล้วแปะก่อน </body>`);
    }
    if (gitignores.length > 0) {
      console.log(`   - อัปเดต .gitignore เรียบร้อย`);
    }
    printUsageTips();
    return;
  }

  // 3. Generic HTML / PHP / Python / Static Project Detection
  const htmlInfo = findHtmlEntry(targetDir);
  if (htmlInfo) {
    const toolsDir = path.join(htmlInfo.toolsBase, 'tools');
    fs.mkdirSync(toolsDir, { recursive: true });
    fs.copyFileSync(DIST_BUNDLE_PATH, path.join(toolsDir, 'click-to-edit.bundle.js'));

    let html = fs.readFileSync(htmlInfo.htmlPath, 'utf8');
    let injected = false;
    if (!html.includes(CTE_SCRIPT_MARKER)) {
      const scriptTag = `  <script src="${htmlInfo.scriptSrc}"></script>\n`;
      if (/<\/body>/i.test(html)) {
        html = html.replace(/<\/body>/i, `${scriptTag}</body>`);
      } else {
        html += `\n${scriptTag}`;
      }
      fs.writeFileSync(htmlInfo.htmlPath, html, 'utf8');
      injected = true;
    }

    const gitignores = updateGitignore([targetDir]);

    console.log(`\n✅ ตรวจพบโปรเจ็กต์เว็บทั่วไป (${htmlInfo.relHtml})`);
    console.log(`   - คัดลอกไฟล์ไปที่: ${path.relative(targetDir, toolsDir)}/click-to-edit.bundle.js`);
    if (injected) {
      console.log(`   - ฝัง <script src="${htmlInfo.scriptSrc}"></script> ลงใน ${htmlInfo.relHtml} เรียบร้อย`);
    } else {
      console.log(`   - อัปเดต bundle เรียบร้อย (${htmlInfo.relHtml} มี script อยู่แล้ว)`);
    }
    if (gitignores.length > 0) {
      console.log(`   - อัปเดต .gitignore เรียบร้อย`);
    }
    console.log(`\n💡 หมายเหตุ: สำหรับโปรเจ็กต์ที่ไม่มี backend รองรับการเซฟไฟล์รูปลง mock/ อัตโนมัติ`);
    console.log(`   ยังสามารถ Ctrl+V รูปและข้อความจาก Clipboard ได้ทันที 100% หรือรัน "cte sidecar" คู่กันเพื่อเซฟไฟล์ลง mock/`);
    printUsageTips();
    return;
  }

  // 4. Fallback: Copy universal bundle into tools/ and print manual 1-line instruction
  const toolsDir = path.join(targetDir, 'tools');
  fs.mkdirSync(toolsDir, { recursive: true });
  fs.copyFileSync(DIST_BUNDLE_PATH, path.join(toolsDir, 'click-to-edit.bundle.js'));
  updateGitignore([targetDir]);

  console.log(`\n⚠️ ไม่พบไฟล์ index.html หรือ vite.config ใน ${targetDir}`);
  console.log(`   - คัดลอกไฟล์ไปที่: tools/click-to-edit.bundle.js แล้ว`);
  console.log(`   - นำแท็กนี้ไปแปะก่อน </body> ในหน้าเว็บหลักของคุณ:`);
  console.log(`     <script src="/tools/click-to-edit.bundle.js"></script>`);
  console.log(`   - หรือใช้ Sidecar Server โดยรัน: cte sidecar แล้วแปะ:`);
  console.log(`     <script src="http://localhost:4899/__cte/click-to-edit.js"></script>`);
  printUsageTips();
}

function runRemove(targetArg) {
  const targetDir = path.resolve(targetArg || process.cwd());
  let removedAny = false;

  const viteInfo = findViteRoot(targetDir);
  if (viteInfo) {
    if (unpatchViteConfig(viteInfo.configPath)) {
      console.log(`- ถอด plugin ออกจาก ${path.relative(targetDir, viteInfo.configPath)}`);
      removedAny = true;
    }
    const toolsDir = path.join(viteInfo.viteRoot, 'tools');
    for (const file of [CTE_PLUGIN_FILE_ESM, CTE_PLUGIN_FILE_CJS, 'click-to-edit.bundle.js']) {
      const p = path.join(toolsDir, file);
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
        console.log(`- ลบไฟล์ ${path.relative(targetDir, p)}`);
        removedAny = true;
      }
    }
  }

  const htmlInfo = findHtmlEntry(targetDir);
  if (htmlInfo && fs.existsSync(htmlInfo.htmlPath)) {
    let html = fs.readFileSync(htmlInfo.htmlPath, 'utf8');
    const updated = html.replace(/[ \t]*<script[^>]*click-to-edit\.bundle\.js[^>]*><\/script>[ \t]*\r?\n?/gi, '');
    if (updated !== html) {
      fs.writeFileSync(htmlInfo.htmlPath, updated, 'utf8');
      console.log(`- ถอด <script> ออกจาก ${htmlInfo.relHtml}`);
      removedAny = true;
    }
    const bundleInHtmlTools = path.join(htmlInfo.toolsBase, 'tools', 'click-to-edit.bundle.js');
    if (fs.existsSync(bundleInHtmlTools)) {
      fs.unlinkSync(bundleInHtmlTools);
      console.log(`- ลบไฟล์ ${path.relative(targetDir, bundleInHtmlTools)}`);
      removedAny = true;
    }
  }

  if (!removedAny) {
    console.log(`[Click-to-Edit] ไม่พบไฟล์ที่ติดตั้งไว้ใน ${targetDir}`);
  } else {
    console.log('✅ ถอนการติดตั้งเรียบร้อย');
  }
}

function runSidecar(args) {
  ensureDistBuilt();
  let port = 4899;
  let rootDir = process.cwd();

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--port' || args[i] === '-p') && args[i + 1]) {
      port = parseInt(args[i + 1], 10) || 4899;
      i++;
    } else if ((args[i] === '--dir' || args[i] === '-d') && args[i + 1]) {
      rootDir = path.resolve(args[i + 1]);
      i++;
    }
  }

  const middleware = createCteMiddleware({ rootDir });
  const server = http.createServer((req, res) => {
    middleware(req, res, () => {
      if ((req.url || '/').split('?')[0] === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Click-to-Edit Sidecar Running\nRoot: ${rootDir}\nScript: http://localhost:${port}/__cte/click-to-edit.js\n`);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
    });
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[Sidecar] พอร์ต ${port} ถูกใช้งานอยู่แล้ว (ลองระบุพอร์ตอื่นด้วย --port)`);
      process.exit(1);
    }
    throw err;
  });

  server.listen(port, () => {
    console.log('\n======================================================');
    console.log('Click-to-Edit Sidecar Server');
    console.log('======================================================');
    console.log(`[INFO] Listening on: http://localhost:${port}`);
    console.log(`[INFO] Saving mock files to: ${path.join(rootDir, 'mock')}`);
    console.log(`[INFO] Embed script tag (if needed):`);
    console.log(`       <script src="http://localhost:${port}/__cte/click-to-edit.js"></script>`);
    console.log('Press Ctrl+C to terminate\n');
  });
}

function printUsageTips() {
  console.log(`
คีย์ลัดการใช้งานบนหน้าเว็บ:
  • ปุ่มลอยมุมซ้ายล่าง  : ลากย้ายมุมได้ คลิกเพื่อเปิดเมนู
  • กดเลข 1             : คลิกเลือก Element (รองรับหลายจุด แล้วกด Enter)
  • กดเลข 2             : ลากครอบพื้นที่ (Area Selection)
  • กดเลข 3             : ลากครอบแคปภาพ + คลิกที่ภาพเพื่อวาดปากกาเน้นจุด
  • กด ESC              : เปิด/ปิดเมนู หรือยกเลิกโหมดเลือก
`);
}

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    printHelp();
    return;
  }

  if (cmd === 'init') {
    runInit(args[1]);
  } else if (cmd === 'sidecar') {
    runSidecar(args.slice(1));
  } else if (cmd === 'remove' || cmd === 'uninstall') {
    runRemove(args[1]);
  } else {
    console.error(`[Click-to-Edit] ไม่รู้จักคำสั่ง: ${cmd}`);
    printHelp();
    process.exit(1);
  }
}

main();
