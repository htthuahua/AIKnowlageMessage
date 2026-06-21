import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const WARM = 0xfff0cc;
const WARM_SOFT = 0xffe8a8;
const ROAD_COLOR = 0x18181c;
const ROAD_EDGE = 0xfff0cc;
const ROUNDABOUT_OUTER_R = 2.55;
const BUILDING_RING_RADIUS = 11.5;
const OUTER_RING_RADIUS = 19.5;
const BUILDINGS_PER_RING = 12;
const DISTRICT_SPACING = 58;

let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let animationId = null;
let raycaster = null;
let pointer = null;
let buildingMeshes = [];
let buildingSpots = [];
let trafficVehicles = [];
let carMaterial = null;
let carGlowMaterial = null;
let carAccentMaterial = null;
let roadGroups = [];
let roadSegments = [];
let streetLampGroups = [];
let vegetationGroups = [];
let districtLabelGroups = [];
let clock = null;
let callbacks = {};
let cityData = null;

function createLabelSprite(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f5f0e6";
  ctx.font = "500 28px Microsoft YaHei, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(7.5, 1.4, 1);
  return sprite;
}

function buildingMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x121216,
    metalness: 0.15,
    roughness: 0.82,
  });
}

function seededRandom(seed) {
  const value = Math.sin(seed * 12.9898 + seed * 0.001) * 43758.5453;
  return value - Math.floor(value);
}

function addHouseholdWindows(group, width, depth, height, data) {
  const questions = data.questions || [];
  const floorHeight = 1.35;
  const floorCount = Math.max(2, Math.floor(height / floorHeight));
  const stepY = height / floorCount;
  const unitsPerFace = 2;
  const faces = [
    { axis: "x", sign: 1, span: depth * 0.78 },
    { axis: "x", sign: -1, span: depth * 0.78 },
    { axis: "z", sign: 1, span: width * 0.78 },
    { axis: "z", sign: -1, span: width * 0.78 },
  ];
  const slotsOnFloor = faces.length * unitsPerFace;

  let questionCursor = 0;

  for (let floor = 0; floor < floorCount; floor += 1) {
    const floorY = stepY * floor + stepY * 0.52;
    const floorSeed = hashSeed(`${data.id}-floor-${floor}`);

    const minLit = 1;
    const maxLit = slotsOnFloor;
    const litCount = minLit + Math.floor(seededRandom(floorSeed) * (maxLit - minLit + 1));

    const slotOrder = Array.from({ length: slotsOnFloor }, (_, index) => index);
    for (let i = slotOrder.length - 1; i > 0; i -= 1) {
      const j = Math.floor(seededRandom(floorSeed + i * 13) * (i + 1));
      [slotOrder[i], slotOrder[j]] = [slotOrder[j], slotOrder[i]];
    }
    const litSlots = new Set(slotOrder.slice(0, litCount));

    if (floor > 0) {
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(width * 1.004, 0.025, depth * 1.004),
        new THREE.MeshBasicMaterial({ color: 0x1c1c22, transparent: true, opacity: 0.55 })
      );
      slab.position.y = stepY * floor;
      group.add(slab);
    }

    let slotOnFloor = 0;
    faces.forEach((face) => {
      for (let unit = 0; unit < unitsPerFace; unit += 1) {
        const lit = litSlots.has(slotOnFloor);
        const seed = hashSeed(`${data.id}-${floor}-${slotOnFloor}`);
        const offset =
          unitsPerFace === 1 ? 0 : ((unit + 0.5) / unitsPerFace - 0.5) * face.span;

        const win = new THREE.Mesh(
          new THREE.PlaneGeometry(0.34, 0.46),
          new THREE.MeshBasicMaterial({
            color: lit ? (seededRandom(seed) > 0.4 ? WARM : WARM_SOFT) : 0x25252c,
            transparent: true,
            opacity: lit ? 0.42 + seededRandom(seed + 3) * 0.38 : 0.1,
          })
        );

        if (face.axis === "x") {
          win.position.set(face.sign * (width / 2 + 0.015), floorY, offset);
          win.rotation.y = face.sign > 0 ? Math.PI / 2 : -Math.PI / 2;
        } else {
          win.position.set(offset, floorY, face.sign * (depth / 2 + 0.015));
          win.rotation.y = face.sign > 0 ? 0 : Math.PI;
        }

        if (lit && questions.length) {
          const question = questions[questionCursor % questions.length];
          questionCursor += 1;
          win.userData = {
            type: "unit",
            id: question.id,
            question: question.question,
            category: question.category,
            summary: question.summary,
            code: question.code,
            buildingId: question.buildingId,
            buildingName: question.buildingName,
          };
        }

        group.add(win);
        slotOnFloor += 1;
      }
    });
  }
}

