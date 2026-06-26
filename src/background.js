// src/background.js
import * as THREE from 'three';

const PANORAMA_BASE = 'panos/';
const PANORAMA_PREFIX = 'panorama_';
const FADE_DURATION = 5000;
const DEFAULT_FOV = 100;

const container = document.getElementById('panorama-container');
container.style.position = 'relative';

let bgViewer = null;
let bgNextViewer = null;
let bgFadeId = null;
let bgFadeActive = false;

// Helper: wait for container size
function waitForContainerSize(maxAttempts = 10, delay = 100) {
  return new Promise((resolve) => {
    let attempts = 0;
    const check = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if ((w > 0 && h > 0) || attempts >= maxAttempts) {
        resolve({ width: w, height: h });
      } else {
        attempts++;
        setTimeout(check, delay);
      }
    };
    check();
  });
}

// Cube texture loader (no fallback – we detect failure)
const FACE_INDEX_TO_THREE = [1, 3, 5, 4, 0, 2];
function flipImageVertically(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.translate(0, canvas.height);
  ctx.scale(1, -1);
  ctx.drawImage(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
async function loadCubeTexture(folder) {
  const faceUrls = FACE_INDEX_TO_THREE.map(idx =>
    `${PANORAMA_BASE}${folder}/${PANORAMA_PREFIX}${idx}.png`
  );
  const loadImage = (url) => new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
  const images = await Promise.all(faceUrls.map(url => loadImage(url)));
  const textures = images.map(img => flipImageVertically(img));
  const cubeTexture = new THREE.CubeTexture();
  cubeTexture.images = textures.map(t => t.image);
  cubeTexture.minFilter = THREE.LinearMipmapLinearFilter;
  cubeTexture.magFilter = THREE.LinearFilter;
  cubeTexture.generateMipmaps = true;
  cubeTexture.needsUpdate = true;
  return cubeTexture;
}

// ----- Build background viewer (transparent, auto-rotate) -----
function buildBackgroundViewer(folder) {
  const width = container.clientWidth;
  const height = container.clientHeight;
  if (width === 0 || height === 0) {
    return null;
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0); // fully transparent

  const canvas = renderer.domElement;
  canvas.style.position = 'absolute';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.zIndex = 0;
  canvas.style.pointerEvents = 'none';
  canvas.style.touchAction = 'auto';
  canvas.style.display = 'block';
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.background = null; // transparent

  const camera = new THREE.PerspectiveCamera(DEFAULT_FOV, width / height, 0.1, 1000);
  camera.position.set(0, 0, 0);
  camera.rotation.order = 'YXZ';

  const controls = { yaw: 0, pitch: 0 };

  let mesh = null;
  let ready = false;
  let loadSuccess = false;

  const loadPromise = loadCubeTexture(folder)
    .then(cubeTexture => {
      const geometry = new THREE.SphereGeometry(500, 256, 256);
      const material = new THREE.MeshBasicMaterial({ envMap: cubeTexture, side: THREE.BackSide });
      mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);
      ready = true;
      loadSuccess = true;
      renderer.render(scene, camera);
    })
    .catch(err => {
      console.warn('Background panorama failed, keeping transparent:', folder, err);
      ready = true;
      loadSuccess = false;
      renderer.render(scene, camera);
    });

  let animId = null;
  function animate() {
    if (!ready) {
      animId = requestAnimationFrame(animate);
      return;
    }
    controls.yaw += 0.0005;
    camera.rotation.y = controls.yaw;
    camera.rotation.x = controls.pitch;
    renderer.render(scene, camera);
    animId = requestAnimationFrame(animate);
  }
  animate();

  const resizeHandler = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener('resize', resizeHandler);

  return {
    folder,
    renderer,
    scene,
    camera,
    controls,
    animId,
    canvas,
    resizeHandler,
    ready,
    loadPromise,
    loadSuccess, // this will be updated after loadPromise resolves
  };
}

function destroyViewer(viewer) {
  if (!viewer) return;
  if (viewer.animId) cancelAnimationFrame(viewer.animId);
  if (viewer.renderer) {
    const canvas = viewer.renderer.domElement;
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    viewer.renderer.dispose();
  }
  if (viewer.scene) {
    while (viewer.scene.children.length) viewer.scene.remove(viewer.scene.children[0]);
  }
  window.removeEventListener('resize', viewer.resizeHandler);
}

// ----- Crossfade (unchanged) -----
function startCrossfade() { /* ... same as before ... */ }

// ==================== PUBLIC API ====================
export async function createBackgroundPanorama(folder) {
  await waitForContainerSize();

  if (bgFadeActive) {
    cancelAnimationFrame(bgFadeId);
    bgFadeId = null;
    bgFadeActive = false;
    if (bgNextViewer) {
      destroyViewer(bgNextViewer);
      bgNextViewer = null;
    }
    if (bgViewer) {
      bgViewer.canvas.style.opacity = 1;
    }
  }

  const newViewer = buildBackgroundViewer(folder);
  if (!newViewer) {
    // Container size zero – can't load
    return false;
  }

  // Wait for the load to finish
  await newViewer.loadPromise;

  // Now check if load succeeded
  const success = newViewer.loadSuccess;

  if (!success) {
    // If failed, don't add it to the viewer chain; clean up
    destroyViewer(newViewer);
    return false;
  }

  // Success: add it to the chain
  if (!bgViewer) {
    bgViewer = newViewer;
    bgViewer.canvas.style.opacity = 1;
    bgViewer.canvas.style.zIndex = 0;
    container.classList.add('background');
    return true;
  }

  bgNextViewer = newViewer;
  bgNextViewer.canvas.style.opacity = 0;
  bgNextViewer.canvas.style.zIndex = 0;
  bgViewer.canvas.style.zIndex = 1;
  bgViewer.canvas.style.opacity = 1;

  startCrossfade();
  return true;
}

export function destroyBackgroundViewer() {
  if (bgFadeActive) {
    cancelAnimationFrame(bgFadeId);
    bgFadeId = null;
    bgFadeActive = false;
  }
  if (bgNextViewer) {
    destroyViewer(bgNextViewer);
    bgNextViewer = null;
  }
  if (bgViewer) {
    destroyViewer(bgViewer);
    bgViewer = null;
  }
  container.classList.remove('background');
}