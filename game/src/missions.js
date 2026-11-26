// Kestrel Ridge — missions: ring courses, landing scoring, fuel, damage.
// Three ways to fly, each with its own goal and score:
//   Ring Run — fly a glowing course of rings down the valley against the
//     clock; every ring is points, every second under par is a bonus.
//   Valley Landing — take off, circle back and put the plane down on the
//     runway: touchdown speed, sink rate and centreline decide the score.
//   Free Flight — no clock, no course: explore, thread the fuel rings to
//     stay up, and chase a high score.
// Rings are torus meshes with a soft glow ring; the next ring pulses so
// the pilot always knows where to look. Fuel rings are gold and refill the
// tank. Damage comes from hard touchdowns and terrain strikes.

import * as THREE from 'three';
import { MISSIONS, SCORE, RUNWAY, FLIGHT } from './config.js';
import { heightAt, riverCentreX } from './terrain.js';
import { mulberry32 } from './noise.js';

export function createMissionManager(scene) {
  const manager = {
    mode: 'menu', // 'menu' | 'ring-run' | 'valley-landing' | 'free-flight'
    score: 0,
    ringsPassed: 0,
    ringsTotal: 0,
    nextRing: 0,
    timer: 0,
    running: false,
    finished: false,
    message: '',
    messageUntil: 0,
    landing: null, // last landing report
    best: { ringTime: null, landing: null },
    fuelRingsPassed: 0,
    _rings: [],
    _group: new THREE.Group(),
  };
  manager._group.name = 'mission-rings';
  scene.add(manager._group);

  try {
    manager.best.ringTime = Number(localStorage.getItem('kestrel-ridge.best-ring-time')) || null;
    manager.best.landing = Number(localStorage.getItem('kestrel-ridge.best-landing')) || null;
  } catch { /* localStorage may be unavailable; bests are a bonus */ }

  function clearRings() {
    for (const ring of manager._rings) {
      manager._group.remove(ring.mesh);
      ring.mesh.geometry.dispose();
    }
    manager._rings = [];
  }

  function makeRingMesh(position, radius, color) {
    const geo = new THREE.TorusGeometry(radius, 0.9, 12, 40);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    // Rings face along the valley (normal along Z) so the pilot flies through.
    mesh.rotation.y = 0;
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(radius + 2.2, 0.35, 8, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 }),
    );
    mesh.add(halo);
    // A small beacon light on top so rings read from far away.
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    beacon.position.set(0, radius + 1, 0);
    mesh.add(beacon);
    return mesh;
  }

  function ringCourse(count, kind) {
    // A course that snakes down the valley: rings alternate sides of the
    // river, rising and falling with the terrain so the pilot works the
    // stick the whole way down.
      const rand = mulberry32(20261126 + count * 13 + (kind === 'fuel' ? 7 : 0));
    const rings = [];
    // The course runs north (-Z): first ring just ahead of the airborne
    // start, each next ring 300 m further north down the valley.
    const startZ = 1350;
    for (let i = 0; i < count; i++) {
      const z = startZ - i * 300;
      const x = riverCentreX(z) + (rand() * 2 - 1) * 150;
      const ground = heightAt(x, z);
      const y = ground + 55 + rand() * 70;
      rings.push({ position: new THREE.Vector3(x, y, z), radius: MISSIONS.ringRun.ringRadius, kind });
    }
    return rings;
  }

  function buildRings(list) {
    clearRings();
    for (const spec of list) {
      const color = spec.kind === 'fuel' ? 0xffc21c : 0x27e0ff;
      const mesh = makeRingMesh(spec.position, spec.radius, color);
      manager._group.add(mesh);
      manager._rings.push({ ...spec, mesh, passed: false });
    }
    manager.ringsTotal = list.length;
    manager.nextRing = 0;
  }

  manager.start = function start(mode) {
    manager.mode = mode;
    manager.score = 0;
    manager.ringsPassed = 0;
    manager.fuelRingsPassed = 0;
    manager.timer = 0;
    manager.running = true;
    manager.finished = false;
    manager.landing = null;
    if (mode === 'ring-run') {
      buildRings(ringCourse(MISSIONS.ringRun.rings, 'ring'));
    } else if (mode === 'free-flight') {
      buildRings(ringCourse(6, 'fuel'));
    } else {
      clearRings();
      manager.ringsTotal = 0;
    }
    manager.showMessage(mode === 'ring-run' ? 'RING RUN — fly through all 9 rings!' : mode === 'valley-landing' ? 'VALLEY LANDING — land on the runway' : 'FREE FLIGHT — explore the valley', 4);
  };

  manager.showMessage = function showMessage(text, seconds = 3) {
    manager.message = text;
    manager.messageUntil = performance.now() / 1000 + seconds;
  };

  // A ring counts when the plane crosses its plane within its radius.
  manager.update = function update(planePos, prevPos, dt, flight, audio) {
    if (manager.running && !manager.finished) manager.timer += dt;
    const now = performance.now() / 1000;
    if (now > manager.messageUntil) manager.message = '';

    // Pulse the next ring so it draws the eye.
    for (let i = 0; i < manager._rings.length; i++) {
      const ring = manager._rings[i];
      const isNext = i === manager.nextRing && !ring.passed;
      const pulse = isNext ? 1 + Math.sin(now * 5) * 0.25 : 1;
      ring.mesh.scale.setScalar(pulse);
      ring.mesh.material.opacity = ring.passed ? 0.18 : isNext ? 1 : 0.55;
    }

    if (!manager.running || manager.finished) return;
    for (let i = 0; i < manager._rings.length; i++) {
      const ring = manager._rings[i];
      if (ring.passed) continue;
      // Crossed the ring's Z plane between the last frame and this one?
      const crossed = (prevPos.z - ring.position.z) * (planePos.z - ring.position.z) <= 0
        && Math.abs(planePos.z - ring.position.z) < 30;
      if (!crossed) continue;
      const dx = planePos.x - ring.position.x;
      const dy = planePos.y - ring.position.y;
      if (Math.hypot(dx, dy) > ring.radius) continue;
      ring.passed = true;
      if (ring.kind === 'fuel') {
        flight.fuel = Math.min(FLIGHT.fuelCapacity, flight.fuel + 35);
        manager.fuelRingsPassed++;
        manager.score += SCORE.fuelRing;
        manager.showMessage(`FUEL RING +35L  (+${SCORE.fuelRing})`, 2.5);
        audio.fuelChime();
      } else {
        manager.ringsPassed++;
        manager.score += SCORE.ring;
        manager.nextRing = i + 1;
        manager.showMessage(`RING ${manager.ringsPassed}/${manager.ringsTotal}  (+${SCORE.ring})`, 2);
        audio.ringChime();
      }
      if (manager.mode === 'ring-run' && manager.ringsPassed >= manager.ringsTotal) {
        manager.finishRingRun();
      }
    }

    // Fuel and damage warnings.
    if (flight.fuel < 15 && !manager._lowFuelWarned) {
      manager._lowFuelWarned = true;
      manager.showMessage('LOW FUEL — land or find a gold fuel ring!', 4);
      audio.warning();
    }
    if (flight.fuel > 25) manager._lowFuelWarned = false;
    if (flight.fuel <= 0 && !manager.finished) {
      manager.showMessage('OUT OF FUEL — glide to the runway!', 4);
    }
  };

  manager.finishRingRun = function finishRingRun() {
    manager.finished = true;
    manager.running = false;
    const par = MISSIONS.ringRun.parTime;
    const bonus = Math.max(0, Math.round((par - manager.timer) * SCORE.timeBonusPerSecond));
    manager.score += bonus;
    const medal = manager.timer <= SCORE.goldTime ? 'GOLD' : manager.timer <= SCORE.silverTime ? 'SILVER' : 'BRONZE';
    manager.showMessage(`COURSE COMPLETE — ${medal}! Time ${manager.timer.toFixed(1)}s, bonus +${bonus}`, 6);
    if (!manager.best.ringTime || manager.timer < manager.best.ringTime) {
      manager.best.ringTime = manager.timer;
      try { localStorage.setItem('kestrel-ridge.best-ring-time', String(manager.timer)); } catch { /* ignore */ }
    }
  };

  // Called by main.js on a touchdown event. Scores the landing and
  // reports damage for a hard arrival.
  manager.onTouchdown = function onTouchdown(sink, speed, planePos, flight, audio) {
    const onRunway = Math.abs(planePos.x - RUNWAY.x) < RUNWAY.width / 2 + 8
      && Math.abs(planePos.z - RUNWAY.z) < RUNWAY.length / 2 + 10;
    const sinkAbs = Math.abs(sink);
    const hard = sinkAbs > MISSIONS.landing.sinkMax;
    if (hard) {
      flight.damage += FLIGHT.damageHardLanding;
      manager.showMessage(`HARD LANDING! Sink ${sinkAbs.toFixed(1)} m/s — damage ${Math.round(flight.damage)}%`, 4);
      audio.thud(true);
      if (flight.damage >= 100) manager.crash('The airframe broke up on impact.');
      return { onRunway, hard, scored: false };
    }
    audio.thud(false);
    if (!onRunway) {
      manager.showMessage('Touchdown off the runway — no score. Try the strip!', 3);
      return { onRunway, hard, scored: false };
    }
    // Score: centreline, sink rate and speed each contribute.
    const centreErr = Math.abs(planePos.x - RUNWAY.x);
    const centreScore = Math.max(0, 1 - centreErr / MISSIONS.landing.centrelineMax);
    const sinkScore = Math.max(0, 1 - Math.max(0, sinkAbs - MISSIONS.landing.sinkIdeal) / (MISSIONS.landing.sinkMax - MISSIONS.landing.sinkIdeal));
    const speedScore = speed <= MISSIONS.landing.touchdownSpeedMax
      ? Math.max(0, 1 - Math.abs(speed - MISSIONS.landing.touchdownSpeedIdeal) / 22) : 0;
    const quality = (centreScore * 0.4 + sinkScore * 0.4 + speedScore * 0.2);
    const points = Math.round(SCORE.landingBase * quality + (quality > 0.9 ? SCORE.perfectLandingBonus : 0));
    manager.score += points;
    manager.landing = { points, quality, centreErr, sink: sinkAbs, speed };
    const verdict = quality > 0.9 ? 'PERFECT LANDING!' : quality > 0.65 ? 'GOOD LANDING' : 'LANDING — ROUGH BUT DOWN';
    manager.showMessage(`${verdict} +${points}  (centre ${centreErr.toFixed(0)}m, sink ${sinkAbs.toFixed(1)} m/s)`, 5);
    flight.fuel = FLIGHT.fuelCapacity; // refuel on the strip
    if (manager.mode === 'valley-landing' && !manager.finished) {
      manager.finished = true;
      manager.running = false;
      if (!manager.best.landing || points > manager.best.landing) {
        manager.best.landing = points;
        try { localStorage.setItem('kestrel-ridge.best-landing', String(points)); } catch { /* ignore */ }
      }
    }
    return { onRunway, hard, scored: true, points, quality };
  };

  manager.crash = function crash(reason) {
    manager.finished = true;
    manager.running = false;
    manager.showMessage(`CRASHED — ${reason} Press R to fly again.`, 8);
  };

  manager.nextRingPosition = function nextRingPosition() {
    const ring = manager._rings[manager.nextRing];
    return ring && !ring.passed ? ring.position : null;
  };

  return manager;
}