function splitIntoDistricts(buildings) {
  const districts = [];
  for (let i = 0; i < buildings.length; i += BUILDINGS_PER_RING) {
    districts.push(buildings.slice(i, i + BUILDINGS_PER_RING));
  }
  return districts;
}

function getDistrictGrid(count) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.ceil(count / cols);
  return { cols, rows };
}

function getDistrictCenter(index, total, grid) {
  if (total <= 1) return { cx: 0, cz: 0 };
  const { cols } = grid;
  const col = index % cols;
  const row = Math.floor(index / cols);
  const offsetX = -((grid.cols - 1) * DISTRICT_SPACING) / 2;
  const offsetZ = -((grid.rows - 1) * DISTRICT_SPACING) / 2;
  return {
    cx: offsetX + col * DISTRICT_SPACING,
    cz: offsetZ + row * DISTRICT_SPACING,
  };
}

function getSceneBounds(districtInfos) {
  if (!districtInfos.length) {
    return { centerX: 0, centerZ: 0, width: 220, depth: 220 };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const margin = OUTER_RING_RADIUS + 10;
  districtInfos.forEach(({ cx, cz }) => {
    minX = Math.min(minX, cx - margin);
    maxX = Math.max(maxX, cx + margin);
    minZ = Math.min(minZ, cz - margin);
    maxZ = Math.max(maxZ, cz + margin);
  });
  return {
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    width: Math.max(220, maxX - minX + 80),
    depth: Math.max(220, maxZ - minZ + 80),
  };
}

function hashSeed(text) {
  let hash = 0;
  const value = String(text);
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getLayout(index, total, cx = 0, cz = 0) {
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
  return {
    x: cx + Math.cos(angle) * BUILDING_RING_RADIUS,
    z: cz + Math.sin(angle) * BUILDING_RING_RADIUS,
    rotation: -angle + Math.PI / 2,
  };
}

function getRingRoadPoint(index, total, cx = 0, cz = 0, radius = OUTER_RING_RADIUS) {
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
  return {
    x: cx + Math.cos(angle) * radius,
    z: cz + Math.sin(angle) * radius,
    angle,
  };
}

function createOuterRingRoad(cx, cz, centerRadius, width, y = 0.35) {
  const group = new THREE.Group();
  const half = width / 2;
  const innerR = centerRadius - half;
  const outerR = centerRadius + half;

  const deck = new THREE.Mesh(new THREE.RingGeometry(innerR, outerR, 96), getRoadDeckMaterial());
  deck.rotation.x = -Math.PI / 2;
  group.add(deck);

  const edgeMat = new THREE.MeshBasicMaterial({
    color: ROAD_EDGE,
    transparent: true,
    opacity: 0.3,
  });
  const edgeOuter = new THREE.Mesh(
    new THREE.RingGeometry(outerR - 0.04, outerR + 0.03, 96),
    edgeMat
  );
  edgeOuter.rotation.x = -Math.PI / 2;
  edgeOuter.position.y = 0.04;
  group.add(edgeOuter);

  const edgeInner = new THREE.Mesh(
    new THREE.RingGeometry(innerR - 0.03, innerR + 0.04, 96),
    edgeMat
  );
  edgeInner.rotation.x = -Math.PI / 2;
  edgeInner.position.y = 0.04;
  group.add(edgeInner);

  group.position.set(cx, y, cz);
  scene.add(group);
  roadGroups.push(group);
}

function buildMonolith(group, w, d, h) {
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), buildingMaterial());
  body.position.y = h / 2;
  group.add(body);
  return { width: w, depth: d, height: h };
}

function buildStepped(group, w, d, h) {
  const steps = 4;
  let y = 0;
  for (let i = 0; i < steps; i += 1) {
    const shrink = 1 - i * 0.14;
    const sh = h / steps;
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(w * shrink, sh, d * shrink),
      buildingMaterial()
    );
    block.position.y = y + sh / 2;
    group.add(block);
    y += sh;
  }
  return { width: w, depth: d, height: h };
}

function buildTwin(group, w, d, h) {
  const tw = w * 0.34;
  const gap = w * 0.08;
  const left = new THREE.Mesh(new THREE.BoxGeometry(tw, h, tw), buildingMaterial());
  left.position.set(-tw / 2 - gap / 2, h / 2, 0);
  group.add(left);
  const right = new THREE.Mesh(new THREE.BoxGeometry(tw, h * 0.9, tw), buildingMaterial());
  right.position.set(tw / 2 + gap / 2, (h * 0.9) / 2, 0);
  group.add(right);
  const bridge = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.62, 0.2, tw * 0.7),
    buildingMaterial()
  );
  bridge.position.set(0, h * 0.62, 0);
  group.add(bridge);
  return { width: w, depth: tw, height: h };
}

