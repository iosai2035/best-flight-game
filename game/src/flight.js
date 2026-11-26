// Kestrel Ridge — flight model: thrust, lift, drag, gravity and stall.
// A simplified but honest model, stepped in small sub-steps so it stays
// stable at any frame rate. Controls rotate the aircraft at rates scaled
// by airspeed (a parked plane cannot pitch), forces act every sub-step,
// and the wing stalls past ~19 degrees of angle of attack: lift collapses
// and the nose drops until the pilot recovers speed.
//
// Conventions: the plane's nose points along its local -Z. Forward,
// up and right are taken from the aircraft quaternion each step.

import * as THREE from 'three';
import { FLIGHT, RUNWAY } from './config.js';
import { clamp, damp } from './noise.js';

const AIR_DENSITY = 1.12; // kg/m^3 at valley altitude
const SUBSTEP = 1 / 120; // physics sub-step, seconds

export function createFlightState() {
  return {
    position: new THREE.Vector3(0, RUNWAY.elevation + 260, 1500),
    velocity: new THREE.Vector3(0, 0, -58),
    quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)),
    throttle: 0.62,
    fuel: FLIGHT.fuelCapacity,
    damage: 0,
    onGround: false,
    airspeed: 58,
    angleOfAttack: 0,
    verticalSpeed: 0,
    stalled: false,
    gearHeight: 1.35,
    heading: 0,
  };
}

// Reset to a fresh start: on the runway threshold, lined up for takeoff,
// or airborne at a given spot for the screenshot states.
export function resetFlight(state, mode = 'runway') {
  if (mode === 'airborne') {
    // North is -Z: the nose points -Z, so velocity must too, or the plane
    // flies backwards and the wing stalls on the spot.
    state.position.set(0, RUNWAY.elevation + 260, 1500);
    state.velocity.set(0, 0, -58);
    state.quaternion.setFromEuler(new THREE.Euler(0, 0, 0));
    state.throttle = 0.62;
  } else if (mode === 'approach') {
    // Final approach from the north, flying south (+Z) onto the runway:
    // yawed 180 degrees so the nose points along the velocity. A gentle
    // power-on glide — 70 m up, 1600 m out, 42 m/s, throttle 30%, nose
    // half a degree up — that meets the runway near its centre with
    // about 1.6 m/s of sink and 46 m/s over the threshold, hands off.
    // The pilot flares from there for a softer, slower touchdown.
    // (Euler XYZ applies X after the Y flip, so with yaw PI a NEGATIVE
    // X rotation is nose-up in world terms.)
    state.position.set(18, RUNWAY.elevation + 70, -1600);
    state.velocity.set(0, -1.8, 42);
    state.quaternion.setFromEuler(new THREE.Euler(-0.0087, Math.PI, 0));
    state.throttle = 0.30;
  } else {
    state.position.set(0, RUNWAY.elevation + 1.35, RUNWAY.z - RUNWAY.length / 2 + 60);
    state.velocity.set(0, 0, 0);
    state.quaternion.setFromEuler(new THREE.Euler(0, 0, 0));
    state.throttle = 0;
  }
  state.fuel = FLIGHT.fuelCapacity;
  state.damage = 0;
  state.onGround = mode === 'runway';
  state.stalled = false;
  state.airspeed = state.velocity.length();
}

const _forward = new THREE.Vector3();
const _up = new THREE.Vector3();
const _right = new THREE.Vector3();
const _liftDir = new THREE.Vector3();
const _force = new THREE.Vector3();
const _accel = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _euler = new THREE.Euler();

function liftCoefficient(aoaDeg, stalled) {
  if (stalled) return 0.32;
  // The wing is rigged with 4 degrees of incidence, so it still lifts
  // when the fuselage is level: without it the plane would sink forever
  // in what looks like level flight.
  const cl = FLIGHT.liftSlope * (aoaDeg + 4);
  return clamp(cl, -0.4, FLIGHT.liftMax);
}

