import * as THREE from "three";

export interface CurvedRoofOptions {
  width: number;
  depth: number;
  rise: number;
  eaveDrop?: number;
  segmentsX?: number;
  segmentsZ?: number;
  cornerLift?: number;
}

/** Builds a shallow, upturned temple roof surface with a stable +Y normal. */
export function createCurvedRoofGeometry(options: CurvedRoofOptions): THREE.BufferGeometry {
  const {
    width, depth, rise, eaveDrop = 0.18,
    segmentsX = 32, segmentsZ = 16, cornerLift = 0.65,
  } = options;
  const safeWidth = Math.max(0.1, Number.isFinite(width) ? width : 0.1);
  const safeDepth = Math.max(0.1, Number.isFinite(depth) ? depth : 0.1);
  const safeRise = Math.max(0, Number.isFinite(rise) ? rise : 0);
  const sx = Math.max(2, Math.floor(segmentsX));
  const sz = Math.max(2, Math.floor(segmentsZ));
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iz = 0; iz <= sz; iz += 1) {
    const v = iz / sz;
    const z = (v - 0.5) * safeDepth;
    for (let ix = 0; ix <= sx; ix += 1) {
      const u = ix / sx;
      const x = (u - 0.5) * safeWidth;
      const nx = Math.abs((u - 0.5) * 2);
      const nz = Math.abs((v - 0.5) * 2);
      const arch = safeRise * (1 - nx * nx);
      const liftedCorners = cornerLift * Math.pow(nx, 6) + cornerLift * 0.24 * Math.pow(nz, 6);
      const edgeFalloff = eaveDrop * Math.pow(Math.max(nx, nz), 3);
      positions.push(x, arch + liftedCorners - edgeFalloff, z);
      uvs.push(u * 4, v * 4);
    }
  }

  for (let iz = 0; iz < sz; iz += 1) {
    for (let ix = 0; ix < sx; ix += 1) {
      const a = iz * (sx + 1) + ix;
      const b = a + 1;
      const c = a + sx + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Deterministic low-frequency mountain mass with irregular ridgelines. */
export function createMountainGeometry(
  width: number,
  depth: number,
  height: number,
  seed: number,
  segments = 28,
): THREE.BufferGeometry {
  const sx = Math.max(4, Math.floor(segments));
  const sz = Math.max(4, Math.floor(segments));
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const hash = (x: number, z: number) => {
    const value = Math.sin((x + seed * 13.17) * 127.1 + (z - seed * 3.71) * 311.7) * 43758.5453;
    return (value - Math.floor(value)) * 2 - 1;
  };

  for (let iz = 0; iz <= sz; iz += 1) {
    const v = iz / sz;
    for (let ix = 0; ix <= sx; ix += 1) {
      const u = ix / sx;
      const nx = u * 2 - 1;
      const nz = v * 2 - 1;
      const radial = Math.max(0, 1 - Math.pow(nx * nx * 0.78 + nz * nz, 1.25));
      const ridges = 0.78 + 0.12 * hash(ix, iz) + 0.08 * Math.sin((nx + seed) * 5.2) * Math.cos((nz - seed) * 4.1);
      const y = Math.max(0, height * radial * ridges);
      positions.push((u - 0.5) * width, y, (v - 0.5) * depth);
      uvs.push(u * 3, v * 3);
    }
  }

  for (let iz = 0; iz < sz; iz += 1) {
    for (let ix = 0; ix < sx; ix += 1) {
      const a = iz * (sx + 1) + ix;
      const b = a + 1;
      const c = a + sx + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Small deterministic grayscale noise texture usable as both bump and roughness input. */
export function createSurfaceNoiseTexture(seed: number, size = 128): THREE.DataTexture {
  const dimension = Math.max(8, Math.floor(size));
  const data = new Uint8Array(dimension * dimension * 4);
  for (let y = 0; y < dimension; y += 1) {
    for (let x = 0; x < dimension; x += 1) {
      const wave = Math.sin((x + seed * 7) * 0.19) * Math.cos((y - seed * 11) * 0.17);
      const grain = Math.sin((x * 13.1 + y * 7.7 + seed * 19.3)) * 0.22;
      const value = Math.max(0, Math.min(255, Math.round(128 + wave * 24 + grain * 32)));
      const offset = (y * dimension + x) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, dimension, dimension, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}


/** One-batch meadow geometry: deterministic low-poly blades for browser-friendly grass patches. */
export function createGrassPatchGeometry(
  width: number,
  depth: number,
  count: number,
  seed: number,
): THREE.BufferGeometry {
  const bladeCount = Math.max(0, Math.floor(count));
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const random = (index: number, salt: number) => {
    const value = Math.sin((index + seed * 17.13) * 127.1 + salt * 311.7) * 43758.5453;
    return value - Math.floor(value);
  };

  for (let i = 0; i < bladeCount; i += 1) {
    const x = (random(i, 1) - 0.5) * width;
    const z = (random(i, 2) - 0.5) * depth;
    const angle = random(i, 3) * Math.PI * 2;
    const bladeWidth = 0.035 + random(i, 4) * 0.055;
    const bladeHeight = 0.22 + random(i, 5) * 0.48;
    const lean = (random(i, 6) - 0.5) * 0.18;
    const dx = Math.cos(angle) * bladeWidth;
    const dz = Math.sin(angle) * bladeWidth;
    const base = positions.length / 3;
    positions.push(
      x - dx, 0.015, z - dz,
      x + dx, 0.015, z + dz,
      x + lean, bladeHeight, z - lean * 0.45,
    );
    const green = 0.72 + random(i, 7) * 0.24;
    for (let vertex = 0; vertex < 3; vertex += 1) {
      colors.push(0.55 * green, 0.72 * green, 0.42 * green);
    }
    uvs.push(0, 0, 1, 0, 0.5, 1);
    indices.push(base, base + 1, base + 2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
