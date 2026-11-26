// Kestrel Ridge — boot and game loop.
// Builds the world (terrain, river, runway, trees, sky, clouds, plane,
// rings), runs the flight model, draws the HUD, and owns the menu, pause
// and crash states. URL parameters pick screenshot states for the maker:
//   ?shot=cover    chase view, ring run mid-course, a ring ahead
//   ?shot=cockpit  cockpit view on final approach, runway ahead
//   ?shot=ring     close behind a ring about to be flown through
//   ?shot=landing  chase view on short final over the runway
//   ?shot=menu     title screen with the plane parked on the strip
// Play it normally with no parameters: pick a mission and fly.

import * as THREE from 'three';
import { WORLD_SIZE, RUNWAY, FLIGHT, CAMERA } from './config.js';
import { buildTerrainMesh, buildRiver, buildRunway, buildVegetation, heightAt } from './terrain.js';
import { buildAircraft, animateAircraft } from './aircraft.js';
import { buildSky, buildClouds, updateClouds } from './sky.js';
import { createFlightState, resetFlight, stepFlight } from './flight.js';
import { createMissionManager } from './missions.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { createCameraRig } from './camera.js';

const params = new URLSearchParams(window.location.search);
const shotMode = params.get('shot') || '';

const canvas3d = document.getElementById('scene');
const hudCanvas = document.getElementById('hud');
const menuEl = document.getElementById('menu');
const menuTitle = document.getElementById('menu-title');
const crashEl = document.getElementById('crash');
const pauseEl = document.getElementById('pause');

const renderer = new THREE.WebGLRenderer({ canvas: canvas3d, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc6e8);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 9000);

const { sun, sunDirection } = buildSky(scene);
scene.add(buildTerrainMesh());
scene.add(buildRiver());
scene.add(buildRunway());
scene.add(buildVegetation());
const { group: cloudGroup, clouds } = buildClouds();
scene.add(cloudGroup);

const plane = buildAircraft();
scene.add(plane);

const flight = createFlightState();
const missions = createMissionManager(scene);
const hud = createHud(hudCanvas);
const audio = createAudio();
const input = createInput(canvas3d);
const cameraRig = createCameraRig(camera);

let gameState = 'menu'; // 'menu' | 'playing' | 'paused' | 'crashed'
let time = 0;
let lastNow = performance.now();
let paused = false;
let crashReason = '';

// ---- Menu ----
function bestLine() {
  const parts = [];
  if (missions.best.ringTime) parts.push(`Best Ring Run ${missions.best.ringTime.toFixed(1)}s`);
  if (missions.best.landing) parts.push(`Best Landing +${missions.best.landing}`);
  return parts.join('  ·  ') || 'No flights logged yet — make the first one count.';
}

function showMenu() {
  gameState = 'menu';
  missions.mode = 'menu';
  menuEl.classList.remove('hidden');
  crashEl.classList.add('hidden');
  pauseEl.classList.add('hidden');
  document.getElementById('menu-best').textContent = bestLine();
}

function startMission(mode, startMode = 'airborne') {
  menuEl.classList.add('hidden');
  crashEl.classList.add('hidden');
  pauseEl.classList.add('hidden');
  gameState = 'playing';
  paused = false;
  if (mode === 'valley-landing') {
    resetFlight(flight, startMode === 'runway' ? 'runway' : 'approach');
  } else if (mode === 'free-flight') {
    resetFlight(flight, 'airborne');
  } else {
    resetFlight(flight, 'airborne');
  }
  missions.start(mode);
  audio.ensure();
}

document.getElementById('btn-ring').addEventListener('click', () => startMission('ring-run'));
document.getElementById('btn-landing').addEventListener('click', () => startMission('valley-landing'));
document.getElementById('btn-free').addEventListener('click', () => startMission('free-flight'));
document.getElementById('btn-crash-retry').addEventListener('click', () => startMission(missions.mode === 'menu' ? 'ring-run' : missions.mode));
document.getElementById('btn-crash-menu').addEventListener('click', () => { resetFlight(flight, 'runway'); showMenu(); });

window.addEventListener('pointerdown', () => audio.ensure(), { once: true });
window.addEventListener('keydown', () => audio.ensure(), { once: true });

// ---- Crashes ----
function crash(reason) {
  if (gameState === 'crashed') return;
  gameState = 'crashed';
  crashReason = reason;
  missions.crash(reason);
  audio.crash();
  document.getElementById('crash-text').textContent = reason;
  document.getElementById('crash-score').textContent = `Score ${missions.score}  ·  Rings ${missions.ringsPassed}/${missions.ringsTotal}`;
  crashEl.classList.remove('hidden');
}

