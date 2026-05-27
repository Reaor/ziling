/**
 * PIBT-based Motion Engine v3 — collision-free + continuous movement.
 *
 * Based on Priority Inheritance with Backtracking (Okumura et al., AIJ 2022).
 * This version addresses the "stuck character" problem by:
 *   1. Only constraining characters to shape mask when mask is active
 *   2. Characters NOT in shape constraint wander freely anywhere
 *   3. Stuck detection with gentle respawn (finds sparse areas)
 *   4. When all candidates blocked, character stays — but will be respawned if stuck too long
 *
 * @module motion
 * @requires ./character.js, ./grid.js
 */

const DIRS = [
  { dx:  0, dy: -1 },
  { dx:  0, dy:  1 },
  { dx: -1, dy:  0 },
  { dx:  1, dy:  0 },
];

const STUCK_LIMIT = 5; // ticks before aggressive target reassignment

export class MotionEngine {
  constructor(grid, cellSize, cellPadding = 0) {
    this.grid = grid;
    this.cellSize = cellSize;
    this.cellPadding = cellPadding;
    this.tickDuration = 200;
    this.accumulatedTime = 0;
    this.tickProgress = 0;
    this.characters = new Map();

    // PIBT state
    this._occupiedNow = [];
    this._occupiedNxt = [];
    this._nextPos = [];

    // Wander targets
    this._wanderTargets = new Map();

    // Direction tracking
    this._currentDirs = new Map();
    this._directionStreaks = new Map();

    // Stuck tracking
    this._stuckTicks = new Map();

    // Interpolation stagger
    this._moveStartTimes = new Map();

    // Shape constraint (per-character, NOT global)
    this._shapeChars = new Set();
    this._shapeMask = null;
  }

  // ── Public API ────────────────────────────────────────

  registerCharacter(char) {
    this.characters.set(char.id, char);
    this.grid.occupy(char.id, char.gridX, char.gridY);
    char.prevGridX = char.gridX;
    char.prevGridY = char.gridY;
    this._assignWanderTarget(char);
    // Random initial direction bias — prevents all chars moving the same way at start
    const initDir = DIRS[Math.floor(Math.random() * 4)];
    this._currentDirs.set(char.id, { dx: initDir.dx, dy: initDir.dy });
    this._directionStreaks.set(char.id, Math.floor(Math.random() * 10)); // Random initial streak
  }

  unregisterCharacter(charId) {
    const char = this.characters.get(charId);
    if (!char) return;
    this.grid.vacate(char.gridX, char.gridY);
    this.characters.delete(charId);
    this._wanderTargets.delete(charId);
    this._directionStreaks.delete(charId);
    this._currentDirs.delete(charId);
    this._stuckTicks.delete(charId);
    this._moveStartTimes.delete(charId);
    this._shapeChars.delete(charId);
  }

  /** Set a specific wander target (for shape transitions) */
  setTarget(charId, tx, ty) {
    this._wanderTargets.set(charId, { tx, ty });
  }

  /** Activate shape constraint for this character */
  constrainToShape(charId) {
    this._shapeChars.add(charId);
  }

  /** Release shape constraint */
  freeFromShape(charId) {
    this._shapeChars.delete(charId);
  }

  /** Set the shape mask and constrain all assigned characters */
  setShapeMask(mask, charIds) {
    this._shapeMask = mask;
    for (const id of charIds) {
      this._shapeChars.add(id);
    }
  }

  /** Release all shape constraints */
  releaseShape() {
    this._shapeChars.clear();
    this._shapeMask = null;
  }

  update(deltaTime) {
    this.accumulatedTime += deltaTime;
    let ticks = 0;
    while (this.accumulatedTime >= this.tickDuration && ticks < 3) {
      this._advanceOneStep();
      this.accumulatedTime -= this.tickDuration;
      ticks++;
    }
    if (this.accumulatedTime >= this.tickDuration) this.accumulatedTime = 0;
    this.tickProgress = this.accumulatedTime / this.tickDuration;
    return this.tickProgress;
  }

  updateDisplayPositions(progress) {
    const cs = this.cellSize;
    const pad = this.cellPadding;
    const now = performance.now();
    const tickMs = this.tickDuration;
    for (const char of this.characters.values()) {
      const start = this._moveStartTimes.get(char.id) || 0;
      let p = 0;
      if (now >= start) p = Math.min((now - start) / tickMs, 1.0);
      char.displayX = this._lerp(char.prevGridX * cs, char.gridX * cs, p) + pad;
      char.displayY = this._lerp(char.prevGridY * cs, char.gridY * cs, p) + pad;
    }
  }

  // ── PIBT Core ─────────────────────────────────────────

