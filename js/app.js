/**
 * 字灵 — PIBT-based Main Entry Point
 * Mobile WebView, 390x700 viewport.
 * Zero-collision grid movement via Priority Inheritance with Backtracking.
 */

import { Renderer } from './render/renderer.js';
import { Grid } from './core/grid.js';
import { Character, CharacterPool } from './core/character.js';
import { MotionEngine } from './core/motion.js';
import { GestureRecognizer } from './input/gestures.js';

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

  // [TEST 4] Shape formation — rectangle
  setTimeout(() => {
    const w = 12, h = 5, ox = 6, oy = 8;
    const mask = [];
    for (let y = oy; y < oy + h; y++)
      for (let x = ox; x < ox + w; x++)
        mask.push({ x, y });
    
    const allChars = pool.getAll();
    allChars.forEach((char, i) => {
      if (i < 30) { // 50% density — room to move
        motion.setTarget(char.id, mask[i].x, mask[i].y);
        motion.constrainToShape(char.id);
      }
    });
    motion.shapeMask = mask;
    console.log(`Shape: ${w}x${h} rect, ${mask.length} cells`);
  }, 3000);

  // ── State ─────────────────────────────────────────────
  const DEBUG = new URLSearchParams(window.location.search).get('debug') === '1';
  let running = true;
  let lastTime = performance.now();
  const frameTimes = [];
  let lastFpsLog = performance.now();
  let lastCheckSecond = -1;
  let collisionOk = true;

  // ── Gestures ──────────────────────────────────────────
  const gestures = new GestureRecognizer(
    renderer.canvas, CELL_SIZE,
    {
      onTap(col, row) {
        console.log(`Tap at (${col},${row})`);
        const allChars = pool.getAll();
        for (const char of allChars) {
          const dist = Math.abs(char.gridX - col) + Math.abs(char.gridY - row);
          if (dist <= 3) {
            motion.scatter(char.id, col, row);
          }
        }
      },
      onDoubleTap(col, row) {
        console.log(`Double-tap at (${col},${row})`);
        // Placeholder: shape switching (will implement in interactive mode)
      },
      onLongPress(col, row) {
        console.log(`Long-press at (${col},${row})`);
        // Placeholder: return to text-line layout (will implement in interactive mode)
      },
      onDragStart(col, row) {
        // TODO: implement proper drag behavior
      },
      onDragMove(col, row, dx, dy) {
        // TODO: implement proper drag behavior
      },
      onDragEnd() {
        // TODO: implement proper drag behavior
      },
      onDragMove(col, row, dx, dy) {
        const origin = gestures._dragOrigin;
        if (!origin) return;
        const dCol = col - origin.col;
        const dRow = row - origin.row;
        const starts = gestures._dragStartPositions;
        if (!starts) return;
        for (const s of starts) {
          const tx = Math.max(0, Math.min(gridCols - 1, s.x + dCol));
          const ty = Math.max(0, Math.min(gridRows - 1, s.y + dRow));
          motion.setTarget(s.id, tx, ty);
        }
      },
      onDragEnd() {
        console.log('Drag end');
        gestures._dragOrigin = null;
        gestures._dragStartPositions = null;
      },
    }
  );

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
      ctx2.fillText(`FPS:${instantFps} FT:${avgFt.toFixed(1)}ms CH:${pool.count()} ${collisionOk ? 'OK' : '!!'}`, 4, 4);
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