// ---- Screenshot states ----
function applyShotMode() {
  if (!shotMode) return;
  if (shotMode === 'menu') {
    resetFlight(flight, 'runway');
    showMenu();
    return;
  }
  if (shotMode === 'cockpit') {
    cameraRig.mode = 'cockpit';
    startMission('valley-landing', 'approach');
    // Short final, so the runway fills the windshield instead of
    // sitting on the horizon 1600 m out.
    flight.position.set(10, RUNWAY.elevation + 50, -700);
    flight.velocity.set(0, -1.8, 42);
    flight.throttle = 0.30;
    input.throttleTarget = 0.30;
    flight.quaternion.setFromEuler(new THREE.Euler(-0.0087, Math.PI, 0));
    return;
  }
  if (shotMode === 'landing') {
    cameraRig.mode = 'chase';
    startMission('valley-landing', 'approach');
    flight.position.set(10, RUNWAY.elevation + 50, -700);
    flight.velocity.set(0, -1.8, 42);
    flight.throttle = 0.30;
    input.throttleTarget = 0.30;
    flight.quaternion.setFromEuler(new THREE.Euler(-0.0087, Math.PI, 0));
    return;
  }
  if (shotMode === 'ring') {
    cameraRig.mode = 'chase';
    startMission('ring-run');
    // Park the plane 70 m south of the FIRST ring, lined up on it, so the
    // course is flown in order from the start.
    const ring = missions._rings[0];
    if (ring) {
      flight.position.set(ring.position.x, ring.position.y, ring.position.z + 70);
      flight.velocity.set(0, 0, -58);
      flight.quaternion.setFromEuler(new THREE.Euler(0, 0, 0));
    }
    return;
  }
  // cover (default): ring run, just south of the first ring, chase view,
  // the glowing ring ahead and the runway beyond it.
  cameraRig.mode = 'chase';
  startMission('ring-run');
  flight.position.set(40, RUNWAY.elevation + 190, 1480);
  flight.velocity.set(0, 0, -58);
}

// ---- Per-frame helpers ----
const _v = new THREE.Vector3();
const _prevPos = new THREE.Vector3();

function nextRingScreen() {
  const pos = missions.nextRingPosition();
  if (!pos || gameState === 'menu') return null;
  _v.copy(pos).project(camera);
  const w = window.innerWidth;
  const h = window.innerHeight;
  const behind = _v.z > 1;
  let x = (_v.x * 0.5 + 0.5) * w;
  let y = (-_v.y * 0.5 + 0.5) * h;
  const onScreen = !behind && x > 60 && x < w - 60 && y > 60 && y < h - 60;
  if (!onScreen) {
    // Clamp to the screen edge and point outward.
    const cx = w / 2;
    const cy = h / 2;
    const dx = behind ? -(x - cx) : x - cx;
    const dy = behind ? -(y - cy) : y - cy;
    const len = Math.hypot(dx, dy) || 1;
    const margin = 46;
    const scale = Math.min((w / 2 - margin) / Math.abs(dx || 1), (h / 2 - margin) / Math.abs(dy || 1), 1);
    x = cx + dx * scale * 0.9;
    y = cy + dy * scale * 0.9;
    const angle = Math.atan2(dy, dx);
    return { x, y, angle, onScreen: false, distance: Math.round(flight.position.distanceTo(pos)) };
  }
  return { x, y, angle: 0, onScreen: true, distance: Math.round(flight.position.distanceTo(pos)) };
}

function handleKeys() {
  if (input.consumePressed('KeyP')) {
    if (gameState === 'playing') {
      paused = true;
      gameState = 'paused';
      pauseEl.classList.remove('hidden');
    } else if (gameState === 'paused') {
      paused = false;
      gameState = 'playing';
      pauseEl.classList.add('hidden');
    }
  }
  if (input.consumePressed('KeyC')) {
    const mode = cameraRig.toggle();
    missions.showMessage(mode === 'cockpit' ? 'COCKPIT VIEW' : 'CHASE VIEW', 1.5);
  }
  if (input.consumePressed('KeyM')) {
    const muted = audio.toggleMute();
    missions.showMessage(muted ? 'SOUND OFF' : 'SOUND ON', 1.5);
  }
  if (input.consumePressed('KeyR')) {
    if (gameState === 'playing' || gameState === 'crashed' || gameState === 'paused') {
      const mode = missions.mode === 'menu' ? 'ring-run' : missions.mode;
      pauseEl.classList.add('hidden');
      startMission(mode);
    }
  }
  if (input.consumePressed('Escape')) {
    if (gameState !== 'menu') {
      resetFlight(flight, 'runway');
      showMenu();
    }
  }
  if (gameState === 'menu') {
    if (input.consumePressed('Digit1')) startMission('ring-run');
    if (input.consumePressed('Digit2')) startMission('valley-landing');
    if (input.consumePressed('Digit3')) startMission('free-flight');
  }
  if (gameState === 'crashed' && input.consumePressed('Enter')) {
    startMission(missions.mode === 'menu' ? 'ring-run' : missions.mode);
  }
}

