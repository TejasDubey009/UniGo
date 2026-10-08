import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { PU_LANDMARKS, GIRLS_HOSTELS, BOYS_HOSTELS } from '../data/campusData';
import { useApp } from '../context/useApp';
import { reportFps } from '../context/telemetry';
import {
  Scan,
  BedDouble,
  BookOpen,
  DoorOpen,
  GraduationCap,
  Landmark,
  FlaskConical,
  Utensils,
  Dumbbell,
  Cross,
  Layers,
  LocateFixed,
  Plus,
  Minus,
  X,
  Navigation,
  Shirt,
  Check,
  Hand,
  Sun,
  Sunset,
  Moon,
} from 'lucide-react';

// Apple Maps–style palettes, one per map style. Tone mapping is off, so these sRGB colours render as written.
const THEMES = {
  day: {
    sky: 0xeef1f4,
    land: 0xf1efea, campus: 0xebe5d9, park: 0xd3e9c4, lawn: 0xc3e2b0, track: 0xe8b9a2,
    road: 0xffffff, roadEdge: 0xd8d5cd, highway: 0xfbe09e, highwayEdge: 0xe4c06a,
    water: 0xa9d3f2, sand: 0xf3e6c6,
    building: 0xf7f6f2, roof: 0xe9e4d8, edge: 0xc4c0b6,
    treeA: 0xa6d594, treeB: 0x8fca7e, scooter: 0x9fe870,
    hemiSky: 0xffffff, hemiGround: 0xd8d4ca, hemiInt: 2.75, sun: 0xffffff, sunInt: 0.6, sunPos: [-60, 110, 60],
  },
  sunset: {
    sky: 0xf6e1d0,
    land: 0xf2e8dd, campus: 0xece0cf, park: 0xd5e2b6, lawn: 0xc7d9a2, track: 0xe6aa8f,
    road: 0xfffaf4, roadEdge: 0xdfd0c1, highway: 0xf8d595, highwayEdge: 0xe0b062,
    water: 0x9ec4e3, sand: 0xf2dcb8,
    building: 0xf8f0e7, roof: 0xeddcc8, edge: 0xcbb9a6,
    treeA: 0xabc98a, treeB: 0x95ba78, scooter: 0x9fe870,
    hemiSky: 0xffeadb, hemiGround: 0xd9c3ae, hemiInt: 2.35, sun: 0xffc29a, sunInt: 1.25, sunPos: [-120, 45, 40],
  },
  night: {
    sky: 0x1c1d21,
    land: 0x2a2b2f, campus: 0x2e2f33, park: 0x28372c, lawn: 0x2c3e30, track: 0x4b3b34,
    road: 0x4c4d53, roadEdge: 0x38393e, highway: 0x6b5b37, highwayEdge: 0x4e442a,
    water: 0x1b324b, sand: 0x3b362c,
    building: 0x5a5b62, roof: 0x4c4d53, edge: 0x6c6d74,
    treeA: 0x36573b, treeB: 0x2f4c34, scooter: 0x9fe870,
    hemiSky: 0xa9b4d0, hemiGround: 0x202125, hemiInt: 2.3, sun: 0xc8d5ff, sunInt: 0.45, sunPos: [40, 100, -30],
  },
};

// Lambert materials whose colour comes straight from the theme
const THEMED_MATERIALS = [
  'land', 'campus', 'park', 'lawn', 'track', 'road', 'roadEdge', 'highway', 'highwayEdge',
  'water', 'sand', 'building', 'roof', 'scooter',
];

const MAP_STYLES = [
  { value: 'day', label: 'Day', icon: Sun, swatch: '#f1efea' },
  { value: 'sunset', label: 'Sunset', icon: Sunset, swatch: '#f2e1cf' },
  { value: 'night', label: 'Night', icon: Moon, swatch: '#2a2b2f' },
];

// Place categories: Apple-style colour + glyph per kind of place
const POI_STYLES = {
  gate: { color: '#2f7cf6', icon: DoorOpen, label: 'Campus gate' },
  academic: { color: '#a3774a', icon: GraduationCap, label: 'Academic' },
  food: { color: '#f08a24', icon: Utensils, label: 'Food & shops' },
  sports: { color: '#2e9e4f', icon: Dumbbell, label: 'Sports' },
  health: { color: '#e5484d', icon: Cross, label: 'Health' },
  'girls-hostel': { color: '#df4f93', icon: BedDouble, label: 'Girls hostel' },
  'boys-hostel': { color: '#1694b5', icon: BedDouble, label: 'Boys hostel' },
};
const KIND_BY_ID = { 'canteen-complex': 'food', 'sports-complex': 'sports', 'health-centre': 'health' };
const ICON_BY_ID = { library: BookOpen, 'admin-block': Landmark, 'science-complex': FlaskConical };
const SHORT_NAMES = {
  'gate-1': 'Gate 1',
  'gate-2': 'Gate 2',
  'admin-block': 'Admin & Clock Tower',
  library: 'Central Library',
  'sjc-campus': 'Silver Jubilee Campus',
  'science-complex': 'Science Complex',
  'canteen-complex': 'Canteen',
  'sports-complex': 'Sports Stadium',
  'health-centre': 'Health Centre',
};
// The drawn model nudges a few places so roads don't run through them
const POS_OVERRIDES = { 'gate-1': [-31, 0, 22], 'gate-2': [31, 0, 22], 'canteen-complex': [9, 0, -3] };
// Height of each landmark's roof, where its marker sits
const LANDMARK_ANCHOR = {
  'gate-1': 5.6, 'gate-2': 5.6, 'admin-block': 12.8, library: 7.6, 'sjc-campus': 6.4,
  'science-complex': 7, 'canteen-complex': 3.2, 'sports-complex': 2.4, 'health-centre': 4.2,
};

