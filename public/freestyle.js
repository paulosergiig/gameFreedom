import { BIKE_RADIUS, createSurvivalState, stepSurvivalState, survivalSummary, FREESTYLE_TICK_RATE, freestyleGround } from './shared/freestyle-survival.js';

const TAU = Math.PI * 2;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const decorRandom = n => { const x = Math.sin(n * 78.233 + 37.17) * 43758.5453; return x - Math.floor(x); };

export class FreestyleGame {
  constructor(canvas, { sound = false, onTick = () => {}, onFinish = () => {}, onInterrupt = () => {} } = {}) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
    this.onTick = onTick; this.onFinish = onFinish; this.onInterrupt = onInterrupt; this.soundEnabled = sound;
    this.state = createSurvivalState(1); this.course = this.state.course; this.inputs = []; this.seed = 1;
    this.running = false; this.touchMask = 0; this.keyMask = 0; this.particles = []; this.notices = []; this.flash = 0;
    this.frame = this.frame.bind(this); this.resize = this.resize.bind(this);
    this.visibility = () => { if (document.hidden && this.running) this.finish('hidden'); };
    this.keydown = event => this.key(event, true); this.keyup = event => this.key(event, false);
    this.blur = () => { this.keyMask = 0; this.touchMask = 0; this.jumpQueued = false; };
    document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('keydown', this.keydown); window.addEventListener('keyup', this.keyup); window.addEventListener('blur', this.blur);
    this.observer = new ResizeObserver(this.resize); this.observer.observe(canvas);
    this.canvas.style.touchAction = 'none'; this.resize();
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect(); this.width = Math.max(1, rect.width || 390); this.height = Math.max(1, rect.height || 530);
    const ratio = Math.min(window.devicePixelRatio || 1, 2); this.canvas.width = Math.round(this.width * ratio); this.canvas.height = Math.round(this.height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0); if (!this.running) this.render(0);
  }
  start({ seed, countdown = 3 }) {
    cancelAnimationFrame(this.raf); this.state = createSurvivalState(seed); this.course = this.state.course; this.seed = seed;
    this.inputs = []; this.completed = false; this.jumpQueued = false; this.touchMask = 0; this.keyMask = 0; this.particles = []; this.notices = []; this.flash = 0;
    this.running = true; this.countdown = Math.max(0, countdown); this.startTime = performance.now(); this.previousTime = this.startTime; this.accumulator = 0; this.countSound = -1;
    this.ensureAudio(); this.publish(); this.raf = requestAnimationFrame(this.frame);
  }
  key(event, down) {
    if (event.defaultPrevented || !this.running || /INPUT|TEXTAREA|SELECT/.test(event.target?.tagName ?? '')) return;
    if (event.code === 'Space' || event.key === 'ArrowUp') {
      event.preventDefault(); if (down && !event.repeat) this.jump(); return;
    }
    const bit = { w: 1, W: 1, s: 2, S: 2, ArrowDown: 2, ArrowLeft: 4, ArrowRight: 8 }[event.key];
    if (!bit) return;
    event.preventDefault(); this.keyMask = down ? this.keyMask | bit : this.keyMask & ~bit;
  }
  setControls(mask) { if (Number.isInteger(mask) && mask >= 0 && mask <= 15) this.touchMask = mask; }
  jump() {
    if (!this.running || this.countdown > 0 || this.jumpQueued) return false;
    this.jumpQueued = true; return true;
  }
  setSound(enabled) { this.soundEnabled = Boolean(enabled); if (enabled) this.ensureAudio(); }
  publish() { this.onTick(survivalSummary(this.state)); }
  frame(now) {
    if (!this.running) return;
    const elapsed = now - this.previousTime; this.previousTime = now;
    if (elapsed > 1500) { this.finish('interrupted'); return; }
    if (this.countdown > 0) {
      const left = Math.max(0, this.countdown - (now - this.startTime) / 1000), number = Math.ceil(left);
      if (number !== this.countSound) { this.beep(number ? 400 : 800, 0.1); this.countSound = number; }
      this.render(Math.min(0.05, elapsed / 1000), left);
      if (left <= 0) { this.countdown = 0; this.accumulator = 0; }
      this.raf = requestAnimationFrame(this.frame); return;
    }
    this.accumulator += elapsed;
    while (this.accumulator >= 1000 / FREESTYLE_TICK_RATE && !this.state.finished) {
      const mask = this.touchMask | this.keyMask | (this.jumpQueued ? 16 : 0);
      if (mask !== this.state.buttons) {
        if (this.inputs.length < 1200) this.inputs.push({ tick: this.state.tick, buttons: mask });
        else { this.finish('connection'); return; }
      }
      stepSurvivalState(this.state, mask);
      this.course = this.state.course; this.jumpQueued = false;
      if (this.state.lastEvent) this.effect(this.state.lastEvent);
      if (this.state.tick % 6 === 0 || this.state.lastEvent) this.publish();
      this.accumulator -= 1000 / FREESTYLE_TICK_RATE;
    }
    this.render(Math.min(0.08, elapsed / 1000));
    if (this.state.finished) { this.finish('lives'); return; }
    this.raf = requestAnimationFrame(this.frame);
  }
  snapshot(fromTick = 0) {
    return { toTick: this.state.tick, inputs: this.inputs.filter(input => input.tick >= fromTick && input.tick < this.state.tick).map(input => ({ ...input })) };
  }
  acknowledge(tick) {
    if (!Number.isInteger(tick) || tick < 0 || tick > this.state.tick) return;
    this.inputs = this.inputs.filter(input => input.tick >= tick);
  }
  finish(reason = 'exit') {
    if (this.completed || !this.running) return;
    this.completed = true; this.running = false; this.touchMask = 0; this.keyMask = 0; this.jumpQueued = false;
    cancelAnimationFrame(this.raf); this.publish();
    this.onFinish({ ...survivalSummary(this.state), ...this.snapshot(), reason });
  }
  interrupt(reason = 'interrupted') { this.finish(reason); }
  destroy() {
    this.running = false; cancelAnimationFrame(this.raf); this.observer.disconnect();
    document.removeEventListener('visibilitychange', this.visibility); window.removeEventListener('keydown', this.keydown); window.removeEventListener('keyup', this.keyup); window.removeEventListener('blur', this.blur);
    this.audio?.close().catch(() => {});
  }
  ensureAudio() {
    if (!this.soundEnabled) return;
    try { const Audio = window.AudioContext || window.webkitAudioContext; if (Audio && !this.audio) this.audio = new Audio(); this.audio?.resume().catch(() => {}); } catch { /* Optional on browsers with restricted audio. */ }
  }
  beep(frequency, duration = 0.13) {
    if (!this.soundEnabled || this.audio?.state !== 'running') return;
    const tone = this.audio.createOscillator(), gain = this.audio.createGain(), time = this.audio.currentTime;
    tone.type = 'triangle'; tone.frequency.setValueAtTime(frequency, time); tone.frequency.exponentialRampToValueAtTime(frequency * 0.6, time + duration);
    gain.gain.setValueAtTime(0.045, time); gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    tone.connect(gain); gain.connect(this.audio.destination); tone.start(); tone.stop(time + duration);
  }
  effect(event) {
    if (event.type === 'flip') { this.notices.push({ text: event.direction === 'back' ? 'BACKFLIP 360°' : 'FRONTFLIP 360°', sub: 'Solte a inclinação para alinhar', color: '#ffe55e', life: 1.4 }); this.beep(850); }
    if (event.type === 'land' && event.banked > 0) { this.notices.push({ text: `+${event.banked.toLocaleString('pt-BR')}`, sub: event.flips ? 'POUSO PERFEITO!' : 'SALTO LIMPO!', color: '#dbffbb', life: 1.1 }); this.beep(event.flips ? 1100 : 570, 0.11); this.burst(10, '#cfaa68'); }
    if (event.type === 'crash') { this.flash = 0.5; this.notices.push({ text: this.state.lives ? '−1 VIDA' : 'FIM DA TRILHA', sub: this.state.lives ? 'Retome a pista e proteja as vidas restantes.' : 'Sua pontuação está sendo salva.', color: '#ffc5a2', life: 1.15 }); this.beep(95, 0.22); this.burst(22, '#d6b173'); }
    if (event.type === 'jump') this.burst(6, '#cfaa68');
    if (this.notices.length > 2) this.notices.shift();
  }
  burst(count, color) {
    for (let i = 0; i < count; i++) this.particles.push({ x: this.state.x - 20, y: this.state.y - 8, vx: -30 + Math.random() * 80, vy: 20 + Math.random() * 80, life: 0.4 + Math.random() * 0.3, color });
  }
  polygon(points, color) { const c = this.ctx; c.fillStyle = color; c.beginPath(); c.moveTo(points[0][0], points[0][1]); for (let i = 1; i < points.length; i++) c.lineTo(points[i][0], points[i][1]); c.closePath(); c.fill(); }
  ellipse(x, y, rx, ry, color) { const c = this.ctx; c.fillStyle = color; c.beginPath(); c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, TAU); c.fill(); }
  project(x, y) { return { x: (x - this.cameraX) * this.zoom, y: this.groundLine - y * this.zoom }; }

  render(delta = 0, countdown = null) {
    if (!this.ctx || !this.width) return;
    const c = this.ctx, w = this.width, h = this.height, s = this.state;
    const landscape = w > h * 1.4;
    this.zoom = Math.min(w / 490, h / (landscape ? 370 : 450), 1.25);
    const baseline = landscape && h < 400 ? h - 88 : h * (landscape ? 0.79 : 0.76);
    const lift = landscape ? clamp(70 + (s.y + 86) * this.zoom - baseline, 0, h * 0.8) : 0;
    this.cameraLift = delta > 0 ? (this.cameraLift ?? 0) + (lift - (this.cameraLift ?? 0)) * Math.min(1, delta * 10) : lift;
    this.groundLine = baseline + this.cameraLift;
    this.cameraX = s.x - w * 0.29 / this.zoom;
    const sky = c.createLinearGradient(0, 0, 0, h * 0.78);
    sky.addColorStop(0, '#283f48'); sky.addColorStop(0.45, '#91a9a0'); sky.addColorStop(0.8, '#e4d7a3'); sky.addColorStop(1, '#c8c393');
    c.fillStyle = sky; c.fillRect(0, 0, w, h);
    const sunX = w * 0.78 - Math.sin(this.cameraX / 12000) * 20, sunY = h * 0.16;
    const glow = c.createRadialGradient(sunX, sunY, 2, sunX, sunY, w * 0.30); glow.addColorStop(0, '#fff3b780'); glow.addColorStop(1, '#fff3b700'); c.fillStyle = glow; c.fillRect(0, 0, w, h * 0.6);
    this.ellipse(sunX, sunY, w * 0.048, w * 0.048, '#ffecb6');
    this.clouds(); this.mountains(); this.scenery(); this.terrain();
    for (const ramp of this.course) {
      if (ramp.origin > this.cameraX + w / this.zoom + 100) break;
      if (ramp.end < this.cameraX - 100) continue;
      for (const obstacle of ramp.obstacles) this.obstacle(obstacle);
      this.rampFlags(ramp);
    }
    const ground = freestyleGround(this.course, s.x), shadow = this.project(s.x, ground.height + 1);
    const airHeight = Math.max(0, s.y - BIKE_RADIUS - ground.height);
    c.globalAlpha = Math.max(0.09, 0.32 - airHeight / 700);
    this.ellipse(shadow.x, shadow.y, (40 + Math.min(35, airHeight * 0.12)) * this.zoom, 5 * this.zoom, '#142119'); c.globalAlpha = 1;
    if (!s.airborne && s.vx > 1 && s.tick % 4 < 2 && !s.respawnTicks && this.running) {
      if (this.particles.length < 50) this.particles.push({ x: s.x - 33, y: s.y - 11, vx: -30, vy: 14 + Math.random() * 20, life: 0.32, color: '#dabf83' });
    }
    for (const p of this.particles) {
      p.life -= delta; p.x += p.vx * delta; p.y += p.vy * delta; p.vy -= delta * 115;
      const at = this.project(p.x, p.y); c.globalAlpha = clamp(p.life * 2, 0, 0.55); this.ellipse(at.x, at.y, this.zoom * (2 + (0.65 - p.life) * 8), this.zoom * (2 + (0.65 - p.life) * 4), p.color);
    }
    this.particles = this.particles.filter(p => p.life > 0); c.globalAlpha = 1;
    c.save();
    if (s.tick < s.invulnerableUntil && Math.floor(s.tick / 6) % 2 === 0) c.globalAlpha = 0.45;
    this.motorcycle();
    c.restore();
    this.flash = Math.max(0, this.flash - delta);
    if (this.flash) { c.fillStyle = `rgba(245,108,58,${this.flash * 0.22})`; c.fillRect(0, 0, w, h); }
    this.notices.forEach(notice => { notice.life -= delta; }); this.notices = this.notices.filter(notice => notice.life > 0);
    const notice = this.notices[this.notices.length - 1];
    if (notice) {
      c.save(); c.globalAlpha = Math.min(1, notice.life * 4); c.textAlign = 'center';
      c.font = `900 italic ${Math.min(28, w * 0.07)}px system-ui, sans-serif`; c.lineWidth = 5; c.strokeStyle = '#153024bb'; c.strokeText(notice.text, w / 2, h * 0.24); c.fillStyle = notice.color; c.fillText(notice.text, w / 2, h * 0.24);
      c.font = `600 ${Math.min(12, w * 0.031)}px system-ui, sans-serif`; c.lineWidth = 3; c.strokeText(notice.sub, w / 2, h * 0.24 + 24); c.fillStyle = '#f8f5df'; c.fillText(notice.sub, w / 2, h * 0.24 + 24); c.restore();
    }
    // Pending points stay in the HUD so the airborne rider remains unobstructed.
    if (!countdown && s.tick < 135 && s.vx < 0.8 && this.running) this.hint('ACELERE E PREPARE O SALTO', 'Deslize o acelerador para cima ao chegar ao obstáculo.');
    if (s.respawnTicks > 0) {
      c.save(); c.textAlign = 'center'; c.font = '700 12px system-ui'; c.fillStyle = '#fff3ce'; c.fillText('RETOMANDO A TRILHA…', w / 2, h * 0.60); c.restore();
    }
    if (countdown !== null && countdown > 0) this.drawCountdown(countdown);
  }
  clouds() {
    const c = this.ctx, w = this.width, h = this.height;
    c.globalAlpha = 0.13;
    for (let i = 0; i < 4; i++) {
      const x = ((i * w * 0.42 - this.cameraX * 0.018) % (w * 1.5) + w * 1.5) % (w * 1.5) - w * 0.2, y = h * (0.10 + (i % 3) * 0.055);
      this.ellipse(x, y, w * 0.12, 8, '#fff8d9'); this.ellipse(x + w * 0.07, y - 3, w * 0.09, 10, '#fff8d9');
    }
    c.globalAlpha = 1;
  }
  mountains() {
    const w = this.width, h = this.height;
    for (const layer of [{ factor: 0.07, base: 0.58, amplitude: 0.15, color: '#7c9180' }, { factor: 0.15, base: 0.66, amplitude: 0.19, color: '#5b7764' }, { factor: 0.24, base: 0.74, amplitude: 0.13, color: '#3e614a' }]) {
      const points = [[-10, h]];
      for (let x = -20; x <= w + 20; x += 12) {
        const world = (x + this.cameraX * layer.factor) / (w * 0.47);
        const wave = (Math.sin(world * 1.9) * 0.5 + Math.sin(world * 4.1 + 1.3) * 0.17 + Math.cos(world * 0.63) * 0.3);
        points.push([x, h * (layer.base - Math.max(0, wave + 0.3) * layer.amplitude)]);
      }
      points.push([w + 20, h]); this.polygon(points, layer.color);
    }
  }
  scenery() {
    const c = this.ctx, left = Math.floor(this.cameraX / 240) - 2;
    for (let i = left; i <= left + 8; i++) {
      const x = i * 240 + decorRandom(i + this.seed % 101) * 80;
      const p = this.project(x, 0); const scale = this.zoom * (0.65 + decorRandom(i) * 0.6);
      c.save(); c.translate(p.x, this.groundLine + 4); c.scale(scale, scale);
      if (i % 3 === 0) {
        c.strokeStyle = '#294c36'; c.lineWidth = 10; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -76); c.moveTo(0, -34); c.lineTo(-20, -34); c.lineTo(-20, -56); c.moveTo(0, -47); c.lineTo(18, -47); c.lineTo(18, -67); c.stroke();
        c.strokeStyle = '#70946b'; c.lineWidth = 2; c.beginPath(); c.moveTo(-2, -5); c.lineTo(-2, -72); c.moveTo(-22, -37); c.lineTo(-22, -53); c.stroke();
      } else {
        c.strokeStyle = '#adab6a'; c.lineWidth = 3;
        for (let j = -3; j <= 3; j++) { c.beginPath(); c.moveTo(j * 2, 0); c.quadraticCurveTo(j * 5, -18, j * 9, -22 + Math.abs(j) * 3); c.stroke(); }
      }
      c.restore();
    }
  }
  terrain() {
    const c = this.ctx, w = this.width, h = this.height, left = this.cameraX - 10 / this.zoom, right = this.cameraX + (w + 10) / this.zoom;
    const xs = [left, right];
    for (const ramp of this.course) {
      if (ramp.start > right) break; if (ramp.end < left) continue;
      for (const x of [ramp.start, ramp.lip, ramp.lip + 0.01, ...(ramp.landing ? [ramp.landing.start - 0.01, ramp.landing.start, ramp.landing.end] : [])]) if (x > left && x < right) xs.push(x);
    }
    xs.sort((a, b) => a - b);
    const edge = xs.map(x => { const p = this.project(x, freestyleGround(this.course, x).height); return [p.x, p.y]; });
    const points = [...edge, [w + 10, h + 10], [-10, h + 10]];
    const soil = c.createLinearGradient(0, this.groundLine - 130 * this.zoom, 0, h); soil.addColorStop(0, '#b88c4f'); soil.addColorStop(0.38, '#987342'); soil.addColorStop(1, '#4c4531');
    this.polygon(points, soil);
    c.save(); c.beginPath(); c.moveTo(points[0][0], points[0][1]); for (const p of points.slice(1)) c.lineTo(p[0], p[1]); c.closePath(); c.clip();
    for (let row = 0; row < 4; row++) {
      c.strokeStyle = row % 2 ? '#d3a56430' : '#4d492b35'; c.lineWidth = row % 2 ? 3 : 6;
      c.beginPath(); for (let x = -10; x <= w + 10; x += 18) { const y = this.groundLine + 24 + row * 28 + Math.sin((x + this.cameraX * this.zoom) / (72 + row * 11)) * 13; if (x === -10) c.moveTo(x, y); else c.lineTo(x, y); } c.stroke();
    }
    const firstStone = Math.floor(left / 47);
    for (let i = firstStone; i < firstStone + w / (47 * this.zoom) + 3; i++) {
      const x = i * 47 + decorRandom(i) * 15, y = -15 - decorRandom(i + 3) * 120, p = this.project(x, y);
      this.ellipse(p.x, p.y, (2 + decorRandom(i + 7) * 8) * this.zoom, (2 + decorRandom(i + 1) * 4) * this.zoom, '#d6ac6940');
    }
    c.restore();
    c.beginPath(); c.moveTo(edge[0][0], edge[0][1]); for (const p of edge.slice(1)) c.lineTo(p[0], p[1]); c.strokeStyle = '#543f28'; c.lineWidth = 7 * this.zoom; c.lineJoin = 'round'; c.stroke(); c.strokeStyle = '#e8c07d'; c.lineWidth = 3 * this.zoom; c.stroke();
    c.lineJoin = 'miter';
  }
  rampFlags(ramp) {
    const c = this.ctx, p = this.project(ramp.lip - 10, ramp.height);
    c.save(); c.translate(p.x, p.y); c.scale(this.zoom, this.zoom);
    c.fillStyle = '#203d2b'; c.fillRect(-2, -80, 4, 80);
    this.polygon([[0, -82], [66, -76], [61, -49], [0, -55]], '#f2d039');
    c.fillStyle = '#17351f'; c.font = '900 italic 10px system-ui'; c.textAlign = 'left'; c.save(); c.translate(5, -63); c.rotate(0.09); c.fillText('FREEDOM', 0, 0); c.restore();
    this.polygon([[-1, -81], [67, -75], [66, -72], [0, -78]], '#ffea7b'); c.restore();
    if (ramp.landing) {
      const q = this.project(ramp.landing.end, 0); c.save(); c.translate(q.x, q.y); c.scale(this.zoom, this.zoom); c.fillStyle = '#2c432b'; c.fillRect(0, -25, 3, 25); this.polygon([[2, -25], [18, -20], [2, -14]], '#e8cc50'); c.restore();
    }
  }
  obstacle(obstacle) {
    const c = this.ctx, p = this.project(obstacle.x, 0);
    c.save(); c.translate(p.x, p.y); c.scale(this.zoom, this.zoom);
    this.ellipse(1, 1, obstacle.width * 0.7, 4, '#28301e55');
    if (obstacle.type === 'log') {
      const width = obstacle.width, height = obstacle.height;
      this.polygon([[-width / 2, -height + 4], [width / 2, -height], [width / 2 + 3, -5], [-width / 2, 0]], '#624729');
      this.ellipse(width / 2, -height / 2, 8, height / 2, '#b99051'); this.ellipse(width / 2, -height / 2, 5, height / 2 - 4, '#d5af6b'); this.ellipse(width / 2, -height / 2, 2, height / 2 - 8, '#9a733f');
      c.strokeStyle = '#b1874b'; c.lineWidth = 2; c.beginPath(); c.moveTo(-width / 2 + 2, -height + 7); c.lineTo(width / 2 - 5, -height + 4); c.moveTo(-width / 2, -9); c.lineTo(width / 2 - 5, -12); c.stroke();
    } else {
      const width = obstacle.width, height = obstacle.height;
      this.polygon([[-width / 2, 0], [-width / 2 - 2, -height * 0.5], [-width * 0.20, -height], [width * 0.18, -height + 2], [width / 2, -height * 0.45], [width / 2 + 1, 0]], '#666b50');
      this.polygon([[-width / 2 - 2, -height * 0.5], [-width * 0.20, -height], [width * 0.18, -height + 2], [0, -height * 0.4]], '#a6a582');
      this.polygon([[0, -height * 0.4], [width * 0.18, -height + 2], [width / 2, -height * 0.45], [width / 2 + 1, 0]], '#858c6b');
    }
    c.fillStyle = '#e8ca4d'; c.fillRect(-obstacle.width / 2 - 15, -21, 3, 21); c.fillStyle = '#273c28'; c.fillRect(-obstacle.width / 2 - 15, -15, 3, 6); c.restore();
  }


  motorcycle() {
    const c = this.ctx, s = this.state, p = this.project(s.x, Math.max(BIKE_RADIUS, s.y));
    c.save(); c.translate(p.x, p.y - 16 * this.zoom); c.scale(this.zoom, this.zoom);
    c.rotate(-s.angle + (s.respawnTicks ? Math.sin(s.respawnTicks * 0.25) * 0.16 : 0)); c.translate(0, 16);
    if (s.respawnTicks) c.globalAlpha = 0.5 + Math.sin(s.respawnTicks * 0.35) * 0.2;
    c.lineJoin = 'round'; c.lineCap = 'round';
    const ink = '#15191d', gold = '#f6c928', silver = '#bdc9cb';
    const shape = (draw, fill, stroke = ink, width = 1.3) => {
      c.beginPath(); draw(); c.closePath(); c.fillStyle = fill; c.fill();
      if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
    };
    const panel = (points, fill, stroke = ink, width = 1.3) => shape(() => {
      c.moveTo(...points[0]); for (const point of points.slice(1)) c.lineTo(...point);
    }, fill, stroke, width);
    const line = (points, color, width) => {
      c.beginPath(); c.moveTo(...points[0]); for (const point of points.slice(1)) c.lineTo(...point);
      c.strokeStyle = color; c.lineWidth = width; c.stroke();
    };
    const metal = c.createLinearGradient(-12, -30, 14, -5);
    metal.addColorStop(0, '#dae0dc'); metal.addColorStop(0.45, '#849398'); metal.addColorStop(1, '#37464c');
    const plastic = c.createLinearGradient(0, -42, 10, -16);
    plastic.addColorStop(0, '#ffe77d'); plastic.addColorStop(0.38, gold); plastic.addColorStop(1, '#ce9516');

    // Axles stay at y=-3 and the tires have radius 16: the contact line remains y=13.
    const wheel = (x) => {
      c.save(); c.translate(x, -3); c.rotate(s.x / 16);
      this.ellipse(0, 0, 16, 16, '#111619');
      c.strokeStyle = '#3e4648'; c.lineWidth = 1.4; c.beginPath(); c.arc(0, 0, 13.8, 0, TAU); c.stroke();
      for (let i = 0; i < 16; i++) {
        c.save(); c.rotate(i * TAU / 16); c.fillStyle = i % 2 ? '#465051' : '#333b3d';
        c.fillRect(-1.7, -15.7, 3.4, 2.6); c.restore();
      }
      this.ellipse(0, 0, 11.6, 11.6, '#aab6b7'); this.ellipse(0, 0, 9.9, 9.9, '#27333a');
      c.strokeStyle = '#e0e5dd'; c.lineWidth = 0.9;
      for (let i = 0; i < 8; i++) {
        const a = i * TAU / 8; c.beginPath(); c.moveTo(Math.cos(a + 0.75) * 2, Math.sin(a + 0.75) * 2);
        c.lineTo(Math.cos(a) * 9.8, Math.sin(a) * 9.8); c.stroke();
      }
      this.ellipse(0, 0, 4.2, 4.2, '#909e9f'); this.ellipse(0, 0, 2.2, 2.2, '#e4e7db');
      c.restore();
    };
    wheel(-35); wheel(35);

    // Rear linkage, chain, compact engine and long fork distinguish the motorcycle silhouette.
    panel([[-35,-4],[-9,-15],[6,-9],[-4,-5]], '#8c9b9d');
    line([[-34,-5],[-8,-11]], '#e0d69e', 1.5); line([[-34,-1],[-7,-7]], '#53543d', 1.1);
    line([[-19,-12],[-10,-33]], '#212b31', 6);
    line([[-19,-12],[-10,-33]], '#b7c2c2', 3);
    for (let i = 0; i < 5; i++) line([[-17+i*1.1,-17-i*2.5],[-12+i*1.1,-15-i*2.5]], '#e7bc2a', 1.7);
    panel([[-18,-32],[19,-35],[11,-8],[-6,-5],[-18,-15]], '#3b454b');
    line([[-17,-29],[-8,-7],[9,-9],[17,-31]], '#a8b5b5', 2.6);
    panel([[-11,-27],[3,-29],[11,-19],[5,-8],[-11,-11],[-15,-19]], metal);
    panel([[-8,-25],[2,-27],[6,-19],[-8,-17]], '#505e64', '#26343b', 1);
    for (let i = 0; i < 4; i++) line([[-8,-24+i*2.1],[3+i*0.5,-25+i*2.1]], '#cad1cd', 1.2);
    this.ellipse(-4, -12, 7.5, 6.4, '#727f83'); this.ellipse(-4, -12, 4.7, 4.2, '#b7c0bc');
    this.ellipse(-4, -12, 1.5, 1.5, '#526168');
    c.beginPath(); c.moveTo(5,-24); c.bezierCurveTo(19,-29,21,-11,11,-9);
    c.strokeStyle = '#343c3f'; c.lineWidth = 5; c.stroke(); c.strokeStyle = '#c0b99d'; c.lineWidth = 2.7; c.stroke();
    panel([[-17,-27],[-40,-29],[-41,-24],[-21,-20]], '#adb8b6');
    line([[-37,-27],[-22,-24]], '#e1e3d7', 1.2); this.ellipse(-41,-26,2,3,'#273137');
    line([[35,-3],[20,-38]], ink, 7); line([[34,-6],[23,-31]], '#e1e5df', 3.4);
    line([[23,-31],[20,-39]], '#d1ae36', 4.6); line([[37,-4],[27,-30]], '#687b83', 1.3);
    this.ellipse(35,-3,2.5,2.5,'#d8dfd9');
    line([[20,-37],[19,-44],[27,-46]], ink, 2.4); line([[23,-46],[30,-46]], '#3b474c', 3.1);
    c.beginPath(); c.moveTo(25,-44); c.quadraticCurveTo(31,-27,24,-12); c.strokeStyle='#353e42'; c.lineWidth=0.8; c.stroke();

    // Swept mudguards, black saddle and contrasting side panel, without third-party marks.
    shape(() => { c.moveTo(-47,-29); c.quadraticCurveTo(-35,-36,-16,-34); c.lineTo(-10,-27);
      c.quadraticCurveTo(-34,-29,-47,-26); }, plastic);
    shape(() => { c.moveTo(-28,-30); c.lineTo(-5,-32); c.quadraticCurveTo(1,-27,-9,-17);
      c.lineTo(-23,-21); c.quadraticCurveTo(-29,-23,-28,-30); }, '#eeeede');
    panel([[-24,-28],[-10,-29],[-13,-24],[-26,-24]], '#252e34', null);
    panel([[-25,-22],[-12,-22],[-10,-18],[-22,-20]], gold, null);
    shape(() => { c.moveTo(-9,-36); c.quadraticCurveTo(2,-42,13,-37); c.lineTo(23,-32);
      c.lineTo(13,-16); c.lineTo(0,-24); c.lineTo(-10,-27); }, plastic);
    panel([[7,-35],[18,-31],[13,-23],[2,-29]], '#1f292f', null);
    line([[0,-37],[11,-35],[18,-32]], '#fff1a2', 1.5);
    shape(() => { c.moveTo(-32,-35); c.quadraticCurveTo(-20,-38,-7,-37); c.lineTo(2,-39);
      c.lineTo(5,-35); c.quadraticCurveTo(-16,-32,-32,-32); }, '#20272c');
    line([[-29,-35],[-10,-35],[-1,-37]], '#6d7574', 1.2);
    shape(() => { c.moveTo(18,-28); c.quadraticCurveTo(32,-29,46,-24); c.lineTo(49,-24);
      c.lineTo(44,-21); c.quadraticCurveTo(29,-24,21,-24); }, plastic);
    line([[26,-27],[41,-24]], '#ffed92', 1.1);
    panel([[18,-37],[26,-35],[24,-27],[19,-28]], '#f1eee0');
    line([[-7,-7],[0,-7]], '#d8ddcf', 2.2);

    // A connected riding pose: hips over the saddle, boots on pegs, hands on the bar.
    const lean = ((s.buttons & 4) ? 1 : 0) - ((s.buttons & 8) ? 1 : 0);
    const bob = !s.airborne ? Math.sin(s.x * 0.11) * Math.min(0.45, s.vx * 0.075) : 0;
    const hip = [-14 - lean * 1.6, -40 + bob];
    const shoulder = [-1 - lean * 3.3 - ((s.buttons & 2) ? 1.5 : 0), -60 + (s.airborne ? 1.7 : 0) + bob];
    const knee = [5 + lean * 0.6, -26 + bob];
    const elbow = [shoulder[0] + 12, shoulder[1] + 11];
    const hand = [27,-45], ankle = [-4,-11];
    const limb = (points, color, width) => { line(points, ink, width + 2.1); line(points, color, width); };
    limb([[hip[0]+5,hip[1]+1],[knee[0]+5,knee[1]+1],[3,-12]], '#404b52', 6);
    line([[3,-11],[9,-9]], '#535f64', 5);
    limb([[shoulder[0]+3,shoulder[1]+2],[elbow[0]+5,elbow[1]-2],[hand[0]+1,hand[1]]], '#998024', 5.5);

    shape(() => {
      c.moveTo(hip[0]-5,hip[1]+2); c.quadraticCurveTo(hip[0]-4,hip[1]-11,shoulder[0]-7,shoulder[1]-1);
      c.quadraticCurveTo(shoulder[0]+1,shoulder[1]-5,shoulder[0]+6,shoulder[1]+4);
      c.lineTo(hip[0]+9,hip[1]+1); c.quadraticCurveTo(hip[0]+2,hip[1]+7,hip[0]-5,hip[1]+2);
    }, '#252e35');
    shape(() => { c.moveTo(shoulder[0]-6,shoulder[1]); c.lineTo(shoulder[0]-2,shoulder[1]-1);
      c.quadraticCurveTo(hip[0]+1,hip[1]-6,hip[0]-1,hip[1]+2); c.lineTo(hip[0]-6,hip[1]);
      c.quadraticCurveTo(hip[0]-4,hip[1]-12,shoulder[0]-6,shoulder[1]); }, gold, null);
    panel([[shoulder[0]+1,shoulder[1]+1],[shoulder[0]+6,shoulder[1]+6],[hip[0]+8,hip[1]-3],[hip[0]+4,hip[1]-4]], '#b3b9ad', null);
    line([[hip[0]-3,hip[1]-1],[hip[0]+8,hip[1]-1]], '#111a20', 2);

    limb([hip,knee,ankle], '#242e36', 8.2);
    line([[hip[0]+1,hip[1]+1],[knee[0]-1,knee[1]-2]], gold, 2.3);
    this.ellipse(knee[0],knee[1],4.6,4.2,'#46545c');
    line([[knee[0]-1,knee[1]-2],[knee[0]+2,knee[1]-1]], '#849196', 1.5);
    shape(() => { c.moveTo(-8,-18); c.lineTo(-2,-17); c.lineTo(-1,-10); c.lineTo(6,-8);
      c.quadraticCurveTo(8,-5,4,-5); c.lineTo(-8,-6); c.closePath(); }, '#d7dace');
    line([[-8,-5],[6,-5]], ink, 2); line([[-6,-14],[-2,-13]], '#747f80', 1.4);
    line([[-6,-10],[-2,-9]], '#747f80', 1.4);
    limb([shoulder,elbow,hand], '#d7af24', 6.1);
    line([[shoulder[0]+1,shoulder[1]+1],[elbow[0]-1,elbow[1]-1]], '#ffe473', 1.6);
    limb([[elbow[0]+1,elbow[1]],[24,-45]], '#313c43', 5.2);
    this.ellipse(27,-45,3.4,2.9,'#161f26'); line([[27,-46],[29,-46]], '#a7b2ad', 1);
    limb([[shoulder[0]+4,shoulder[1]+1],[shoulder[0]+8,shoulder[1]-6]], '#b4bcb4', 4);

    // Compact motocross helmet: sculpted shell, peak, goggles and a separate chin guard.
    c.save(); c.translate(shoulder[0]+10,shoulder[1]-10); c.rotate(-0.05 - lean * 0.025);
    shape(() => { c.moveTo(-9,-1); c.quadraticCurveTo(-10,-9,-3,-10);
      c.quadraticCurveTo(6,-12,10,-4); c.lineTo(10,0); c.lineTo(14,5); c.lineTo(10,10);
      c.lineTo(2,8); c.quadraticCurveTo(-9,7,-9,-1); }, '#eeefe3', ink, 1.5);
    shape(() => { c.moveTo(-7,-7); c.quadraticCurveTo(-3,-11,1,-10); c.lineTo(-2,3);
      c.lineTo(-7,4); c.quadraticCurveTo(-10,-2,-7,-7); }, '#252f36', null);
    panel([[-2,-9],[4,-9],[9,-5],[1,-5]], gold, null);
    panel([[2,-4],[11,-3],[10,1],[2,2],[-1,0]], '#151f27', null);
    panel([[4,-3],[10,-2],[9,0],[4,0]], '#709eaa', null);
    line([[5,-3],[8,-2]], '#d6eff0', 1);
    panel([[-1,-6],[9,-6],[17,-3],[10,-2],[2,-4]], '#e7c237', ink, 0.9);
    panel([[3,3],[8,2],[14,5],[10,9],[3,7]], gold, null);
    line([[8,5],[11,6]], '#394047', 1.7);
    line([[-7,-6],[-4,-8]], '#fffdf0', 1.4);
    c.restore(); c.restore();
  }

  hint(title, subtitle) {
    const c = this.ctx, w = this.width, h = this.height;
    c.save(); c.textAlign = 'center'; c.fillStyle = '#203c2bd9'; c.fillRect(w * 0.07, h * 0.29, w * 0.86, 68);
    c.fillStyle = '#ffe263'; c.font = '900 italic 21px system-ui'; c.fillText(title, w / 2, h * 0.29 + 29);
    c.fillStyle = '#f0f1d7'; c.font = '500 12px system-ui'; c.fillText(subtitle, w / 2, h * 0.29 + 51); c.restore();
  }
  drawCountdown(remaining) {
    const c = this.ctx, w = this.width, h = this.height, x = w / 2, y = h * 0.38, r = Math.min(48, w * 0.13);
    c.fillStyle = '#0b241785'; c.fillRect(0, 0, w, h); this.ellipse(x, y, r + 8, r + 8, '#183c27');
    c.strokeStyle = '#f9d44a'; c.lineWidth = 3; c.beginPath(); c.arc(x, y, r + 7, -Math.PI / 2, -Math.PI / 2 + (remaining % 1 || 1) * TAU); c.stroke();
    this.ellipse(x, y, r, r, '#f4d13f'); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#1b3522'; c.font = `900 italic ${r * 1.30}px system-ui`; c.fillText(String(Math.ceil(remaining)), x - 2, y + 1);
    c.textBaseline = 'alphabetic'; c.fillStyle = '#fff6d4'; c.font = `900 italic ${Math.min(23, w * 0.063)}px system-ui`; c.fillText('FREEDOM FREESTYLE', x, y - r - 26);
    c.font = '600 12px system-ui'; c.fillStyle = '#f1f0d7'; c.fillText('Acelere. Salte obstáculos. Pouse para pontuar.', x, y + r + 35);
    c.fillStyle = '#ffe467'; c.fillText('Deslize o acelerador para cima para saltar.', x, y + r + 57);
  }
}

