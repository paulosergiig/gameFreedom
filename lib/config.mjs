import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
function integer(value, fallback, min, max, name) {
  const n = Number(value ?? fallback);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} inválido.`);
  return n;
}
export function configuration(options = {}) {
  const env = options.env ?? process.env;
  const host = options.host ?? env.HOST ?? '127.0.0.1';
  const port = integer(options.port ?? env.PORT, 3000, 0, 65535, 'PORT');
  const retentionDays = integer(options.retentionDays ?? env.RETENTION_DAYS, 30, 1, 365, 'RETENTION_DAYS');
  const rawUrl = options.publicUrl ?? env.PUBLIC_URL ?? '';
  let publicUrl = null;
  if (rawUrl) {
    try { publicUrl = new URL(rawUrl); } catch { throw new Error('PUBLIC_URL inválida.'); }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(publicUrl.hostname);
    if (publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash || publicUrl.pathname !== '/' || !['http:', 'https:'].includes(publicUrl.protocol) || (!local && publicUrl.protocol !== 'https:')) {
      throw new Error('PUBLIC_URL deve ser a origem HTTPS, sem caminho, usuário ou parâmetros.');
    }
  }
  if (env.NODE_ENV === 'production' && publicUrl?.protocol !== 'https:') throw new Error('Produção exige PUBLIC_URL HTTPS.');
  const trustRaw = options.trustProxy ?? env.TRUST_PROXY ?? false;
  if (![true, false, 'true', 'false'].includes(trustRaw)) throw new Error('TRUST_PROXY deve ser true ou false.');
  const publicDir = path.resolve(options.publicDir ?? path.join(ROOT, 'public'));
  const rawDb = options.dbPath ?? env.DB_PATH ?? path.join(ROOT, 'data', 'freedom.sqlite');
  const dbPath = rawDb === ':memory:' ? rawDb : path.resolve(rawDb);
  const relative = path.relative(publicDir, dbPath);
  if (dbPath !== ':memory:' && (relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)))) throw new Error('DB_PATH deve ficar fora de public.');
  return { host, port, retentionDays, publicUrl, publicDir, dbPath, trustProxy: trustRaw === true || trustRaw === 'true' };
}
