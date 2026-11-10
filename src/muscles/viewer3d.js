// The three.js scene for the muscle map: the anatomy model with toon shading and
// outline, orbit controls, tap-to-select, smooth colour transitions, spring-damped
// camera moves and the animations (intro sweep, breathing, pulse on weak muscles,
// tap-to-focus) plus the muscle name labels. Framework-free; MuscleViewer.jsx
// owns the lifecycle.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GROUP_IDS, groupLabel } from "./taxonomy";

const BASE_KEY = "base";

export function webglSupported() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch {
    return false;
  }
}

const FIGURE_HEIGHT = 1.74;
const FOV = 32;
const TARGET = new THREE.Vector3(0, 0.78, 0);
// Camera azimuth for each preset view (the figure faces +z; its right side is -x).
const VIEW_AZIMUTH = { front: 0, right: -Math.PI / 2, back: Math.PI, left: Math.PI / 2 };
const VIEW_POLAR = 1.5; // just above level
// How much of the view a focused muscle fills. Deliberately well under 1: a
// close-up with no silhouette around it leaves you unable to tell where you are.
const FOCUS_FILL = 0.45;
const FLEX_DEPTH = 0.011; // metres a muscle swells at flex = 1
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth01 = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

// Critically damped spring: eases in and out and can be retargeted mid-flight.
function smoothDamp(cur, tgt, vel, smoothTime, dt) {
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - tgt;
  const temp = (vel.v + omega * change) * dt;
  vel.v = (vel.v - omega * temp) * e;
  return tgt + (change + temp) * e;
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,0.95)");
  grd.addColorStop(0.45, "rgba(255,255,255,0.3)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function createViewer(container, { onSelect } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  const dom = renderer.domElement;
  dom.style.cssText = "display:block;width:100%;height:100%;touch-action:none;outline:none";
  container.appendChild(dom);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 30);
  camera.position.set(0, 1.1, 4);
  scene.add(camera);

  const controls = new OrbitControls(camera, dom);
  controls.target.copy(TARGET);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minPolarAngle = 0.35;
  controls.maxPolarAngle = Math.PI * 0.62;
  controls.rotateSpeed = 0.85;
  controls.zoomSpeed = 0.7;
  controls.update();

  // ── Lights ──────────────────────────────────────────────────────────────
  // The key and fill ride on the camera, so whichever side you are looking at
  // is always lit, including mid-turn. A world-space top light adds form.
  const hemi = new THREE.HemisphereLight(0xffffff, 0x9a88b0, 1.05);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(-1.3, 1.6, 0);
  key.target.position.set(0, 0, -5);
  const fill = new THREE.DirectionalLight(0xc4d6ff, 1.0);
  fill.position.set(1.6, -0.4, 0);
  fill.target.position.set(0, 0, -5);
  camera.add(key, key.target, fill, fill.target);
  const top = new THREE.DirectionalLight(0xffffff, 0.8);
  top.position.set(0.3, 3, 0.4);
  scene.add(top);

  // Four-step lighting bands give the pixel-art look.
  const bands = new THREE.DataTexture(new Uint8Array([88, 150, 214, 255]), 4, 1, THREE.RedFormat);
  bands.minFilter = THREE.NearestFilter;
  bands.magFilter = THREE.NearestFilter;
  bands.generateMipmaps = false;
  bands.needsUpdate = true;

  // ── Meshes ──────────────────────────────────────────────────────────────
  // One mesh per muscle group, loaded from public/models/body.glb (built from the
  // Z-Anatomy model, CC BY-SA 4.0; see docs/MUSCLE_MAP.md). Colours that arrive
  // before the model has loaded are applied as soon as it is in.
  const meshes = {};
  const materials = {};
  const bounds = {}; // per group: centre height, depth, size (for the focus camera)
  const neutral = new THREE.Color("#4b4b5c");
  const baseColor = new THREE.Color("#8a6f7e");
  const geometries = [];
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  // One flex uniform per group, shared by the muscle and its outline so they swell together.
  const flexU = Object.fromEntries(GROUP_IDS.map((g) => [g, { value: 0 }]));
  const outlineColor = { value: new THREE.Color("#1a0f16") };
  const outlineMaterials = [];
  const figure = new THREE.Group();
  scene.add(figure);
  let all = [];
  let disposed = false;
  let sweepStart = null;
  const reveal = Object.fromEntries(GROUP_IDS.map((g) => [g, 1]));

  // The .glb is Draco-compressed. DRACOLoader resolves its decoder through the
  // bundler (import.meta.url), so the .wasm ships as a build asset and is
  // precached with everything else - no CDN fetch, and the map works offline.
  const draco = new DRACOLoader();
  const loader = new GLTFLoader().setDRACOLoader(draco);
  loader.load(import.meta.env.BASE_URL + "models/body.glb", (gltf) => {
    if (disposed) return;
    const found = [];
    gltf.scene.traverse((o) => {
      if (o.isMesh) found.push(o);
    });
    for (const o of found) {
      const key2 = o.name;
      const uniform = flexU[key2];
      const material = new THREE.MeshToonMaterial({ color: key2 === BASE_KEY ? baseColor : neutral, gradientMap: bands });
      if (uniform) {
        material.onBeforeCompile = (shader) => {
          shader.uniforms.uFlex = uniform;
          shader.vertexShader = "uniform float uFlex;\n" + shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>\n transformed += normal * uFlex * ${FLEX_DEPTH};`);
        };
        material.customProgramCacheKey = () => "flex";
      }
      o.material = material;
      o.userData.group = key2;
      geometries.push(o.geometry);
      meshes[key2] = o;
      materials[key2] = material;
      if (uniform) {
        const box = new THREE.Box3().setFromObject(o);
        bounds[key2] = {
          // Label anchor: the centroid of ONE side of the muscle. A left+right
          // pair shares a mesh, so its bounding-box centre falls on the midline
          // and would caption the belly "Forearms". One side lands on the muscle.
          centre: sideAnchor(o.geometry, box),
          cy: (box.min.y + box.max.y) / 2,
          cz: (box.min.z + box.max.z) / 2,
          h: box.max.y - box.min.y,
          w: box.max.x - box.min.x,
        };
      }
      if (current[key2]) material.color.copy(current[key2]);
      const outlineMaterial = new THREE.ShaderMaterial({
        uniforms: { color: outlineColor, width: { value: 0.0022 }, uFlex: uniform || { value: 0 } },
        vertexShader: `uniform float width; uniform float uFlex; void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * (width + uFlex * ${FLEX_DEPTH}), 1.0); }`,
        fragmentShader: "uniform vec3 color; void main(){ gl_FragColor = vec4(color, 1.0); }",
        side: THREE.BackSide,
      });
      outlineMaterials.push(outlineMaterial);
      const outline = new THREE.Mesh(o.geometry, outlineMaterial);
      outline.raycast = () => {};
      o.add(outline);
    }
    figure.add(gltf.scene);
    draco.dispose();
    all = Object.values(meshes);
    if (!reduced) {
      sweepStart = performance.now();
      for (const g of GROUP_IDS) reveal[g] = 0;
    }
    applyTargets();
  });

  const floorMaterial = new THREE.MeshToonMaterial({ color: "#241b30", gradientMap: bands });
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.66, 0.05, 24), floorMaterial);
  floor.position.y = -0.035;
  scene.add(floor);

  const glowMap = glowTexture();
  const glowMaterial = new THREE.MeshBasicMaterial({ map: glowMap, color: "#ffffff", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 });
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.95, 48), glowMaterial);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.003;
  scene.add(glow);

  // ── Colour and animation state ──────────────────────────────────────────
  const current = Object.fromEntries(GROUP_IDS.map((g) => [g, neutral.clone()]));
  const goal = Object.fromEntries(GROUP_IDS.map((g) => [g, neutral.clone()]));
  const shown = new THREE.Color();
  let lastColors = {};
  let selected = null;
  let pulse = new Set();
  let needsRender = true;
  let fitDist = 4;

  function applyTargets() {
    if (materials[BASE_KEY]) materials[BASE_KEY].color.copy(baseColor);
    for (const g of GROUP_IDS) {
      goal[g].set(lastColors[g] || "#4b4b5c");
      if (selected && selected !== g) goal[g].lerp(baseColor, 0.6);
    }
    needsRender = true;
  }

  // Flex (muscle swell) and glow targets for this moment; eased toward each frame.
  function dynamics(t, g) {
    let flex = 0;
    let glow = 0;
    if (selected === g) {
      flex = 0.5;
      glow = 0.2;
    } else if (!selected && pulse.has(g)) {
      glow = reduced ? 0.2 : 0.1 + 0.22 * (0.5 + 0.5 * Math.sin((t * Math.PI * 2) / 1.8));
    }
    if (!reduced && !selected) {
      if (g === "chest") flex = 0.14 * (0.5 + 0.5 * Math.sin(t * 1.5));
      else if (g === "abs" || g === "obliques") flex = 0.1 * (0.5 + 0.5 * Math.sin(t * 1.5 - 0.6));
    }
    return { flex, glow };
  }

  // ── Camera moves ────────────────────────────────────────────────────────
  let view = null; // spring state: current values, goals and velocities

  function endView() {
    if (!view) return;
    view = null;
    controls.enabled = true;
    controls.update();
  }

  function startView(az, pol, r, ty) {
    const off = camera.position.clone().sub(controls.target);
    const cr = off.length();
    const caz = Math.atan2(off.x, off.z);
    const cpol = Math.acos(Math.max(-1, Math.min(1, off.y / cr)));
    let d = (az - caz) % (2 * Math.PI);
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    view = {
      az: caz,
      pol: cpol,
      r: cr,
      ty: controls.target.y,
      goal: { az: caz + d, pol, r: Math.min(Math.max(r, controls.minDistance), controls.maxDistance), ty },
      vaz: { v: 0 },
      vpol: { v: 0 },
      vr: { v: 0 },
      vty: { v: 0 },
    };
    controls.enabled = false;
  }

  function currentAzimuth() {
    const off = camera.position.clone().sub(controls.target);
    return Math.atan2(off.x, off.z);
  }

  const tanHalf = Math.tan((FOV * Math.PI) / 360);

  function focusGroup(g) {
    const b = g && bounds[g];
    if (!b) {
      startView(currentAzimuth(), VIEW_POLAR, fitDist, TARGET.y);
      return;
    }
    // Face the side the muscle is on: back muscles from behind, front ones from the front.
    const az = b.cz < -0.02 ? Math.PI : b.cz > 0.02 ? 0 : currentAzimuth();
    // Distance that makes the muscle fill FOCUS_FILL of the view, then held back
    // so at least half the figure stays in frame however small the muscle is.
    // Dividing the width by the aspect keeps the framing honest on a wide monitor
    // and a narrow phone alike.
    const need = Math.max(b.h, b.w / camera.aspect) / (2 * FOCUS_FILL * tanHalf);
    const r = Math.min(fitDist, Math.max(fitDist * 0.55, need));
    // Sit between the muscle and the body centre, so the silhouette stays readable.
    startView(az, VIEW_POLAR, r, TARGET.y + (b.cy - TARGET.y) * 0.75);
  }

  // ── Labels ──────────────────────────────────────────────────────────────
  // Plain DOM over the canvas: crisp at any resolution, themeable, and free to
  // restyle. Only muscles facing the camera are labelled, and overlapping ones
  // are dropped, so you get a handful of readable names instead of 18 stacked.
  const labelLayer = document.createElement("div");
  labelLayer.className = "mm-labels";
  container.appendChild(labelLayer);
  const labelEls = {};
  for (const g of GROUP_IDS) {
    const el = document.createElement("div");
    el.className = "mm-label";
    el.textContent = groupLabel(g);
    el.style.opacity = "0";
    labelLayer.appendChild(el);
    labelEls[g] = el;
  }
  let labelsOn = true;
  const vProj = new THREE.Vector3();
  const vOut = new THREE.Vector3();
  const camDir = new THREE.Vector3();

  function sideAnchor(geometry, box) {
    const pos = geometry.attributes.position;
    let ax = 0;
    let ay = 0;
    let az = 0;
    let n = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      if (x < 0.02) continue; // skip the midline and the far side
      ax += x;
      ay += pos.getY(i);
      az += pos.getZ(i);
      n++;
    }
    return n > 20 ? new THREE.Vector3(ax / n, ay / n, az / n) : box.getCenter(new THREE.Vector3());
  }

  function hideLabels() {
    for (const g of GROUP_IDS) labelEls[g].style.opacity = "0";
  }

  function updateLabels() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!labelsOn || all.length === 0 || sweepStart !== null) {
      hideLabels();
      return;
    }
    camera.getWorldDirection(camDir);
    const cands = [];
    for (const g of GROUP_IDS) {
      const b = bounds[g];
      if (!b) continue;
      // Treat the muscle's offset from the body axis as its outward direction;
      // if it points away from the camera the muscle is round the back.
      vOut.set(b.centre.x, 0, b.centre.z);
      if (vOut.lengthSq() < 1e-6) vOut.set(0, 0, 1);
      vOut.normalize();
      if (vOut.dot(camDir) > -0.12) continue;
      vProj.copy(b.centre).project(camera);
      if (vProj.z > 1) continue;
      const x = (vProj.x * 0.5 + 0.5) * w;
      const y = (-vProj.y * 0.5 + 0.5) * h;
      if (x < 6 || x > w - 6 || y < 6 || y > h - 6) continue;
      cands.push({ g, x, y, rank: selected === g ? 3 : pulse.has(g) ? 2 : 1, size: b.h * b.w });
    }
    // Most important first, so a crowded area keeps the label worth reading.
    cands.sort((a, b2) => b2.rank - a.rank || b2.size - a.size);
    const max = w < 520 ? 6 : 14;
    const placed = [];
    const shown = new Set();
    for (const c of cands) {
      if (shown.size >= max) break;
      const el = labelEls[c.g];
      const halfW = (el.offsetWidth || 54) / 2;
      const halfH = (el.offsetHeight || 16) / 2;
      if (placed.some((p) => Math.abs(p.x - c.x) < p.halfW + halfW + 4 && Math.abs(p.y - c.y) < p.halfH + halfH + 2)) continue;
      placed.push({ x: c.x, y: c.y, halfW, halfH });
      shown.add(c.g);
      el.style.transform = `translate(-50%,-50%) translate(${Math.round(c.x)}px, ${Math.round(c.y)}px)`;
      el.style.opacity = selected && selected !== c.g ? "0.4" : "1";
      el.classList.toggle("on", selected === c.g);
    }
    for (const g of GROUP_IDS) if (!shown.has(g)) labelEls[g].style.opacity = "0";
  }

  // ── Loop ────────────────────────────────────────────────────────────────
  let raf = 0;
  let last = performance.now();
  let lastRender = 0;
  const t0 = performance.now();

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = (now - t0) / 1000;
    let changed = false;
    let busy = false; // something other than the idle breathing is moving

    if (view) {
      view.az = smoothDamp(view.az, view.goal.az, view.vaz, 0.34, dt);
      view.pol = smoothDamp(view.pol, view.goal.pol, view.vpol, 0.34, dt);
      view.r = smoothDamp(view.r, view.goal.r, view.vr, 0.34, dt);
      view.ty = smoothDamp(view.ty, view.goal.ty, view.vty, 0.34, dt);
      controls.target.y = view.ty;
      const s = Math.sin(view.pol);
      camera.position.set(controls.target.x + view.r * s * Math.sin(view.az), view.ty + view.r * Math.cos(view.pol), controls.target.z + view.r * s * Math.cos(view.az));
      camera.lookAt(controls.target);
      changed = busy = true;
      if (Math.abs(view.goal.az - view.az) < 0.002 && Math.abs(view.goal.pol - view.pol) < 0.002 && Math.abs(view.goal.r - view.r) < 0.003 && Math.abs(view.goal.ty - view.ty) < 0.002) endView();
    } else if (controls.update()) changed = busy = true;

    // Intro sweep: colours fill in from the feet up.
    let sweeping = false;
    if (sweepStart !== null) {
      const p = (performance.now() - sweepStart) / 1500;
      for (const g of GROUP_IDS) {
        const rank = bounds[g] ? clamp01((bounds[g].cy - 0.1) / 1.4) : 0.5;
        reveal[g] = smooth01((p * 1.6 - rank * 0.6) / 0.4);
      }
      if (p >= 1) {
        sweepStart = null;
        for (const g of GROUP_IDS) reveal[g] = 1;
      }
      sweeping = changed = busy = true;
    }

    const k = 1 - Math.exp(-dt * 7);
    const kf = 1 - Math.exp(-dt * 10);
    for (const g of GROUP_IDS) {
      const settling = !current[g].equals(goal[g]);
      if (settling) {
        current[g].lerp(goal[g], k);
        const d = Math.abs(current[g].r - goal[g].r) + Math.abs(current[g].g - goal[g].g) + Math.abs(current[g].b - goal[g].b);
        if (d < 0.004) current[g].copy(goal[g]);
        changed = busy = true;
      }
      const m = materials[g];
      if (!m) continue;
      const dyn = dynamics(t, g);
      const u = flexU[g];
      if (Math.abs(u.value - dyn.flex) > 0.0005) {
        u.value += (dyn.flex - u.value) * kf;
        changed = true;
        if (selected) busy = true;
      }
      if (settling || sweeping) {
        shown.copy(neutral).lerp(current[g], reveal[g]);
        m.color.copy(shown);
      }
      const e = sweeping ? 0 : dyn.glow;
      if (e !== m.userData.glow) {
        m.userData.glow = e;
        m.emissive.copy(current[g]).multiplyScalar(e);
        changed = true;
        if (pulse.size) busy = true;
      } else if (e > 0 && pulse.size) {
        m.emissive.copy(current[g]).multiplyScalar(e);
      }
    }

    // Breathing: the whole figure rises a hair, only when nothing else is going on.
    if (!reduced && !sweeping) {
      const b = 1 + 0.0035 * Math.sin(t * 1.5);
      if (figure.scale.y !== b) {
        figure.scale.y = b;
        changed = true;
      }
    }
    const animated = !reduced && (changed || pulse.size > 0);
    // Idle animation only needs ~30 fps; anything the user is driving gets every frame.
    if (needsRender || busy || ((animated || changed) && now - lastRender > 33)) {
      updateLabels();
      renderer.render(scene, camera);
      lastRender = now;
      needsRender = false;
    }
  }
  raf = requestAnimationFrame(frame);

  // ── Size ────────────────────────────────────────────────────────────────
  let fitted = false;
  function resize() {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const fit = Math.max((FIGURE_HEIGHT / 2 + 0.06) / tanHalf, 0.58 / (tanHalf * camera.aspect));
    fitDist = fit;
    controls.minDistance = fit * 0.3;
    controls.maxDistance = fit * 1.5;
    if (!fitted) {
      camera.position.copy(TARGET).add(new THREE.Vector3(0, 0.1, 1).normalize().multiplyScalar(fit));
      controls.update();
      fitted = true;
    }
    needsRender = true;
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  // ── Picking ─────────────────────────────────────────────────────────────
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down = null;
  const onDown = (e) => {
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
    endView(); // grabbing the figure cancels a view change in progress
  };
  const onUp = (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const held = performance.now() - down.t;
    down = null;
    if (moved > 6 || held > 500) return;
    const r = dom.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(all, false)[0];
    const g = hit ? hit.object.userData.group : null;
    onSelect?.(g && g !== BASE_KEY ? g : null);
  };
  dom.addEventListener("pointerdown", onDown);
  dom.addEventListener("pointerup", onUp);
  controls.addEventListener("change", () => {
    needsRender = true;
  });

  return {
    setColors(map) {
      lastColors = map || {};
      applyTargets();
    },
    setSelected(g) {
      const next = g || null;
      const was = selected;
      selected = next;
      applyTargets();
      if (next !== was) focusGroup(next);
    },
    // Groups that pulse softly to draw the eye (the weakest muscles).
    setPulse(groups) {
      pulse = new Set(groups || []);
      needsRender = true;
    },
    // A preset view always shows the whole body from that side. Keeping the
    // selection would dim everything else and keeping the zoom would crop it,
    // which together made "Back" look like an untrained back.
    setView(name) {
      if (!(name in VIEW_AZIMUTH)) return;
      if (selected) {
        selected = null;
        applyTargets();
        onSelect?.(null);
      }
      startView(VIEW_AZIMUTH[name], VIEW_POLAR, fitDist, TARGET.y);
    },
    setLabels(on) {
      labelsOn = !!on;
      if (!labelsOn) hideLabels();
      needsRender = true;
    },
    setPalette({ base, floor: floorColor } = {}) {
      if (base) {
        baseColor.set(base);
        outlineColor.value.set(base).multiplyScalar(0.2);
      }
      if (floorColor) {
        floorMaterial.color.set(floorColor);
        glowMaterial.color.set(floorColor).lerp(new THREE.Color(1, 1, 1), 0.4);
      }
      applyTargets();
    },
    dispose() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointerup", onUp);
      controls.dispose();
      labelLayer.remove();
      for (const g of geometries) g.dispose();
      for (const m of Object.values(materials)) m.dispose();
      for (const m of outlineMaterials) m.dispose();
      disposed = true;
      floor.geometry.dispose();
      floorMaterial.dispose();
      glow.geometry.dispose();
      glowMaterial.dispose();
      glowMap.dispose();
      bands.dispose();
      renderer.dispose();
      dom.remove();
    },
  };
}
