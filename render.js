// ============================================================================
// render.js — Escena, cámara, luces, sol/luna/estrellas, nubes, ciclo día/noche
// ============================================================================
import * as THREE from 'three';
import {
  SEED, DAY_LEN,
  paint, vary, mkTex, mulberry32, smooth
} from './nucleo.js';

// ============================ RENDERER ============================
export const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Mantiene el coste de renderizado estable en pantallas de alta densidad.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.prepend(renderer.domElement);

// ============================ ESCENA Y CÁMARA ============================
export const scene = new THREE.Scene();
export const skyColor = new THREE.Color(0x87ceeb);
scene.background = skyColor;
scene.fog = new THREE.Fog(skyColor, 30, 92);
export const worldGroup = new THREE.Group();
worldGroup.name = 'overworld-chunks';
scene.add(worldGroup);

export const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 600);
camera.rotation.order = 'YXZ';
scene.add(camera);

// ============================ LUCES ============================
export const ambient = new THREE.AmbientLight(0xffffff, 1.3);
scene.add(ambient);
export const dirLight = new THREE.DirectionalLight(0xfff2dd, 2.2);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(1024, 1024);
dirLight.shadow.camera.left = -34;
dirLight.shadow.camera.right = 34;
dirLight.shadow.camera.top = 34;
dirLight.shadow.camera.bottom = -34;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 180;
dirLight.shadow.bias = -0.00025;
dirLight.shadow.normalBias = 0.025;
scene.add(dirLight);
scene.add(dirLight.target);

// Iluminación propia del End; queda apagada mientras se juega en el mundo normal.
const endHemisphere = new THREE.HemisphereLight(0xb9a4eb, 0x180d2b, 1.1);
const endAmbient = new THREE.AmbientLight(0x8a6ec4, 0.72);
const endDirectional = new THREE.DirectionalLight(0xffe6c4, 1.25);
endDirectional.position.set(30, 80, 20);
[endHemisphere, endAmbient, endDirectional].forEach(light => {
  light.visible = false;
  scene.add(light);
});
scene.add(endDirectional.target);

// ============================ ESTADO DEL CIELO ============================
export let timeOfDay = 0.02;
export let sunH = 0;
export function setTimeOfDay(t) { timeOfDay = t; }

// ============================ SOL / LUNA ============================
function radialTex(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, inner);
  gr.addColorStop(1, outer);
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const sunMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(34, 34),
  new THREE.MeshBasicMaterial({ color: 0xfff4a8, fog: false, depthWrite: false })
);
export const sunGlow = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 120),
  new THREE.MeshBasicMaterial({
    map: radialTex('rgba(255,220,140,0.55)', 'rgba(255,200,120,0)'),
    transparent: true, fog: false, depthWrite: false, blending: THREE.AdditiveBlending
  })
);
const moonTexC = paint((x, y, R) => {
  if (x < 1 || y < 1 || x > 14 || y > 14) return null;
  const c1 = (x - 5) ** 2 + (y - 6) ** 2 < 5;
  const c2 = (x - 10) ** 2 + (y - 10) ** 2 < 3;
  const c3 = (x - 11) ** 2 + (y - 4) ** 2 < 2;
  if (c1 || c2 || c3) return [170, 176, 196];
  return vary([226, 230, 244], R, 10);
}, 99);
export const moonMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(24, 24),
  new THREE.MeshBasicMaterial({ map: mkTex(moonTexC), fog: false, transparent: true, depthWrite: false })
);
[sunGlow, sunMesh, moonMesh].forEach(m => { m.renderOrder = -1; scene.add(m); });

// ============================ ESTRELLAS ============================
const starGeo = new THREE.BufferGeometry();
{
  const R = mulberry32(SEED + 5);
  const arr = new Float32Array(1500 * 3);
  for (let i = 0; i < 1500; i++) {
    const th = R() * Math.PI * 2;
    const ph = Math.acos(R() * 2 - 1);
    const r = 400;
    arr[i * 3]     = r * Math.sin(ph) * Math.cos(th);
    arr[i * 3 + 1] = Math.abs(r * Math.cos(ph)) * 0.9 + 10;
    arr[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
}
export const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
  color: 0xffffff, size: 2, sizeAttenuation: false,
  transparent: true, opacity: 0, fog: false, depthWrite: false
}));
stars.renderOrder = -2;
scene.add(stars);

// ============================ NUBES ============================
export const CLOUDS = 42;
export const clouds = new THREE.InstancedMesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, emissive: 0x777777 }),
  CLOUDS
);
export const cloudData = [];
{
  const R = mulberry32(SEED + 9);
  for (let i = 0; i < CLOUDS; i++) {
    cloudData.push({
      x: -180 + R() * 360,
      z: -180 + R() * 360,
      y: 56 + R() * 3,
      sx: 8 + R() * 14,
      sz: 6 + R() * 10
    });
  }
}
scene.add(clouds);