const isHostel = (node) => node.category === 'girls-hostel' || node.category === 'boys-hostel';
const hostelHeight = (data) => 1.2 + (parseInt(data.floor, 10) || 4) * 0.8;

const NODES = [...PU_LANDMARKS, ...GIRLS_HOSTELS, ...BOYS_HOSTELS].map((data) => {
  const kind = KIND_BY_ID[data.id] || data.category;
  const style = POI_STYLES[kind] || POI_STYLES.academic;
  return {
    id: data.id,
    data,
    name: data.name,
    label: SHORT_NAMES[data.id] || data.name.replace(/ Hostel$/, ''),
    category: data.category,
    style,
    Icon: ICON_BY_ID[data.id] || style.icon,
    pos: POS_OVERRIDES[data.id] || data.pos,
    anchorY: isHostel(data) ? hostelHeight(data) + 0.5 : LANDMARK_ANCHOR[data.id] ?? 4.5,
    // Hostel names only appear once you zoom in, like minor places on a real map
    labelRange: isHostel(data) ? 50 : 140,
  };
});
const NODE_BY_ID = Object.fromEntries(NODES.map((n) => [n.id, n]));

// Static map text: water, roads and the campus name
const AREA_LABELS = [
  { id: 'sea', text: 'Bay of Bengal', pos: [34, 0, 52], kind: 'water' },
  { id: 'ecr', text: 'East Coast Road', pos: [-58, 0, 26], kind: 'road' },
  // Area names are for the overview; they step aside once you zoom in on the buildings
  { id: 'campus', text: 'Pondicherry University', pos: [0, 0, -50], kind: 'area', hideCloserThan: 75 },
];

const ROADS = [
  { from: [-260, 26], to: [260, 26], w: 7, highway: true }, // East Coast Road
  { from: [-31, 26], to: [-31, -42], w: 3.2 }, // West drive (Gate 1)
  { from: [31, 26], to: [31, -42], w: 3.2 }, // East drive (Gate 2)
  { from: [-31, -42], to: [31, -42], w: 3 }, // North road
  { from: [-31, -15], to: [31, -15], w: 3.2 }, // Hostel road
  { from: [-31, 5], to: [-7, 5], w: 3 }, // Academic road, west
  { from: [7, 5], to: [31, 5], w: 3 }, // Academic road, east
  { from: [0, 26], to: [0, 12], w: 4 }, // Main avenue to the library circle
  { from: [0, -2], to: [0, -42], w: 4 }, // Main avenue north
];
const LIBRARY_CIRCLE = { center: [0, 5], radius: 7, w: 2.8 };

const CAMERA_PRESETS = {
  aerial: { lookAt: [0, 0, -6], cam: [0, 52, 52] },
  'girls-hostels': { lookAt: [18, 0, -28], cam: [18, 22, -6] },
  'boys-hostels': { lookAt: [-18, 0, -28], cam: [-18, 22, -6] },
  academics: { lookAt: [0, 0, 4], cam: [0, 20, 28] },
  'gate-1': { lookAt: [-31, 0, 22], cam: [-31, 12, 38] },
};

const PRESET_CHIPS = [
  { value: 'aerial', label: 'Full campus', icon: Scan },
  { value: 'girls-hostels', label: 'Girls hostels', icon: BedDouble, color: POI_STYLES['girls-hostel'].color },
  { value: 'boys-hostels', label: 'Boys hostels', icon: BedDouble, color: POI_STYLES['boys-hostel'].color },
  { value: 'academics', label: 'Library', icon: BookOpen, color: POI_STYLES.academic.color },
  { value: 'gate-1', label: 'Gate 1 hub', icon: DoorOpen, color: POI_STYLES.gate.color },
];

const LEGEND = [
  { label: 'Girls hostels', color: POI_STYLES['girls-hostel'].color },
  { label: 'Boys hostels', color: POI_STYLES['boys-hostel'].color },
  { label: 'Campus gates', color: POI_STYLES.gate.color },
];

const TILT_PHI = 0.95;
const FLAT_PHI = 0.02;
const MIN_RADIUS = 12;
const MAX_RADIUS = 110;
const FORWARD = new THREE.Vector3(0, 0, 1);
const DRAG_CLICK_TOLERANCE_PX = 6;

