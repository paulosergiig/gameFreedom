import { createSurvivalState, stepSurvivalState, survivalSummary, MOVE_COOLDOWN_TICKS, TICK_RATE, VIEW_DISTANCE } from './shared/classic-survival.js';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const colorMix = (a, b, t) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;

export class FreedomGame {
  constructor(canvas, { onTick = () => {}, onFinish = () => {}, onInterrupt = () => {}, sound = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.onTick = onTick;
    this.onFinish = onFinish;
    this.onInterrupt = onInterrupt;
    this.soundEnabled = sound;
    this.state = createSurvivalState(1);
    this.course = this.state.course;
    this.moves = [];
    this.running = false;
    this.particles = [];
    this.visualLane = 1;
    this.flash = 0;
    this.resize = this.resize.bind(this);
    this.frame = this.frame.bind(this);
    this.visibility = () => { if (document.hidden && this.running) this.finish('hidden'); };
    this.keydown = event => {
      if (!this.running || event.repeat) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); this.move(event.key === 'ArrowLeft' ? -1 : 1); }
    };
    this.pointerdown = event => { this.swipeStart = { x: event.clientX, y: event.clientY }; };
    this.pointerup = event => {
      if (!this.swipeStart) return;
      const dx = event.clientX - this.swipeStart.x;
      const dy = event.clientY - this.swipeStart.y;
      if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy)) this.move(dx < 0 ? -1 : 1);
      this.swipeStart = null;
    };
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(canvas);
    document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('keydown', this.keydown);
    canvas.addEventListener('pointerdown', this.pointerdown);
    canvas.addEventListener('pointerup', this.pointerup);
    canvas.style.touchAction = 'none';
    this.resize();
    this.render(0);
  }

  resize() {
    const box = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, box.width || 390);
    this.height = Math.max(1, box.height || 620);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.running) this.render(0);
  }

  start({ seed, countdown = 3 }) {
    cancelAnimationFrame(this.raf);
    this.state = createSurvivalState(seed);
    this.course = this.state.course;
    this.moves = [];
    this.pendingDirection = 0;
    this.completed = false;
    this.particles = [];
    this.visualLane = 1;
    this.flash = 0;
    this.floating = null;
    this.countdown = Math.max(0, countdown);
    this.countdownStart = performance.now();
    this.previousTime = this.countdownStart;
    this.accumulator = 0;
    this.running = true;
    this.lastCountdownSound = -1;
    this.ensureAudio();
    this.publish();
    this.raf = requestAnimationFrame(this.frame);
  }

  move(direction) {
    if (!this.running || this.countdown > 0 || this.pendingDirection || (direction !== -1 && direction !== 1)) return false;
    if (this.state.tick - this.state.lastMoveTick < MOVE_COOLDOWN_TICKS || this.state.lane + direction < 0 || this.state.lane + direction > 2) return false;
    this.pendingDirection = direction;
    return true;
  }

  publish() {
    this.onTick(survivalSummary(this.state));
  }

  frame(now) {
    if (!this.running) return;
    const elapsed = now - this.previousTime;
    this.previousTime = now;
    if (elapsed > 1500) { this.finish('interrupted'); return; }
    if (this.countdown > 0) {
      const remaining = Math.max(0, this.countdown - (now - this.countdownStart) / 1000);
      const number = Math.ceil(remaining);
      if (number !== this.lastCountdownSound) { this.beep(number ? 420 : 760, 0.08, 0.04); this.lastCountdownSound = number; }
      this.render(elapsed / 1000, remaining);
      if (remaining <= 0) { this.countdown = 0; this.accumulator = 0; }
      this.raf = requestAnimationFrame(this.frame);
      return;
    }
    this.accumulator += elapsed;
    const fixedStep = 1000 / TICK_RATE;
    while (this.accumulator >= fixedStep && !this.state.finished) {
      const previousScore = this.state.score;
      if (this.pendingDirection && this.moves.length >= 1200) { this.finish('connection'); return; }
      const applied = this.pendingDirection ? { tick: this.state.tick, direction: this.pendingDirection } : null;
      stepSurvivalState(this.state, this.pendingDirection);
      if (applied) this.moves.push(applied);
      this.course = this.state.course;
      this.pendingDirection = 0;
      this.accumulator -= fixedStep;
      if (this.state.lastEvent) this.effect(this.state.lastEvent, this.state.score - previousScore);
      if (this.state.tick % 6 === 0 || this.state.lastEvent) this.publish();
    }
    this.render(Math.min(elapsed / 1000, 0.1));
    if (this.state.finished) { this.finish('lives'); return; }
    this.raf = requestAnimationFrame(this.frame);
  }

  snapshot(fromTick = 0) {
    return { toTick: this.state.tick, inputs: this.moves.filter(move => move.tick >= fromTick && move.tick < this.state.tick).map(move => ({ ...move })) };
  }

  acknowledge(tick) {
    if (!Number.isInteger(tick) || tick < 0 || tick > this.state.tick) return;
    this.moves = this.moves.filter(move => move.tick >= tick);
  }

  finish(reason = 'exit') {
    if (this.completed || !this.running) return;
    this.completed = true;
    this.running = false;
    this.pendingDirection = 0;
    cancelAnimationFrame(this.raf);
    this.publish();
    this.onFinish({ ...survivalSummary(this.state), ...this.snapshot(), reason });
  }

  interrupt() { this.finish('interrupted'); }

  setSound(enabled) { this.soundEnabled = Boolean(enabled); if (enabled) this.ensureAudio(); }
  ensureAudio() {
    if (!this.soundEnabled) return;
    try { const Audio = window.AudioContext || window.webkitAudioContext; if (Audio && !this.audio) this.audio = new Audio(); this.audio?.resume().catch(() => {}); } catch { /* Sound is optional on restricted mobile browsers. */ }
  }
  beep(frequency, duration = 0.12, volume = 0.045) {
    if (!this.soundEnabled || !this.audio || this.audio.state !== 'running') return;
    const oscillator = this.audio.createOscillator();
    const gain = this.audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, this.audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.7, this.audio.currentTime + duration);
    gain.gain.setValueAtTime(volume, this.audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.audio.currentTime + duration);
    oscillator.connect(gain); gain.connect(this.audio.destination);
    oscillator.start(); oscillator.stop(this.audio.currentTime + duration);
  }
  effect(type, points) {
    const position = this.project(0.94, this.visualLane);
    if (type === 'hit') { this.flash = 0.5; this.beep(110, 0.18, 0.06); }
    else this.beep(790 + this.state.combo * 120, 0.11, 0.055);
    this.floating = { text: type === 'hit' ? '−1 VIDA' : `+${points}`, type, life: 0.9 };
    for (let i = 0; i < 12; i++) {
      const angle = i / 12 * TAU;
      this.particles.push({ x: position.x, y: position.y - 45, vx: Math.cos(angle) * (30 + Math.random() * 85), vy: Math.sin(angle) * 75 - 30, life: 0.6, color: type === 'hit' ? '#ff8752' : '#ffe76a' });
    }
  }
  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    document.removeEventListener('visibilitychange', this.visibility);
    window.removeEventListener('keydown', this.keydown);
    this.canvas.removeEventListener('pointerdown', this.pointerdown);
    this.canvas.removeEventListener('pointerup', this.pointerup);
    this.audio?.close().catch(() => {});
  }

  project(depth, lane = 1) {
    const horizon = this.height * 0.265;
    const curvature = Math.sin(this.state.distance / 490) * this.width * 0.19;
    const center = this.width / 2 + curvature * Math.pow(1 - Math.min(depth, 1), 2);
    const half = this.width * (0.026 + 0.58 * depth);
    return { x: center + (lane - 1) * half * 0.655, y: horizon + (this.height - horizon) * depth * depth, half, center };
  }
  polygon(points, color) {
    const ctx = this.ctx;
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath(); ctx.fill();
  }
  ellipse(x, y, rx, ry, color) { const ctx = this.ctx; ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, TAU); ctx.fill(); }

  render(delta = 0, countdown = null) {
    if (!this.ctx || !this.width || !this.height) return;
    const ctx = this.ctx, w = this.width, h = this.height;
    const blend = clamp((this.state.tick - 1780) / 80, 0, 1);
    this.visualLane += (this.state.lane - this.visualLane) * Math.min(1, delta * 18);
    this.flash = Math.max(0, this.flash - delta);
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.32);
    sky.addColorStop(0, '#172b32'); sky.addColorStop(0.55, '#597476'); sky.addColorStop(1, '#eacb81');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    const sun = ctx.createRadialGradient(w * 0.77, h * 0.17, 4, w * 0.77, h * 0.17, w * 0.25);
    sun.addColorStop(0, '#ffeebbaa'); sun.addColorStop(1, '#ffeeb000');
    ctx.fillStyle = sun; ctx.fillRect(0, 0, w, h * 0.4);
    this.ellipse(w * 0.77, h * 0.17, w * 0.056, w * 0.056, '#ffe6a1');
    this.hills();
    ctx.fillStyle = colorMix([111, 118, 64], [155, 115, 67], blend);
    ctx.fillRect(0, h * 0.267, w, h);
    // Broad painted terrain bands follow the same perspective as the circuit.
    for (let i = 0; i < 35; i++) {
      const p0 = i / 35, p1 = (i + 1) / 35;
      const a = this.project(p0), b = this.project(p1);
      const band = (Math.floor(this.state.distance / 12) + i) % 4 === 0;
      if (band) { ctx.fillStyle = blend < 0.5 ? '#87905238' : '#c5955730'; ctx.fillRect(0, a.y, w, b.y - a.y + 1); }
      this.polygon([[a.center - a.half * 1.13, a.y], [a.center + a.half * 1.13, a.y], [b.center + b.half * 1.13, b.y], [b.center - b.half * 1.13, b.y]], colorMix([165, 152, 94], [191, 151, 91], blend));
      this.polygon([[a.center - a.half, a.y], [a.center + a.half, a.y], [b.center + b.half, b.y], [b.center - b.half, b.y]], colorMix([47 + (band ? 3 : 0), 52 + (band ? 3 : 0), 53 + (band ? 3 : 0)], [154 + (band ? 4 : 0), 107 + (band ? 3 : 0), 59], blend));
      for (const side of [-1, 1]) {
        this.polygon([[a.center + side * a.half * 0.965, a.y], [a.center + side * a.half, a.y], [b.center + side * b.half, b.y], [b.center + side * b.half * 0.965, b.y]], band ? '#e8c840' : '#e8dfbb');
      }
    }
    const dashOffset = (this.state.distance % 40) / 40;
    for (let i = 0; i < 13; i++) {
      const p0 = (i + dashOffset) / 13, p1 = Math.min(1.06, p0 + 0.035);
      const a = this.project(p0), b = this.project(p1);
      for (const lane of [-1 / 3, 1 / 3]) this.polygon([[a.center + a.half * (lane - 0.009), a.y], [a.center + a.half * (lane + 0.009), a.y], [b.center + b.half * (lane + 0.009), b.y], [b.center + b.half * (lane - 0.009), b.y]], blend < 0.5 ? '#f5eed355' : '#efcea344');
    }
    // A paired set of wheel tracks gives the dirt section a different surface.
    if (blend > 0) {
      ctx.globalAlpha = blend * 0.18;
      for (let lane = 0; lane < 3; lane++) for (const offset of [-0.11, 0.11]) {
        ctx.strokeStyle = '#63482b'; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i <= 20; i++) { const point = this.project(i / 20, lane + offset); if (!i) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y); }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    this.scenery();
    const visible = this.course.filter(row => row.distance - this.state.distance <= VIEW_DISTANCE && row.tick - this.state.tick >= -14).sort((a, b) => b.tick - a.tick);
    for (const row of visible) {
      const p = 0.06 + (1 - (row.distance - this.state.distance) / VIEW_DISTANCE) * 0.88;
      for (const obstacle of row.obstacles) this.obstacle(this.project(p, obstacle.lane), p, obstacle.type);
      if (row.tick >= this.state.tick) this.tire(this.project(p, row.coinLane), p, row.id);
    }
    ctx.save();
    if (this.state.tick < this.state.invulnerableUntil && Math.floor(this.state.tick / 6) % 2 === 0) ctx.globalAlpha = 0.45;
    this.motorcycle(delta, blend);
    ctx.restore();
    for (const particle of this.particles) {
      particle.life -= delta; particle.x += particle.vx * delta; particle.y += particle.vy * delta; particle.vy += 170 * delta;
      ctx.globalAlpha = Math.max(0, particle.life / 0.6); ctx.fillStyle = particle.color; ctx.fillRect(particle.x, particle.y, 4, 4);
    }
    this.particles = this.particles.filter(particle => particle.life > 0); ctx.globalAlpha = 1;
    if (this.floating) {
      this.floating.life -= delta;
      if (this.floating.life > 0) {
        const p = this.project(0.94, this.visualLane);
        ctx.save(); ctx.textAlign = 'center'; ctx.font = '900 27px system-ui, sans-serif'; ctx.lineWidth = 4; ctx.strokeStyle = '#15221e'; ctx.globalAlpha = Math.min(1, this.floating.life * 3);
        const y = p.y - 115 - (0.9 - this.floating.life) * 35;
        ctx.strokeText(this.floating.text, p.x, y); ctx.fillStyle = this.floating.type === 'hit' ? '#ff9974' : '#ffe36a'; ctx.fillText(this.floating.text, p.x, y); ctx.restore();
      } else this.floating = null;
    }
    if (this.flash) { ctx.fillStyle = `rgba(255,92,45,${this.flash * 0.24})`; ctx.fillRect(0, 0, w, h); }
    const vignette = ctx.createRadialGradient(w / 2, h * 0.5, w * 0.35, w / 2, h * 0.5, h * 0.85);
    vignette.addColorStop(0, '#00000000'); vignette.addColorStop(1, '#06110e55'); ctx.fillStyle = vignette; ctx.fillRect(0, 0, w, h);
    if (this.state.tick >= 1800 && this.state.tick < 1920) this.terrainNotice();
    if (countdown !== null && countdown > 0) this.drawCountdown(countdown);
  }

  hills() {
    const ctx = this.ctx, w = this.width, h = this.height;
    const shift = Math.sin(this.state.distance / 700) * w * 0.02;
    this.polygon([[-w * 0.1, h * 0.28], [-w * 0.1, h * 0.23], [w * 0.12 + shift, h * 0.145], [w * 0.22, h * 0.173], [w * 0.38, h * 0.14], [w * 0.53, h * 0.235], [w * 0.71, h * 0.185], [w * 0.85, h * 0.207], [w * 1.1, h * 0.16], [w * 1.1, h * 0.29]], '#53665d');
    this.polygon([[-20, h * 0.28], [-20, h * 0.245], [w * 0.09, h * 0.23], [w * 0.18, h * 0.205], [w * 0.29, h * 0.235], [w * 0.45, h * 0.241], [w * 0.55, h * 0.202], [w * 0.68, h * 0.24], [w * 0.88, h * 0.219], [w + 20, h * 0.237], [w + 20, h * 0.29]], '#3d5148');
    ctx.strokeStyle = '#dce6cf35'; ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); const x = w * (0.17 + i * 0.095), y = h * (0.093 + (i % 2) * 0.02); ctx.moveTo(x - 3, y); ctx.quadraticCurveTo(x, y - 3, x + 3, y); ctx.quadraticCurveTo(x + 6, y - 3, x + 9, y); ctx.stroke(); }
  }

  scenery() {
    const ctx = this.ctx;
    for (let i = 0; i < 12; i++) {
      const depth = ((i / 12 + (this.state.distance % 280) / 280) % 1);
      if (depth < 0.04) continue;
      const position = this.project(depth);
      const side = i % 2 ? 1 : -1;
      const x = position.center + side * position.half * (1.22 + (i % 3) * 0.2);
      const y = position.y, scale = depth * this.width / 390;
      if (i % 4 === 0) {
        ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
        this.ellipse(0, 0, 16, 5, '#263a2e55');
        ctx.strokeStyle = '#334e3a'; ctx.lineCap = 'round'; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -47); ctx.moveTo(0, -24); ctx.lineTo(-13, -24); ctx.lineTo(-13, -36); ctx.moveTo(0, -17); ctx.lineTo(12, -17); ctx.lineTo(12, -30); ctx.stroke();
        ctx.strokeStyle = '#829060'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-1, -4); ctx.lineTo(-1, -46); ctx.stroke(); ctx.restore();
      } else if (i % 5 === 0) {
        ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
        ctx.fillStyle = '#313e35'; ctx.fillRect(-2, -63, 4, 64);
        this.polygon([[0, -66], [side * 50, -58], [side * 50, -33], [0, -40]], '#f0cc38');
        ctx.translate(side * 24, -46); ctx.rotate(side * 0.15); ctx.fillStyle = '#182520'; ctx.font = '900 italic 7px system-ui'; ctx.textAlign = 'center'; ctx.fillText('FREEDOM', 0, 0); ctx.restore();
      } else {
        ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
        ctx.strokeStyle = '#b6b577'; ctx.lineWidth = 2;
        for (let j = -2; j <= 2; j++) { ctx.beginPath(); ctx.moveTo(j * 3, 0); ctx.quadraticCurveTo(j * 4, -8, j * 7, -13 + Math.abs(j) * 2); ctx.stroke(); }
        ctx.restore();
      }
    }
  }

  tire(position, depth, id) {
    const ctx = this.ctx;
    const size = Math.max(2, depth * 22 * this.width / 390);
    const bob = Math.sin(this.state.tick / 14 + id) * size * 0.11;
    this.ellipse(position.x, position.y + 1, size * 0.8, size * 0.22, '#10151245');
    ctx.save(); ctx.translate(position.x, position.y - size * 1.25 + bob); ctx.rotate(Math.sin(this.state.tick / 30 + id) * 0.08);
    const glow = ctx.createRadialGradient(0, 0, size * 0.3, 0, 0, size * 1.6); glow.addColorStop(0, '#ffe75166'); glow.addColorStop(1, '#ffe75100'); ctx.fillStyle = glow; ctx.fillRect(-size * 1.7, -size * 1.7, size * 3.4, size * 3.4);
    this.ellipse(2, 2, size * 0.77, size, '#80601c');
    this.ellipse(0, 0, size * 0.77, size, '#ffd83d');
    ctx.strokeStyle = '#aa7b17'; ctx.lineWidth = Math.max(1, size * 0.12);
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * size * 0.67, Math.sin(a) * size * 0.87); ctx.lineTo(Math.cos(a + 0.08) * size * 0.55, Math.sin(a + 0.08) * size * 0.74); ctx.stroke(); }
    this.ellipse(0, 0, size * 0.39, size * 0.57, '#fff0a5'); this.ellipse(1, 1, size * 0.26, size * 0.43, '#624d23');
    ctx.strokeStyle = '#fff6c2'; ctx.lineWidth = Math.max(1, size * 0.08); ctx.beginPath(); ctx.ellipse(0, 0, size * 0.69, size * 0.9, 0, Math.PI * 1.08, Math.PI * 1.72); ctx.stroke();
    ctx.restore();
  }

  obstacle(position, depth, type) {
    const ctx = this.ctx, scale = depth * this.width / 390;
    ctx.save(); ctx.translate(position.x, position.y); ctx.scale(scale, scale);
    this.ellipse(0, 1, type === 'barrier' ? 35 : 24, 7, '#151b1765');
    if (type === 'cone') {
      this.polygon([[-22, -3], [15, -3], [23, 3], [-14, 5]], '#171f1c');
      this.polygon([[-15, -3], [-4, -43], [4, -43], [14, -3]], '#f9c737');
      this.polygon([[1, -42], [4, -43], [14, -3], [5, -3]], '#b6821d');
      this.polygon([[-10, -21], [9, -21], [11, -13], [-12, -13]], '#f4efdc');
      this.polygon([[-7, -33], [6, -33], [7, -28], [-8, -28]], '#17261f');
    } else if (type === 'barrier') {
      ctx.fillStyle = '#26332b'; ctx.fillRect(-27, -22, 6, 24); ctx.fillRect(21, -22, 6, 24);
      ctx.fillStyle = '#e9c53d'; ctx.fillRect(-34, -36, 68, 23);
      ctx.save(); ctx.beginPath(); ctx.rect(-34, -36, 68, 23); ctx.clip();
      for (let i = -3; i < 4; i++) this.polygon([[i * 23, -37], [i * 23 + 11, -37], [i * 23 - 5, -12], [i * 23 - 16, -12]], '#222c27');
      ctx.restore(); ctx.fillStyle = '#fff0a6'; ctx.fillRect(-34, -37, 68, 3);
    } else {
      this.polygon([[-27, -3], [-24, -21], [-10, -36], [10, -32], [25, -15], [24, 0], [5, 5]], '#776c58');
      this.polygon([[-24, -21], [-10, -36], [10, -32], [3, -19]], '#b9a17b');
      this.polygon([[3, -19], [10, -32], [25, -15], [24, 0]], '#8c7757');
      this.polygon([[-27, -3], [-24, -21], [3, -19], [5, 5]], '#9a8768');
      ctx.strokeStyle = '#cbb58b'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-21, -20); ctx.lineTo(3, -19); ctx.lineTo(20, -13); ctx.stroke();
    }
    ctx.restore();
  }

  motorcycle(delta, dirt) {
    const ctx = this.ctx, point = this.project(0.94, this.visualLane);
    const scale = Math.min(1.5, this.width / 390);
    const lean = clamp((this.state.lane - this.visualLane) * 0.28, -0.2, 0.2);
    const vibration = this.running && !this.countdown ? Math.sin(this.state.tick * 1.8) * 0.55 : 0;
    ctx.save(); ctx.translate(point.x, point.y);
    this.ellipse(0, 1, scale * 28, scale * 9, '#08110ec0');
    if (dirt > 0) {
      for (let i = 0; i < 6; i++) {
        const age = (this.state.tick / 16 + i / 6) % 1;
        const side = i % 2 ? 1 : -1;
        this.ellipse(side * (7 + age * 15) * scale, age * 25 * scale, (4 + age * 7) * scale, (2 + age * 5) * scale, `rgba(221,184,116,${dirt * (1 - age) * 0.3})`);
      }
    }
    ctx.scale(scale, scale); ctx.rotate(lean); ctx.translate(this.flash ? Math.sin(this.state.tick * 3) * 3 : 0, vibration);
    // Rear tyre, edge blocks and rolling chevrons.
    this.ellipse(0, -23, 12, 26, '#080e0b');
    ctx.fillStyle = '#151e18'; ctx.fillRect(-11, -33, 22, 21);
    ctx.strokeStyle = '#384239'; ctx.lineWidth = 2.6;
    const roll = (this.state.distance % 9) / 9;
    for (let i = 0; i < 7; i++) {
      const y = -45 + (i + roll) * 6;
      ctx.beginPath(); ctx.moveTo(-8, y - 1); ctx.lineTo(-2, y + 2); ctx.moveTo(8, y - 1); ctx.lineTo(2, y + 2); ctx.stroke();
    }
    ctx.strokeStyle = '#0b110e'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-15, -39); ctx.lineTo(-11, -9); ctx.moveTo(15, -39); ctx.lineTo(11, -9); ctx.stroke();
    ctx.strokeStyle = '#768276'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-15, -39); ctx.lineTo(-11, -12); ctx.moveTo(15, -39); ctx.lineTo(11, -12); ctx.stroke();
    // Metallic exhaust and side fairings.
    ctx.save(); ctx.translate(21, -30); ctx.rotate(-0.08); ctx.fillStyle = '#5e6c62'; ctx.fillRect(-4, -15, 9, 24); this.ellipse(0.5, 9, 4.5, 3.5, '#a3ada1'); this.ellipse(0.5, 9, 2.4, 1.8, '#101813'); ctx.fillStyle = '#c2cbbb'; ctx.fillRect(-3, -13, 2, 16); ctx.restore();
    this.polygon([[-13, -64], [-26, -42], [-17, -25], [-8, -40], [8, -40], [17, -25], [25, -43], [13, -64]], '#e4b920');
    this.polygon([[-13, -61], [-22, -42], [-16, -32], [-14, -43]], '#fff077');
    this.polygon([[13, -61], [22, -43], [17, -31], [14, -43]], '#9a7617');
    this.polygon([[-11, -64], [11, -64], [14, -43], [10, -31], [-10, -31], [-14, -43]], '#121b16');
    ctx.fillStyle = '#26372b'; ctx.fillRect(-9, -54, 18, 11);
    this.polygon([[-14, -38], [14, -38], [10, -28], [-10, -28]], '#ffe044');
    ctx.fillStyle = '#fc7652'; ctx.fillRect(-7, -34, 14, 3); ctx.fillStyle = '#ffc0a1'; ctx.fillRect(-4, -34, 8, 1);
    // Rider boots and bent legs.
    ctx.strokeStyle = '#101a14'; ctx.lineWidth = 11; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-9, -54); ctx.lineTo(-21, -41); ctx.lineTo(-22, -24); ctx.moveTo(9, -54); ctx.lineTo(21, -41); ctx.lineTo(20, -24); ctx.stroke();
    ctx.strokeStyle = '#334138'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-16, -48); ctx.lineTo(-23, -38); ctx.moveTo(16, -48); ctx.lineTo(23, -37); ctx.stroke();
    ctx.fillStyle = '#101811'; ctx.fillRect(-28, -26, 11, 7); ctx.fillRect(16, -26, 11, 7);
    ctx.fillStyle = '#828c79'; ctx.fillRect(-28, -20, 11, 2); ctx.fillRect(16, -20, 11, 2);
    // Handlebar and gloves remain visible on both sides of the rider.
    ctx.strokeStyle = '#819181'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-30, -69); ctx.lineTo(-18, -64); ctx.lineTo(18, -64); ctx.lineTo(30, -69); ctx.stroke();
    ctx.strokeStyle = '#101a14'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-35, -69); ctx.lineTo(-28, -69); ctx.moveTo(28, -69); ctx.lineTo(35, -69); ctx.stroke();
    ctx.strokeStyle = '#e7c32c'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(-11, -78); ctx.lineTo(-23, -73); ctx.lineTo(-29, -67); ctx.moveTo(11, -78); ctx.lineTo(23, -73); ctx.lineTo(29, -67); ctx.stroke();
    ctx.strokeStyle = '#17271b'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-24, -72); ctx.lineTo(-29, -67); ctx.moveTo(24, -72); ctx.lineTo(29, -67); ctx.stroke();
    this.polygon([[-11, -81], [-17, -69], [-11, -49], [11, -49], [17, -69], [11, -81]], '#1b2a1e');
    this.polygon([[-11, -80], [-16, -68], [-12, -56], [-7, -58], [-7, -79]], '#e9c72f');
    this.polygon([[11, -80], [16, -68], [12, -56], [7, -58], [7, -79]], '#c99f21');
    ctx.strokeStyle = '#73805f'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(-5, -75); ctx.lineTo(5, -75); ctx.moveTo(-6, -63); ctx.lineTo(6, -63); ctx.stroke();
    // Helmet silhouette, recessed back vent, highlights, and a tiny visor edge.
    this.ellipse(0, -87, 15, 17, '#09160e');
    this.ellipse(-0.5, -89, 14, 15.5, '#f5d33b');
    this.polygon([[-4, -104], [3, -104], [6, -77], [-5, -77]], '#23321e');
    this.polygon([[9, -102], [14, -93], [12, -79], [6, -77], [9, -90]], '#b69220');
    ctx.strokeStyle = '#fff3a2'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(-1, -90, 11.5, 12.5, -0.12, Math.PI * 1.05, Math.PI * 1.53); ctx.stroke();
    this.polygon([[-12, -83], [-6, -80], [6, -80], [12, -84], [9, -76], [-9, -76]], '#102014');
    ctx.fillStyle = '#5a6b49'; ctx.fillRect(-5, -80, 10, 2);
    ctx.restore();
  }

  drawCountdown(remaining) {
    const ctx = this.ctx, w = this.width, h = this.height;
    ctx.fillStyle = '#08180f77'; ctx.fillRect(0, 0, w, h);
    const x = w / 2, y = h * 0.40, radius = Math.min(61, w * 0.16);
    this.ellipse(x, y, radius + 9, radius + 9, '#1c2e24b0');
    ctx.strokeStyle = '#f9d747'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, radius + 8, -Math.PI / 2, -Math.PI / 2 + (remaining % 1 || 1) * TAU); ctx.stroke();
    this.ellipse(x, y, radius, radius, '#f8d342');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#17281c'; ctx.font = `900 italic ${radius * 1.22}px system-ui, sans-serif`; ctx.fillText(String(Math.ceil(remaining)), x - 2, y);
    ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff9df'; ctx.font = '800 15px system-ui, sans-serif'; ctx.fillText('PREPARE-SE PARA ACELERAR', x, y - radius - 28);
    ctx.font = '500 13px system-ui, sans-serif'; ctx.fillStyle = '#e9ecda'; ctx.fillText('Toque nas setas para trocar de faixa', x, y + radius + 40);
    ctx.font = '600 12px system-ui, sans-serif'; ctx.fillStyle = '#f9db65'; ctx.fillText('Colete pneus dourados. Desvie dos obstáculos.', x, y + radius + 64);
  }

  terrainNotice() {
    const ctx = this.ctx, w = this.width, h = this.height;
    const progress = (this.state.tick - 1800) / 120;
    const alpha = Math.min(1, progress * 8, (1 - progress) * 5);
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.fillStyle = '#1d301ee6'; ctx.fillRect(w * 0.08, h * 0.34, w * 0.84, 72);
    ctx.fillStyle = '#f5d34b'; ctx.fillRect(w * 0.08, h * 0.34, 3, 72);
    ctx.textAlign = 'center'; ctx.font = '900 italic 21px system-ui, sans-serif'; ctx.fillText('AGORA É TRILHA!', w / 2, h * 0.34 + 30);
    ctx.fillStyle = '#e8e9d5'; ctx.font = '500 12px system-ui, sans-serif'; ctx.fillText('A aventura continua na terra.', w / 2, h * 0.34 + 52);
    ctx.restore();
  }
}