export const dummy = new THREE.Object3D();

// ============================ RESALTADO DEL BLOQUE APUNTADO ============================
export const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
  new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 })
);
highlight.visible = false;
scene.add(highlight);

// ============================ CICLO DÍA / NOCHE ============================
const C_DAY        = new THREE.Color(0x87c6f0);
const C_SUNSET     = new THREE.Color(0xf08a4b);
const C_NIGHT      = new THREE.Color(0x060a1c);
const C_SUNL_WARM  = new THREE.Color(0xffa060);
const C_SUNL_DAY   = new THREE.Color(0xfff4e0);
const C_MOON       = new THREE.Color(0x8ea4ff);
const C_AMB_DAY    = new THREE.Color(0xffffff);
const C_AMB_NIGHT  = new THREE.Color(0x5566aa);
const sunDir = new THREE.Vector3();

export function updateSky(dt) {
  timeOfDay = (timeOfDay + dt / DAY_LEN) % 1;
  const a = timeOfDay * Math.PI * 2;
  sunH = Math.sin(a);
  sunDir.set(Math.cos(a), Math.sin(a), 0.28).normalize();

  const cp = camera.position;
  sunMesh.position.copy(cp).addScaledVector(sunDir, 320);  sunMesh.lookAt(cp);
  sunGlow.position.copy(cp).addScaledVector(sunDir, 330);  sunGlow.lookAt(cp);
  moonMesh.position.copy(cp).addScaledVector(sunDir, -320); moonMesh.lookAt(cp);

  if (sunH > 0.25) skyColor.copy(C_DAY);
  else if (sunH > 0) skyColor.copy(C_SUNSET).lerp(C_DAY, sunH / 0.25);
  else if (sunH > -0.2) skyColor.copy(C_NIGHT).lerp(C_SUNSET, (sunH + 0.2) / 0.2);
  else skyColor.copy(C_NIGHT);
  scene.fog.color.copy(skyColor);

  const dayF = smooth(-0.15, 0.3, sunH);
  ambient.intensity = 0.35 + 1.05 * dayF;
  ambient.color.copy(C_AMB_NIGHT).lerp(C_AMB_DAY, dayF);

  if (sunH > -0.05) {
    dirLight.position.copy(cp).addScaledVector(sunDir, 100);
    dirLight.intensity = 2.3 * smooth(-0.05, 0.3, sunH);
    dirLight.color.copy(C_SUNL_WARM).lerp(C_SUNL_DAY, smooth(0, 0.45, sunH));
  } else {
    dirLight.position.copy(cp).addScaledVector(sunDir, -100);
    dirLight.intensity = 0.55 * smooth(-0.05, -0.3, sunH);
    dirLight.color.copy(C_MOON);
  }
  dirLight.target.position.copy(cp);

  stars.material.opacity = smooth(0.05, -0.25, sunH);
  stars.position.copy(cp);

  clouds.material.emissive.setScalar(0.1 + 0.4 * dayF);
  for (let i = 0; i < CLOUDS; i++) {
    const c = cloudData[i];
    c.x += dt * 1.2;
    if (c.x > 180) c.x = -180;
    dummy.position.set(camera.position.x+c.x, c.y, camera.position.z+c.z);
    dummy.scale.set(c.sx, 1.2, c.sz);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    clouds.setMatrixAt(i, dummy.matrix);
  }
  clouds.instanceMatrix.needsUpdate = true;
}

export function setEndLighting(active) {
  const celestial=[sunGlow,sunMesh,moonMesh,stars,clouds];
  celestial.forEach(o=>o.visible=!active);
  [endHemisphere, endAmbient, endDirectional].forEach(light => { light.visible = active; });
  if(active){
    scene.background=new THREE.Color(0x06030c);
    scene.fog.color.set(0x100b20);scene.fog.near=110;scene.fog.far=620;
    ambient.color.set(0x716596);ambient.intensity=.28;
    dirLight.color.set(0x8b80b3);dirLight.intensity=.18;
    camera.far=1500;camera.updateProjectionMatrix();
  }else{
    scene.background=skyColor;scene.fog.color.copy(skyColor);scene.fog.near=30;scene.fog.far=92;
    ambient.color.set(0xffffff);ambient.intensity=1.3;
    dirLight.color.set(0xfff2dd);updateSky(0);
    camera.far=600;camera.updateProjectionMatrix();
  }
}

export function clockStr() {
  const h = (timeOfDay * 24 + 6) % 24;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// ============================ RESIZE ============================
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