export default function CampusMap3D({ onHostelSelect, highlightedId = null }) {
  const mountRef = useRef(null);
  const {
    activeTab,
    setActiveTab,
    selected3DTarget,
    setSelected3DTarget,
    setRideDropTarget,
    mapDayNightMode,
    setMapDayNightMode,
  } = useApp();

  const [viewPreset, setViewPreset] = useState('aerial');
  const [hoveredId, setHoveredId] = useState(null);
  const [selectedId, setSelectedId] = useState(highlightedId);
  const [isCardOpen, setIsCardOpen] = useState(false);
  const [is2D, setIs2D] = useState(false);
  const [isStyleMenuOpen, setIsStyleMenuOpen] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  // Follow picks made outside the map (laundry form, Google map card) by moving the pin there
  const [seenHighlight, setSeenHighlight] = useState(highlightedId);
  if (highlightedId !== seenHighlight) {
    setSeenHighlight(highlightedId);
    if (highlightedId) setSelectedId(highlightedId);
  }
  const [seenTarget, setSeenTarget] = useState(selected3DTarget);
  if (selected3DTarget !== seenTarget) {
    setSeenTarget(selected3DTarget);
    if (selected3DTarget?.id && NODE_BY_ID[selected3DTarget.id]) setSelectedId(selected3DTarget.id);
  }

  // Three.js state shared between the scene effect and the controls
  const sceneRef = useRef(null);
  const themeTargetsRef = useRef(null);
  const targetCamPos = useRef(new THREE.Vector3(...CAMERA_PRESETS.aerial.cam));
  const targetLookAt = useRef(new THREE.Vector3(...CAMERA_PRESETS.aerial.lookAt));
  const currentLookAt = useRef(new THREE.Vector3(...CAMERA_PRESETS.aerial.lookAt));
  const interactiveObjects = useRef([]);
  const is2DRef = useRef(false);
  const markerEls = useRef({});
  const areaLabelEls = useRef({});
  const compassRef = useRef(null);
  const styleMenuRef = useRef(null);

  // The scene's event handlers live for the whole mount, so read the latest callbacks through refs
  const onHostelSelectRef = useRef(onHostelSelect);
  const selectNodeRef = useRef(null);
  useEffect(() => {
    onHostelSelectRef.current = onHostelSelect;
  }, [onHostelSelect]);

  // ---- Camera helpers (refs only, so they're safe to call from the scene's listeners) ----
  const getOrbit = () => {
    const offset = new THREE.Vector3().subVectors(targetCamPos.current, targetLookAt.current);
    const radius = offset.length() || 1;
    return {
      radius,
      theta: Math.atan2(offset.x, offset.z),
      phi: Math.acos(THREE.MathUtils.clamp(offset.y / radius, -1, 1)),
    };
  };

  const setOrbit = (lookAt, radius, theta, phi) => {
    targetLookAt.current.copy(lookAt);
    targetCamPos.current.set(
      lookAt.x + radius * Math.sin(phi) * Math.sin(theta),
      lookAt.y + radius * Math.cos(phi),
      lookAt.z + radius * Math.sin(phi) * Math.cos(theta)
    );
  };

  const flyToPos = (pos) => {
    if (!pos) return;
    const { theta } = getOrbit();
    setOrbit(new THREE.Vector3(pos[0], (pos[1] || 0) + 1, pos[2]), 34, theta, is2DRef.current ? FLAT_PHI : TILT_PHI);
  };

  const zoomBy = (factor) => {
    const { radius, theta, phi } = getOrbit();
    setOrbit(targetLookAt.current.clone(), THREE.MathUtils.clamp(radius * factor, MIN_RADIUS, MAX_RADIUS), theta, phi);
  };

  const selectNode = (node, { fly = true } = {}) => {
    setViewPreset(null);
    setSelectedId(node.id);
    setIsCardOpen(true);
    if (fly) flyToPos(node.pos);
    if (isHostel(node)) onHostelSelectRef.current?.(node.data);
  };
  useEffect(() => {
    selectNodeRef.current = selectNode;
  });

  // Build the scene once; map style changes recolour it in place
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color();
    scene.fog = new THREE.Fog(0xffffff, 140, 340);

    const camera = new THREE.PerspectiveCamera(42, (container.clientWidth || 1) / (container.clientHeight || 1), 1, 420);
    camera.position.copy(targetCamPos.current);
    camera.lookAt(currentLookAt.current);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.NoToneMapping;
    const domEl = renderer.domElement;
    domEl.style.display = 'block';
    domEl.style.cursor = 'grab';
    // Horizontal drags rotate the campus; vertical swipes still scroll the page on touch screens
    domEl.style.touchAction = 'pan-y';
    container.appendChild(domEl);

    // Soft sky fill does most of the work; a gentle sun adds shape and light shadows
    const hemiLight = new THREE.HemisphereLight();
    scene.add(hemiLight);
    const sunLight = new THREE.DirectionalLight();
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 400;
    sunLight.shadow.camera.left = -80;
    sunLight.shadow.camera.right = 80;
    sunLight.shadow.camera.top = 80;
    sunLight.shadow.camera.bottom = -80;
    sunLight.shadow.bias = -0.0004;
    sunLight.shadow.radius = 3;
    scene.add(sunLight);

    const mats = createMaterials();
    const trees = buildTrees(scene, mats);
    buildGround(scene, mats);
    ROADS.forEach((road) => addRoad(scene, mats, road));
    addRoundabout(scene, mats, LIBRARY_CIRCLE);
    interactiveObjects.current = NODES.map((node) => buildPlace(scene, mats, node));
    const vehicles = buildScooters(scene, mats);

    themeTargetsRef.current = { scene, mats, trees, hemiLight, sunLight };
    applyTheme(themeTargetsRef.current, THEMES.day);

    // ---- Pointer interaction ----
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const pickNode = (clientX, clientY) => {
      const rect = domEl.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      let hit = raycaster.intersectObjects(interactiveObjects.current, true)[0]?.object;
      while (hit && !hit.userData?.isCampusNode) hit = hit.parent;
      return hit ? NODE_BY_ID[hit.userData.id] : null;
    };

    // Orbit around the target; in 2D only the heading turns
    const orbit = (dx, dy) => {
      const { radius, theta, phi } = getOrbit();
      const nextPhi = is2DRef.current ? FLAT_PHI : THREE.MathUtils.clamp(phi - dy * 0.004, 0.15, 1.45);
      setOrbit(targetLookAt.current.clone(), radius, theta - dx * 0.005, nextPhi);
    };

    let drag = null;
    let lastHoverId = null;
    const setHover = (id) => {
      if (id === lastHoverId) return;
      lastHoverId = id;
      setHoveredId(id);
    };

    const onPointerDown = (e) => {
      if (e.button !== 0) return;
      setHasInteracted(true);
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
      try {
        domEl.setPointerCapture(e.pointerId);
      } catch {
        // Pointer already released; the drag still works while the pointer stays over the canvas
      }
      domEl.style.cursor = 'grabbing';
    };

    const onPointerMove = (e) => {
      if (drag && e.pointerId === drag.id) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        drag.x = e.clientX;
        drag.y = e.clientY;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        if (drag.moved >= DRAG_CLICK_TOLERANCE_PX && !drag.turned) {
          drag.turned = true;
          setViewPreset(null);
        }
        orbit(dx, dy);
        setHover(null);
        return;
      }
      if (e.pointerType !== 'mouse') return;
      const node = pickNode(e.clientX, e.clientY);
      setHover(node?.id ?? null);
      domEl.style.cursor = node ? 'pointer' : 'grab';
    };

    // A press that barely moved is a click: select what's under it, or dismiss the place card
    const onPointerUp = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const isClick = e.type === 'pointerup' && drag.moved < DRAG_CLICK_TOLERANCE_PX;
      drag = null;
      domEl.style.cursor = 'grab';
      if (!isClick) return;
      const node = pickNode(e.clientX, e.clientY);
      if (node) selectNodeRef.current?.(node);
      else setIsCardOpen(false);
    };

    const onPointerLeave = () => {
      if (!drag) setHover(null);
    };

    const onWheel = (e) => {
      e.preventDefault();
      setHasInteracted(true);
      zoomBy(1 + e.deltaY * 0.0008);
    };

    domEl.addEventListener('pointerdown', onPointerDown);
    domEl.addEventListener('pointermove', onPointerMove);
    domEl.addEventListener('pointerup', onPointerUp);
    domEl.addEventListener('pointercancel', onPointerUp);
    domEl.addEventListener('pointerleave', onPointerLeave);
    domEl.addEventListener('wheel', onWheel, { passive: false });

    // ---- Render loop (skips frames while scrolled out of view) ----
    let isVisible = true;
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
    });
    visibilityObserver.observe(container);

    const size = { w: container.clientWidth, h: container.clientHeight };
    const projected = new THREE.Vector3();
    const worldPoint = new THREE.Vector3();

    // Pin each HTML marker to its 3D anchor
    const placeOnScreen = (el, x, y, z) => {
      projected.set(x, y, z).project(camera);
      const onScreen = projected.z < 1 && Math.abs(projected.x) < 1.2 && Math.abs(projected.y) < 1.2;
      el.style.visibility = onScreen ? 'visible' : 'hidden';
      if (!onScreen) return null;
      el.style.transform = `translate3d(${((projected.x + 1) / 2) * size.w}px, ${((1 - projected.y) / 2) * size.h}px, 0)`;
      return camera.position.distanceTo(worldPoint.set(x, y, z));
    };

    const updateOverlays = () => {
      NODES.forEach((node) => {
        const el = markerEls.current[node.id];
        if (!el) return;
        const dist = placeOnScreen(el, node.pos[0], node.anchorY, node.pos[2]);
        if (dist === null) return;
        el.style.zIndex = String(1000 - Math.round(dist * 4));
        const far = dist > node.labelRange ? '1' : '0';
        if (el.dataset.far !== far) el.dataset.far = far;
      });
      AREA_LABELS.forEach((label) => {
        const el = areaLabelEls.current[label.id];
        if (!el) return;
        const dist = placeOnScreen(el, ...label.pos);
        if (dist !== null && label.hideCloserThan) el.style.opacity = dist < label.hideCloserThan ? '0' : '1';
      });
      if (compassRef.current) {
        const heading = Math.atan2(camera.position.x - currentLookAt.current.x, camera.position.z - currentLookAt.current.z);
        compassRef.current.style.transform = `rotate(${heading}rad)`;
      }
    };

    let reqId;
    let frameCount = 0;
    let lastFpsUpdate = performance.now();

    const animate = (time) => {
      reqId = requestAnimationFrame(animate);
      if (!isVisible) return;

      frameCount++;
      if (time - lastFpsUpdate >= 1000) {
        reportFps(Math.round((frameCount * 1000) / (time - lastFpsUpdate)));
        frameCount = 0;
        lastFpsUpdate = time;
      }

      camera.position.lerp(targetCamPos.current, 0.075);
      currentLookAt.current.lerp(targetLookAt.current, 0.075);
      camera.lookAt(currentLookAt.current);

      vehicles.forEach((v) => {
        v.progress = (v.progress + v.speed) % 1;
        v.mesh.position.copy(v.curve.getPointAt(v.progress));
        v.mesh.quaternion.setFromUnitVectors(FORWARD, v.curve.getTangentAt(v.progress));
      });

      renderer.render(scene, camera);
      updateOverlays();
    };
    reqId = requestAnimationFrame(animate);

    // Resize with the container (not just the window), e.g. when the page layout reflows
    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (!w || !h) return;
      size.w = w;
      size.h = h;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(reqId);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      domEl.removeEventListener('pointerdown', onPointerDown);
      domEl.removeEventListener('pointermove', onPointerMove);
      domEl.removeEventListener('pointerup', onPointerUp);
      domEl.removeEventListener('pointercancel', onPointerUp);
      domEl.removeEventListener('pointerleave', onPointerLeave);
      domEl.removeEventListener('wheel', onWheel);

      // Free GPU memory; browsers cap the number of live WebGL contexts
      scene.traverse((obj) => {
        obj.geometry?.dispose();
        const materials = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
        materials.forEach((m) => m.dispose());
      });
      renderer.dispose();
      renderer.forceContextLoss();
      domEl.remove();
      sceneRef.current = null;
      themeTargetsRef.current = null;
      interactiveObjects.current = [];
    };
  }, []);

  // Recolour for the chosen map style without rebuilding the scene or moving the camera
  useEffect(() => {
    if (themeTargetsRef.current) applyTheme(themeTargetsRef.current, THEMES[mapDayNightMode] || THEMES.day);
  }, [mapDayNightMode]);

  // Fly to places picked elsewhere (laundry hostel dropdown, Google map card)
  useEffect(() => {
    flyToPos(selected3DTarget ? NODE_BY_ID[selected3DTarget.id]?.pos || selected3DTarget.pos : null);
  }, [selected3DTarget]);

  useEffect(() => {
    if (highlightedId) flyToPos(NODE_BY_ID[highlightedId]?.pos);
  }, [highlightedId]);

  // Close the map style menu on outside click or Escape; Escape also closes the place card
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      setIsStyleMenuOpen(false);
      setIsCardOpen(false);
    };
    const onPointerDown = (e) => {
      if (!styleMenuRef.current?.contains(e.target)) setIsStyleMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, []);

  const handlePresetChange = (preset) => {
    setHasInteracted(true);
    setViewPreset(preset);
    const lookAt = new THREE.Vector3(...CAMERA_PRESETS[preset].lookAt);
    const offset = new THREE.Vector3(...CAMERA_PRESETS[preset].cam).sub(lookAt);
    const radius = offset.length();
    const phi = is2DRef.current ? FLAT_PHI : Math.acos(offset.y / radius);
    setOrbit(lookAt, radius, Math.atan2(offset.x, offset.z), phi);
  };

  const toggle2D = () => {
    const next = !is2D;
    is2DRef.current = next;
    setIs2D(next);
    setHasInteracted(true);
    const { radius, theta } = getOrbit();
    setOrbit(targetLookAt.current.clone(), radius, theta, next ? FLAT_PHI : TILT_PHI);
  };

  const resetNorth = () => {
    const { radius, phi } = getOrbit();
    setOrbit(targetLookAt.current.clone(), radius, 0, phi);
  };

  const theme = mapDayNightMode === 'night' ? 'dark' : 'light';
  const card = isCardOpen ? NODE_BY_ID[selectedId] : null;
  const isLaundryPick = Boolean(card && onHostelSelect && isHostel(card));
  const CardIcon = card?.Icon;

  return (
    <div
      className="campus-map @container relative w-full h-full select-none overflow-hidden rounded-[inherit]"
      data-theme={theme}
    >
      {/* WebGL canvas */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* Map text and place markers, positioned every frame by the render loop */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-[5]">
        {AREA_LABELS.map((label) => (
          <span
            key={label.id}
            ref={(el) => {
              areaLabelEls.current[label.id] = el;
            }}
            className={`map-area-label map-area-label-${label.kind}`}
            style={{ visibility: 'hidden' }}
          >
            {label.text}
          </span>
        ))}
        {NODES.map((node) => {
          const isSelected = node.id === selectedId;
          const { Icon } = node;
          return (
            <button
              key={node.id}
              type="button"
              ref={(el) => {
                markerEls.current[node.id] = el;
              }}
              onClick={() => {
                setHasInteracted(true);
                selectNode(node);
              }}
              aria-label={node.name}
              aria-pressed={isSelected}
              className={`map-poi ${isSelected ? 'is-selected' : ''} ${hoveredId === node.id ? 'is-hover' : ''}`}
              style={{ '--poi': node.style.color, visibility: 'hidden' }}
            >
              {isSelected ? (
                <span key={`pin-${node.id}`} className="map-poi-pin" aria-hidden="true">
                  <span className="map-poi-pin-head">
                    <Icon className="w-4 h-4" strokeWidth={2.4} />
                  </span>
                </span>
              ) : (
                <span className="map-poi-dot" aria-hidden="true">
                  <Icon className="w-3 h-3" strokeWidth={2.6} />
                </span>
              )}
              <span className="map-poi-label">{node.label}</span>
            </button>
          );
        })}
      </div>

      {/* Quick places, like the category chips under a map search bar */}
      <div className="absolute top-3 left-3 right-[60px] z-10 flex gap-1.5 overflow-x-auto pb-1 ![scrollbar-width:none] pointer-events-none">
        {PRESET_CHIPS.map((chip) => {
          const Icon = chip.icon;
          const isActive = viewPreset === chip.value;
          return (
            <button
              key={chip.value}
              type="button"
              onClick={() => handlePresetChange(chip.value)}
              aria-pressed={isActive}
              className={`map-chip pointer-events-auto ${isActive ? 'is-active' : 'map-glass'}`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" style={chip.color && !isActive ? { color: chip.color } : undefined} aria-hidden="true" />
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Map controls: style, 2D/3D, recenter */}
      <div ref={styleMenuRef} className="absolute top-3 right-3 z-20 flex flex-col items-end gap-2">
        <div className="map-glass rounded-[12px] flex flex-col overflow-hidden divide-y divide-[var(--map-line)]">
          <button
            type="button"
            onClick={() => setIsStyleMenuOpen((open) => !open)}
            aria-expanded={isStyleMenuOpen}
            aria-label="Map style"
            className="map-btn"
          >
            <Layers className="w-[18px] h-[18px]" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={toggle2D}
            aria-label={is2D ? 'Switch to 3D view' : 'Switch to 2D view'}
            className="map-btn text-[13px] font-semibold tracking-tight"
          >
            {is2D ? '3D' : '2D'}
          </button>
          <button type="button" onClick={() => handlePresetChange('aerial')} aria-label="Show the whole campus" className="map-btn">
            <LocateFixed className="w-[18px] h-[18px]" aria-hidden="true" />
          </button>
        </div>

        {isStyleMenuOpen && (
          <div
            role="menu"
            aria-label="Map style"
            className="map-glass absolute top-0 right-[52px] w-[200px] rounded-[14px] p-1.5 origin-top-right animate-pop-in"
          >
            <p className="px-2.5 pt-1.5 pb-1 text-[12px] font-semibold text-[var(--map-muted)]">Map style</p>
            {MAP_STYLES.map((option) => {
              const isActive = mapDayNightMode === option.value;
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isActive}
                  onClick={() => {
                    setMapDayNightMode(option.value);
                    setIsStyleMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-[14px] font-medium hover:bg-[var(--map-hover)] transition-colors duration-150"
                >
                  <span
                    className="w-6 h-6 rounded-[7px] flex items-center justify-center shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.2)]"
                    style={{ background: option.swatch, color: option.value === 'night' ? '#f5f5f7' : '#6e6e73' }}
                  >
                    <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  </span>
                  <span className="flex-1 text-left">{option.label}</span>
                  {isActive && <Check className="w-4 h-4 text-[#0a84ff]" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Compass and zoom */}
      <div className={`absolute bottom-3 right-3 z-10 flex flex-col items-center gap-2 ${card ? '@max-2xl:hidden' : ''}`}>
        <button type="button" onClick={resetNorth} aria-label="Point the map north" className="map-glass w-10 h-10 rounded-full flex items-center justify-center transition-transform duration-100 active:scale-95">
          <svg ref={compassRef} viewBox="0 0 40 40" className="w-10 h-10" aria-hidden="true">
            <path d="M20 5 L23.5 14 H16.5 Z" fill="#ff3b30" />
            <text x="20" y="25.5" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor">
              N
            </text>
          </svg>
        </button>
        <div className="map-glass rounded-[12px] flex flex-col overflow-hidden divide-y divide-[var(--map-line)]">
          <button type="button" onClick={() => zoomBy(0.75)} aria-label="Zoom in" className="map-btn">
            <Plus className="w-[18px] h-[18px]" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => zoomBy(1.33)} aria-label="Zoom out" className="map-btn">
            <Minus className="w-[18px] h-[18px]" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Legend and first-run hint */}
      {!card && (
        <div className="absolute bottom-3 left-3 right-[60px] z-10 flex items-end justify-between gap-2 pointer-events-none">
          <ul aria-label="Map legend" className="map-glass hidden @3xl:flex items-center gap-3.5 h-9 px-3.5 rounded-full text-[12px] font-medium">
            {LEGEND.map((item) => (
              <li key={item.label} className="flex items-center gap-1.5">
                <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                {item.label}
              </li>
            ))}
          </ul>
          <p
            className={`map-glass flex items-center gap-2 h-9 px-3.5 rounded-full text-[12px] font-medium transition-opacity duration-500 ${
              hasInteracted ? 'opacity-0' : 'opacity-100'
            }`}
          >
            <Hand className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="@xl:hidden">Drag to turn · tap a place</span>
            <span className="hidden @xl:inline">Drag to turn · scroll to zoom · click a place</span>
          </p>
        </div>
      )}

      {/* Place card for the selected place */}
      {card && (
        <article
          key={card.id}
          aria-label={card.name}
          className="map-glass map-card absolute z-30 left-3 right-3 bottom-3 @2xl:right-auto @2xl:w-[300px] rounded-[18px] p-4 animate-sheet-up"
        >
          <div className="flex items-start gap-3">
            <span
              className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0"
              style={{ backgroundColor: card.style.color }}
              aria-hidden="true"
            >
              <CardIcon className="w-[18px] h-[18px]" strokeWidth={2.2} />
            </span>
            <div className="flex-1 min-w-0">
              <h4 className="text-[17px] font-semibold leading-tight tracking-tight">{card.name}</h4>
              <p className="text-[13px] text-[var(--map-muted)] mt-0.5">
                {card.style.label}
                {card.data.rooms && ` · ${card.data.rooms} · ${card.data.floor}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsCardOpen(false)}
              aria-label="Close place card"
              className="w-7 h-7 -mr-1 -mt-0.5 rounded-full flex items-center justify-center bg-[var(--map-hover)] text-[var(--map-muted)] hover:text-[var(--map-ink)] transition-colors duration-150 shrink-0"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {card.data.desc && !isHostel(card) && (
            <p className="mt-3 text-[13px] leading-relaxed text-[var(--map-muted)] line-clamp-2">{card.data.desc}</p>
          )}

          {isLaundryPick && (
            <p className="mt-3 flex items-center gap-1.5 text-[13px] font-semibold text-[var(--map-ink)]">
              <span className="w-4 h-4 rounded-full bg-lime text-forest flex items-center justify-center">
                <Check className="w-3 h-3" strokeWidth={3} aria-hidden="true" />
              </span>
              Set as your laundry pickup
            </p>
          )}

          <div className="mt-3.5 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setRideDropTarget(card.name);
                setActiveTab('rides');
              }}
              className="btn btn-sm btn-primary flex-1"
            >
              <Navigation className="w-3.5 h-3.5" aria-hidden="true" />
              {activeTab === 'rides' ? 'Set as drop' : 'Ride here'}
            </button>
            {!isLaundryPick && (
              <button
                type="button"
                onClick={() => {
                  setSelected3DTarget(card.data);
                  setActiveTab('laundry');
                }}
                className="btn btn-sm btn-quiet flex-1"
              >
                <Shirt className="w-3.5 h-3.5" aria-hidden="true" />
                {activeTab === 'laundry' ? 'Pick up here' : 'Book laundry'}
              </button>
            )}
          </div>
        </article>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scene builders
// ---------------------------------------------------------------------------

function createMaterials() {
  const mats = Object.fromEntries(THEMED_MATERIALS.map((key) => [key, new THREE.MeshLambertMaterial()]));
  mats.edge = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.55 });
  // Trees take their colour per instance
  mats.tree = new THREE.MeshLambertMaterial({ color: 0xffffff });
  mats.seat = new THREE.MeshLambertMaterial({ color: 0x163300 });
  return mats;
}

function applyTheme({ scene, mats, trees, hemiLight, sunLight }, theme) {
  scene.background.setHex(theme.sky);
  scene.fog.color.setHex(theme.sky);
  THEMED_MATERIALS.forEach((key) => mats[key].color.setHex(theme[key]));
  mats.edge.color.setHex(theme.edge);
  hemiLight.color.setHex(theme.hemiSky);
  hemiLight.groundColor.setHex(theme.hemiGround);
  hemiLight.intensity = theme.hemiInt;
  sunLight.color.setHex(theme.sun);
  sunLight.intensity = theme.sunInt;
  sunLight.position.set(...theme.sunPos);

  const colors = [new THREE.Color(theme.treeA), new THREE.Color(theme.treeB)];
  trees.variants.forEach((variant, i) => trees.mesh.setColorAt(i, colors[variant]));
  trees.mesh.instanceColor.needsUpdate = true;
}

// Flat ground layer; `y` stacks layers so they don't flicker against each other
function addFlat(scene, geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

const flatPlane = (w, d) => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
const flatCircle = (r) => new THREE.CircleGeometry(r, 40).rotateX(-Math.PI / 2);

// Rounded rectangle on the ground between (x0, z0) and (x1, z1)
function flatRoundedRect(x0, z0, x1, z1, r) {
  const shape = new THREE.Shape();
  const top = -z1; // shape y maps to world -z after rotating flat
  const bottom = -z0;
  shape.moveTo(x0 + r, top);
  shape.lineTo(x1 - r, top);
  shape.quadraticCurveTo(x1, top, x1, top + r);
  shape.lineTo(x1, bottom - r);
  shape.quadraticCurveTo(x1, bottom, x1 - r, bottom);
  shape.lineTo(x0 + r, bottom);
  shape.quadraticCurveTo(x0, bottom, x0, bottom - r);
  shape.lineTo(x0, top + r);
  shape.quadraticCurveTo(x0, top, x0 + r, top);
  return new THREE.ShapeGeometry(shape, 6).rotateX(-Math.PI / 2);
}

function buildGround(scene, mats) {
  // Land north of the coast, the sea to the south, a strip of beach between
  addFlat(scene, flatPlane(700, 433), mats.land, 0, 0, -183.5);
  addFlat(scene, flatPlane(700, 400), mats.water, 0, -0.02, 233);
  addFlat(scene, flatPlane(700, 3.4), mats.sand, 0, 0.02, 31.4);

  // University grounds
  addFlat(scene, flatRoundedRect(-37, -47, 37, 22.4, 5), mats.campus, 0, 0.02, 0);

  // Parks and lawns
  [
    [-11.5, 16.5, -2.5, 21.6],
    [3, 15, 9.5, 21.6],
    [-26, -13.2, -4.5, -8.4],
    [6.5, -13.2, 14, -6.8],
    [-29, -45.5, 29, -43.6],
    [-37, -12, -33, 20],
    [33, -12, 37, 20],
  ].forEach(([x0, z0, x1, z1]) => addFlat(scene, flatRoundedRect(x0, z0, x1, z1, 1.4), mats.park, 0, 0.04, 0));

  // Lawn inside the library circle
  addFlat(scene, flatCircle(5.6), mats.lawn, LIBRARY_CIRCLE.center[0], 0.05, LIBRARY_CIRCLE.center[1]);
}

// Road with a slightly wider casing underneath and round ends so junctions read as one network
function addRoad(scene, mats, { from, to, w, highway = false }) {
  const [x1, z1] = from;
  const [x2, z2] = to;
  const length = Math.hypot(x2 - x1, z2 - z1);
  const angle = Math.atan2(z2 - z1, x2 - x1);
  const layers = highway
    ? [
        { mat: mats.highwayEdge, width: w + 1.1, y: 0.07 },
        { mat: mats.highway, width: w, y: 0.1 },
      ]
    : [
        { mat: mats.roadEdge, width: w + 0.8, y: 0.06 },
        { mat: mats.road, width: w, y: 0.08 },
      ];

  layers.forEach(({ mat, width, y }) => {
    const body = addFlat(scene, flatPlane(length, width), mat, (x1 + x2) / 2, y, (z1 + z2) / 2);
    body.rotation.y = -angle;
    addFlat(scene, flatCircle(width / 2), mat, x1, y, z1);
    addFlat(scene, flatCircle(width / 2), mat, x2, y, z2);
  });
}

function addRoundabout(scene, mats, { center, radius, w }) {
  const ring = (inner, outer) => new THREE.RingGeometry(inner, outer, 64).rotateX(-Math.PI / 2);
  addFlat(scene, ring(radius - w / 2 - 0.4, radius + w / 2 + 0.4), mats.roadEdge, center[0], 0.06, center[1]);
  addFlat(scene, ring(radius - w / 2, radius + w / 2), mats.road, center[0], 0.08, center[1]);
}

// Box with lighter roof and crisp outline, the building block of the model
function addBox(group, mats, w, h, d, x = 0, z = 0, y = 0) {
  const geometry = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geometry, [mats.building, mats.building, mats.roof, mats.building, mats.building, mats.building]);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), mats.edge);
  edges.position.copy(mesh.position);
  group.add(edges);
  return mesh;
}

function addCylinder(group, mats, radius, h, y, material = mats.building) {
  const geometry = new THREE.CylinderGeometry(radius, radius, h, 48);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = y + h / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30), mats.edge);
  edges.position.copy(mesh.position);
  group.add(edges);
  return mesh;
}

function buildPlace(scene, mats, node) {
  const group = new THREE.Group();
  group.position.set(...node.pos);

  if (isHostel(node)) {
    // Two-wing residence block
    const h = hostelHeight(node.data);
    addBox(group, mats, 5.4, h, 2.2, 0, -1.1);
    addBox(group, mats, 2.2, h, 4.6, -1.6, 0.2);
  } else {
    switch (node.id) {
      case 'gate-1':
      case 'gate-2':
        addBox(group, mats, 1.1, 4.4, 1.1, -2.6);
        addBox(group, mats, 1.1, 4.4, 1.1, 2.6);
        addBox(group, mats, 6.8, 0.9, 1.5, 0, 0, 4.4);
        break;
      case 'admin-block': {
        addBox(group, mats, 8, 4, 6);
        addBox(group, mats, 2.4, 10, 2.4, 0, 0, 0);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(1.95, 2.4, 4), mats.roof);
        roof.rotation.y = Math.PI / 4;
        roof.position.y = 11.2;
        roof.castShadow = true;
        group.add(roof);
        break;
      }
      case 'library': {
        // Three-tier circular library under a dome
        addCylinder(group, mats, 4.8, 2.4, 0);
        addCylinder(group, mats, 3.8, 1.7, 2.4);
        addCylinder(group, mats, 2.8, 1.3, 4.1);
        const dome = new THREE.Mesh(new THREE.SphereGeometry(2.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mats.roof);
        dome.position.y = 5.4;
        dome.castShadow = true;
        group.add(dome);
        break;
      }
      case 'sjc-campus':
        addBox(group, mats, 10, 6, 4, 0, -1.5);
        addBox(group, mats, 4, 4.2, 7.5, 3, 1);
        break;
      case 'science-complex':
        addBox(group, mats, 12, 4.4, 6, 0, -1);
        addBox(group, mats, 4, 6.6, 4, 3.5, -1.5);
        break;
      case 'canteen-complex':
        addBox(group, mats, 6, 2.6, 4.4);
        break;
      case 'sports-complex': {
        // Running track around a pitch, with a stand on the north side
        const track = addFlat(group, new THREE.RingGeometry(4.2, 5.6, 48).rotateX(-Math.PI / 2), mats.track, 0, 0.05, 0);
        track.scale.set(1.45, 1, 1);
        const pitch = addFlat(group, flatCircle(4.2), mats.lawn, 0, 0.06, 0);
        pitch.scale.set(1.45, 1, 1);
        addBox(group, mats, 9, 1.6, 1.4, 0, -6.6);
        break;
      }
      case 'health-centre':
        addBox(group, mats, 6, 3.6, 4.6);
        addBox(group, mats, 3, 2.2, 2.4, 3.6, 1);
        break;
      default:
        addBox(group, mats, 6, 3.6, 6);
    }
  }

  group.userData = { isCampusNode: true, id: node.id };
  scene.add(group);
  return group;
}

// Seeded random so the trees land in the same places on every visit
function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const distanceToSegment = (px, pz, [x1, z1], [x2, z2]) => {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const t = THREE.MathUtils.clamp(((px - x1) * dx + (pz - z1) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(px - (x1 + t * dx), pz - (z1 + t * dz));
};

function buildTrees(scene, mats) {
  const random = seededRandom(2024);
  const spots = [];
  const isClear = (x, z) =>
    ROADS.every((road) => distanceToSegment(x, z, road.from, road.to) > road.w / 2 + 1.4) &&
    Math.abs(Math.hypot(x - LIBRARY_CIRCLE.center[0], z - LIBRARY_CIRCLE.center[1]) - LIBRARY_CIRCLE.radius) > 3 &&
    NODES.every((node) => Math.hypot(x - node.pos[0], z - node.pos[2]) > (node.id === 'sports-complex' ? 10 : 5.5)) &&
    spots.every(([sx, sz]) => Math.hypot(x - sx, z - sz) > 2.1);

  for (let i = 0; i < 600 && spots.length < 150; i++) {
    const x = -36 + random() * 72;
    const z = -46.5 + random() * 68;
    if (isClear(x, z)) spots.push([x, z, 0.75 + random() * 0.6]);
  }

  // Low, rounded canopies like the trees on a 3D city map
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mats.tree, spots.length);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const matrix = new THREE.Matrix4();
  const variants = spots.map(([x, z, s], i) => {
    matrix.compose(
      new THREE.Vector3(x, s * 0.95 + 0.25, z),
      new THREE.Quaternion(),
      new THREE.Vector3(s, s * 0.95, s)
    );
    mesh.setMatrixAt(i, matrix);
    mesh.setColorAt(i, new THREE.Color());
    return i % 3 === 0 ? 1 : 0;
  });
  scene.add(mesh);
  return { mesh, variants };
}

// UniGo captains riding the campus loop and the coast road
function buildScooters(scene, mats) {
  const coastRoad = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-130, 0.2, 24.6),
    new THREE.Vector3(0, 0.2, 24.6),
    new THREE.Vector3(130, 0.2, 24.6),
  ]);
  const campusLoop = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(-30.4, 0.2, 20),
      new THREE.Vector3(-30.4, 0.2, -14.4),
      new THREE.Vector3(30.4, 0.2, -14.4),
      new THREE.Vector3(30.4, 0.2, 20),
    ],
    true,
    'catmullrom',
    0.05
  );

  const makeScooter = () => {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 1.4), mats.scooter);
    body.position.y = 0.3;
    body.castShadow = true;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.6), mats.seat);
    seat.position.set(0, 0.62, -0.2);
    group.add(body, seat);
    scene.add(group);
    return group;
  };

  return [
    { mesh: makeScooter(), curve: coastRoad, progress: 0.1, speed: 0.0009 },
    { mesh: makeScooter(), curve: campusLoop, progress: 0.2, speed: 0.0012 },
    { mesh: makeScooter(), curve: campusLoop, progress: 0.7, speed: 0.0012 },
  ];
}