  _advanceOneStep() {
    const chars = [...this.characters.values()];
    const N = chars.length;
    const grid = this.grid;
    const cols = grid.cols;
    const rows = grid.rows;
    const totalCells = cols * rows;

    // Reset PIBT state
    if (this._occupiedNow.length !== totalCells) {
      this._occupiedNow = new Array(totalCells).fill(-1);
      this._occupiedNxt = new Array(totalCells).fill(-1);
      this._nextPos = new Array(N).fill(-1);
    } else {
      this._occupiedNow.fill(-1);
      this._occupiedNxt.fill(-1);
      this._nextPos.fill(-1);
    }

    const idx = (x, y) => y * cols + x;

    // Record current occupation
    for (let i = 0; i < N; i++) {
      this._occupiedNow[idx(chars[i].gridX, chars[i].gridY)] = chars[i].id;
    }

    // Random priority order — PIBT priority inheritance handles cascade naturally
    const order = [...Array(N).keys()];
    this._shuffle(order);

    for (const i of order) {
      if (this._nextPos[i] === -1) {
        this._funcPIBT(chars, i, cols, rows, idx);
      }
    }

    // Apply moves
    const now = performance.now();
    for (let i = 0; i < N; i++) {
      const char = chars[i];
      const nxt = this._nextPos[i];
      if (nxt === -1) continue;

      const nx = nxt % cols;
      const ny = Math.floor(nxt / cols);
      const dx = nx - char.gridX;
      const dy = ny - char.gridY;

      if (dx !== 0 || dy !== 0) {
        // Moving
        this._stuckTicks.set(char.id, 0);
        this.grid.vacate(char.gridX, char.gridY);
        this.grid.occupy(char.id, nx, ny);
        char.prevGridX = char.gridX;
        char.prevGridY = char.gridY;
        char.gridX = nx;
        char.gridY = ny;

        this._currentDirs.set(char.id, { dx, dy });
        const streak = (this._directionStreaks.get(char.id) || 0) + 1;
        this._directionStreaks.set(char.id, streak);

        const target = this._wanderTargets.get(char.id);
        if (target && nx === target.tx && ny === target.ty) {
          this._wanderTargets.delete(char.id);
          // Shape-constrained: pick a new mask cell to keep wandering within shape
          if (this._shapeChars.has(char.id)) {
            this._assignWanderTarget(char);
          }
        }

        const moveTime = now;
        this._moveStartTimes.set(char.id, moveTime);
      } else {
        // Not moving
        const stuck = (this._stuckTicks.get(char.id) || 0) + 1;
        this._stuckTicks.set(char.id, stuck);
        this._directionStreaks.set(char.id, 0);

        if (stuck > STUCK_LIMIT) {
          // Force a new target far away — PIBT will naturally find a way out
          this._assignWanderTarget(char);
          this._stuckTicks.set(char.id, 0);
        }
      }
    }
  }

  _funcPIBT(chars, i, cols, rows, idx) {
    const char = chars[i];
    const grid = this.grid;
    const target = this._wanderTargets.get(char.id);
    const isShape = this._shapeChars.has(char.id);

    // Candidates: [stay] + [4 neighbors] — only unoccupied
    const cands = [{ x: char.gridX, y: char.gridY, stay: true }];
    for (const d of DIRS) {
      const nx = char.gridX + d.dx;
      const ny = char.gridY + d.dy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      
      // Shape constraint: only move within mask
      if (isShape && this._shapeMask) {
        const inMask = this._shapeMask.some(c => c.x === nx && c.y === ny);
        if (!inMask) continue;
      }
      
      if (!grid.isOccupied(nx, ny)) {
        cands.push({ x: nx, y: ny, stay: false, dx: d.dx, dy: d.dy });
      }
    }

    // Sort: repulsion priority → stuck-penalty → direction streak → target distance
    const curDir = this._currentDirs.get(char.id);
    const streak = this._directionStreaks.get(char.id) || 0;
    const stuck = this._stuckTicks.get(char.id) || 0;

    // Compute repulsion score for each candidate: avoid nearby characters
    for (const c of cands) {
      c.repulsion = 0;
      for (const other of chars) {
        if (other.id === char.id) continue;
        const dist = Math.abs(c.x - other.gridX) + Math.abs(c.y - other.gridY);
        if (dist < 4) c.repulsion -= (4 - dist) * 3; // Strong penalty for being close
      }
    }

    // Sort: target direction (TOP when active) > direction persistence > repulsion
    const changeThreshold = 15 + Math.floor(Math.random() * 15);
    const forceChange = streak > changeThreshold;
    const hasTarget = target !== undefined;

    cands.sort((a, b) => {
      if (a.stay && !b.stay) return 1;
      if (!a.stay && b.stay) return -1;
      if (a.stay && b.stay) return 0;

      // When a character has a specific target → target direction is TOP priority
      if (hasTarget) {
        const aDist = Math.abs(a.x - target.tx) + Math.abs(a.y - target.ty);
        const bDist = Math.abs(b.x - target.tx) + Math.abs(b.y - target.ty);
        if (aDist !== bDist) return aDist - bDist;
      }

      if (curDir && !hasTarget) {
        const aSame = a.dx === curDir.dx && a.dy === curDir.dy;
        const bSame = b.dx === curDir.dx && b.dy === curDir.dy;
        const aOpposite = a.dx === -curDir.dx && a.dy === -curDir.dy;
        const bOpposite = b.dx === -curDir.dx && b.dy === -curDir.dy;
        
        if (!forceChange) {
          if (aSame && !bSame) return -1;
          if (!aSame && bSame) return 1;
          if (aOpposite && !bOpposite) return 1;
          if (!aOpposite && bOpposite) return -1;
        } else {
          const aPerp = !aSame && !aOpposite;
          const bPerp = !bSame && !bOpposite;
          if (aPerp && !bPerp) return -1;
          if (!aPerp && bPerp) return 1;
          if (aSame && bOpposite) return -1;
          if (bSame && aOpposite) return 1;
        }
      }

      // Repulsion breaks ties
      if (a.repulsion !== b.repulsion) return b.repulsion - a.repulsion;
      return 0;
    });

    for (const c of cands) {
      const ci = idx(c.x, c.y);
      if (this._occupiedNxt[ci] !== -1) continue;

      const occNow = this._occupiedNow[ci];
      if (occNow !== -1) {
        const oj = chars.findIndex(ch => ch.id === occNow);
        if (oj !== -1 && this._nextPos[oj] === idx(char.gridX, char.gridY)) continue;
      }

      this._nextPos[i] = ci;
      this._occupiedNxt[ci] = char.id;

      if (occNow !== -1 && occNow !== char.id) {
        const oj = chars.findIndex(ch => ch.id === occNow);
        if (oj !== -1 && this._nextPos[oj] === -1) {
          if (!this._funcPIBT(chars, oj, cols, rows, idx)) {
            this._nextPos[i] = -1;
            this._occupiedNxt[ci] = -1;
            continue;
          }
        }
      }
      return true;
    }

    // Fallback: stay
    const si = idx(char.gridX, char.gridY);
    this._nextPos[i] = si;
    this._occupiedNxt[si] = char.id;
    return false;
  }