function buildCylinder(group, w, d, h) {
  const radius = Math.min(w, d) * 0.42;
  const cyl = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.94, radius, h, 12),
    buildingMaterial()
  );
  cyl.position.y = h / 2;
  group.add(cyl);
  return { width: radius * 2.05, depth: radius * 2.05, height: h };
}

function buildCantilever(group, w, d, h) {
  const baseH = h * 0.38;
  const midH = h * 0.34;
  const topH = h - baseH - midH;
  const base = new THREE.Mesh(new THREE.BoxGeometry(w, baseH, d), buildingMaterial());
  base.position.y = baseH / 2;
  group.add(base);
  const mid = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, midH, d * 0.72), buildingMaterial());
  mid.position.set(w * 0.12, baseH + midH / 2, 0);
  group.add(mid);
  const top = new THREE.Mesh(new THREE.BoxGeometry(w * 0.46, topH, d * 0.46), buildingMaterial());
  top.position.set(-w * 0.14, baseH + midH + topH / 2, 0);
  group.add(top);
  return { width: w, depth: d, height: h };
}

function buildBlade(group, w, d, h) {
  const core = new THREE.Mesh(new THREE.BoxGeometry(w * 0.44, h, d * 0.44), buildingMaterial());
  core.position.y = h / 2;
  group.add(core);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(w * 0.09, h * 0.94, d * 0.8), buildingMaterial());
  fin.position.set(w * 0.27, h * 0.47, 0);
  group.add(fin);
  return { width: w, depth: d, height: h };
}

function buildPodium(group, w, d, h) {
  const baseH = h * 0.28;
  const towerH = h - baseH;
  const base = new THREE.Mesh(new THREE.BoxGeometry(w * 1.08, baseH, d * 1.08), buildingMaterial());
  base.position.y = baseH / 2;
  group.add(base);
  const tower = new THREE.Mesh(new THREE.BoxGeometry(w * 0.58, towerH, d * 0.58), buildingMaterial());
  tower.position.y = baseH + towerH / 2;
  group.add(tower);
  return { width: w, depth: d, height: h };
}

const SHAPE_BUILDERS = [
  buildMonolith,
  buildStepped,
  buildTwin,
  buildCylinder,
  buildCantilever,
  buildBlade,
  buildPodium,
];

function createBuilding(data, index, total, cx = 0, cz = 0) {
  const layout = getLayout(index, total, cx, cz);
  const height = 10 + (data.count / 130) * 32;
  const width = 3.2 + (index % 3) * 0.55;
  const depth = 3.0 + (index % 4) * 0.5;

  const group = new THREE.Group();
  group.position.set(layout.x, 0, layout.z);
  group.rotation.y = layout.rotation;
  group.userData = data;

  const footprint = SHAPE_BUILDERS[index % SHAPE_BUILDERS.length](group, width, depth, height);
  addHouseholdWindows(group, footprint.width, footprint.depth, footprint.height, data);

  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(footprint.width * 0.72, 0.07, footprint.depth * 0.72),
    new THREE.MeshBasicMaterial({ color: WARM_SOFT, transparent: true, opacity: 0.32 })
  );
  cap.position.y = footprint.height;
  group.add(cap);

  const label = createLabelSprite(`${data.name} · ${data.count}`);
  label.position.y = footprint.height + 2.2;
  group.add(label);

  buildingSpots.push({ x: layout.x, z: layout.z, height: footprint.height, id: data.id });
  return group;
}

let roadDeckMaterial = null;

function getRoadDeckMaterial() {
  if (!roadDeckMaterial) {
    roadDeckMaterial = new THREE.MeshStandardMaterial({
      color: ROAD_COLOR,
      roughness: 0.92,
      metalness: 0.05,
    });
  }
  return roadDeckMaterial;
}

function createRoad(x1, z1, x2, z2, y = 0.35, width = 1.1) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.hypot(dx, dz);
  if (length < 1) return null;

  const group = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(length, 0.12, width), getRoadDeckMaterial());
  group.add(deck);

  const edgeMat = new THREE.MeshBasicMaterial({
    color: ROAD_EDGE,
    transparent: true,
    opacity: 0.22,
  });
  const edgeL = new THREE.Mesh(new THREE.BoxGeometry(length, 0.03, 0.05), edgeMat);
  edgeL.position.set(0, 0.07, width / 2);
  group.add(edgeL);
  const edgeR = edgeL.clone();
  edgeR.position.z = -width / 2;
  group.add(edgeR);

  group.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
  group.rotation.y = Math.atan2(dz, dx);
  scene.add(group);
  roadGroups.push(group);

  return { x1, z1, x2, z2, y, length };
}

