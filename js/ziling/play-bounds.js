/**
 * 画布活动区边界：夹紧 + 速度反弹（供 pet.js 复用）。
 * 核心逻辑：碰撞后即使速度为 0 也会 kick，避免「贴墙无法弹开」。
 */
(function (global) {
  "use strict";

  const DEFAULT_KICK = 115;

  function inset(w, h) {
    return Math.max(1, Math.min(w, h) * 0.006);
  }

  /**
   * @returns {{ nx: number, ny: number } | null}
   */
  function resolve(pos, vel, bounds, r, restitution, kickSpeed) {
    const rest = restitution == null ? 0.42 : restitution;
    const kick = kickSpeed == null ? DEFAULT_KICK : kickSpeed;
    let nx = 0;
    let ny = 0;
    let hit = false;

    if (pos.x < bounds.minX + r) {
      pos.x = bounds.minX + r;
      nx = 1;
      hit = true;
      vel.x = Math.max(vel.x * -rest, kick);
    } else if (pos.x > bounds.maxX - r) {
      pos.x = bounds.maxX - r;
      nx = -1;
      hit = true;
      vel.x = Math.min(vel.x * -rest, -kick);
    }

    if (pos.y < bounds.minY + r) {
      pos.y = bounds.minY + r;
      ny = 1;
      hit = true;
      vel.y = Math.max(vel.y * -rest, kick);
    } else if (pos.y > bounds.maxY - r) {
      pos.y = bounds.maxY - r;
      ny = -1;
      hit = true;
      vel.y = Math.min(vel.y * -rest, -kick);
    }

    return hit ? { nx, ny } : null;
  }

  global.ZiLingPlayBounds = {
    inset,
    resolve,
  };
})(typeof window !== "undefined" ? window : globalThis);