  // ── Wander ────────────────────────────────────────────

  _assignWanderTarget(char) {
    if (this._shapeChars.has(char.id) && this._shapeMask && this._shapeMask.length > 0) {
      for (let a = 0; a < 20; a++) {
        const c = this._shapeMask[Math.floor(Math.random() * this._shapeMask.length)];
        if (c.x === char.gridX && c.y === char.gridY) continue;
        if (this.grid.isOccupied(c.x, c.y)) continue;
        this._wanderTargets.set(char.id, { tx: c.x, ty: c.y });
        return;
      }
    }
    // Prefer targets far from current position for wider roaming
    for (let a = 0; a < 15; a++) {
      const tx = Math.floor(Math.random() * this.grid.cols);
      const ty = Math.floor(Math.random() * this.grid.rows);
      const dist = Math.abs(tx - char.gridX) + Math.abs(ty - char.gridY);
      if (dist < 8) continue;  // At least 8 cells away
      if (tx === char.gridX && ty === char.gridY) continue;
      if (this.grid.isOccupied(tx, ty)) continue;
      this._wanderTargets.set(char.id, { tx, ty });
      return;
    }
    // Fallback: any unoccupied cell
    for (let a = 0; a < 10; a++) {
      const tx = Math.floor(Math.random() * this.grid.cols);
      const ty = Math.floor(Math.random() * this.grid.rows);
      if (tx === char.gridX && ty === char.gridY) continue;
      if (this.grid.isOccupied(tx, ty)) continue;
      this._wanderTargets.set(char.id, { tx, ty });
      return;
    }
  }

  // ── Recovery ──────────────────────────────────────────

  _respawnSparse(char, cols, rows) {
    for (let a = 0; a < 50; a++) {
      const tx = Math.floor(Math.random() * cols);
      const ty = Math.floor(Math.random() * rows);
      if (this.grid.isOccupied(tx, ty)) continue;
      let crowded = false;
      for (let dy = -3; dy <= 3 && !crowded; dy++)
        for (let dx = -3; dx <= 3 && !crowded; dx++)
          if (tx+dx >= 0 && tx+dx < cols && ty+dy >= 0 && ty+dy < rows)
            if (this.grid.isOccupied(tx+dx, ty+dy)) crowded = true;
      if (crowded) continue;
      this.grid.vacate(char.gridX, char.gridY);
      this.grid.occupy(char.id, tx, ty);
      char.gridX = tx; char.gridY = ty;
      char.prevGridX = tx; char.prevGridY = ty;
      char.displayX = tx * this.cellSize;
      char.displayY = ty * this.cellSize;
      this._stuckTicks.set(char.id, 0);
      this._assignWanderTarget(char);
      return;
    }
  }

  // ── Helpers ───────────────────────────────────────────

  _lerp(a, b, t) { return a + (b - a) * t; }

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
}