function createRoundabout(cx, cz, innerR, outerR, y = 0.35) {
  const group = new THREE.Group();

  const glowCore = new THREE.Mesh(
    new THREE.CircleGeometry(outerR + 0.6, 48),
    new THREE.MeshBasicMaterial({
      color: WARM_SOFT,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    })
  );
  glowCore.rotation.x = -Math.PI / 2;
  glowCore.position.y = 0.01;
  group.add(glowCore);

  const glowHalo = new THREE.Mesh(
    new THREE.RingGeometry(outerR + 0.4, outerR + 2.2, 48),
    new THREE.MeshBasicMaterial({
      color: WARM,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    })
  );
  glowHalo.rotation.x = -Math.PI / 2;
  glowHalo.position.y = 0.015;
  group.add(glowHalo);

  const ringMaterial = getRoadDeckMaterial().clone();
  ringMaterial.color.setHex(0x24242a);
  const ring = new THREE.Mesh(new THREE.RingGeometry(innerR, outerR, 48), ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);

  const island = new THREE.Mesh(
    new THREE.CircleGeometry(innerR * 0.92, 32),
    new THREE.MeshStandardMaterial({
      color: 0x141418,
      emissive: 0x2a2418,
      emissiveIntensity: 0.35,
      roughness: 1,
      metalness: 0,
    })
  );
  island.rotation.x = -Math.PI / 2;
  island.position.y = 0.02;
  group.add(island);

  const edgeMat = new THREE.MeshBasicMaterial({
    color: WARM,
    transparent: true,
    opacity: 0.72,
  });
  const edgeRing = new THREE.Mesh(new THREE.RingGeometry(outerR - 0.05, outerR + 0.04, 48), edgeMat);
  edgeRing.rotation.x = -Math.PI / 2;
  edgeRing.position.y = 0.07;
  group.add(edgeRing);

  const centerLight = new THREE.PointLight(WARM, 1.4, 14, 1.5);
  centerLight.position.set(0, 3.2, 0);
  group.add(centerLight);

  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const fill = new THREE.PointLight(WARM_SOFT, 0.55, 8, 1.8);
    fill.position.set(Math.cos(angle) * (outerR + 0.5), 1.6, Math.sin(angle) * (outerR + 0.5));
    group.add(fill);
  }

  group.position.set(cx, y, cz);
  scene.add(group);
  roadGroups.push(group);
}

function buildCenterRoadHub(cx, cz, y, width) {
  const segments = [];
  const innerR = 1.15;
  const outerR = ROUNDABOUT_OUTER_R;
  const ringInner = OUTER_RING_RADIUS - width / 2;

  createRoundabout(cx, cz, innerR, outerR, y);

  const arms = [
    [cx + outerR, cz, cx + ringInner, cz],
    [cx - outerR, cz, cx - ringInner, cz],
    [cx, cz + outerR, cx, cz + ringInner],
    [cx, cz - outerR, cx, cz - ringInner],
  ];

  arms.forEach(([x1, z1, x2, z2]) => {
    const seg = createRoad(x1, z1, x2, z2, y, width);
    if (seg) segments.push(seg);
  });

  return segments;
}

function buildDistrictRoadNetwork(cx, cz) {
  const segments = [];
  const y = 0.35;
  const width = 1.15;

  segments.push(...buildCenterRoadHub(cx, cz, y, width));
  createOuterRingRoad(cx, cz, OUTER_RING_RADIUS, width, y);

  return segments;
}

let lampPoleMaterial = null;
let lampGlowMaterial = null;

function createStreetLamp(withLight = false) {
  if (!lampPoleMaterial) {
    lampPoleMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2a30,
      metalness: 0.4,
      roughness: 0.6,
    });
    lampGlowMaterial = new THREE.MeshBasicMaterial({
      color: WARM,
      transparent: true,
      opacity: 0.85,
    });
  }

  const group = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.8, 6), lampPoleMaterial);
  pole.position.y = 0.9;
  group.add(pole);

  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), lampGlowMaterial);
  bulb.position.y = 1.82;
  group.add(bulb);

  if (withLight) {
    const light = new THREE.PointLight(WARM, 0.9, 10, 1.7);
    light.position.set(0, 1.78, 0);
    group.add(light);
  }

  return group;
}

