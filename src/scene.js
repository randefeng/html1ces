import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const PALETTES = {
  day: { background: '#eeeee2', fog: '#eeeee2', light: '#fff2d6', ambient: '#e1ead8', intensity: 3.2 },
  dusk: { background: '#e9d8cc', fog: '#e9d8cc', light: '#ffb974', ambient: '#d0bcda', intensity: 2.4 },
  night: { background: '#1f3038', fog: '#1f3038', light: '#a4c4ec', ambient: '#839aa6', intensity: 1.3 },
};

export function createTempleScene(container, { onInteract, onReady, onError }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (error) {
    onError(error);
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', '可拖动旋转的三维山寺场景，点击香炉上香，点击钟楼敲钟');
  renderer.domElement.setAttribute('role', 'img');

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PALETTES.day.fog, 35, 80);
  const camera = new THREE.OrthographicCamera(-15, 15, 12, -12, 0.1, 120);
  camera.position.set(20, 19, 25);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.5, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.enablePan = false;
  controls.minZoom = 0.78;
  controls.maxZoom = 1.8;
  controls.minPolarAngle = Math.PI / 5;
  controls.maxPolarAngle = Math.PI / 2.65;
  controls.minAzimuthAngle = -Math.PI / 2;
  controls.maxAzimuthAngle = Math.PI / 2;

  const hemisphere = new THREE.HemisphereLight(0xe1ead8, 0x756a52, 2.3);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xfff2d6, 3.2);
  sun.position.set(-12, 20, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 65 });
  sun.shadow.normalBias = 0.06;
  sun.shadow.bias = -0.0002;
  scene.add(sun);
  scene.add(new THREE.DirectionalLight(0xf4f0d9, 0.8).translateX(12).translateY(8).translateZ(-12));

  const materials = {};
  const mat = (name, color, roughness = 1, metalness = 0) => {
    materials[name] = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    return materials[name];
  };
  mat('grass', '#889c72');
  mat('grassLight', '#a2b086');
  mat('soil', '#b6ad93');
  mat('rock', '#a3a294');
  mat('rockDark', '#858879');
  mat('stone', '#d2cdb9');
  mat('path', '#c8c5b0');
  mat('wood', '#805741');
  mat('woodLight', '#b4845c');
  mat('red', '#995344');
  mat('wall', '#edddbc');
  mat('roof', '#465e5c');
  mat('roofEdge', '#607571');
  mat('green', '#496c55');
  mat('pink', '#d9a8a4');
  mat('pinkLight', '#edc2b9');
  mat('gold', '#c1a264', 0.45, 0.4);
  mat('incense', '#a8774e');
  mat('water', '#769b90', 0.3, 0.15);
  mat('paper', '#eddfbf');
  mat('dark', '#3d4640');
  const glowMat = new THREE.MeshStandardMaterial({ color: '#f5c77b', emissive: '#f5b747', emissiveIntensity: 1.1 });
  const emberMat = new THREE.MeshBasicMaterial({ color: '#ff985b' });
  const world = new THREE.Group();
  scene.add(world);
  const interactables = [];
  const lanterns = [];

  function mesh(geometry, material, position, parent = world) {
    const object = new THREE.Mesh(geometry, material);
    if (position) object.position.set(...position);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function box(w, h, d, material, position, parent) {
    return mesh(new THREE.BoxGeometry(w, h, d), material, position, parent);
  }
  function cylinder(rt, rb, h, material, position, segments = 10, parent) {
    return mesh(new THREE.CylinderGeometry(rt, rb, h, segments), material, position, parent);
  }
  function sphere(r, material, position, parent, detail = 1) {
    return mesh(new THREE.IcosahedronGeometry(r, detail), material, position, parent);
  }
  function beam(from, to, radius, material, parent = world) {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const object = cylinder(radius, radius * 1.1, a.distanceTo(b), material, a.clone().add(b).multiplyScalar(0.5).toArray(), 8, parent);
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
    return object;
  }
  let seed = 42;
  function random() {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  // A handcrafted, faceted floating island, without external model assets.
  const island = cylinder(9.4, 8.3, 1.3, materials.soil, [0, -0.8, 0], 9);
  island.rotation.y = 0.18;
  const grass = cylinder(9.42, 9.4, 0.24, materials.grass, [0, -0.07, 0], 9);
  grass.rotation.y = 0.18;
  const underside = cylinder(8.2, 4.5, 1.7, materials.rockDark, [0, -2.25, 0], 9);
  underside.rotation.y = 0.18;
  for (let i = 0; i < 35; i++) {
    const a = i / 35 * Math.PI * 2;
    const stone = sphere(0.5 + random() * 0.65, i % 3 ? materials.rock : materials.rockDark,
      [Math.cos(a) * 8.55, -0.6 - random() * 0.6, Math.sin(a) * 8.55]);
    stone.scale.set(1.3, 0.6 + random() * 0.5, 0.8);
    stone.rotation.set(random(), random(), random());
  }
  const shadow = mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: 0.095 }), [0, -4.3, 0], scene);
  shadow.rotation.x = -Math.PI / 2;
  shadow.castShadow = false;

  // The courtyard, approach and stone steps.
  box(9.4, 0.14, 6.9, materials.path, [0, 0.08, 1.3]);
  for (let z = -1.8; z < 4.8; z += 0.88) {
    for (let x = -4.25; x < 4.5; x += 1.07) {
      const tile = box(1.025, 0.018, 0.82, (Math.round(x + z) % 3 === 0) ? materials.stone : materials.path, [x, 0.165, z]);
      tile.rotation.y = (random() - 0.5) * 0.018;
    }
  }
  for (let z = 5.2; z < 8.35; z += 0.75) {
    box(1.65, 0.1, 0.65, materials.stone, [0, 0.07, z]);
  }
  box(5.5, 0.3, 0.55, materials.stone, [0, 0.29, 0.2]);
  box(5.1, 0.55, 0.55, materials.stone, [0, 0.4, -0.28]);

  function roof(width, depth, height, baseY, parent) {
    const xSteps = 32;
    const zSteps = 24;
    const vertices = [];
    const indices = [];
    const roofY = (x, z) => baseY + height * (1 - Math.abs(z)) + 0.35 * Math.pow(Math.abs(z), 4) + 0.25 * Math.pow(Math.abs(x), 6);
    for (let xi = 0; xi <= xSteps; xi++) {
      for (let zi = 0; zi <= zSteps; zi++) {
        const x = xi / xSteps * 2 - 1;
        const z = zi / zSteps * 2 - 1;
        vertices.push(x * width / 2, roofY(x, z), z * depth / 2);
      }
    }
    for (let xi = 0; xi < xSteps; xi++) {
      for (let zi = 0; zi < zSteps; zi++) {
        const a = xi * (zSteps + 1) + zi;
        const b = (xi + 1) * (zSteps + 1) + zi;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = materials.roof.clone();
    material.side = THREE.DoubleSide;
    mesh(geometry, material, [0, 0, 0], parent);
    // Raised tile seams trace the curved eaves.
    for (let x = -width / 2; x <= width / 2 + 0.01; x += 0.27) {
      for (const side of [-1, 1]) {
        const points = [];
        for (let i = 0; i <= 10; i++) {
          const zn = i / 10 * side;
          points.push(new THREE.Vector3(x, roofY(x / (width / 2), zn) + 0.026, zn * depth / 2));
        }
        mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 12, 0.032, 4, false), materials.roofEdge, null, parent);
      }
    }
    for (const z of [-1, 1]) {
      const points = [];
      for (let i = 0; i <= 20; i++) {
        const xn = i / 10 - 1;
        points.push(new THREE.Vector3(xn * width / 2, roofY(xn, z), z * depth / 2));
      }
      mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, 0.1, 6, false), materials.roofEdge, null, parent);
    }
    beam([-width / 2 - 0.12, baseY + height + 0.22, 0], [width / 2 + 0.12, baseY + height + 0.22, 0], 0.14, materials.roofEdge, parent);
    for (const side of [-1, 1]) {
      sphere(0.15, materials.roofEdge, [side * (width / 2 + 0.1), baseY + height + 0.31, 0], parent);
    }
  }

  // Main hall: timber columns, lattice doors and dancheong-inspired beams.
  const temple = new THREE.Group();
  temple.position.set(-0.5, 0, -2.2);
  world.add(temple);
  box(7.2, 0.48, 4.6, materials.stone, [0, 0.35, 0], temple);
  box(6.9, 0.15, 4.45, materials.wood, [0, 0.66, 0], temple);
  box(6.35, 2.55, 0.12, materials.wall, [0, 2.05, -1.9], temple);
  for (const x of [-3.05, 3.05]) {
    box(0.13, 2.55, 3.75, materials.wall, [x, 2.05, 0], temple);
  }
  const columnXs = [-3.15, -1.55, 0, 1.55, 3.15];
  for (const x of columnXs) {
    for (const z of [-1.92, 1.9]) {
      cylinder(0.2, 0.24, 0.22, materials.stone, [x, 0.87, z], 10, temple);
      cylinder(0.13, 0.17, 2.75, materials.red, [x, 2.22, z], 10, temple);
      box(0.46, 0.15, 0.4, materials.green, [x, 3.4, z], temple);
      box(0.32, 0.12, 0.59, materials.woodLight, [x, 3.57, z], temple);
    }
  }
  for (const z of [-1.92, 1.92]) {
    box(6.75, 0.22, 0.2, materials.green, [0, 3.34, z], temple);
    box(6.85, 0.14, 0.25, materials.red, [0, 3.52, z], temple);
    for (let x = -3.1; x <= 3.2; x += 0.32) {
      box(0.09, 0.09, 0.3, materials.gold, [x, 3.48, z], temple);
    }
  }
  for (const x of [-2.33, -0.76, 0.76, 2.33]) {
    box(1.35, 2.25, 0.1, materials.wood, [x, 1.95, 1.52], temple);
    box(1.17, 1.77, 0.11, materials.wall, [x, 2.08, 1.58], temple);
    for (let dx = -0.49; dx <= 0.5; dx += 0.17) {
      box(0.035, 1.8, 0.06, materials.woodLight, [x + dx, 2.08, 1.68], temple);
    }
    for (let y = 1.23; y < 3; y += 0.19) {
      box(1.18, 0.035, 0.06, materials.woodLight, [x, y, 1.68], temple);
    }
    sphere(0.035, materials.gold, [x + 0.46, 1.9, 1.73], temple);
  }
  roof(8.45, 5.75, 1.35, 3.55, temple);
  // A small plaque drawn locally to avoid relying on downloaded textures.
  const plaqueCanvas = document.createElement('canvas');
  plaqueCanvas.width = 512;
  plaqueCanvas.height = 160;
  const plaqueCtx = plaqueCanvas.getContext('2d');
  plaqueCtx.fillStyle = '#354c44';
  plaqueCtx.fillRect(0, 0, 512, 160);
  plaqueCtx.strokeStyle = '#bda271';
  plaqueCtx.lineWidth = 8;
  plaqueCtx.strokeRect(10, 10, 492, 140);
  plaqueCtx.font = '72px serif';
  plaqueCtx.textAlign = 'center';
  plaqueCtx.textBaseline = 'middle';
  plaqueCtx.fillStyle = '#e3cf9e';
  plaqueCtx.fillText('山   寺', 256, 84);
  const plaque = mesh(new THREE.PlaneGeometry(1.65, 0.52), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(plaqueCanvas) }), [0, 3.36, 2.06], temple);
  plaque.castShadow = false;

  // Bell pavilion and a physically swinging bronze bell.
  const pavilion = new THREE.Group();
  pavilion.position.set(5.05, 0, 0.15);
  world.add(pavilion);
  box(2.5, 0.35, 2.4, materials.stone, [0, 0.25, 0], pavilion);
  box(2.25, 0.12, 2.15, materials.wood, [0, 0.47, 0], pavilion);
  for (const x of [-0.88, 0.88]) {
    for (const z of [-0.82, 0.82]) {
      cylinder(0.1, 0.14, 2.45, materials.wood, [x, 1.73, z], 8, pavilion);
      box(0.28, 0.12, 0.3, materials.green, [x, 2.92, z], pavilion);
    }
    box(0.12, 0.19, 2.1, materials.red, [x, 2.95, 0], pavilion);
  }
  box(2.1, 0.2, 0.16, materials.red, [0, 2.95, 0], pavilion);
  roof(3.3, 3.1, 0.83, 3.02, pavilion);
  const bellPivot = new THREE.Group();
  bellPivot.position.set(0, 2.85, 0);
  pavilion.add(bellPivot);
  const bell = cylinder(0.36, 0.59, 1.12, materials.gold, [0, -0.86, 0], 20, bellPivot);
  cylinder(0.61, 0.61, 0.09, materials.gold, [0, -1.41, 0], 20, bellPivot);
  cylinder(0.39, 0.39, 0.065, materials.gold, [0, -0.6, 0], 20, bellPivot);
  sphere(0.13, materials.gold, [0, -0.2, 0], bellPivot);
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    sphere(0.048, materials.gold, [Math.cos(a) * 0.41, -0.7, Math.sin(a) * 0.41], bellPivot);
  }
  beam([-1, 1.8, 0.64], [0.9, 1.8, 0.64], 0.11, materials.woodLight, pavilion);
  bell.userData.action = 'bell';
  interactables.push(bell);
  const bellHit = box(2.4, 3.5, 2.4, new THREE.MeshBasicMaterial({ visible: false }), [0, 2, 0], pavilion);
  bellHit.userData.action = 'bell';
  interactables.push(bellHit);

  // Stone incense burner in the courtyard.
  const burner = new THREE.Group();
  burner.position.set(-0.45, 0.2, 3.0);
  world.add(burner);
  cylinder(0.71, 0.79, 0.18, materials.stone, [0, 0.11, 0], 12, burner);
  for (const a of [0, Math.PI * 2 / 3, Math.PI * 4 / 3]) {
    cylinder(0.075, 0.1, 0.53, materials.dark, [Math.cos(a) * 0.32, 0.39, Math.sin(a) * 0.32], 8, burner);
  }
  cylinder(0.55, 0.38, 0.43, materials.dark, [0, 0.78, 0], 18, burner);
  cylinder(0.59, 0.59, 0.09, materials.gold, [0, 1.03, 0], 20, burner);
  cylinder(0.49, 0.49, 0.025, materials.soil, [0, 1.083, 0], 20, burner);
  for (const x of [-0.61, 0.61]) {
    const handle = mesh(new THREE.TorusGeometry(0.16, 0.045, 6, 12), materials.gold, [x, 0.93, 0], burner);
    handle.rotation.y = Math.PI / 2;
  }
  const burnerHit = cylinder(0.9, 0.9, 2.8, new THREE.MeshBasicMaterial({ visible: false }), [0, 1.4, 0], 10, burner);
  burnerHit.userData.action = 'incense';
  interactables.push(burnerHit);
  const incenseSticks = [];
  const smokeGroup = new THREE.Group();
  world.add(smokeGroup);
  const smokeMaterial = new THREE.MeshBasicMaterial({ color: '#efeee5', transparent: true, opacity: 0.2, depthWrite: false });
  const smokeGeometry = new THREE.SphereGeometry(1, 6, 4);
  const smokeParticles = [];
  function lightIncense() {
    if (incenseSticks.length >= 9) {
      const oldest = incenseSticks.shift();
      burner.remove(oldest);
      oldest.traverse((object) => object.geometry?.dispose());
    }
    const stick = new THREE.Group();
    const angle = random() * Math.PI * 2;
    stick.position.set(Math.cos(angle) * 0.25 * random(), 1.09, Math.sin(angle) * 0.25 * random());
    const length = 0.85 + random() * 0.18;
    cylinder(0.018, 0.018, length, materials.incense, [0, length / 2, 0], 5, stick);
    sphere(0.027, emberMat, [0, length, 0], stick, 0);
    stick.userData.length = length;
    stick.userData.createdAt = performance.now();
    burner.add(stick);
    incenseSticks.push(stick);
  }
  lightIncense();

  // Cherry blossom tree. Every crown and branch is generated in JavaScript.
  function tree(x, z, scale = 1, cherry = false) {
    const group = new THREE.Group();
    group.position.set(x, 0.1, z);
    group.scale.setScalar(scale);
    world.add(group);
    beam([0, 0, 0], [0.12, 2.4, 0], 0.17, materials.wood, group);
    const crowns = [[-0.95, 2.7, 0], [0.75, 3.1, 0.2], [0, 3.6, -0.3], [-0.35, 3.25, 0.7], [0.65, 2.75, -0.65], [-0.8, 3.3, -0.6]];
    for (let i = 0; i < crowns.length; i++) {
      const [cx, cy, cz] = crowns[i];
      beam([0.07, 1.4, 0], [cx, cy, cz], 0.08, materials.wood, group);
      const crown = sphere(0.86 + random() * 0.3, cherry ? (i % 2 ? materials.pink : materials.pinkLight) : materials.green, [cx, cy, cz], group);
      crown.scale.set(1.15, 0.7, 0.95);
      crown.rotation.set(random(), random(), random());
      if (cherry) {
        for (let j = 0; j < 5; j++) {
          sphere(0.25 + random() * 0.16, j % 2 ? materials.pink : materials.pinkLight,
            [cx + (random() - 0.5) * 1.5, cy + (random() - 0.5) * 0.8, cz + (random() - 0.5) * 1.4], group, 0);
        }
      }
    }
    return group;
  }
  const cherryTree = tree(-5.65, 1.3, 1.25, true);
  tree(-5.3, -5, 1.05);
  tree(4.9, -4.8, 1.15);
  tree(-7, -2.6, 0.7);
  // Evergreen pines punctuate the silhouette.
  for (const [x, z, s] of [[1.6, -6.7, 1], [6.75, -2.8, 0.82], [-2.9, -6.8, 0.85]]) {
    cylinder(0.1, 0.16, 2.1 * s, materials.wood, [x, s, z], 7);
    for (let i = 0; i < 3; i++) {
      const canopy = mesh(new THREE.ConeGeometry((1.05 - i * 0.18) * s, 1.5 * s, 7), materials.green, [x, (1.8 + i * 0.65) * s, z]);
      canopy.rotation.y = i * 0.4;
    }
  }
  // Pond, stepping stones and water lilies.
  const pond = cylinder(1.8, 1.8, 0.09, materials.water, [4.2, 0.09, 5.55], 24);
  pond.scale.z = 0.72;
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2;
    const stone = sphere(0.27 + random() * 0.13, materials.rock, [4.2 + Math.cos(a) * 1.85, 0.15, 5.55 + Math.sin(a) * 1.35]);
    stone.scale.y = 0.6;
  }
  for (const [x, z] of [[3.55, 5.7], [4.65, 5.9], [4.3, 5.05]]) {
    cylinder(0.23, 0.23, 0.018, materials.green, [x, 0.15, z], 10);
    sphere(0.09, materials.pinkLight, [x + 0.07, 0.21, z], world, 0);
  }
  const ripple = mesh(new THREE.RingGeometry(0.5, 0.51, 40), new THREE.MeshBasicMaterial({ color: '#e0e3cd', transparent: true, opacity: 0.25, side: THREE.DoubleSide }), [4.2, 0.15, 5.5]);
  ripple.rotation.x = -Math.PI / 2;

  function lantern(x, z) {
    cylinder(0.39, 0.47, 0.16, materials.stone, [x, 0.15, z], 8);
    cylinder(0.13, 0.2, 0.66, materials.stone, [x, 0.54, z], 8);
    box(0.58, 0.12, 0.58, materials.stone, [x, 0.9, z]);
    box(0.38, 0.45, 0.38, glowMat, [x, 1.16, z]);
    for (const dx of [-0.23, 0.23]) {
      for (const dz of [-0.23, 0.23]) box(0.07, 0.46, 0.07, materials.stone, [x + dx, 1.16, z + dz]);
    }
    const cap = mesh(new THREE.ConeGeometry(0.53, 0.32, 4), materials.stone, [x, 1.55, z]);
    cap.rotation.y = Math.PI / 4;
    sphere(0.08, materials.stone, [x, 1.76, z]);
    const light = new THREE.PointLight('#ffbc65', 0, 5, 2);
    light.position.set(x, 1.3, z);
    scene.add(light);
    lanterns.push(light);
  }
  lantern(-2.35, 4.9);
  lantern(1.7, 4.9);
  lantern(-4.45, -0.35);

  // Wooden wish rack, with paper wishes moving gently in the wind.
  const wishRack = new THREE.Group();
  wishRack.position.set(-4.7, 0.2, 4.7);
  wishRack.rotation.y = -0.2;
  world.add(wishRack);
  for (const x of [-1, 1]) {
    box(0.12, 2.1, 0.12, materials.wood, [x, 1.05, 0], wishRack);
    box(0.38, 0.12, 0.45, materials.stone, [x, 0, 0], wishRack);
  }
  beam([-1.15, 2.14, 0], [1.15, 2.14, 0], 0.08, materials.wood, wishRack);
  beam([-1, 1.34, 0], [1, 1.34, 0], 0.035, materials.wood, wishRack);
  const wishPapers = [];
  function addWishPaper() {
    if (wishPapers.length >= 10) {
      const paper = wishPapers.shift();
      paper.userData.addedAt = performance.now();
      paper.children[0].material = paper.children[0].material === materials.paper ? materials.pinkLight : materials.paper;
      wishPapers.push(paper);
      return;
    }
    const i = wishPapers.length;
    const pivot = new THREE.Group();
    pivot.position.set(-0.8 + (i % 5) * 0.4, i < 5 ? 2.05 : 1.32, 0.015);
    box(0.25, 0.41, 0.028, i % 3 === 1 ? materials.pinkLight : materials.paper, [0, -0.24, 0], pivot);
    box(0.015, 0.09, 0.018, materials.red, [0, -0.015, 0], pivot);
    box(0.012, 0.19, 0.034, materials.woodLight, [0, -0.25, 0.01], pivot);
    pivot.userData.addedAt = performance.now();
    wishRack.add(pivot);
    wishPapers.push(pivot);
  }
  for (let i = 0; i < 7; i++) addWishPaper();
  const wishHit = box(2.5, 2.5, 0.8, new THREE.MeshBasicMaterial({ visible: false }), [0, 1.2, 0], wishRack);
  wishHit.userData.action = 'wish';
  interactables.push(wishHit);

  // Moss, small rocks, ground foliage, and a little sleeping cat.
  for (let i = 0; i < 60; i++) {
    const x = (random() - 0.5) * 16;
    const z = (random() - 0.5) * 16;
    if (Math.hypot(x, z) > 8.1 || (Math.abs(x) < 4.9 && z > -4.7 && z < 5) || (Math.abs(x) < 1.3 && z > 4)) continue;
    if (i % 4 === 0) {
      const rock = sphere(0.22 + random() * 0.38, materials.rock, [x, 0.16, z], world, 0);
      rock.scale.y = 0.6;
    } else {
      const bush = sphere(0.15 + random() * 0.18, i % 2 ? materials.grassLight : materials.green, [x, 0.19, z], world, 0);
      bush.scale.y = 0.7;
    }
  }
  const cat = new THREE.Group();
  cat.position.set(-2.3, 0.85, -0.63);
  world.add(cat);
  const catMat = new THREE.MeshStandardMaterial({ color: '#d3b48a', roughness: 1 });
  const body = sphere(0.21, catMat, [0, 0, 0], cat);
  body.scale.set(1.5, 0.7, 0.85);
  sphere(0.14, catMat, [0.23, 0.07, 0.04], cat);
  for (const x of [0.16, 0.29]) mesh(new THREE.ConeGeometry(0.06, 0.12, 4), catMat, [x, 0.22, 0.04], cat);
  const tail = mesh(new THREE.TorusGeometry(0.19, 0.052, 5, 12, Math.PI * 1.45), catMat, [-0.13, 0.06, 0.1], cat);
  tail.rotation.x = Math.PI / 2;

  // Falling petals, rain and small night-time fireflies.
  const petalGeometry = new THREE.PlaneGeometry(0.085, 0.055);
  const petalMaterial = new THREE.MeshStandardMaterial({ color: '#f0c7c0', side: THREE.DoubleSide });
  const petals = [];
  for (let i = 0; i < 38; i++) {
    const petal = mesh(petalGeometry, petalMaterial, [-6 + random() * 4, random() * 5, random() * 5], scene);
    petal.castShadow = false;
    petal.userData = { speed: 0.2 + random() * 0.25, phase: random() * Math.PI * 2 };
    petals.push(petal);
  }
  const rainCount = 800;
  const rainPositions = new Float32Array(rainCount * 6);
  const rainSpeeds = [];
  for (let i = 0; i < rainCount; i++) {
    const offset = i * 6;
    const x = (random() - 0.5) * 22;
    const y = random() * 18;
    const z = (random() - 0.5) * 22;
    rainPositions.set([x, y, z, x - 0.025, y + 0.25, z], offset);
    rainSpeeds.push(7 + random() * 5);
  }
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
  const rain = new THREE.LineSegments(rainGeometry, new THREE.LineBasicMaterial({ color: '#b4c4c4', transparent: true, opacity: 0.33, depthWrite: false }));
  rain.visible = false;
  scene.add(rain);
  const fireflies = [];
  const fireflyMat = new THREE.MeshBasicMaterial({ color: '#e9db93', transparent: true });
  for (let i = 0; i < 22; i++) {
    const fly = mesh(new THREE.SphereGeometry(0.026, 4, 4), fireflyMat.clone(), [(random() - 0.5) * 16, 0.7 + random() * 2.2, (random() - 0.5) * 12], scene);
    fly.userData.origin = fly.position.clone();
    fly.visible = false;
    fireflies.push(fly);
  }

  let mode = 'day';
  let raining = false;
  let bellTime = -100;
  let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const updateMotion = (event) => { reducedMotion = event.matches; };
  motionQuery.addEventListener('change', updateMotion);
  const clock = new THREE.Clock();
  let elapsed = 0;
  let lastSmoke = 0;
  let disposed = false;
  let frame;
  let pointerDown = null;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const raycast = (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(interactables, false)[0]?.object.userData.action;
  };
  renderer.domElement.addEventListener('pointerdown', (event) => {
    pointerDown = event.button === 0 && event.isPrimary ? { x: event.clientX, y: event.clientY, dragged: false } : null;
  });
  renderer.domElement.addEventListener('pointercancel', () => { pointerDown = null; });
  renderer.domElement.addEventListener('pointerup', (event) => {
    const start = pointerDown;
    pointerDown = null;
    if (event.button !== 0 || !start || start.dragged || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 7) return;
    const action = raycast(event);
    if (action) onInteract(action);
  });
  renderer.domElement.addEventListener('pointermove', (event) => {
    if (pointerDown && Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 7) pointerDown.dragged = true;
    renderer.domElement.style.cursor = raycast(event) ? 'pointer' : 'grab';
  });

  function resize() {
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height);
    const aspect = width / height;
    const viewHeight = aspect < 1 ? 25 : 23;
    camera.left = -viewHeight * aspect / 2;
    camera.right = viewHeight * aspect / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  function setAtmosphere(nextMode, nextRain = raining) {
    mode = PALETTES[nextMode] ? nextMode : 'day';
    raining = Boolean(nextRain);
    const palette = PALETTES[mode];
    sun.color.set(palette.light);
    sun.intensity = palette.intensity * (raining ? 0.7 : 1);
    hemisphere.color.set(palette.ambient);
    hemisphere.intensity = mode === 'night' ? 1.05 : 2.3;
    scene.fog.color.set(palette.fog);
    glowMat.emissiveIntensity = mode === 'night' ? 2 : 0.55;
    lanterns.forEach((light) => { light.intensity = mode === 'night' ? 5 : mode === 'dusk' ? 2 : 0; });
    fireflies.forEach((fly) => { fly.visible = mode === 'night' && !raining; });
    rain.visible = raining;
    petalMaterial.color.set(mode === 'night' ? '#ac959f' : '#f0c7c0');
  }

  function animate() {
    if (disposed) return;
    frame = requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (document.hidden) return;
    elapsed += dt;
    controls.update();
    if (!reducedMotion) {
      cherryTree.rotation.z = Math.sin(elapsed * 0.55) * 0.008;
      wishPapers.forEach((paper, i) => {
        paper.rotation.x = Math.sin(elapsed * 1.4 + i) * (raining ? 0.19 : 0.09);
        const age = (performance.now() - paper.userData.addedAt) / 1000;
        paper.scale.setScalar(age < 1 ? 1 + Math.sin(age * Math.PI) * 0.22 : 1);
      });
      for (const petal of petals) {
        petal.position.y -= dt * petal.userData.speed;
        petal.position.x += dt * (0.25 + Math.sin(elapsed + petal.userData.phase) * 0.1);
        petal.position.z += Math.sin(elapsed * 0.5 + petal.userData.phase) * dt * 0.12;
        petal.rotation.x += dt;
        petal.rotation.z += dt * 0.4;
        if (petal.position.y < 0.2 || petal.position.x > 3) petal.position.set(-7 + random() * 4, 4 + random() * 2, random() * 4);
      }
      if (raining) {
        for (let i = 0; i < rainCount; i++) {
          const offset = i * 6;
          rainPositions[offset + 1] -= rainSpeeds[i] * dt;
          rainPositions[offset + 4] -= rainSpeeds[i] * dt;
          if (rainPositions[offset + 1] < -2) {
            rainPositions[offset + 1] = 16;
            rainPositions[offset + 4] = 16.25;
          }
        }
        rainGeometry.attributes.position.needsUpdate = true;
      }
      fireflies.forEach((fly, i) => {
        if (!fly.visible) return;
        fly.position.x = fly.userData.origin.x + Math.sin(elapsed * 0.4 + i) * 0.5;
        fly.position.y = fly.userData.origin.y + Math.cos(elapsed * 0.7 + i) * 0.35;
        fly.material.opacity = 0.3 + (Math.sin(elapsed * 1.3 + i) + 1) * 0.35;
      });
      ripple.scale.setScalar(1 + (elapsed * 0.2) % 1);
      ripple.material.opacity = 0.25 * (1 - (elapsed * 0.2) % 1);
    }
    const bellAge = elapsed - bellTime;
    bellPivot.rotation.z = bellAge < 8 ? Math.sin(bellAge * 7) * 0.16 * Math.exp(-bellAge * 0.65) : 0;
    if (elapsed - lastSmoke > 0.13 && smokeParticles.length < 120 && !reducedMotion) {
      lastSmoke = elapsed;
      for (const stick of incenseSticks) {
        if (performance.now() - stick.userData.createdAt > 180000) continue;
        const puff = new THREE.Mesh(smokeGeometry, smokeMaterial.clone());
        puff.position.set(burner.position.x + stick.position.x, burner.position.y + 1.09 + stick.userData.length, burner.position.z + stick.position.z);
        puff.scale.setScalar(0.055);
        puff.userData = { age: 0, phase: random() * Math.PI * 2 };
        smokeGroup.add(puff);
        smokeParticles.push(puff);
      }
    }
    for (let i = smokeParticles.length - 1; i >= 0; i--) {
      const puff = smokeParticles[i];
      puff.userData.age += dt;
      const age = puff.userData.age;
      puff.position.y += dt * 0.43;
      puff.position.x += Math.sin(age * 2 + puff.userData.phase) * dt * 0.12 + dt * 0.07;
      puff.position.z += Math.cos(age * 1.2 + puff.userData.phase) * dt * 0.06;
      puff.scale.setScalar(0.045 + age * 0.045);
      puff.material.opacity = Math.max(0, 0.22 * (1 - age / 5));
      if (age >= 5) {
        smokeGroup.remove(puff);
        puff.material.dispose();
        smokeParticles.splice(i, 1);
      }
    }
    renderer.render(scene, camera);
  }
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    onError(new Error('WebGL context lost'));
  });
  animate();
  onReady();

  return {
    lightIncense,
    ringBell() { bellTime = elapsed; },
    addWish: addWishPaper,
    setAtmosphere,
    resetView() {
      camera.position.set(20, 19, 25);
      camera.zoom = 1;
      camera.updateProjectionMatrix();
      controls.target.set(0, 1.5, 0);
      controls.update();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      motionQuery.removeEventListener('change', updateMotion);
      controls.dispose();
      const geometries = new Set();
      const usedMaterials = new Set();
      scene.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) {
          const list = Array.isArray(object.material) ? object.material : [object.material];
          list.forEach((material) => usedMaterials.add(material));
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      usedMaterials.forEach((material) => { material.map?.dispose(); material.dispose(); });
      smokeGeometry.dispose();
      smokeMaterial.dispose();
      emberMat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
