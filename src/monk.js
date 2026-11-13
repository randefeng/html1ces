import * as THREE from 'three';

export const ACTION_SECONDS = { idle: 0, bow: 4, fish: 5, beads: 8, incense: 5 };
const robes = ['#d6904f', '#a3ada0', '#c5a576', '#ac8773', '#7e9c9a', '#b3a181'];

// Original rounded character built locally: no unlicensed models or remote assets.
export function createMonk(id = 'self', isLocal = false) {
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const skin = new THREE.MeshStandardMaterial({ color: '#f4cda8', roughness: 0.9 });
  const robe = new THREE.MeshStandardMaterial({ color: isLocal ? '#d6904f' : robes[hash % robes.length], roughness: 1 });
  const sash = new THREE.MeshStandardMaterial({ color: '#b56939', roughness: 1 });
  const shoe = new THREE.MeshStandardMaterial({ color: '#4e4540', roughness: 1 });
  const wood = new THREE.MeshStandardMaterial({ color: '#9d592c', roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: '#4b3022', roughness: 1 });
  const gold = new THREE.MeshStandardMaterial({ color: '#dab879', roughness: 0.5, metalness: 0.2 });
  const parts = [];
  function add(geometry, material, xyz, parent = rig) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(...xyz);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    parts.push(object);
    return object;
  }
  function round(radius, material, xyz, scale, parent = rig) {
    const object = add(new THREE.SphereGeometry(radius, 20, 14), material, xyz, parent);
    if (scale) object.scale.set(...scale);
    return object;
  }
  const leftLeg = new THREE.Group();
  const rightLeg = new THREE.Group();
  leftLeg.position.set(-0.14, 0.4, 0);
  rightLeg.position.set(0.14, 0.4, 0);
  rig.add(leftLeg, rightLeg);
  for (const leg of [leftLeg, rightLeg]) {
    round(0.12, robe, [0, -0.14, 0], [1, 1.5, 1], leg);
    round(0.13, shoe, [0, -0.3, 0.06], [1, 0.65, 1.55], leg);
  }
  const torso = new THREE.Group();
  torso.position.y = 0.53;
  rig.add(torso);
  add(new THREE.CylinderGeometry(0.23, 0.34, 0.65, 24), robe, [0, 0.19, 0], torso);
  const chest = round(0.26, robe, [0, 0.48, 0], [1, 0.58, 0.83], torso);
  const diagonal = add(new THREE.BoxGeometry(0.12, 0.65, 0.05), sash, [0.025, 0.23, 0.253], torso);
  diagonal.rotation.z = -0.38;
  add(new THREE.TorusGeometry(0.283, 0.026, 6, 30), sash, [0, 0.05, 0], torso).rotation.x = Math.PI / 2;
  round(0.095, skin, [0, 0.56, 0], null, torso);
  const head = new THREE.Group();
  head.position.set(0, 0.89, 0);
  torso.add(head);
  round(0.375, skin, [0, 0, 0], [1, 1.02, 0.97], head);
  round(0.087, skin, [-0.37, -0.025, 0], [0.65, 1, 0.8], head);
  round(0.087, skin, [0.37, -0.025, 0], [0.65, 1, 0.8], head);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f4cda8';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#e9a99b';
  for (const x of [57, 199]) { ctx.beginPath(); ctx.ellipse(x, 162, 24, 13, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = '#594339';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  for (const x of [83, 173]) { ctx.beginPath(); ctx.arc(x, 132, 11, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
  ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.arc(128, 153, 13, 0.2, Math.PI - 0.2); ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.MeshStandardMaterial({ map: texture, roughness: 1 });
  // Curved face patch follows the spherical head, instead of floating eyes.
  const facePatch = add(new THREE.SphereGeometry(0.377, 24, 20, Math.PI * 0.31, Math.PI * 0.38, Math.PI * 0.32, Math.PI * 0.4), face, [0, 0, 0], head);
  facePatch.scale.set(1, 1.02, 0.97);
  for (let i = -1; i <= 1; i++) round(0.023, wood, [i * 0.07, 0.27, 0.255], null, head);
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.28, 0.41, 0);
    torso.add(arm);
    round(0.13, robe, [side * 0.055, -0.13, 0], [1, 1.6, 1], arm);
    round(0.085, skin, [side * 0.06, -0.34, 0.035], null, arm);
    arms.push(arm);
  }
  const necklace = new THREE.Group();
  torso.add(necklace);
  for (let i = 0; i < 15; i++) {
    const a = i / 14 * Math.PI;
    round(0.031, wood, [Math.cos(a) * 0.2, 0.43 - Math.sin(a) * 0.24, 0.235], null, necklace);
  }
  const heldIncense = new THREE.Group();
  heldIncense.position.set(0, -0.32, 0.09);
  arms[1].add(heldIncense);
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.52, 6), wood, [0, 0.2, 0], heldIncense);
  round(0.022, new THREE.MeshBasicMaterial({ color: '#ffbd70' }), [0, 0.46, 0], null, heldIncense);
  const handBeads = new THREE.Group();
  handBeads.position.set(0, 0.12, 0.47);
  torso.add(handBeads);
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    round(0.037, wood, [Math.cos(a) * 0.14, Math.sin(a) * 0.17, 0], null, handBeads);
  }
  const fish = new THREE.Group();
  fish.position.set(0, 0.14, 0.82);
  root.add(fish);
  add(new THREE.CylinderGeometry(0.34, 0.37, 0.06, 24), gold, [0, 0, 0], fish);
  round(0.26, wood, [0, 0.19, 0], [1.2, 0.8, 1], fish);
  const slit = add(new THREE.BoxGeometry(0.032, 0.014, 0.4), dark, [0, 0.382, 0], fish);
  slit.rotation.z = 0.1;
  const mallet = new THREE.Group();
  mallet.position.set(0, -0.32, 0.08);
  arms[1].add(mallet);
  const shaft = add(new THREE.CylinderGeometry(0.018, 0.018, 0.47, 8), wood, [0, 0.11, 0.14], mallet);
  shaft.rotation.x = Math.PI / 2;
  round(0.067, wood, [0, 0.11, 0.38], null, mallet);
  heldIncense.visible = handBeads.visible = fish.visible = mallet.visible = false;

  const marker = add(new THREE.RingGeometry(0.37, 0.39, 40), new THREE.MeshBasicMaterial({ color: '#efd7a1', transparent: true, opacity: 0.65, side: THREE.DoubleSide }), [0, 0.02, 0], root);
  marker.rotation.x = -Math.PI / 2;
  marker.visible = isLocal;
  let action = 'idle';
  let actionAt = 0;
  let lastPulse = -1;

  return {
    root,
    setAction(next, startedAt = Date.now()) {
      if (!(next in ACTION_SECONDS)) return;
      if (action === next && actionAt === startedAt) return;
      action = next;
      actionAt = startedAt;
      lastPulse = -1;
    },
    get action() { return action; },
    get actionAt() { return actionAt; },
    update(dt, time, speed, reducedMotion, onPulse) {
      const age = Math.max(0, (Date.now() - actionAt) / 1000);
      if (action !== 'idle' && age >= ACTION_SECONDS[action]) action = 'idle';
      const phase = time * 9;
      const walking = speed > 0.12 && action === 'idle';
      rig.position.y = walking && !reducedMotion ? Math.abs(Math.sin(phase)) * 0.035 : Math.sin(time * 1.8) * 0.008;
      torso.rotation.x = 0;
      torso.position.y = 0.53;
      head.rotation.x = 0;
      chest.scale.x = 1 + Math.sin(time * 1.8) * 0.008;
      leftLeg.rotation.x = walking && !reducedMotion ? Math.sin(phase) * 0.46 : 0;
      rightLeg.rotation.x = -leftLeg.rotation.x;
      arms[0].rotation.set(walking && !reducedMotion ? -Math.sin(phase) * 0.25 : 0, 0, 0.12);
      arms[1].rotation.set(walking && !reducedMotion ? Math.sin(phase) * 0.25 : 0, 0, -0.12);
      heldIncense.visible = action === 'incense';
      handBeads.visible = action === 'beads';
      fish.visible = mallet.visible = action === 'fish';
      if (action === 'bow') {
        const sink = Math.min(1, age / 0.65, (4 - age) / 0.65);
        const bend = Math.sin(Math.min(1, Math.max(0, (age - 0.65) / 2.5)) * Math.PI);
        torso.position.y -= Math.max(0, sink) * 0.28;
        torso.rotation.x = Math.max(0, bend) * 1.1;
        arms[0].rotation.set(-0.65, 0, -0.6);
        arms[1].rotation.set(-0.65, 0, 0.6);
        leftLeg.rotation.x = rightLeg.rotation.x = -Math.max(0, sink) * 1.2;
      } else if (action === 'fish') {
        torso.position.y -= 0.17;
        leftLeg.rotation.x = rightLeg.rotation.x = -0.8;
        arms[1].rotation.x = -0.85 + Math.sin(age * Math.PI * 3) * 0.32;
        arms[0].rotation.set(-0.4, 0, -0.25);
        const pulse = Math.floor(age * 1.5);
        if (pulse !== lastPulse) { lastPulse = pulse; onPulse?.('fish'); }
      } else if (action === 'beads') {
        arms[0].rotation.set(-0.85, 0, -0.65);
        arms[1].rotation.set(-0.85, 0, 0.65);
        handBeads.rotation.z = reducedMotion ? 0 : age * 0.5;
        head.rotation.x = 0.14;
      } else if (action === 'incense') {
        arms[0].rotation.set(-0.75, 0, -0.55);
        arms[1].rotation.set(-0.9, 0, 0.55);
        head.rotation.x = age > 1 && age < 3.5 ? 0.26 : 0;
      }
    },
    dispose() {
      const geometrySet = new Set(parts.map((part) => part.geometry));
      const materialSet = new Set(parts.map((part) => part.material));
      geometrySet.forEach((geometry) => geometry.dispose());
      materialSet.forEach((material) => { material.map?.dispose(); material.dispose(); });
      root.removeFromParent();
    },
  };
}
