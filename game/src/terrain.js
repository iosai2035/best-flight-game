// Kestrel Ridge — the valley: seeded height field, terrain mesh, river,
// runway flattening, trees and rocks.
// The valley runs along the Z axis. Mountains rise on both sides, a river
// winds down the valley floor, and a grass airfield sits on a flattened
// shelf near the valley's south end. Everything is a pure function of the
// world seed, so heightAt(x, z) is identical for the renderer, the flight
// model (terrain collision) and the landing logic.

import * as THREE from 'three';
import { WORLD_SEED, WORLD_SIZE, WORLD_HALF, TERRAIN_SEGMENTS, VALLEY_WIDTH, RIVER_WIDTH, RUNWAY, TREE_COUNT, ROCK_COUNT } from './config.js';
import { mulberry32, fbm, ridgedNoise, warpedFbm, valueNoise2D, billowNoise, clamp, lerp } from './noise.js';

// ---- Height field ----
// Valley profile: how much of the mountain height survives at |x|.
// 0 on the valley floor, 1 on the high ridges, smooth in between.
export function valleyProfile(x) {
  const ax = Math.abs(x);
  const t = clamp((ax - VALLEY_WIDTH * 0.55) / (VALLEY_WIDTH * 1.9), 0, 1);
  return t * t * (3 - 2 * t);
}

// The river meanders: its centreline drifts east and west as it runs north.
export function riverCentreX(z) {
  return 170 * Math.sin(z * 0.0011 + 0.6) + 60 * Math.sin(z * 0.0031 + 2.1);
}

// Runway mask: 1 on the flattened airfield shelf, fading out around it.
function runwayMask(x, z) {
  const dx = Math.abs(x - RUNWAY.x);
  const dz = Math.abs(z - RUNWAY.z);
  const ex = clamp(1 - (dx - RUNWAY.width * 1.6) / 90, 0, 1);
  const ez = clamp(1 - (dz - RUNWAY.length * 0.62) / 110, 0, 1);
  return clamp(ex * ez, 0, 1);
}

export function heightAt(x, z) {
  // Base rolling hills, domain-warped so the ridges curve naturally.
  const hills = warpedFbm(x, z, WORLD_SEED, 5) * 95;
  // Sharp ridged mountains, strongest away from the valley.
  const ridge = ridgedNoise(x * 0.0016, z * 0.0016, WORLD_SEED + 500, 4);
  const mountains = Math.pow(ridge, 2.2) * 420;
  const profile = valleyProfile(x);
  let h = 40 + hills * (0.25 + 0.75 * profile) + mountains * profile;
  // A second, taller range far to the east and west frames the horizon.
  const edge = clamp((Math.abs(x) - 1500) / 600, 0, 1);
  h += edge * edge * 260 * (0.5 + 0.5 * ridgedNoise(x * 0.001, z * 0.001, WORLD_SEED + 900, 3));
  // Carve the river valley into the valley floor.
  const riverDist = Math.abs(x - riverCentreX(z));
  const riverCarve = clamp(1 - riverDist / (RIVER_WIDTH * 2.2), 0, 1);
  h -= riverCarve * riverCarve * 14;
  // Flatten the airfield shelf so the runway sits on level ground.
  const mask = runwayMask(x, z);
  h = lerp(h, RUNWAY.elevation, mask);
  // Gentle bowl at the world edge so the horizon never shows a cliff edge.
  const rim = clamp((Math.max(Math.abs(x), Math.abs(z)) - WORLD_HALF + 260) / 260, 0, 1);
  h = lerp(h, 120 + rim * 80, rim * rim);
  return h;
}

export function groundHeight(x, z) {
  return heightAt(x, z);
}

// Slope estimate by central differences — used for tree placement and
// for colouring steep rock faces.
export function slopeAt(x, z) {
  const e = 3;
  const dx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
  const dz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  return Math.hypot(dx, dz);
}

// ---- Mesh ----
function colourForHeight(h, slope, x, z, out) {
  // Palette: valley grass, dry grass, rock, snow. Slope pushes rock.
  // A little low-frequency noise breaks up the flat colour fields, and a
  // touch of billow noise mottles the meadows like patchy grass.
  const variation = valueNoise2D(x * 0.02, z * 0.02, WORLD_SEED + 31) * 0.05
    + (billowNoise(x * 0.008, z * 0.008, WORLD_SEED + 47, 3) - 0.5) * 0.07;
  const rockiness = clamp((slope - 0.45) / 0.55, 0, 1);
  if (h > 300) {
    // Snow caps, blending down into grey rock.
    const t = clamp((h - 300) / 90, 0, 1);
    out.setRGB(lerp(0.62, 0.93, t), lerp(0.60, 0.93, t), lerp(0.60, 0.96, t));
  } else if (h > 150) {
    out.setRGB(0.40, 0.44, 0.28); // high meadow
  } else if (h > 48) {
    out.setRGB(0.29, 0.47, 0.20); // valley grass
  } else {
    out.setRGB(0.46, 0.47, 0.28); // dry grass by the river
  }
  out.r += variation;
  out.g += variation;
  out.b += variation * 0.5;
  if (rockiness > 0) {
    out.r = lerp(out.r, 0.45, rockiness * 0.8);
    out.g = lerp(out.g, 0.42, rockiness * 0.8);
    out.b = lerp(out.b, 0.40, rockiness * 0.8);
  }
  return out;
}