function buildStreetLamps(segments, cx = 0, cz = 0) {
  segments.forEach((segment) => {
    const { x1, z1, x2, z2, y, length } = segment;
    if (length < 6) return;

    const dx = x2 - x1;
    const dz = z2 - z1;
    const angle = Math.atan2(dz, dx);
    const perpX = -Math.sin(angle);
    const perpZ = Math.cos(angle);
    const spacing = 10;
    const count = Math.max(1, Math.floor(length / spacing));

    for (let i = 1; i <= count; i += 1) {
      const t = i / (count + 1);
      const side = i % 2 === 0 ? 1 : -1;
      const lamp = createStreetLamp();
      lamp.position.set(
        x1 + dx * t + perpX * 0.95 * side,
        y + 0.08,
        z1 + dz * t + perpZ * 0.95 * side
      );
      lamp.rotation.y = angle;
      scene.add(lamp);
      streetLampGroups.push(lamp);
    }
  });

  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const lamp = createStreetLamp(true);
    lamp.position.set(cx + Math.cos(angle) * 2.05, 0.43, cz + Math.sin(angle) * 2.05);
    lamp.rotation.y = angle + Math.PI / 2;
    scene.add(lamp);
    streetLampGroups.push(lamp);
  }

  buildRingRoadStreetLamps(cx, cz);
}

function buildRingRoadStreetLamps(cx = 0, cz = 0) {
  const segCount = 24;
  const y = 0.35;

  for (let i = 0; i < segCount; i += 1) {
    const point = getRingRoadPoint(i, segCount, cx, cz);
    const next = getRingRoadPoint((i + 1) % segCount, segCount, cx, cz);
    const midX = (point.x + next.x) / 2;
    const midZ = (point.z + next.z) / 2;
    const midAngle = Math.atan2(midZ, midX);
    const tangent = midAngle + Math.PI / 2;

    const lampInner = createStreetLamp(i % 3 === 0);
    lampInner.position.set(
      cx + Math.cos(point.angle) * (OUTER_RING_RADIUS - 0.95),
      y + 0.08,
      cz + Math.sin(point.angle) * (OUTER_RING_RADIUS - 0.95)
    );
    lampInner.rotation.y = tangent;
    scene.add(lampInner);
    streetLampGroups.push(lampInner);

    const lampOuter = createStreetLamp(i % 4 === 0);
    lampOuter.position.set(
      cx + Math.cos(point.angle) * (OUTER_RING_RADIUS + 1.15),
      y + 0.08,
      cz + Math.sin(point.angle) * (OUTER_RING_RADIUS + 1.15)
    );
    lampOuter.rotation.y = tangent;
    scene.add(lampOuter);
    streetLampGroups.push(lampOuter);
  }
}

let trunkMaterial = null;
let foliageMaterial = null;
let bushMaterial = null;

function getVegetationMaterials() {
  if (!trunkMaterial) {
    trunkMaterial = new THREE.MeshStandardMaterial({
      color: 0x3d2f24,
      roughness: 0.95,
      metalness: 0,
    });
    foliageMaterial = new THREE.MeshStandardMaterial({
      color: 0x1e4a32,
      roughness: 0.9,
      metalness: 0,
    });
    bushMaterial = new THREE.MeshStandardMaterial({
      color: 0x245038,
      roughness: 0.92,
      metalness: 0,
    });
  }
  return { trunkMaterial, foliageMaterial, bushMaterial };
}

function createTree(scale = 1) {
  const { trunkMaterial, foliageMaterial } = getVegetationMaterials();
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08 * scale, 0.11 * scale, 0.65 * scale, 6),
    trunkMaterial
  );
  trunk.position.y = 0.325 * scale;
  group.add(trunk);

  const crown = new THREE.Mesh(
    new THREE.ConeGeometry(0.4 * scale, 0.85 * scale, 8),
    foliageMaterial
  );
  crown.position.y = 0.92 * scale;
  group.add(crown);
  return group;
}

function createBush(scale = 1) {
  const { bushMaterial } = getVegetationMaterials();
  const group = new THREE.Group();
  const bush = new THREE.Mesh(new THREE.SphereGeometry(0.22 * scale, 8, 8), bushMaterial);
  bush.position.y = 0.14 * scale;
  bush.scale.y = 0.65;
  group.add(bush);
  return group;
}

function placeVegetation(x, z, kind, scale, rotation = 0) {
  const item = kind === "tree" ? createTree(scale) : createBush(scale);
  item.position.set(x, 0, z);
  item.rotation.y = rotation;
  scene.add(item);
  vegetationGroups.push(item);
}

