import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { CAMERA_PRESETS, APP_TO_SPEC_ID, SPEC_TO_APP_ID, APP_CATEGORY, PALETTE } from '../data/puAppleMap';
import { PU_LANDMARKS, GIRLS_HOSTELS, BOYS_HOSTELS } from '../data/campusData';
import {
  PLACES,
  AREA_LABELS,
  CAMPUS_BOUNDS,
  CAMPUS_POINTS,
  buildWorld,
  applyStyle,
  createMaterialRegistry,
  fitRadius,
} from './campusMapWorld';
import { useApp } from '../context/useApp';
import {
  Scan,
  BedDouble,
  BookOpen,
  GraduationCap,
  Landmark,
  Drama,
  Globe,
  Utensils,
  Trophy,
  Cross,
  Banknote,
  Shield,
  Store,
  Bus,
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

// ---------------------------------------------------------------------------
// Places and controls
// ---------------------------------------------------------------------------

const CATEGORY_META = {
  academic: { label: 'Academic', icon: GraduationCap },
  library: { label: 'Library', icon: BookOpen },
  auditorium: { label: 'Auditorium', icon: Drama },
  admin: { label: 'University administration', icon: Landmark },
  boys_hostel: { label: 'Boys hostel', icon: BedDouble },
  girls_hostel: { label: 'Girls hostel', icon: BedDouble },
  hostel_international: { label: 'Guest hostel', icon: Globe },
  dining: { label: 'Dining', icon: Utensils },
  sports: { label: 'Sports', icon: Trophy },
  health: { label: 'Health', icon: Cross },
  bank_service: { label: 'Bank & services', icon: Banknote },
  gate_security: { label: 'Campus gate', icon: Shield },
  amenity: { label: 'Shops & services', icon: Store },
  bus: { label: 'Bus stop', icon: Bus },
};

const NODES = PLACES.map((place) => ({ ...place, Icon: (CATEGORY_META[place.kind] || CATEGORY_META.academic).icon }));
const NODE_BY_ID = Object.fromEntries(NODES.map((n) => [n.id, n]));
// Landmarks first so they win when badges collide
const DRAW_ORDER = [...NODES].sort((a, b) => b.priority - a.priority);

const APP_HOSTEL_BY_ID = Object.fromEntries([...GIRLS_HOSTELS, ...BOYS_HOSTELS].map((h) => [h.id, h]));
const APP_LANDMARK_BY_ID = Object.fromEntries(PU_LANDMARKS.map((l) => [l.id, l]));
// Ids from the rest of the app (laundry form, Google map card) resolve to map places
const toSpecId = (appId) => (appId && (NODE_BY_ID[appId] ? appId : APP_TO_SPEC_ID[appId])) || null;

const OVERVIEW = 'apple_maps_default_frame';
const PRESET_CHIPS = [
  { value: OVERVIEW, label: 'Overview', icon: Scan },
  { value: 'silver_jubilee_campus', label: 'Silver Jubilee', icon: GraduationCap, color: '#5856D6' },
  { value: 'central_library_and_admin', label: 'Library & admin', icon: BookOpen, color: '#0A84FF' },
  { value: 'north_boys_hostels', label: 'Boys hostels', icon: BedDouble, color: '#007AFF' },
  { value: 'girls_hostel_sanctuary', label: 'Girls hostels', icon: BedDouble, color: '#FF2D55' },
  { value: 'sports_stadium_arena', label: 'Stadium', icon: Trophy, color: '#34C759', target: 'rajiv-gandhi-stadium' },
  // The spec's Gate 1 preset aims 620 m south of the gate; centre on the gate itself
  { value: 'gate_1_entrance', label: 'Gate 1', icon: Shield, color: '#8E8E93', target: 'gate-1-main' },
];

const LEGEND = [
  { label: 'Girls hostels', color: '#FF2D55' },
  { label: 'Boys hostels', color: '#007AFF' },
  { label: 'Campus gates', color: '#8E8E93' },
];

const MAP_STYLES = [
  { value: 'day', label: 'Light', icon: Sun, swatch: PALETTE.light.terrain_fill },
  { value: 'sunset', label: 'Sunset', icon: Sunset, swatch: '#f4e2d2' },
  { value: 'night', label: 'Dark', icon: Moon, swatch: PALETTE.dark.terrain_fill },
];

const FOV = 40;
const TILT_PHI = THREE.MathUtils.degToRad(52);
const FLAT_PHI = 0.01;
const MIN_RADIUS = 120;
const MAX_RADIUS = 9000;
const TARGET_BOUNDS = { minX: -1800, maxX: 1800, minZ: -1600, maxZ: 2200 };
const DRAG_CLICK_TOLERANCE_PX = 6;
const EASE_PER_SECOND = 7.5; // Camera flights settle in about half a second whatever the frame rate
const OVERVIEW_HEADING = THREE.MathUtils.degToRad(CAMERA_PRESETS[OVERVIEW].heading_deg);
const OVERVIEW_PITCH = THREE.MathUtils.degToRad(CAMERA_PRESETS[OVERVIEW].pitch_deg);
// Trees thin out as you zoom out and are gone by the whole-campus view, as on Apple Maps
const TREE_FADE = { start: 2000, end: 2900 };
const EDGE_GAP = 6; // Badges stay this far inside the map edge rather than being cut off
const CAMPUS_CENTRE = new THREE.Vector3((CAMPUS_BOUNDS.minX + CAMPUS_BOUNDS.maxX) / 2, 0, (CAMPUS_BOUNDS.minZ + CAMPUS_BOUNDS.maxZ) / 2);

// Orbit for a chip; the overview frames the whole campus for the map's current shape
const presetOrbit = (chip, aspect) => {
  if (chip.value === OVERVIEW) {
    return {
      lookAt: CAMPUS_CENTRE.clone(),
      radius: fitRadius(CAMPUS_POINTS, CAMPUS_CENTRE, -OVERVIEW_HEADING, OVERVIEW_PITCH, FOV, aspect, 0.9),
      phi: OVERVIEW_PITCH,
      theta: -OVERVIEW_HEADING,
    };
  }
  const preset = CAMERA_PRESETS[chip.value];
  const target = chip.target ? NODE_BY_ID[chip.target] : null;
  return {
    lookAt: new THREE.Vector3(target ? target.x : preset.target_local_m[0], 0, target ? target.z : preset.target_local_m[2]),
    radius: preset.altitude_m,
    phi: THREE.MathUtils.degToRad(preset.pitch_deg),
    // Heading turns the view clockwise from north, so the camera swings the other way
    theta: -THREE.MathUtils.degToRad(preset.heading_deg),
  };
};

export default function CampusMap3D({ onHostelSelect, highlightedId = null }) {
  const mountRef = useRef(null);
  const containerRef = useRef(null);
  const {
    activeTab,
    setActiveTab,
    selected3DTarget,
    setSelected3DTarget,
    setRideDropTarget,
    mapDayNightMode,
    setMapDayNightMode,
  } = useApp();

  const [viewPreset, setViewPreset] = useState(OVERVIEW);
  const [hoveredId, setHoveredId] = useState(null);
  const [selectedId, setSelectedId] = useState(() => toSpecId(highlightedId));
  const [isCardOpen, setIsCardOpen] = useState(false);
  const [is2D, setIs2D] = useState(false);
  const [isStyleMenuOpen, setIsStyleMenuOpen] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  // Follow picks made outside the map (laundry form, Google map card) by moving the pin there
  const [seenHighlight, setSeenHighlight] = useState(highlightedId);
  if (highlightedId !== seenHighlight) {
    setSeenHighlight(highlightedId);
    if (toSpecId(highlightedId)) setSelectedId(toSpecId(highlightedId));
  }
  const [seenTarget, setSeenTarget] = useState(selected3DTarget);
  if (selected3DTarget !== seenTarget) {
    setSeenTarget(selected3DTarget);
    if (toSpecId(selected3DTarget?.id)) setSelectedId(toSpecId(selected3DTarget.id));
  }

  // Three.js state shared between the scene effect and the controls
  const targetLookAt = useRef(CAMPUS_CENTRE.clone());
  const currentLookAt = useRef(CAMPUS_CENTRE.clone());
  const targetCamPos = useRef(new THREE.Vector3(0, 3000, 2000));
  const sceneStateRef = useRef(null);
  const interactiveObjects = useRef([]);
  const aspectRef = useRef(1.6);
  const is2DRef = useRef(false);
  const viewPresetRef = useRef(OVERVIEW);
  const userMovedRef = useRef(false);
  const selectedIdRef = useRef(selectedId);
  const overlayDirtyRef = useRef(true);
  const markerEls = useRef({});
  const markerWidths = useRef({});
  const areaLabelEls = useRef({});
  const areaLabelWidths = useRef({});
  const pinRef = useRef(null);
  const compassRef = useRef(null);
  const styleMenuRef = useRef(null);
  const onHostelSelectRef = useRef(onHostelSelect);
  const selectNodeRef = useRef(null);
  const panRef = useRef(null);

  useEffect(() => {
    onHostelSelectRef.current = onHostelSelect;
  }, [onHostelSelect]);
  useEffect(() => {
    selectedIdRef.current = selectedId;
    overlayDirtyRef.current = true;
  }, [selectedId]);
  useEffect(() => {
    viewPresetRef.current = viewPreset;
  }, [viewPreset]);
  // The card, the hint and the chip row change the no-go areas for badges
  useEffect(() => {
    overlayDirtyRef.current = true;
  }, [isCardOpen, selectedId, hasInteracted]);

  // ---- Camera helpers (refs only, so the scene's listeners can call them) ----
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
    lookAt.x = THREE.MathUtils.clamp(lookAt.x, TARGET_BOUNDS.minX, TARGET_BOUNDS.maxX);
    lookAt.z = THREE.MathUtils.clamp(lookAt.z, TARGET_BOUNDS.minZ, TARGET_BOUNDS.maxZ);
    lookAt.y = 0;
    const r = THREE.MathUtils.clamp(radius, MIN_RADIUS, MAX_RADIUS);
    targetLookAt.current.copy(lookAt);
    targetCamPos.current.set(
      lookAt.x + r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi),
      lookAt.z + r * Math.sin(phi) * Math.cos(theta)
    );
  };

  const flyToPlace = (node) => {
    if (!node) return;
    const { theta } = getOrbit();
    const radius = THREE.MathUtils.clamp(node.size * 6, 300, 700);
    setOrbit(new THREE.Vector3(node.x, 0, node.z), radius, theta, is2DRef.current ? FLAT_PHI : TILT_PHI);
  };

  // Zoom about a ground point so whatever is under the cursor stays under it
  const zoomAbout = (factor, focus = targetLookAt.current) => {
    const { radius, theta, phi } = getOrbit();
    const next = THREE.MathUtils.clamp(radius * factor, MIN_RADIUS, MAX_RADIUS);
    const applied = next / radius;
    const lookAt = new THREE.Vector3().copy(focus).addScaledVector(new THREE.Vector3().subVectors(targetLookAt.current, focus), applied);
    setOrbit(lookAt, next, theta, phi);
  };

  const showPreset = (chip) => {
    setViewPreset(chip.value);
    userMovedRef.current = false;
    const { lookAt, radius, phi, theta } = presetOrbit(chip, aspectRef.current);
    setOrbit(lookAt, radius, theta, is2DRef.current ? FLAT_PHI : phi);
  };

  const selectNode = (node, { fly = true } = {}) => {
    setViewPreset(null);
    setSelectedId(node.id);
    setIsCardOpen(true);
    if (fly) flyToPlace(node);
    const appHostel = APP_HOSTEL_BY_ID[node.id];
    if (appHostel) onHostelSelectRef.current?.(appHostel);
  };
  useEffect(() => {
    selectNodeRef.current = selectNode;
  });

  // Build the scene once; map styles recolour it in place
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color();
    scene.fog = new THREE.Fog(0xffffff, 2000, 6000);

    aspectRef.current = (container.clientWidth || 1) / (container.clientHeight || 1);
    const camera = new THREE.PerspectiveCamera(FOV, aspectRef.current, 2, 30000);

    const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.NoToneMapping;
    const domEl = renderer.domElement;
    domEl.style.display = 'block';
    domEl.style.cursor = 'grab';
    // One-finger vertical swipes still scroll the page on phones; everything else drives the map
    domEl.style.touchAction = 'pan-y';
    container.appendChild(domEl);

    // Soft sky light does most of the work; a gentle sun adds shape and light contact shadows
    const ambient = new THREE.AmbientLight();
    const hemi = new THREE.HemisphereLight();
    const sun = new THREE.DirectionalLight();
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 50;
    sun.shadow.camera.far = 9000;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6;
    sun.shadow.radius = 3;
    scene.add(ambient, hemi, sun, sun.target);
    const sunDirection = new THREE.Vector3();

    const registry = createMaterialRegistry();
    const world = buildWorld(scene, registry);
    interactiveObjects.current = world.places;
    sceneStateRef.current = { scene, registry, world, ambient, hemi, sun, sunDirection };
    applyStyle(sceneStateRef.current, 'day');

    // Open on the whole campus, framed for this container
    const start = presetOrbit(PRESET_CHIPS[0], aspectRef.current);
    setOrbit(start.lookAt, start.radius, start.theta, start.phi);
    camera.position.copy(targetCamPos.current);
    currentLookAt.current.copy(targetLookAt.current);
    camera.lookAt(currentLookAt.current);

    // ---- Picking ----
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const aimRay = (clientX, clientY) => {
      const rect = domEl.getBoundingClientRect();
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
    };
    const pickNode = (clientX, clientY) => {
      aimRay(clientX, clientY);
      let hit = raycaster.intersectObjects(interactiveObjects.current, true)[0]?.object;
      while (hit && !hit.userData?.isCampusNode) hit = hit.parent;
      return hit ? NODE_BY_ID[hit.userData.id] : null;
    };
    const groundPoint = (clientX, clientY) => {
      aimRay(clientX, clientY);
      return raycaster.ray.intersectPlane(ground, new THREE.Vector3());
    };

    // ---- Gestures: drag pans, right/modifier-drag turns, two fingers pan and pinch ----
    const metresPerPixel = () => {
      const distance = camera.position.distanceTo(currentLookAt.current);
      return (2 * distance * Math.tan(THREE.MathUtils.degToRad(FOV / 2))) / (domEl.clientHeight || 1);
    };

    // Content follows the pointer: dragging right moves the target left, dragging down moves it forward
    const pan = (dx, dy) => {
      const { radius, theta, phi } = getOrbit();
      const mpp = metresPerPixel();
      const stretch = Math.min(2.5, 1 / Math.max(Math.cos(phi), 0.4));
      const lookAt = targetLookAt.current.clone();
      lookAt.x += (-Math.cos(theta) * dx - Math.sin(theta) * dy * stretch) * mpp;
      lookAt.z += (Math.sin(theta) * dx - Math.cos(theta) * dy * stretch) * mpp;
      setOrbit(lookAt, radius, theta, phi);
    };
    panRef.current = pan;

    const turn = (dx, dy) => {
      const { radius, theta, phi } = getOrbit();
      const nextPhi = is2DRef.current ? FLAT_PHI : THREE.MathUtils.clamp(phi - dy * 0.004, 0.12, 1.35);
      setOrbit(targetLookAt.current.clone(), radius, theta - dx * 0.005, nextPhi);
    };

    const pointers = new Map();
    let gesture = null;
    let hoverAt = null;
    let lastHoverId = null;
    const setHover = (id) => {
      if (id === lastHoverId) return;
      lastHoverId = id;
      setHoveredId(id);
    };
    const markMoved = () => {
      if (userMovedRef.current) return;
      userMovedRef.current = true;
      setViewPreset(null);
    };

    const pinchState = () => {
      const [a, b] = [...pointers.values()];
      return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
    };

    const onPointerDown = (e) => {
      setHasInteracted(true);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try {
        domEl.setPointerCapture(e.pointerId);
      } catch {
        // Pointer already released; the gesture still works while it stays over the canvas
      }
      if (pointers.size === 2) {
        gesture = { type: 'pinch', ...pinchState(), moved: DRAG_CLICK_TOLERANCE_PX };
        return;
      }
      const wantsTurn = e.button === 2 || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || e.pointerType === 'touch';
      gesture = { type: wantsTurn ? 'turn' : 'pan', x: e.clientX, y: e.clientY, moved: 0 };
      domEl.style.cursor = 'grabbing';
    };

    const onPointerMove = (e) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (gesture?.type === 'pinch' && pointers.size === 2) {
        const next = pinchState();
        pan(next.cx - gesture.cx, next.cy - gesture.cy);
        const focus = groundPoint(next.cx, next.cy);
        zoomAbout(gesture.dist / next.dist, focus || targetLookAt.current);
        gesture = { ...gesture, ...next };
        markMoved();
        return;
      }
      if (gesture && pointers.has(e.pointerId)) {
        const dx = e.clientX - gesture.x;
        const dy = e.clientY - gesture.y;
        gesture.x = e.clientX;
        gesture.y = e.clientY;
        gesture.moved += Math.abs(dx) + Math.abs(dy);
        if (gesture.moved >= DRAG_CLICK_TOLERANCE_PX) markMoved();
        if (gesture.type === 'pan') pan(dx, dy);
        else turn(dx, e.pointerType === 'touch' ? 0 : dy);
        setHover(null);
        return;
      }
      // Hover picking runs once per frame in the loop, not on every mouse event
      if (e.pointerType === 'mouse') hoverAt = { x: e.clientX, y: e.clientY };
    };

    // A press that barely moved is a click: select what's under it, or dismiss the place card
    const onPointerUp = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      const wasClick = gesture && gesture.type !== 'pinch' && e.type === 'pointerup' && gesture.moved < DRAG_CLICK_TOLERANCE_PX;
      if (pointers.size === 0) {
        gesture = null;
      } else if (pointers.size === 1) {
        // Lifting one finger of a pinch carries on as a one-finger gesture from where it is
        const [remaining] = [...pointers.values()];
        gesture = { type: 'turn', x: remaining.x, y: remaining.y, moved: DRAG_CLICK_TOLERANCE_PX };
      }
      domEl.style.cursor = 'grab';
      if (!wasClick) return;
      const node = pickNode(e.clientX, e.clientY);
      if (node) selectNodeRef.current?.(node);
      else setIsCardOpen(false);
    };

    const onPointerLeave = () => {
      hoverAt = null;
      if (!gesture) setHover(null);
    };
    const onWheel = (e) => {
      e.preventDefault();
      setHasInteracted(true);
      markMoved();
      const focus = groundPoint(e.clientX, e.clientY);
      zoomAbout(1 + THREE.MathUtils.clamp(e.deltaY, -120, 120) * 0.0015, focus || targetLookAt.current);
    };
    const onContextMenu = (e) => e.preventDefault();

    domEl.addEventListener('pointerdown', onPointerDown);
    domEl.addEventListener('pointermove', onPointerMove);
    domEl.addEventListener('pointerup', onPointerUp);
    domEl.addEventListener('pointercancel', onPointerUp);
    domEl.addEventListener('pointerleave', onPointerLeave);
    domEl.addEventListener('wheel', onWheel, { passive: false });
    domEl.addEventListener('contextmenu', onContextMenu);

    // ---- Overlays: badges, area text, the selected pin and the compass follow the camera ----
    const size = { w: container.clientWidth, h: container.clientHeight };
    const projected = new THREE.Vector3();
    const worldPoint = new THREE.Vector3();
    const project = (x, y, z) => {
      projected.set(x, y, z).project(camera);
      if (projected.z > 1 || Math.abs(projected.x) > 1.15 || Math.abs(projected.y) > 1.15) return null;
      return {
        sx: ((projected.x + 1) / 2) * size.w,
        sy: ((1 - projected.y) / 2) * size.h,
        dist: camera.position.distanceTo(worldPoint.set(x, y, z)),
      };
    };
    const hide = (el) => {
      if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden';
    };

    // Map controls, the legend and the place card are no-go areas for map text
    const controlRects = () => {
      const root = containerRef.current;
      if (!root) return [];
      const box = container.getBoundingClientRect();
      return [...root.querySelectorAll('[data-map-control]')].map((el) => {
        const r = el.getBoundingClientRect();
        return { l: r.left - box.left - 4, r: r.right - box.left + 4, t: r.top - box.top - 4, b: r.bottom - box.top + 4 };
      });
    };

    // Badges are placed in priority order; one that would overlap a placed badge shrinks to its
    // icon, and an icon that still overlaps is hidden, as on Apple Maps
    const updateOverlays = () => {
      const placed = controlRects();
      const offMap = (r) => r.l < EDGE_GAP || r.t < EDGE_GAP || r.r > size.w - EDGE_GAP || r.b > size.h - EDGE_GAP;
      const overlaps = (r) => offMap(r) || placed.some((p) => r.l < p.r && r.r > p.l && r.t < p.b && r.b > p.t);
      const selected = selectedIdRef.current;
      const viewRadius = camera.position.distanceTo(currentLookAt.current);

      // Area text: the campus name and the sea lead; district names give way to place badges
      const placeAreaLabel = (label) => {
        const el = areaLabelEls.current[label.id];
        if (!el) return;
        const at = project(label.x, 0, label.z);
        if (!at) return hide(el);
        const half = (areaLabelWidths.current[label.id] || 120) / 2;
        const rect = { l: at.sx - half, r: at.sx + half, t: at.sy - 9, b: at.sy + 9 };
        const inRange = (!label.showFrom || viewRadius >= label.showFrom) && (!label.hideFrom || viewRadius <= label.hideFrom);
        const shown = inRange && !overlaps(rect);
        if (shown) placed.push(rect);
        el.style.visibility = 'visible';
        el.style.opacity = shown ? '1' : '0';
        el.style.transform = `translate3d(${at.sx}px, ${at.sy}px, 0)`;
      };
      AREA_LABELS.filter((label) => label.lead).forEach(placeAreaLabel);

      if (pinRef.current) {
        const node = NODE_BY_ID[selected];
        const at = node && project(node.x, node.top, node.z);
        if (at) {
          pinRef.current.style.visibility = 'visible';
          pinRef.current.style.transform = `translate3d(${at.sx}px, ${at.sy}px, 0)`;
          placed.push({ l: at.sx - 20, r: at.sx + 30 + (markerWidths.current[selected] || 80), t: at.sy - 46, b: at.sy + 4 });
        } else {
          hide(pinRef.current);
        }
      }

      DRAW_ORDER.forEach((node) => {
        const el = markerEls.current[node.id];
        if (!el) return;
        if (node.id === selected) return hide(el);
        const at = project(node.x, node.top, node.z);
        if (!at || at.dist > node.dotRange) return hide(el);

        const pillWidth = markerWidths.current[node.id] || 90;
        const rectFor = (mode) => {
          const w = mode === 'pill' ? pillWidth : 20;
          return { l: at.sx - w / 2 - 3, r: at.sx + w / 2 + 3, t: at.sy - 13, b: at.sy + 13 };
        };
        let mode = at.dist > node.labelRange ? 'dot' : 'pill';
        let rect = rectFor(mode);
        if (mode === 'pill' && overlaps(rect)) {
          mode = 'dot';
          rect = rectFor(mode);
        }
        if (overlaps(rect)) return hide(el);

        placed.push(rect);
        if (el.dataset.mode !== mode) el.dataset.mode = mode;
        el.style.visibility = 'visible';
        el.style.transform = `translate3d(${at.sx}px, ${at.sy}px, 0)`;
        el.style.zIndex = String(10 + Math.round(node.priority * 10));
      });

      AREA_LABELS.filter((label) => !label.lead).forEach(placeAreaLabel);

      if (compassRef.current) {
        const heading = Math.atan2(camera.position.x - currentLookAt.current.x, camera.position.z - currentLookAt.current.z);
        compassRef.current.style.transform = `rotate(${heading}rad)`;
      }
    };

    // Keep the shadow frustum fitted to the view so shadows stay crisp at every zoom
    let shadowExtent = 0;
    const fitSunToView = (radius) => {
      sun.position.copy(currentLookAt.current).addScaledVector(sunDirection, 4000);
      sun.target.position.copy(currentLookAt.current);
      sun.target.updateMatrixWorld();
      const extent = THREE.MathUtils.clamp(radius * 0.85, 240, 3200);
      if (Math.abs(extent - shadowExtent) / extent > 0.08) {
        shadowExtent = extent;
        Object.assign(sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent });
        sun.shadow.camera.updateProjectionMatrix();
      }
    };

    // Slow devices get a lighter render: fewer pixels first, then a smaller shadow map
    let slowSeconds = 0;
    const adaptQuality = (fps) => {
      slowSeconds = fps < 32 ? slowSeconds + 1 : 0;
      if (slowSeconds < 2) return;
      slowSeconds = 0;
      const ratio = renderer.getPixelRatio();
      if (ratio > 1) {
        renderer.setPixelRatio(Math.max(1, ratio - 0.5));
        renderer.setSize(size.w, size.h);
      } else if (sun.shadow.mapSize.x > 1024) {
        sun.shadow.mapSize.set(1024, 1024);
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
      }
    };

    // ---- Render loop: time-based, and skipped while scrolled out of view ----
    let isVisible = true;
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
    });
    visibilityObserver.observe(container);

    const lastCamera = new THREE.Vector3();
    const lastLookAt = new THREE.Vector3();
    let reqId;
    let lastTime = null;
    let frameCount = 0;
    let lastFpsUpdate = null;
    const animate = (time) => {
      reqId = requestAnimationFrame(animate);
      const dt = lastTime === null ? 0 : Math.min(0.1, Math.max(0, (time - lastTime) / 1000));
      lastTime = time;
      lastFpsUpdate ??= time;
      if (!isVisible) return;

      frameCount++;
      if (time - lastFpsUpdate >= 1000) {
        const fps = Math.round((frameCount * 1000) / (time - lastFpsUpdate));
        adaptQuality(fps);
        frameCount = 0;
        lastFpsUpdate = time;
      }

      // Direct manipulation follows the hand exactly; flights and zooms ease in
      const ease = gesture && gesture.type !== 'pinch' ? 1 : 1 - Math.exp(-EASE_PER_SECOND * dt);
      camera.position.lerp(targetCamPos.current, ease);
      currentLookAt.current.lerp(targetLookAt.current, ease);
      camera.lookAt(currentLookAt.current);

      // Haze the horizon in proportion to zoom, like the atmosphere on a tilted 3D map
      const radius = camera.position.distanceTo(currentLookAt.current);
      scene.fog.near = radius * 1.9;
      scene.fog.far = radius * 5.5;
      fitSunToView(radius);

      const treeFade = THREE.MathUtils.clamp((TREE_FADE.end - radius) / (TREE_FADE.end - TREE_FADE.start), 0, 1);
      world.trees.meshes.forEach((mesh) => {
        mesh.visible = treeFade > 0.01;
        mesh.material.transparent = treeFade < 0.99;
        mesh.material.opacity = treeFade;
      });

      if (hoverAt) {
        const node = pickNode(hoverAt.x, hoverAt.y);
        setHover(node?.id ?? null);
        domEl.style.cursor = node ? 'pointer' : 'grab';
        hoverAt = null;
      }

      renderer.render(scene, camera);

      // Badges only need re-placing when the view or the selection changed
      const moved = camera.position.distanceToSquared(lastCamera) > 0.0004 || currentLookAt.current.distanceToSquared(lastLookAt) > 0.0004;
      if (moved || overlayDirtyRef.current) {
        updateOverlays();
        lastCamera.copy(camera.position);
        lastLookAt.copy(currentLookAt.current);
        overlayDirtyRef.current = false;
      }
    };
    reqId = requestAnimationFrame(animate);

    // Resize with the container; an untouched overview reframes to the new shape
    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (!w || !h) return;
      size.w = w;
      size.h = h;
      aspectRef.current = w / h;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      overlayDirtyRef.current = true;
      if (viewPresetRef.current === OVERVIEW && !userMovedRef.current) {
        const view = presetOrbit(PRESET_CHIPS[0], aspectRef.current);
        setOrbit(view.lookAt, view.radius, view.theta, is2DRef.current ? FLAT_PHI : view.phi);
      }
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
      domEl.removeEventListener('contextmenu', onContextMenu);

      // Free GPU memory; browsers cap the number of live WebGL contexts
      scene.traverse((obj) => {
        obj.geometry?.dispose();
        const materials = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
        materials.forEach((m) => m.dispose());
      });
      renderer.dispose();
      renderer.forceContextLoss();
      domEl.remove();
      sceneStateRef.current = null;
      interactiveObjects.current = [];
      panRef.current = null;
    };
  }, []);

  // Measure each badge once its font has loaded, for the collision checks in the render loop
  useEffect(() => {
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      NODES.forEach((node) => {
        const el = markerEls.current[node.id];
        if (!el) return;
        const previous = el.dataset.mode;
        el.dataset.mode = 'pill';
        markerWidths.current[node.id] = el.offsetWidth;
        el.dataset.mode = previous;
      });
      AREA_LABELS.forEach((label) => {
        const el = areaLabelEls.current[label.id];
        if (el) areaLabelWidths.current[label.id] = el.offsetWidth;
      });
      overlayDirtyRef.current = true;
    };
    measure();
    document.fonts?.ready.then(measure);
    return () => {
      cancelled = true;
    };
  }, []);

  // Recolour for the chosen map style without rebuilding the scene or moving the camera
  useEffect(() => {
    if (sceneStateRef.current) applyStyle(sceneStateRef.current, mapDayNightMode);
  }, [mapDayNightMode]);

  // Fly to places picked elsewhere (laundry hostel dropdown, Google map card)
  useEffect(() => {
    flyToPlace(NODE_BY_ID[toSpecId(selected3DTarget?.id)]);
  }, [selected3DTarget]);

  useEffect(() => {
    flyToPlace(NODE_BY_ID[toSpecId(highlightedId)]);
  }, [highlightedId]);

  // Close the style menu on outside click or Escape; Escape also closes the place card
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

  // Keyboard: arrows move the view, + and - zoom
  const handleKeyDown = (e) => {
    if (e.target !== containerRef.current) return;
    const step = 80;
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) {
      e.preventDefault();
      panRef.current?.(...moves[e.key]);
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomAbout(0.75);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      zoomAbout(1.33);
    } else {
      return;
    }
    userMovedRef.current = true;
    setViewPreset(null);
    setHasInteracted(true);
  };

  const handlePreset = (chip) => {
    setHasInteracted(true);
    showPreset(chip);
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
  const selectedNode = NODE_BY_ID[selectedId];
  const SelectedIcon = selectedNode?.Icon;
  const card = isCardOpen ? selectedNode : null;
  const CardIcon = card?.Icon;
  const cardMeta = CATEGORY_META[card?.kind] || CATEGORY_META.academic;
  const appHostel = card ? APP_HOSTEL_BY_ID[card.id] : null;
  const appLandmark = card ? APP_LANDMARK_BY_ID[SPEC_TO_APP_ID[card.id]] : null;
  const isLaundryPick = Boolean(appHostel && onHostelSelect);
  // Use the names the ride and laundry forms already list, where there is one
  const appPlaceName = appHostel?.name || appLandmark?.name || card?.name;
  const floors = card?.data.dimensions_m?.floors;
  // Room counts already show in the subtitle
  const amenities = (card?.data.amenities_inside || []).filter((item) => !/Rooms$/.test(item)).slice(0, 3);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="region"
      aria-label="Campus map. Arrow keys move the map, plus and minus zoom."
      onKeyDown={handleKeyDown}
      className="campus-map @container relative w-full h-full select-none overflow-hidden rounded-[inherit] focus-visible:outline-2 focus-visible:-outline-offset-2"
      data-theme={theme}
    >
      <div ref={mountRef} className="absolute inset-0" />

      {/* Map text and place badges, positioned by the render loop */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-[5]">
        {AREA_LABELS.map((label) => (
          <span
            key={label.id}
            ref={(el) => {
              areaLabelEls.current[label.id] = el;
            }}
            className={`map-area-label map-area-label-${label.kind}`}
            style={{ visibility: 'hidden', zIndex: 9 }}
          >
            {label.text}
          </span>
        ))}

        {NODES.map((node) => {
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
              data-mode="pill"
              className={`map-badge ${hoveredId === node.id ? 'is-hover' : ''}`}
              style={{ '--poi': node.color, '--badge-bg': node.badge, visibility: 'hidden' }}
            >
              <span className="map-badge-icon" aria-hidden="true">
                <Icon className="w-2.5 h-2.5" strokeWidth={2.75} />
              </span>
              <span className="map-badge-text">{node.label}</span>
            </button>
          );
        })}

        {selectedNode && (
          <div
            ref={pinRef}
            className="map-poi is-selected"
            style={{ '--poi': selectedNode.color, visibility: 'hidden', zIndex: 100 }}
            aria-hidden="true"
          >
            <span key={selectedNode.id} className="map-poi-pin">
              <span className="map-poi-pin-head">
                <SelectedIcon className="w-4 h-4" strokeWidth={2.4} />
              </span>
            </span>
            <span className="map-poi-label">{selectedNode.label}</span>
          </div>
        )}
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
              onClick={() => handlePreset(chip)}
              aria-pressed={isActive}
              data-map-control
              className={`map-chip pointer-events-auto ${isActive ? 'is-active' : 'map-glass'}`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" style={chip.color && !isActive ? { color: chip.color } : undefined} aria-hidden="true" />
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Map controls: style, 2D/3D, recentre */}
      <div ref={styleMenuRef} data-map-control className="absolute top-3 right-3 z-20 flex flex-col items-end gap-2">
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
          <button type="button" onClick={() => handlePreset(PRESET_CHIPS[0])} aria-label="Show the whole campus" className="map-btn">
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
      <div data-map-control className={`absolute bottom-7 right-3 z-10 flex flex-col items-center gap-2 ${card ? '@max-2xl:hidden' : ''}`}>
        <button
          type="button"
          onClick={resetNorth}
          aria-label="Point the map north"
          className="map-glass w-10 h-10 rounded-full flex items-center justify-center transition-transform duration-100 active:scale-95"
        >
          <svg ref={compassRef} viewBox="0 0 40 40" className="w-10 h-10" aria-hidden="true">
            <path d="M20 5 L23.5 14 H16.5 Z" fill="#ff3b30" />
            <text x="20" y="25.5" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor">
              N
            </text>
          </svg>
        </button>
        <div className="map-glass rounded-[12px] flex flex-col overflow-hidden divide-y divide-[var(--map-line)]">
          <button type="button" onClick={() => zoomAbout(0.7)} aria-label="Zoom in" className="map-btn">
            <Plus className="w-[18px] h-[18px]" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => zoomAbout(1.4)} aria-label="Zoom out" className="map-btn">
            <Minus className="w-[18px] h-[18px]" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Legend and first-run hint */}
      {!card && (
        <div className="absolute bottom-7 left-3 right-[60px] z-10 flex items-end justify-between gap-2 pointer-events-none">
          <ul aria-label="Map legend" data-map-control className="map-glass hidden @3xl:flex items-center gap-3.5 h-9 px-3.5 rounded-full text-[12px] font-medium">
            {LEGEND.map((item) => (
              <li key={item.label} className="flex items-center gap-1.5">
                <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                {item.label}
              </li>
            ))}
          </ul>
          <p
            {...(hasInteracted ? {} : { 'data-map-control': true })}
            className={`map-glass flex items-center gap-2 h-9 px-3.5 rounded-full text-[12px] font-medium transition-opacity duration-500 ${
              hasInteracted ? 'opacity-0' : 'opacity-100'
            }`}
          >
            <Hand className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="@xl:hidden">Use two fingers to move the map</span>
            <span className="hidden @xl:inline">Drag to move · shift-drag to turn · scroll to zoom</span>
          </p>
        </div>
      )}

      {/* Data credit, required by the OpenStreetMap licence */}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer"
        data-map-control
        className="absolute bottom-1.5 right-3 z-10 text-[10px] leading-none text-[var(--map-muted)] hover:text-[var(--map-ink)] transition-colors duration-150"
      >
        © OpenStreetMap contributors
      </a>

      {/* Place card for the selected place */}
      {card && (
        <article
          key={card.id}
          aria-label={card.name}
          data-map-control
          className="map-glass map-card absolute z-30 left-3 right-3 bottom-6 @2xl:right-auto @2xl:w-[320px] rounded-[18px] p-4 animate-sheet-up"
        >
          <div className="flex items-start gap-3">
            <span
              className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0"
              style={{ backgroundColor: card.color }}
              aria-hidden="true"
            >
              <CardIcon className="w-[18px] h-[18px]" strokeWidth={2.2} />
            </span>
            <div className="flex-1 min-w-0">
              <h4 className="text-[17px] font-semibold leading-tight tracking-tight">{card.name}</h4>
              <p className="text-[13px] text-[var(--map-muted)] mt-0.5">
                {cardMeta.label}
                {floors && ` · ${floors} floor${floors > 1 ? 's' : ''}`}
                {appHostel?.rooms && ` · ${appHostel.rooms}`}
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

          {card.data.description && (
            <p className="mt-3 text-[13px] leading-relaxed text-[var(--map-muted)] line-clamp-2">{card.data.description}</p>
          )}

          {amenities.length > 0 && (
            <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Inside">
              {amenities.map((item) => (
                <li key={item} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--map-hover)] text-[var(--map-ink)]">
                  {item}
                </li>
              ))}
            </ul>
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
                setRideDropTarget(appPlaceName);
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
                  setSelected3DTarget(
                    appHostel || appLandmark || { id: card.id, name: card.name, category: APP_CATEGORY[card.kind] || card.kind }
                  );
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