export function buildTerrainMesh() {
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colours = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    colourForHeight(h, slopeAt(x, z), x, z, c);
    colours[i * 3] = c.r;
    colours[i * 3 + 1] = c.g;
    colours[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

// ---- River ----
export function buildRiver() {
  // A ribbon of flat blue quads following the river centreline.
  const segments = 120;
  const positions = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const z = -WORLD_HALF + (i / segments) * WORLD_SIZE;
    const cx = riverCentreX(z);
    const y = heightAt(cx, z) + 2.2;
    positions.push(cx - RIVER_WIDTH / 2, y, z, cx + RIVER_WIDTH / 2, y, z);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x2f7fa8, roughness: 0.15, metalness: 0.25,
    transparent: true, opacity: 0.88,
  });
  return new THREE.Mesh(geo, mat);
}

// ---- Runway ----
export function buildRunway() {
  const group = new THREE.Group();
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(RUNWAY.width, RUNWAY.length),
    new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.9 }),
  );
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(RUNWAY.x, RUNWAY.elevation + 0.35, RUNWAY.z);
  strip.receiveShadow = true;
  group.add(strip);
  // Centreline dashes and threshold bars, as thin white boxes.
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf2f2e8 });
  for (let z = RUNWAY.z - RUNWAY.length / 2 + 40; z < RUNWAY.z + RUNWAY.length / 2 - 20; z += 46) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 18), dashMat);
    dash.position.set(RUNWAY.x, RUNWAY.elevation + 0.45, z);
    group.add(dash);
  }
  for (const end of [-1, 1]) {
    for (let k = -2; k <= 2; k++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.1, 10), dashMat);
      bar.position.set(RUNWAY.x + k * 6, RUNWAY.elevation + 0.45, RUNWAY.z + end * (RUNWAY.length / 2 - 14));
      group.add(bar);
    }
  }
  // Windsock and two low hangars beside the strip.
  const sock = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 8), new THREE.MeshStandardMaterial({ color: 0xd8d8d8 }));
  pole.position.y = 3.5;
  sock.add(pole);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.9, 3.4, 10, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xff7a1a, side: THREE.DoubleSide }),
  );
  cone.rotation.z = Math.PI / 2;
  cone.position.set(1.9, 6.6, 0);
  sock.add(cone);
  sock.position.set(RUNWAY.x + 42, RUNWAY.elevation, RUNWAY.z - 120);
  group.add(sock);
  const hangarMat = new THREE.MeshStandardMaterial({ color: 0x8a6f4d, roughness: 0.85 });
  for (const dz of [-190, 150]) {
    const hangar = new THREE.Mesh(new THREE.BoxGeometry(26, 9, 20), hangarMat);
    hangar.position.set(RUNWAY.x - 52, RUNWAY.elevation + 4.5, RUNWAY.z + dz);
    hangar.castShadow = true;
    group.add(hangar);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 26, 12, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x5d6b73, roughness: 0.6 }));
    roof.rotation.z = Math.PI / 2;
    roof.rotation.y = Math.PI / 2;
    roof.position.set(RUNWAY.x - 52, RUNWAY.elevation + 9, RUNWAY.z + dz);
    group.add(roof);
  }
  return group;
}

// ---- Trees and rocks (instanced, seeded) ----
export function buildVegetation() {
  const group = new THREE.Group();
  const rand = mulberry32(WORLD_SEED + 42);
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 4.5, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3d24, roughness: 1 });
  const coneGeo = new THREE.ConeGeometry(3.2, 11, 7);
  const coneMat = new THREE.MeshStandardMaterial({ color: 0x35702e, roughness: 0.95 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, TREE_COUNT);
  const crowns = new THREE.InstancedMesh(coneGeo, coneMat, TREE_COUNT);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  let placed = 0;
  let guard = 0;
  while (placed < TREE_COUNT && guard++ < TREE_COUNT * 40) {
    const x = (rand() * 2 - 1) * (WORLD_HALF - 120);
    const z = (rand() * 2 - 1) * (WORLD_HALF - 120);
    if (Math.abs(x - RUNWAY.x) < 70 && Math.abs(z - RUNWAY.z) < RUNWAY.length * 0.7) continue;
    if (Math.abs(x - riverCentreX(z)) < RIVER_WIDTH) continue;
    const h = heightAt(x, z);
    if (h > 190 || slopeAt(x, z) > 0.75) continue;
    const scale = 0.8 + rand() * 0.9;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
    m.compose(new THREE.Vector3(x, h + 2.2 * scale, z), q, new THREE.Vector3(scale, scale, scale));
    trunks.setMatrixAt(placed, m);
    m.compose(new THREE.Vector3(x, h + (4.5 + 4.5) * scale, z), q, new THREE.Vector3(scale, scale, scale));
    crowns.setMatrixAt(placed, m);
    placed++;
  }
  trunks.count = placed;
  crowns.count = placed;
  trunks.castShadow = true;
  crowns.castShadow = true;
  group.add(trunks, crowns);

  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6d6a63, roughness: 1, flatShading: true });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, ROCK_COUNT);
  for (let i = 0; i < ROCK_COUNT; i++) {
    const x = (rand() * 2 - 1) * (WORLD_HALF - 100);
    const z = (rand() * 2 - 1) * (WORLD_HALF - 100);
    const h = heightAt(x, z);
    const scale = 1.5 + rand() * 5;
    q.setFromEuler(new THREE.Euler(rand() * 3, rand() * 3, rand() * 3));
    m.compose(new THREE.Vector3(x, h + scale * 0.3, z), q, new THREE.Vector3(scale, scale * 0.7, scale));
    rocks.setMatrixAt(i, m);
  }
  rocks.castShadow = true;
  group.add(rocks);
  return group;
}