function buildDistrictVegetation(cx, cz, districtIndex) {
  const islandPlants = [
    [0.45, 0.35],
    [-0.35, -0.25],
    [0.15, -0.45],
    [-0.25, 0.4],
  ];
  islandPlants.forEach(([ox, oz], index) => {
    const seed = hashSeed(`island-${districtIndex}-${index}`);
    placeVegetation(
      cx + ox,
      cz + oz,
      "bush",
      0.85 + seededRandom(seed) * 0.25,
      seededRandom(seed + 1) * Math.PI
    );
  });

  buildingSpots
    .filter((spot) => Math.hypot(spot.x - cx, spot.z - cz) <= BUILDING_RING_RADIUS + 1.5)
    .forEach((spot) => {
      const angle = Math.atan2(spot.z - cz, spot.x - cx);
      const dist = Math.hypot(spot.x - cx, spot.z - cz);
      const seed = hashSeed(spot.id);

      const outward = dist + 1.8 + seededRandom(seed) * 1.2;
      const tangent = (seededRandom(seed + 1) - 0.5) * 2.4;
      const x = cx + Math.cos(angle) * outward - Math.sin(angle) * tangent;
      const z = cz + Math.sin(angle) * outward + Math.cos(angle) * tangent;
      const kind = seededRandom(seed + 2) > 0.42 ? "tree" : "bush";
      placeVegetation(x, z, kind, 0.8 + seededRandom(seed + 3) * 0.35, seededRandom(seed + 4) * Math.PI);

      if (seededRandom(seed + 5) > 0.35) {
        const x2 = cx + Math.cos(angle) * (outward + 1.2) + Math.sin(angle) * tangent * 0.6;
        const z2 = cz + Math.sin(angle) * (outward + 1.2) - Math.cos(angle) * tangent * 0.6;
        placeVegetation(x2, z2, "bush", 0.7 + seededRandom(seed + 6) * 0.2, seededRandom(seed + 7) * Math.PI);
      }
    });

  for (let offset = 4; offset < 12.5; offset += 3.2) {
    placeVegetation(cx + offset, cz + 1.5, "bush", 0.65, 0);
    placeVegetation(cx - offset, cz - 1.5, "bush", 0.6, 0);
    placeVegetation(cx + 1.5, cz + offset, "bush", 0.65, 0);
    placeVegetation(cx - 1.5, cz - offset, "bush", 0.6, 0);
  }

  buildRingRoadVegetation(cx, cz, districtIndex);
}

function buildRingRoadVegetation(cx = 0, cz = 0, districtIndex = 0) {
  const segCount = 24;

  for (let i = 0; i < segCount; i += 1) {
    const point = getRingRoadPoint(i, segCount, cx, cz);
    const next = getRingRoadPoint((i + 1) % segCount, segCount, cx, cz);
    const midAngle = Math.atan2((point.z + next.z) / 2 - cz, (point.x + next.x) / 2 - cx);
    const seed = hashSeed(`ring-veg-${districtIndex}-${i}`);
    const innerR = OUTER_RING_RADIUS + 1.45;
    const outerR = OUTER_RING_RADIUS + 2.4;

    placeVegetation(
      cx + Math.cos(midAngle) * innerR,
      cz + Math.sin(midAngle) * innerR,
      seededRandom(seed) > 0.5 ? "tree" : "bush",
      0.75 + seededRandom(seed + 1) * 0.25,
      midAngle
    );

    if (i % 2 === 0) {
      placeVegetation(
        cx + Math.cos(midAngle + 0.08) * outerR,
        cz + Math.sin(midAngle + 0.08) * outerR,
        "bush",
        0.65 + seededRandom(seed + 2) * 0.2,
        midAngle + 0.5
      );
    }
  }
}

function createCar(scale = 0.38) {
  if (!carMaterial) {
    carMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a4438,
      emissive: WARM_SOFT,
      emissiveIntensity: 0.72,
      roughness: 0.45,
      metalness: 0.18,
    });
    carGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0xfff4cc,
      transparent: true,
      opacity: 0.98,
    });
    carAccentMaterial = new THREE.MeshBasicMaterial({
      color: 0xfff8e8,
      transparent: true,
      opacity: 0.92,
    });
  }

  const car = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9 * scale, 0.32 * scale, 0.48 * scale), carMaterial);
  body.position.y = 0.04 * scale;
  car.add(body);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(0.76 * scale, 0.05 * scale, 0.36 * scale),
    carAccentMaterial
  );
  roof.position.y = 0.22 * scale;
  car.add(roof);

  const glowRing = new THREE.Mesh(
    new THREE.RingGeometry(0.2 * scale, 0.34 * scale, 20),
    new THREE.MeshBasicMaterial({
      color: WARM,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  glowRing.rotation.x = -Math.PI / 2;
  glowRing.position.y = 0.03 * scale;
  car.add(glowRing);

  [[0.48, 0.14], [0.48, -0.14], [-0.48, 0.14], [-0.48, -0.14]].forEach(([x, z]) => {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1 * scale, 10, 10), carGlowMaterial);
    lamp.position.set(x * scale, 0.06 * scale, z * scale);
    car.add(lamp);
  });

  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(1.35 * scale, 0.55 * scale, 0.78 * scale),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hit.position.y = 0.04 * scale;
  car.add(hit);

  return car;
}

