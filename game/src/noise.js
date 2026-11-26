// Kestrel Ridge — seeded randomness and value-noise terrain functions.
// The whole valley is reproducible from one integer seed: the same seed
// always grows the same mountains, river and tree line, so a screenshot
// taken today matches the world a player flies tomorrow.

// mulberry32: a small, fast, well-behaved seeded PRNG.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function nextRandom() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A deterministic 2D hash: turns an integer lattice point into a
// pseudo-random gradient direction without storing any tables.
function latticeHash(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 974634) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

// Classic value noise: interpolate hashed lattice corners with a smoothstep.
export function valueNoise2D(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const a = latticeHash(ix, iz, seed);
  const b = latticeHash(ix + 1, iz, seed);
  const c = latticeHash(ix, iz + 1, seed);
  const d = latticeHash(ix + 1, iz + 1, seed);
  const u = smoothstep(fx);
  const v = smoothstep(fz);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

// Fractal Brownian motion: several octaves of value noise, each twice the
// frequency and half the amplitude of the last. Lacunarity 2, gain 0.5.
export function fbm(x, z, seed, octaves = 5) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2D(x * freq, z * freq, seed + i * 101);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm; // roughly in [-1, 1]
}

// Ridged noise: sharp crests instead of rolling hills, for mountain ridges.
export function ridgedNoise(x, z, seed, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise2D(x * freq, z * freq, seed + i * 77));
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm; // in [0, 1]
}

// Billow noise: the absolute value of fBm, puffy and cloud-like. Used for
// soft variation (meadow mottling) where ridged noise would be too sharp.
export function billowNoise(x, z, seed, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * Math.abs(valueNoise2D(x * freq, z * freq, seed + i * 53));
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm; // in [0, 1]
}

// Domain warp: sample the noise field at a position bent by another noise
// field, so ridges curve and wander instead of running in straight lines.
export function warpedFbm(x, z, seed, octaves = 5) {
  const warpScale = 0.0016;
  const wx = fbm(x * warpScale + 5.2, z * warpScale + 1.3, seed + 31, 3);
  const wz = fbm(x * warpScale - 1.7, z * warpScale + 8.4, seed + 57, 3);
  const warpStrength = 180;
  return fbm((x + wx * warpStrength) * 0.0011, (z + wz * warpStrength) * 0.0011, seed, octaves);
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}
