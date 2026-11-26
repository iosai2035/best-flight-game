// Kestrel Ridge — sky: gradient dome, sun, drifting clouds and fog.
// One coherent late-morning look: warm sun, pale-blue zenith fading to a
// hazy horizon, flat-shaded billow clouds that drift slowly down the valley.

import * as THREE from 'three';
import { WORLD_SEED, WORLD_SIZE, CLOUD_COUNT, SKY } from './config.js';
import { mulberry32 } from './noise.js';

export function buildSky(scene) {
  // Gradient dome: a big sphere whose shader blends horizon haze into
  // zenith blue. BackSide so we see it from inside.
  const skyGeo = new THREE.SphereGeometry(WORLD_SIZE * 1.6, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x3f7fd0) },
      horizonColor: { value: new THREE.Color(0xd8e8f2) },
      sunDirection: { value: new THREE.Vector3(0.4, 0.6, 0.5).normalize() },
      sunColor: { value: new THREE.Color(0xfff2cf) },
    },
    vertexShader: `
      varying vec3 vWorldDirection;
      void main() {
        vWorldDirection = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 sunDirection;
      uniform vec3 sunColor;
      varying vec3 vWorldDirection;
      void main() {
        float h = clamp(vWorldDirection.y, -0.08, 1.0);
        vec3 col = mix(horizonColor, topColor, pow(max(h, 0.0), 0.55));
        float sunAmount = pow(max(dot(normalize(vWorldDirection), normalize(sunDirection)), 0.0), 180.0);
        float halo = pow(max(dot(normalize(vWorldDirection), normalize(sunDirection)), 0.0), 8.0);
        col += sunColor * (sunAmount * 0.9 + halo * 0.12);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(skyGeo, skyMat);
  dome.name = 'sky-dome';
  scene.add(dome);

  // Sun: a directional light matched to the dome's sun direction, plus a
  // soft hemisphere light so shadowed slopes stay readable.
  const el = (SKY.sunElevation * Math.PI) / 180;
  const az = (SKY.sunAzimuth * Math.PI) / 180;
  const sunDir = new THREE.Vector3(
    Math.cos(el) * Math.sin(az),
    Math.sin(el),
    Math.cos(el) * Math.cos(az),
  );
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
  sun.position.copy(sunDir).multiplyScalar(900);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 2600;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfd9ee, 0x5a6b4a, 1.05));

  // Fog: pale blue haze that swallows the far ridges.
  scene.fog = new THREE.Fog(0xcfe0ec, SKY.fogNear, SKY.fogFar);

  return { sun, sunDirection: sunDir };
}

// Clouds: clusters of flattened white spheres, drifting slowly. Each
// cloud is one group so the whole puff moves as a unit.
export function buildClouds() {
  const group = new THREE.Group();
  group.name = 'clouds';
  const rand = mulberry32(WORLD_SEED + 777);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1, metalness: 0,
    transparent: true, opacity: 0.95, flatShading: true,
    emissive: 0xe8f0f5, emissiveIntensity: 0.55,
  });
  const puffGeo = new THREE.SphereGeometry(1, 10, 8);
  const clouds = [];
  for (let i = 0; i < CLOUD_COUNT; i++) {
    const cloud = new THREE.Group();
    const puffs = 4 + Math.floor(rand() * 4);
    for (let p = 0; p < puffs; p++) {
      const puff = new THREE.Mesh(puffGeo, mat);
      const s = 22 + rand() * 38;
      puff.scale.set(s, s * 0.38, s * 0.75);
      puff.position.set((rand() - 0.5) * 90, (rand() - 0.5) * 10, (rand() - 0.5) * 50);
      cloud.add(puff);
    }
    cloud.position.set(
      (rand() * 2 - 1) * (WORLD_SIZE * 0.55),
      420 + rand() * 260,
      (rand() * 2 - 1) * (WORLD_SIZE * 0.55),
    );
    cloud.userData.drift = 2.5 + rand() * 3.5;
    group.add(cloud);
    clouds.push(cloud);
  }
  return { group, clouds };
}

// Drift clouds down the valley and wrap them around when they leave.
export function updateClouds(clouds, dt) {
  for (const cloud of clouds) {
    cloud.position.x += cloud.userData.drift * dt;
    if (cloud.position.x > WORLD_SIZE * 0.6) cloud.position.x = -WORLD_SIZE * 0.6;
  }
}
