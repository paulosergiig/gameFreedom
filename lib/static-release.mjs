import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const STATIC = new Set(['/index.html', '/styles.css', '/boot.js', '/app.js', '/game.js', '/shared/rules.js', '/freestyle.js', '/shared/freestyle-rules.js', '/favicon.svg', '/shared/classic-survival.js', '/shared/freestyle-survival.js']);
const ASSET = /^\/assets\/[a-zA-Z0-9/_-]+\.(?:png|webp|jpg|svg|woff2|ttf|ico|js)$/;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };
// Include the delivery code so changing URL rewriting also changes the release identity.
const DELIVERY_SOURCE = fs.readFileSync(fileURLToPath(import.meta.url));
export const NO_STORE = 'no-store';
export const IMMUTABLE = 'public, max-age=31536000, immutable';

export function cacheHeaders(res, policy = NO_STORE) {
  res.setHeader('Cache-Control', policy);
  res.setHeader('CDN-Cache-Control', policy);
  res.setHeader('Cloudflare-CDN-Cache-Control', policy);
}

export function createStaticRelease(publicDir) {
  const root = fs.realpathSync(publicDir);
  const files = new Map();
  function read(relative) {
    const target = '/' + relative;
    if (!STATIC.has(target) && !ASSET.test(target)) return;
    try {
      const real = fs.realpathSync(path.join(root, relative));
      const rel = path.relative(root, real);
      if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel) || !fs.statSync(real).isFile()) return;
      files.set(target, fs.readFileSync(real));
    } catch (error) {
      if (['ENOENT', 'ENOTDIR'].includes(error.code)) return;
      throw error;
    }
  }
  function walk(relative) {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const name = relative ? relative + '/' + entry.name : entry.name;
      // Do not follow directory links/junctions or explore non-public directories.
      if (entry.isDirectory() && (name === 'assets' || name.startsWith('assets/') || name === 'shared')) walk(name);
      else if (!entry.isDirectory()) read(name);
    }
  }
  walk('');
  const digest = createHash('sha256').update(DELIVERY_SOURCE);
  for (const [name, bytes] of [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    digest.update('\0' + name + '\0' + bytes.length + '\0').update(bytes);
  }
  const version = digest.digest('hex');
  const prefix = '/static/' + version;
  function versionUrl(value) {
    const name = value.split(/[?#]/)[0];
    return name !== '/index.html' && name !== '/boot.js' && files.has(name) ? prefix + value : value;
  }
  const rendered = new Map();
  for (const [name, bytes] of files) {
    let body = bytes;
    if (name === '/index.html') {
      let html = bytes.toString('utf8').replace(/\b(src|href)=(['"])(\/[^'"<>]*)\2/g,
        (_match, attribute, quote, value) => attribute + '=' + quote + versionUrl(value) + quote);
      const meta = '<meta name="freedom-release" content="' + version + '">';
      html = html.includes('</head>') ? html.replace('</head>', meta + '\n</head>') : meta + html;
      body = Buffer.from(html);
    } else if (name.endsWith('.css')) {
      body = Buffer.from(bytes.toString('utf8').replace(/url\(\s*(['"]?)(\/[^\s)'"<>]+)\1\s*\)/g,
        (_match, quote, value) => 'url(' + quote + versionUrl(value) + quote + ')'));
    }
    rendered.set(name, { body, type: MIME[path.extname(name)] ?? 'application/octet-stream' });
  }
  return {
    version,
    resolve(pathname) {
      const versioned = /^\/static\/([a-f0-9]{64})(\/.*)$/.exec(pathname);
      let name = pathname === '/' ? '/index.html' : pathname;
      if (pathname.startsWith('/static/')) {
        if (!versioned || versioned[1] !== version || versioned[2] === '/index.html') return null;
        name = versioned[2];
      }
      const file = rendered.get(name);
      return file ? { ...file, cache: versioned ? IMMUTABLE : NO_STORE } : null;
    },
  };
}