// ---- Main loop ----
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastNow) / 1000, 0.05);
  lastNow = now;
  time += dt;

  input.update(dt);
  handleKeys();

  if (gameState === 'playing' && !paused) {
    _prevPos.copy(flight.position);
    const event = stepFlight(flight, input, dt, heightAt);
    missions.update(flight.position, _prevPos, dt, flight, audio);
    if (event && event.type === 'touchdown') {
      const onRunway = Math.abs(flight.position.x - RUNWAY.x) < RUNWAY.width / 2 + 8
        && Math.abs(flight.position.z - RUNWAY.z) < RUNWAY.length / 2 + 10;
      if (Math.abs(event.sink) > 6.5) {
        crash(`Impact at ${Math.abs(event.sink).toFixed(1)} m/s — the airframe broke up.`);
      } else if (!onRunway && Math.abs(event.sink) > 4.5) {
        flight.damage += FLIGHT.damageHardLanding;
        missions.showMessage(`Hard field landing — damage ${Math.round(flight.damage)}%`, 3);
        audio.thud(true);
        if (flight.damage >= 100) crash('The airframe broke up on impact.');
      } else {
        missions.onTouchdown(event.sink, event.speed, flight.position, flight, audio);
      }
    }
    if (flight.damage >= 100 && gameState === 'playing') {
      crash('The airframe gave out.');
    }
    if (flight.fuel <= 0 && flight.onGround && flight.airspeed < 1 && missions.mode === 'ring-run') {
      missions.showMessage('Out of fuel on the ground — press R to fly again.', 4);
    }
  }

  // Sync the visible plane with the flight model.
  plane.position.copy(flight.position);
  plane.quaternion.copy(flight.quaternion);
  animateAircraft(plane, flight.throttle, time);
  updateClouds(clouds, dt);

  // Keep the sun and its shadows centred on the plane.
  sun.position.copy(flight.position).addScaledVector(sunDirection, 900);
  sun.target.position.copy(flight.position);
  sun.target.updateMatrixWorld();

  if (gameState === 'menu') {
    // Slow orbit around the parked plane for the title screen.
    const a = time * 0.12;
    camera.position.set(
      flight.position.x + Math.sin(a) * 16,
      flight.position.y + 4.5,
      flight.position.z + Math.cos(a) * 16,
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(flight.position.x, flight.position.y + 1, flight.position.z);
    camera.fov = 55;
    camera.updateProjectionMatrix();
  } else {
    cameraRig.update(plane, dt, time);
  }

  // In the cockpit the frozen propeller blades read as black bars across
  // the windshield; the translucent disc alone suggests the spinning
  // propeller, so the blades are hidden in cockpit view only.
  const prop = plane.getObjectByName('propeller');
  if (prop) {
    const showBlades = cameraRig.mode !== 'cockpit' || gameState === 'menu';
    prop.children.forEach((child) => {
      if (child.name === 'prop-blade') child.visible = showBlades;
    });
  }

  renderer.render(scene, camera);

  // HUD attitude from the quaternion.
  const euler = new THREE.Euler().setFromQuaternion(flight.quaternion, 'YXZ');
  hud.draw({
    flight,
    mission: missions,
    pitchDeg: (euler.x * 180) / Math.PI,
    rollDeg: (euler.z * 180) / Math.PI,
    nextRingScreen: nextRingScreen(),
    airbrake: input.airbrake,
  });
  audio.update(flight.throttle, flight.airspeed, dt, flight.stalled);
  input.endFrame();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  hud.resize();
});

// Debug handle for play-testing: window.__kestrel exposes the live flight
// state, the plane and the camera so a test harness can read positions,
// check for console errors and take screenshots. It changes nothing in
// the game itself.
window.__kestrel = { flight, plane, camera, missions, cameraRig };

// Start: menu, or the requested screenshot state.
if (shotMode) {
  applyShotMode();
} else {
  resetFlight(flight, 'runway');
  showMenu();
}
menuTitle.textContent = 'KESTREL RIDGE';
requestAnimationFrame(frame);
