/**
 * 字灵 — PIBT-based Main Entry Point
 * Mobile WebView, 390x700 viewport.
 * Zero-collision grid movement via Priority Inheritance with Backtracking.
 */

import { Renderer } from './render/renderer.js';
import { Grid } from './core/grid.js';
import { Character, CharacterPool, CHAR_STATE } from './core/character.js';
import { MotionEngine } from './core/motion.js';
import { ShapeSystem } from './core/shape.js';

document.addEventListener('DOMContentLoaded', () => {
  // ── Init ──────────────────────────────────────────────
  const renderer = new Renderer('main-canvas');
  const { cssWidth, cssHeight } = renderer.init();

  // ── Core objects ───────────────────────────────────────
  const CELL_SIZE = 16;
  const FONT_SIZE = 15;

  const gridCols = Math.floor(cssWidth / CELL_SIZE);
  const gridRows = Math.floor(cssHeight / CELL_SIZE);
  const grid = new Grid(gridCols, gridRows);
  const pool = new CharacterPool(200);
  const motion = new MotionEngine(grid, CELL_SIZE, 0);

  // Shape system for expression/giant-char grid masks
  const shapeSystem = new ShapeSystem();

  // Create characters spread across grid
  const CHAR_POOL = '天地玄黄宇宙洪荒日月盈昃辰宿列张寒来暑往秋收冬藏闰余成岁律吕调阳'.split('');
  const CHAR_COUNT = 60;
  for (let i = 0; i < CHAR_COUNT; i++) {
    const col = 2 + (i % 20);
    const row = 2 + Math.floor(i / 20);
    const char = CHAR_POOL[i % CHAR_POOL.length];
    const c = pool.acquire(char, col, row);
    motion.registerCharacter(c);
  }
  console.log(`PIBT ready — Grid ${gridCols}x${gridRows}, ${CHAR_COUNT} characters`);

  // ── Shape transition test after 3s of wandering ────────
  setTimeout(() => {
    console.log('Shape transition: ^_^');
    const result = shapeSystem.sampleEmoji('^_^', gridCols, gridRows, CHAR_COUNT);
    console.log(`Mask: ${result.mask.length} cells`);

    // Assign shape mask cells as PIBT wander targets
    const mask = [...result.mask];
    const allChars = pool.getAll();
  allChars.forEach((char, i) => {
    if (i < mask.length) {
      motion.setTarget(char.id, mask[i].x, mask[i].y);
    }
  });
  // NOTE: Not setting shapeMask/constrainToShape — chars move freely after reaching target
  console.log('Shape targets assigned — ' + Math.min(CHAR_COUNT, mask.length) + ' chars');
    console.log('Transition initiated');
  }, 3000);

  // ── State ─────────────────────────────────────────────
  const DEBUG = new URLSearchParams(window.location.search).get('debug') === '1';
  let running = true;
  let lastTime = performance.now();
  const frameTimes = [];
  let lastFpsLog = performance.now();
  let lastCheckSecond = -1;
  let collisionOk = true;

  // ── Animation loop ────────────────────────────────────
  function loop(now) {
    if (!running) { requestAnimationFrame(loop); return; }

    const dtMs = now - lastTime;
    lastTime = now;

    // FPS tracking
    frameTimes.push(now);
    if (frameTimes.length > 60) frameTimes.shift();

    if (now - lastFpsLog >= 5000) {
      const elapsed = frameTimes[frameTimes.length - 1] - frameTimes[0];
      const avgFps = elapsed > 0 ? ((frameTimes.length - 1) / (elapsed / 1000)).toFixed(1) : '—';
      console.log(`[FPS] avg ${avgFps} over ${frameTimes.length} frames`);
      lastFpsLog = now;
    }

    // Clear & motion tick (PIBT handles everything internally)
    renderer.clear();
    motion.update(dtMs);
    motion.updateDisplayPositions(motion.tickProgress);

    // Collision check
    if (DEBUG) {
      const checkSec = Math.floor(now / 5000);
      if (checkSec !== lastCheckSecond) {
        lastCheckSecond = checkSec;
        collisionOk = verifyNoCollisions(pool, grid);
      }
    }

    // Render characters
    const ctx = renderer.getContext();
    const allChars = pool.getAll();
    ctx.font = `${FONT_SIZE}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = '#e0e0e0';
    for (const char of allChars) {
      if (char.alpha > 0.01) {
        ctx.globalAlpha = char.alpha;
        ctx.fillText(char.char, char.displayX, char.displayY);
      }
    }
    ctx.globalAlpha = 1;

    // Debug overlay
    if (DEBUG) {
      const ctx2 = renderer.getContext();
      const instantFps = dtMs > 0 ? (1000 / dtMs).toFixed(0) : '—';
      const avgFt = frameTimes.length > 1
        ? (frameTimes[frameTimes.length - 1] - frameTimes[0]) / (frameTimes.length - 1)
        : 0;
      ctx2.save();
      ctx2.fillStyle = '#ffffff';
      ctx2.font = '10px monospace';
      ctx2.textBaseline = 'top';
      ctx2.fillText(`FPS:${instantFps} FT:${avgFt.toFixed(1)}ms CH:${pool.count()} ${collisionOk ? 'OK' : '!!'} SHP:${shapeSystem.currentMask.length}`, 4, 4);
      ctx2.restore();
    }

    requestAnimationFrame(loop);
  }

  // ── Collision verification ────────────────────────────
  function verifyNoCollisions(pool, grid) {
    const occupied = new Map();
    for (const char of pool.getAll()) {
      const posX = char.state === 'moving' ? char.prevGridX : char.gridX;
      const posY = char.state === 'moving' ? char.prevGridY : char.gridY;
      const key = grid.getCellKey(posX, posY);
      if (!occupied.has(key)) occupied.set(key, []);
      occupied.get(key).push(char.id);
    }
    for (const [key, ids] of occupied) {
      if (ids.length > 1) {
        console.warn(`COLLISION at key=${key}: chars ${ids.join(',')}`);
        return false;
      }
    }
    console.log('Collision check: OK');
    return true;
  }

  // ── Visibility ────────────────────────────────────────
  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) lastTime = performance.now();
  });

  // ── Start ─────────────────────────────────────────────
  document.fonts.ready.then(() => {
    requestAnimationFrame(loop);
  });
});
