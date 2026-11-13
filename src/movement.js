export const WALK_SPEED = 2.7;
export const WORLD_RADIUS = 8.3;

export function groundHeight(x, z) {
  if (Math.abs(x + 0.5) < 3.6 && z >= -4.45 && z <= -0.12) return 0.75;
  if (Math.abs(x) < 2.75 && z < 0.5 && z > -0.12) return 0.44;
  if (Math.abs(x - 5.05) < 1.25 && Math.abs(z - 0.15) < 1.2) return 0.53;
  return 0.19;
}

export function canStandAt(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.hypot(x, z) > WORLD_RADIUS) return false;
  // Hall sides and back; front lattice panels leave an actual central doorway.
  const hallX = x + 0.5;
  if (z > -4.65 && z < -0.1 && Math.abs(Math.abs(hallX) - 3.1) < 0.37) return false;
  if (Math.abs(hallX) < 3.5 && Math.abs(z + 4.1) < 0.35) return false;
  if (Math.abs(hallX) < 3.4 && Math.abs(hallX) > 0.6 && Math.abs(z + 0.62) < 0.29) return false;
  if (Math.abs(hallX) < 1.1 && z < -2.7 && z > -4.1) return false;
  if (Math.hypot(x + 0.45, z - 3) < 0.82) return false;
  if (((x - 4.2) / 2.25) ** 2 + ((z - 5.55) / 1.7) ** 2 < 1) return false;
  if (Math.abs(x + 4.7) < 1.35 && Math.abs(z - 4.7) < 0.42) return false;
  const trunks = [[-5.65, 1.3], [-5.3, -5], [4.9, -4.8], [-7, -2.6], [1.6, -6.7], [6.75, -2.8], [-2.9, -6.8]];
  return !trunks.some(([tx, tz]) => Math.hypot(x - tx, z - tz) < 0.48);
}

export function moveOnGround(position, dx, dz) {
  let { x, z } = position;
  if (canStandAt(x + dx, z + dz)) return { x: x + dx, z: z + dz };
  // Sliding along walls feels natural, and avoids getting caught on courtyard edges.
  if (canStandAt(x + dx, z)) x += dx;
  if (canStandAt(x, z + dz)) z += dz;
  return { x, z };
}
