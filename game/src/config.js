// Kestrel Ridge — tuning constants and the world seed.
// Every number that shapes how the plane flies, how the valley looks and how
// missions score lives here, so the rest of the game reads like a recipe
// instead of a pile of magic numbers.

export const WORLD_SEED = 20261126;

// ---- World geometry (metres) ----
export const WORLD_SIZE = 4200; // terrain plane is WORLD_SIZE x WORLD_SIZE
export const WORLD_HALF = WORLD_SIZE / 2;
export const TERRAIN_SEGMENTS = 180; // mesh resolution (180 x 180 quads)
export const VALLEY_WIDTH = 620; // half-width of the flat valley floor
export const RIVER_WIDTH = 34;
export const RUNWAY = {
  x: 0,
  z: 60,
  length: 620,
  width: 34,
  heading: 0, // runway runs along +Z
  elevation: 42,
};
export const TREE_COUNT = 420;
export const ROCK_COUNT = 160;
export const CLOUD_COUNT = 26;

// ---- Flight model ----
export const FLIGHT = {
  mass: 1100, // kg, light bush plane
  maxThrust: 3300, // N at full throttle — balanced against drag at ~80 m/s
  wingArea: 16.5, // m^2
  liftSlope: 0.085, // lift coefficient per degree of angle of attack
  liftMax: 1.35, // lift coefficient at the stall break
  stallAoA: 19, // degrees; past this, lift collapses
  dragBase: 0.052, // parasitic drag coefficient
  dragInduced: 0.055, // induced drag factor
  cruiseSpeed: 62, // m/s, comfortable cruise
  maxSpeed: 95, // m/s, never-exceed
  minFlySpeed: 24, // m/s, below this the wing stops flying
  rollRate: 1.9, // rad/s at full aileron and good airspeed
  pitchRate: 1.15, // rad/s at full elevator
  yawRate: 0.55, // rad/s at full rudder
  gravity: 9.81,
  fuelCapacity: 100, // litres (shown as percent)
  fuelBurn: 0.55, // litres per second at full throttle
  fuelBurnIdle: 0.10, // litres per second at idle
  damageHardLanding: 34, // damage from a touchdown harder than -4.5 m/s
  damageTerrain: 100, // terrain strike is a crash
};

// ---- Missions ----
export const MISSIONS = {
  ringRun: {
    id: 'ring-run',
    name: 'Ring Run',
    rings: 9,
    parTime: 150, // seconds for a gold medal pace
    ringRadius: 16,
    ringScore: 100,
    timeBonusPerSecond: 5,
  },
  landing: {
    id: 'valley-landing',
    name: 'Valley Landing',
    touchdownSpeedMax: 48, // m/s, faster than this is a bounce-off
    touchdownSpeedIdeal: 38,
    sinkMax: 4.5, // m/s vertical speed at touchdown
    sinkIdeal: 1.6,
    centrelineMax: 26, // m off centreline still counts
  },
  free: { id: 'free-flight', name: 'Free Flight' },
};

// ---- Scoring ----
export const SCORE = {
  ring: 100,
  fuelRing: 150,
  landingBase: 400,
  perfectLandingBonus: 250,
  goldTime: 150,
  silverTime: 190,
};

// ---- Camera ----
export const CAMERA = {
  chaseDistance: 20,
  chaseHeight: 5.0,
  chaseLag: 8, // smoothing, higher is snappier (and less lag behind a fast plane)
  // Cockpit seat: high and forward, just behind the windshield and above
  // the nose cowling, so the pilot sees over the engine, not through it.
  cockpitOffset: { x: 0, y: 1.15, z: -1.6 },
};

// ---- Presentation ----
export const SKY = {
  fogNear: 500,
  fogFar: 3400,
  sunElevation: 38, // degrees
  sunAzimuth: 215,
};

export const STORAGE_KEYS = {
  bestRingTime: 'kestrel-ridge.best-ring-time',
  bestLanding: 'kestrel-ridge.best-landing',
  bestFreeScore: 'kestrel-ridge.best-free-score',
};