function addKnowledgeCarOnOuterRing(knowledge, index, total, cx = 0, cz = 0, districtIndex = 0) {
  const seed = hashSeed(knowledge.id);
  const mesh = createCar();
  mesh.userData = {
    type: "knowledge",
    id: knowledge.id,
    question: knowledge.question,
    category: knowledge.category,
    summary: knowledge.summary,
    code: knowledge.code,
    buildingId: knowledge.buildingId,
    buildingName: knowledge.buildingName,
    districtIndex,
  };

  scene.add(mesh);
  trafficVehicles.push({
    mesh,
    mode: "ring",
    cx,
    cz,
    districtIndex,
    buildingId: knowledge.buildingId,
    radius: OUTER_RING_RADIUS,
    angle: (index / Math.max(total, 1)) * Math.PI * 2 + seededRandom(seed) * 0.05,
    speed: 0.12 + (seed % 20) / 1000,
    y: 0.42,
    lane: (seed % 3) - 1,
  });
}

function buildKnowledgeCars(districtInfos) {
  districtInfos.forEach(({ buildings, cx, cz, index: districtIndex }) => {
    const districtBuildingIds = new Set(buildings.map((building) => building.id));
    const questions = [];

    buildings.forEach((building) => {
      building.questions.forEach((question) => {
        if (question.buildingId && !districtBuildingIds.has(question.buildingId)) {
          return;
        }
        questions.push({
          ...question,
          buildingId: question.buildingId || building.id,
          buildingName: question.buildingName || building.name,
        });
      });
    });

    questions.forEach((question, carIndex) => {
      addKnowledgeCarOnOuterRing(
        question,
        carIndex,
        questions.length,
        cx,
        cz,
        districtIndex
      );
    });
  });
}

function buildDistrict(cx, cz, buildings, districtIndex, totalDistricts) {
  buildings.forEach((building, index) => {
    const mesh = createBuilding(building, index, buildings.length, cx, cz);
    scene.add(mesh);
    buildingMeshes.push(mesh);
  });

  const segments = buildDistrictRoadNetwork(cx, cz);
  roadSegments.push(...segments);
  buildStreetLamps(segments, cx, cz);
  buildDistrictVegetation(cx, cz, districtIndex);

  if (totalDistricts > 1) {
    const label = createLabelSprite(`知识小区 ${districtIndex + 1}`);
    label.position.set(cx, 5.2, cz);
    scene.add(label);
    districtLabelGroups.push(label);
  }
}

function addCityEnvironment(width = 220, depth = 220, centerX = 0, centerZ = 0) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 1, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(centerX, 0, centerZ);
  scene.add(ground);
}

function setupLighting() {
  scene.add(new THREE.AmbientLight(0x2a2824, 0.45));
  const key = new THREE.DirectionalLight(WARM, 0.55);
  key.position.set(20, 32, 18);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x888890, 0.12);
  fill.position.set(-16, 12, -20);
  scene.add(fill);
  scene.fog = new THREE.FogExp2(0x08080a, 0.0045);
}

function animate() {
  animationId = requestAnimationFrame(animate);
  const delta = clock.getDelta();

  trafficVehicles.forEach((vehicle) => {
    if (vehicle.mode === "ring") {
      vehicle.angle += vehicle.speed * delta;
      const laneOffset = vehicle.lane * 0.28;
      const radius = vehicle.radius + laneOffset;
      vehicle.mesh.position.set(
        vehicle.cx + Math.cos(vehicle.angle) * radius,
        vehicle.y + 0.18,
        vehicle.cz + Math.sin(vehicle.angle) * radius
      );
      vehicle.mesh.rotation.y = -vehicle.angle + Math.PI / 2;
      return;
    }

    vehicle.t += vehicle.speed * delta;
    if (vehicle.t > 1) vehicle.t -= 1;

    const { x1, z1, x2, z2, y } = vehicle.segment;
    const t = vehicle.reverse ? 1 - vehicle.t : vehicle.t;
    vehicle.mesh.position.set(x1 + (x2 - x1) * t, y + 0.12, z1 + (z2 - z1) * t);
    vehicle.mesh.rotation.y = Math.atan2(z2 - z1, x2 - x1) + (vehicle.reverse ? Math.PI : 0);
  });

  controls.update();
  renderer.render(scene, camera);
}

