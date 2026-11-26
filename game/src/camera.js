// Kestrel Ridge — cameras: chase view and cockpit view.
// Chase: the camera trails behind and above the plane, smoothed so it
// never snaps, looking slightly ahead of the nose. Cockpit: fixed in the
// pilot's seat, looking out over the nose with the instrument panel drawn
// by the HUD. Switching is instant; the smoothing only ever follows.

import * as THREE from 'three';
import { CAMERA } from './config.js';
import { damp } from './noise.js';

export function createCameraRig(camera) {
  const rig = {
    mode: 'chase', // 'chase' | 'cockpit'
    chasePos: new THREE.Vector3(0, 200, -940),
    lookAt: new THREE.Vector3(0, 200, -800),
  };

  const _behind = new THREE.Vector3();
  const _forward = new THREE.Vector3();
  const _up = new THREE.Vector3();
  const _desired = new THREE.Vector3();
  const _target = new THREE.Vector3();

  rig.toggle = function toggle() {
    rig.mode = rig.mode === 'chase' ? 'cockpit' : 'chase';
    return rig.mode;
  };

  rig.update = function update(plane, dt, time) {
    _forward.set(0, 0, -1).applyQuaternion(plane.quaternion);
    _up.set(0, 1, 0).applyQuaternion(plane.quaternion);

    if (rig.mode === 'cockpit') {
      const off = CAMERA.cockpitOffset;
      _desired.copy(plane.position)
        .addScaledVector(_up, off.y)
        .addScaledVector(_forward, -off.z);
      // The cockpit camera is pinned to the seat every frame, never
      // smoothed: lerping from the chase position would swoop the view
      // through the wing and fuselage on every switch.
      camera.position.copy(_desired);
      // Look straight out of the windshield, with the plane's attitude.
      _target.copy(camera.position).addScaledVector(_forward, 60);
      // A whisper of head-bob from the engine at high throttle.
      camera.position.y += Math.sin(time * 29) * 0.006;
      camera.up.copy(_up);
      camera.lookAt(_target);
      camera.fov = 72;
    } else {
      // Chase: behind the plane along its forward axis, lifted a little,
      // with the camera level to the horizon (not rolled with the plane)
      // so steep banks stay readable.
      _behind.copy(plane.position)
        .addScaledVector(_forward, -CAMERA.chaseDistance)
        .addScaledVector(_up, CAMERA.chaseHeight);
      const lambda = CAMERA.chaseLag;
      rig.chasePos.x = damp(rig.chasePos.x, _behind.x, lambda, dt);
      rig.chasePos.y = damp(rig.chasePos.y, _behind.y, lambda, dt);
      rig.chasePos.z = damp(rig.chasePos.z, _behind.z, lambda, dt);
      camera.position.copy(rig.chasePos);
      _target.copy(plane.position).addScaledVector(_forward, 26);
      rig.lookAt.x = damp(rig.lookAt.x, _target.x, lambda * 1.4, dt);
      rig.lookAt.y = damp(rig.lookAt.y, _target.y, lambda * 1.4, dt);
      rig.lookAt.z = damp(rig.lookAt.z, _target.z, lambda * 1.4, dt);
      camera.up.set(0, 1, 0);
      camera.lookAt(rig.lookAt);
      camera.fov = 62;
    }
    camera.updateProjectionMatrix();
  };

  return rig;
}