function stepOnce(state, input, dt, groundHeight) {
  _forward.set(0, 0, -1).applyQuaternion(state.quaternion);
  _up.set(0, 1, 0).applyQuaternion(state.quaternion);
  _right.set(1, 0, 0).applyQuaternion(state.quaternion);

  const speed = state.velocity.length();
  const controlAuthority = clamp((speed - 6) / 34, 0, 1); // no control parked
  const groundSteer = state.onGround ? 1 : 0;

  // --- Rotation from the controls ---
  // Roll and pitch are scaled by airspeed; yaw is rudder plus a touch of
  // coordinated turn (banking yaws the nose into the turn).
  const rollRate = -input.roll * FLIGHT.rollRate * (0.25 + 0.75 * controlAuthority);
  const pitchRate = input.pitch * FLIGHT.pitchRate * (0.25 + 0.75 * controlAuthority);
  const yawRate = -input.yaw * FLIGHT.yawRate * (0.3 + 0.7 * controlAuthority)
    - input.roll * 0.22 * controlAuthority;
  _euler.set(pitchRate * dt, yawRate * dt, rollRate * dt, 'XYZ');
  _q.setFromEuler(_euler);
  state.quaternion.multiply(_q).normalize();

  // Re-read axes after the rotation.
  _forward.set(0, 0, -1).applyQuaternion(state.quaternion);
  _up.set(0, 1, 0).applyQuaternion(state.quaternion);
  _right.set(1, 0, 0).applyQuaternion(state.quaternion);

  // --- Angle of attack: angle between velocity and the nose ---
  let aoaDeg = 0;
  if (speed > 1) {
    const cosA = clamp(state.velocity.clone().normalize().dot(_forward), -1, 1);
    aoaDeg = (Math.acos(cosA) * 180) / Math.PI;
    // Sign: positive when the nose is above the flight path.
    const velUp = state.velocity.y / speed;
    const noseUp = _forward.y;
    if (noseUp < velUp) aoaDeg = -aoaDeg;
  }
  state.stalled = speed > 12 && Math.abs(aoaDeg) > FLIGHT.stallAoA;

  // --- Forces ---
  _force.set(0, 0, 0);
  const q = 0.5 * AIR_DENSITY * speed * speed; // dynamic pressure
  // Thrust along the nose.
  _force.addScaledVector(_forward, FLIGHT.maxThrust * state.throttle);
  // Lift: perpendicular to the flight path, in the plane's up direction.
  // Bank the wing and the lift vector tilts — that is what turns the plane.
  if (speed > 1) {
    const velDir = state.velocity.clone().normalize();
    _liftDir.copy(_up).addScaledVector(velDir, -_up.dot(velDir)).normalize();
    const cl = liftCoefficient(aoaDeg, state.stalled);
    _force.addScaledVector(_liftDir, q * FLIGHT.wingArea * cl);
    // Drag opposes motion, growing with the square of speed and with lift.
    // The airbrake adds a flat drag penalty on top.
    const cd = FLIGHT.dragBase + FLIGHT.dragInduced * cl * cl + (state._airbrake ? 0.09 : 0);
    _force.addScaledVector(velDir, -q * FLIGHT.wingArea * cd);
  }
  // Gravity.
  _force.y -= FLIGHT.mass * FLIGHT.gravity;

  _accel.copy(_force).divideScalar(FLIGHT.mass);
  state.velocity.addScaledVector(_accel, dt);

  // Yaw stability only: gently swing the nose's heading toward the
  // velocity's heading, so the plane flies coordinated instead of sliding
  // sideways. Pitch is the pilot's business, and the tail's trim holds it:
  // with the nose held, the flight path settles where lift balances
  // weight, so a trimmed approach holds its glide instead of steepening
  // into the ground. (Aligning the nose to the velocity in pitch would
  // do the opposite: it would eat the angle of attack and let the sink
  // rate run away.)
  if (speed > 15 && !state.onGround) {
    const noseHeading = Math.atan2(-_forward.x, -_forward.z);
    const pathHeading = Math.atan2(-state.velocity.x, -state.velocity.z);
    let diff = pathHeading - noseHeading;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    const yawAdjust = clamp(diff * 0.5 * dt, -0.02, 0.02);
    if (Math.abs(yawAdjust) > 1e-6) {
      _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawAdjust);
      state.quaternion.premultiply(_q).normalize();
    }
  }

  // Stall break: the nose drops and the wing buffets until speed returns.
  if (state.stalled) {
    _euler.set(-0.9 * dt, 0, 0, 'XYZ');
    _q.setFromEuler(_euler);
    state.quaternion.multiply(_q).normalize();
  }

  // --- Integrate position ---
  state.position.addScaledVector(state.velocity, dt);

  // --- Ground contact ---
  const ground = groundHeight(state.position.x, state.position.z) + state.gearHeight;
  if (state.position.y <= ground) {
    state.position.y = ground;
    const sink = state.velocity.y;
    if (!state.onGround) {
      // First touch: report the touchdown through the returned event.
      state._touchdownSink = sink;
      state._touchdownSpeed = speed;
    }
    state.onGround = true;
    if (state.velocity.y < 0) state.velocity.y = 0;
    // Rolling resistance: a roughly constant drag on the wheels, not a
    // percentage of speed — a percentage would cap the takeoff roll at a
    // crawl and the plane would never reach rotation speed.
    const rollingSpeed = Math.hypot(state.velocity.x, state.velocity.z);
    if (rollingSpeed > 0.05) {
      const decel = Math.min(rollingSpeed, (0.9 + 0.03 * rollingSpeed) * dt);
      const scale = (rollingSpeed - decel) / rollingSpeed;
      state.velocity.x *= scale;
      state.velocity.z *= scale;
    }
    if (speed > 2 && groundSteer) {
      _euler.set(0, -input.yaw * 0.9 * dt, 0, 'XYZ');
      _q.setFromEuler(_euler);
      state.quaternion.multiply(_q).normalize();
    }
    // Keep the wings level-ish while taxiing.
    const e = new THREE.Euler().setFromQuaternion(state.quaternion, 'YXZ');
    e.x = damp(e.x, 0, 4, dt);
    e.z = damp(e.z, 0, 4, dt);
    state.quaternion.setFromEuler(e);
  } else {
    state.onGround = false;
  }

  // --- Fuel ---
  const burn = FLIGHT.fuelBurnIdle + (FLIGHT.fuelBurn - FLIGHT.fuelBurnIdle) * state.throttle;
  state.fuel = Math.max(0, state.fuel - burn * dt);
  if (state.fuel <= 0 && state.throttle > 0) state.throttle = 0;

  state.airspeed = state.velocity.length();
  state.angleOfAttack = aoaDeg;
  state.verticalSpeed = state.velocity.y;
  // Heading in degrees, 0 = north (-Z), clockwise.
  state.heading = (Math.atan2(-_forward.x, -_forward.z) * 180) / Math.PI;
  if (state.heading < 0) state.heading += 360;
}

// Public step: throttle smoothing, sub-stepping, touchdown event.
export function stepFlight(state, input, dt, groundHeight) {
  dt = Math.min(dt, 0.05);
  // Airbrake: throttle to idle at once and let the extra drag in stepOnce
  // bleed the speed. The lever itself is untouched, so releasing Space
  // brings the power straight back.
  const targetThrottle = input.airbrake ? 0 : clamp(input.throttleTarget, 0, 1);
  const throttleLambda = input.airbrake ? 6 : 1.6;
  state.throttle = damp(state.throttle, targetThrottle, throttleLambda, dt);
  state._airbrake = !!input.airbrake;
  state._touchdownSink = null;
  let steps = Math.max(1, Math.ceil(dt / SUBSTEP));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) stepOnce(state, input, h, groundHeight);
  // Report the first touch, however gentle: a soft touchdown still
  // counts as a landing (the scorer reads the sink rate), and swallowing
  // it would leave a greased landing unscored.
  if (state._touchdownSink !== null) {
    const sink = state._touchdownSink;
    const speed = state._touchdownSpeed;
    state._touchdownSink = null;
    return { type: 'touchdown', sink, speed };
  }
  return null;
}