function onPointerMove(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function findUserDataFromHit(object) {
  let target = object;
  while (target) {
    if (target.userData?.type === "knowledge" || target.userData?.type === "unit") {
      return { kind: "knowledge", data: target.userData };
    }
    if (target.userData?.id && target.userData?.count !== undefined) {
      return { kind: "building", data: target.userData };
    }
    target = target.parent;
  }
  return null;
}

function onPointerClick(event) {
  if (!raycaster || !camera) return;
  onPointerMove(event);
  raycaster.setFromCamera(pointer, camera);

  const carRoots = trafficVehicles.map((vehicle) => vehicle.mesh);
  const carHits = raycaster.intersectObjects(carRoots, true);
  if (carHits.length) {
    const picked = findUserDataFromHit(carHits[0].object);
    if (picked?.kind === "knowledge" && callbacks.onCarSelect) {
      callbacks.onCarSelect(picked.data);
      return;
    }
  }

  const hits = raycaster.intersectObjects(buildingMeshes, true);
  if (!hits.length) return;

  const picked = findUserDataFromHit(hits[0].object);
  if (picked?.kind === "knowledge" && callbacks.onCarSelect) {
    callbacks.onCarSelect(picked.data);
    return;
  }
  if (picked?.kind === "building" && callbacks.onSelect) {
    callbacks.onSelect(picked.data);
  }
}

function onResize(canvas) {
  if (!camera || !renderer) return;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

export async function initKnowledgeCity(options) {
  disposeKnowledgeCity();
  callbacks = options || {};
  const canvas = options.canvas;
  if (!canvas) return;

  const response = await fetch("/api/knowledge-map");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "加载知识地图失败");
  cityData = payload;

  const districtBuildingGroups = splitIntoDistricts(payload.buildings);
  const totalDistricts = districtBuildingGroups.length;
  const grid = getDistrictGrid(totalDistricts);
  const districtInfos = districtBuildingGroups.map((buildings, index) => {
    const center = getDistrictCenter(index, totalDistricts, grid);
    return {
      buildings,
      cx: center.cx,
      cz: center.cz,
      index,
    };
  });
  const sceneBounds = getSceneBounds(districtInfos);
  payload.districtCount = totalDistricts;
  payload.buildingsPerRing = BUILDINGS_PER_RING;

  clock = new THREE.Clock();
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x08080a);

  camera = new THREE.PerspectiveCamera(48, canvas.clientWidth / canvas.clientHeight, 0.1, 600);
  const cameraBack = 52 + Math.max(0, totalDistricts - 1) * 14;
  const cameraHeight = 28 + Math.max(0, totalDistricts - 1) * 6;
  camera.position.set(sceneBounds.centerX, cameraHeight, sceneBounds.centerZ + cameraBack);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI / 2.1;
  controls.minDistance = 18;
  controls.maxDistance = 90 + Math.max(0, totalDistricts - 1) * 28;
  controls.target.set(sceneBounds.centerX, 8, sceneBounds.centerZ);

  setupLighting();
  addCityEnvironment(sceneBounds.width, sceneBounds.depth, sceneBounds.centerX, sceneBounds.centerZ);

  buildingMeshes = [];
  buildingSpots = [];
  roadSegments = [];
  districtInfos.forEach(({ cx, cz, buildings, index }) => {
    buildDistrict(cx, cz, buildings, index, totalDistricts);
  });

  buildKnowledgeCars(districtInfos);
  payload.districtSummaries = districtInfos.map(({ buildings, index }) => ({
    index: index + 1,
    buildingCount: buildings.length,
    carCount: buildings.reduce((sum, building) => sum + building.questions.length, 0),
  }));

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("click", onPointerClick);
  window.addEventListener("resize", () => onResize(canvas));

  onResize(canvas);
  animate();
  return payload;
}

export function resizeKnowledgeCity(canvas) {
  onResize(canvas);
}

export function disposeKnowledgeCity() {
  if (animationId) cancelAnimationFrame(animationId);
  animationId = null;
  buildingMeshes = [];
  buildingSpots = [];
  trafficVehicles = [];
  carMaterial = null;
  carGlowMaterial = null;
  carAccentMaterial = null;
  roadGroups = [];
  roadSegments = [];
  streetLampGroups = [];
  vegetationGroups = [];
  districtLabelGroups = [];
  roadDeckMaterial = null;
  lampPoleMaterial = null;
  lampGlowMaterial = null;
  trunkMaterial = null;
  foliageMaterial = null;
  bushMaterial = null;
  callbacks = {};
  cityData = null;
  clock = null;
  if (renderer?.domElement) {
    renderer.domElement.removeEventListener("pointermove", onPointerMove);
    renderer.domElement.removeEventListener("click", onPointerClick);
  }
  controls?.dispose();
  renderer?.dispose();
  scene = null;
  camera = null;
  renderer = null;
  controls = null;
  raycaster = null;
  pointer = null;
}

export function getCityData() {
  return cityData;
}
