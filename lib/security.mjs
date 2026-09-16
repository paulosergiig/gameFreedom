import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

export const cookieName = 'freedom_session';
export const hash = value => createHash('sha256').update(value).digest('hex');
export const csrfFor = token => createHmac('sha256', token).update('freedom-csrf-v1').digest('base64url');
export function equalToken(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !/^[A-Za-z0-9_-]+$/.test(a) || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
export function cookieToken(req) {
  const cookies = (req.headers.cookie ?? '').split(';').map(s => s.trim()).filter(s => s.startsWith(cookieName + '='));
  if (cookies.length !== 1) return null;
  const token = cookies[0].slice(cookieName.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
export function clientAddress(req, trustProxy) {
  const remote = req.socket.remoteAddress ?? 'unknown';
  const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote);
  const forwarded = req.headers['cf-connecting-ip'];
  return trustProxy && loopback && typeof forwarded === 'string' && isIP(forwarded) ? forwarded : remote;
}
export class RateLimiter {
  constructor(limit = 10000) { this.entries = new Map(); this.limit = limit; }
  allow(key, cap, window, now) {
    let entry = this.entries.get(key);
    if (!entry || entry.expires <= now) {
      if (this.entries.size >= this.limit) {
        for (const [key, value] of this.entries) if (value.expires <= now) this.entries.delete(key);
        // Fail closed when capacity is exhausted: do not allow eviction to bypass limits.
        if (this.entries.size >= this.limit && !entry) return false;
      }
      entry = { n: 0, expires: now + window };
      this.entries.set(key, entry);
    }
    entry.n++;
    return entry.n <= cap;
  }
}
export function cleanName(value) {
  if (typeof value !== 'string') return null;
  const name = value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
  if ([...name].length < 2 || [...name].length > 20 || !/^[\p{L}\p{N} ._-]+$/u.test(name) || !/[\p{L}\p{N}]/u.test(name)) return null;
  const plain = name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  // A small first-pass filter. The operator can remove names through the local CLI.
  if (/(?:^|[ ._-])(merda|porra|caralho|puta|puto|buceta|foder|fdp|nazista|hitler|fuck|shit)(?:$|[ ._-])/i.test(plain)) return null;
  if (/\b(honda|yamaha|pirelli|michelin|dunlop|goodyear|bridgestone|continental|metzeler|rinaldi|vipal|maggion)\b/.test(plain)) return null;
  return name;
}
export function validateMoves(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['moves', 'version'].includes(k)) || body.version !== '1' || !Array.isArray(body.moves) || body.moves.length > 360) return false;
  let last = -10;
  return body.moves.every(move => {
    if (!move || typeof move !== 'object' || Array.isArray(move) || Object.keys(move).length !== 2 || !Object.hasOwn(move, 'tick') || !Object.hasOwn(move, 'direction') || !Number.isInteger(move.tick) || move.tick < 0 || move.tick >= 3600 || (move.direction !== -1 && move.direction !== 1) || move.tick - last < 10) return false;
    last = move.tick;
    return true;
  });
}

