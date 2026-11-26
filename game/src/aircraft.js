// Kestrel Ridge — the aircraft: a light bush plane built up from primitives.
// Cream fuselage, red trim, high wing with struts, tailplane, fixed gear
// and a spinning propeller. No imported model: every part is a three.js
// mesh positioned by hand, so the plane reads as built, not borrowed.

import * as THREE from 'three';

export function buildAircraft() {
  const plane = new THREE.Group();
  plane.name = 'kestrel';

  const cream = new THREE.MeshStandardMaterial({ color: 0xf3ead2, roughness: 0.45, metalness: 0.15 });
  const red = new THREE.MeshStandardMaterial({ color: 0xb3271e, roughness: 0.5, metalness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.6, metalness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fd4e8, roughness: 0.12, metalness: 0.4, transparent: true, opacity: 0.35 });
  const aluminium = new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: 0.35, metalness: 0.7 });

  // Fuselage: a tapered cylinder along Z, nose forward (-Z is forward here
  // because three.js cameras look down -Z; the flight model keeps the
  // plane's nose on -Z and rotates the whole group).
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.78, 5.6, 14), cream);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.set(0, 0, 0.4);
  fuselage.castShadow = true;
  plane.add(fuselage);

  // Nose cowling and spinner.
  const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.52, 1.1, 14), red);
  cowl.rotation.x = Math.PI / 2;
  cowl.position.set(0, 0, -2.75);
  cowl.castShadow = true;
  plane.add(cowl);
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 12), aluminium);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.set(0, 0, -3.55);
  plane.add(spinner);

  // Propeller: two blades on a hub, spun by the flight loop.
  const prop = new THREE.Group();
  prop.position.set(0, 0, -3.7);
  const bladeGeo = new THREE.BoxGeometry(0.16, 2.6, 0.07);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.4 });
  for (const angle of [0, Math.PI]) {
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.name = 'prop-blade';
    blade.rotation.z = angle;
    blade.position.y = 0;
    prop.add(blade);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 10), aluminium);
  hub.rotation.x = Math.PI / 2;
  prop.add(hub);
  // A faint disc suggests the blur of the spinning propeller, so a frozen
  // frame never shows a single black bar across the cockpit view.
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.35, 24),
    new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.10, side: THREE.DoubleSide, depthWrite: false }),
  );
  disc.name = 'prop-disc';
  prop.add(disc);
  prop.name = 'propeller';
  plane.add(prop);

  // Windshield and side windows.
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.62, 0.9), glass);
  windshield.position.set(0, 0.52, -1.55);
  windshield.rotation.x = -0.28;
  plane.add(windshield);
  for (const side of [-1, 1]) {
    const window = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 1.1), glass);
    window.position.set(side * 0.62, 0.42, -0.55);
    plane.add(window);
  }

  // High wing with a red tip stripe on each side, plus lift struts.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.16, 1.7), cream);
  wing.position.set(0, 0.78, -0.35);
  wing.castShadow = true;
  plane.add(wing);
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 1.72), red);
    tip.position.set(side * 4.45, 0.78, -0.35);
    plane.add(tip);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 6), aluminium);
    strut.position.set(side * 1.5, -0.05, -0.35);
    strut.rotation.z = side * 0.5;
    plane.add(strut);
  }

  // Tail: horizontal stabiliser, red fin, rudder.
  const tailplane = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 1.1), cream);
  tailplane.position.set(0, 0.18, 3.05);
  tailplane.castShadow = true;
  plane.add(tailplane);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.5, 1.4), red);
  fin.position.set(0, 0.85, 3.0);
  fin.rotation.x = 0.12;
  plane.add(fin);

  // Fixed landing gear: two wheels and a tail wheel.
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 6), dark);
    leg.position.set(side * 0.72, -0.85, -0.6);
    leg.rotation.z = side * 0.25;
    plane.add(leg);
    const wheel = new THREE.Mesh(wheelGeo, dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 0.95, -1.3, -0.6);
    wheel.castShadow = true;
    plane.add(wheel);
  }
  const tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 10), dark);
  tailWheel.rotation.z = Math.PI / 2;
  tailWheel.position.set(0, -0.72, 3.3);
  plane.add(tailWheel);

  // Navigation lights: red port, green starboard, white tail.
  const lightGeo = new THREE.SphereGeometry(0.09, 8, 8);
  const portLight = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0xff2211 }));
  portLight.position.set(-4.8, 0.78, -0.35);
  const starboardLight = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0x22ff66 }));
  starboardLight.position.set(4.8, 0.78, -0.35);
  const tailLight = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  tailLight.position.set(0, 0.18, 3.62);
  plane.add(portLight, starboardLight, tailLight);

  return plane;
}

// Spin the propeller and give the plane a faint engine shudder. Called
// every frame with the current throttle (0..1) and elapsed seconds.
export function animateAircraft(plane, throttle, time) {
  const prop = plane.getObjectByName('propeller');
  if (prop) prop.rotation.z -= (6 + throttle * 55) * 0.016;
  plane.position.y += Math.sin(time * 31) * 0.004 * throttle;
}
