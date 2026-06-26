// src/panorama.js
import * as THREE from 'three';

const PANORAMA_BASE = 'panos/';
const PANORAMA_PREFIX = 'panorama_';
const MIN_FOV = 12;
const MAX_FOV = 130;
const DEFAULT_FOV = 100;
const BASE_DRAG_SENSITIVITY = 0.005;

const container = document.getElementById('panorama-container');
const compassNeedle = document.getElementById('compass-needle');

let gameViewer = null;

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

// Cube texture loader (no fallback – will reject on failure)
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

function updateCompass(yawRad) {
  if (!compassNeedle) return;
  const deg = yawRad * (180 / Math.PI);
  compassNeedle.style.transform = `translate(-50%, -100%) rotate(${deg}deg)`;
}

function getDragSensitivity(camera) {
  const zoomFactor = camera.fov / DEFAULT_FOV;
  return BASE_DRAG_SENSITIVITY * zoomFactor;
}

function getCameraSpaceDirection(x, y, width, height, fov) {
  const ndcX = (x / width) * 2 - 1;
  const ndcY = -((y / height) * 2 - 1);
  const halfFov = THREE.MathUtils.degToRad(fov) / 2;
  const dir = new THREE.Vector3(
    ndcX * Math.tan(halfFov) * (width / height),
    ndcY * Math.tan(halfFov),
    -1
  );
  return dir.normalize();
}

function getWorldDirectionForScreenPoint(camera, x, y, width, height, fov) {
  const localDir = getCameraSpaceDirection(x, y, width, height, fov);
  return localDir.applyQuaternion(camera.quaternion).normalize();
}

function syncCameraFromControls(camera, controls) {
  camera.rotation.set(controls.pitch, controls.yaw, 0, 'YXZ');
  camera.updateMatrixWorld(true);
}

// ----- Build game viewer (interactive, solid fallback) -----
function buildGameViewer(folder) {
  const width = container.clientWidth;
  const height = container.clientHeight;
  if (width === 0 || height === 0) {
    return null;
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x050a15, 1); // solid dark blue

  const canvas = renderer.domElement;
  canvas.style.position = 'absolute';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.zIndex = 10;
  canvas.style.pointerEvents = 'auto';
  canvas.style.touchAction = 'none';
  canvas.style.display = 'block';
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050a15);

  const camera = new THREE.PerspectiveCamera(DEFAULT_FOV, width / height, 0.1, 1000);
  camera.position.set(0, 0, 0);
  camera.rotation.order = 'YXZ';

  const controls = { yaw: 0, pitch: 0 };

  let mesh = null;
  let ready = false;

  const loadPromise = loadCubeTexture(folder)
    .then(cubeTexture => {
      const geometry = new THREE.SphereGeometry(500, 256, 256);
      const material = new THREE.MeshBasicMaterial({ envMap: cubeTexture, side: THREE.BackSide });
      mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);
      ready = true;
      renderer.render(scene, camera);
    })
    .catch(err => {
      // No fallback – rethrow to skip this location
      throw new Error(`Panorama load failed for ${folder}: ${err.message}`);
    });

  let animId = null;
  function animate() {
    if (!ready) {
      animId = requestAnimationFrame(animate);
      return;
    }
    camera.rotation.y = controls.yaw;
    camera.rotation.x = controls.pitch;
    renderer.render(scene, camera);
    updateCompass(controls.yaw);
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

// ==================== PUBLIC API ====================
export async function createCubeMapViewer(folder) {
  await waitForContainerSize();

  if (gameViewer) {
    destroyViewer(gameViewer);
    gameViewer = null;
  }

  const viewer = buildGameViewer(folder);
  if (!viewer) {
    throw new Error('Viewer could not be created (container size zero)');
  }

  await viewer.loadPromise; // will throw on failure

  gameViewer = viewer;
  gameViewer.canvas.style.opacity = 1;
  gameViewer.canvas.style.zIndex = 10;
  container.style.cursor = 'grab';
  setupInteractiveControls(viewer);

  updateCompass(0);
}

// ----- Interactive controls (full) -----
function setupInteractiveControls(viewer) {
  const canvas = viewer.canvas;
  const controls = viewer.controls;
  const camera = viewer.camera;

  let dragging = false;
  let lastX = 0, lastY = 0;

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.style.cursor = 'grabbing';
    e.preventDefault();
  };

  const onMouseMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    const sensitivity = getDragSensitivity(camera);
    controls.yaw += dx * sensitivity;
    controls.pitch += dy * sensitivity;
    controls.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, controls.pitch));
    camera.rotation.y = controls.yaw;
    camera.rotation.x = controls.pitch;
    updateCompass(controls.yaw);
    lastX = e.clientX;
    lastY = e.clientY;
  };

  const onMouseUp = (e) => {
    if (dragging) {
      dragging = false;
      canvas.style.cursor = 'grab';
    }
  };

  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  const onWheel = (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;
    const oldFov = camera.fov;
    const anchorDir = getWorldDirectionForScreenPoint(camera, cursorX, cursorY, rect.width, rect.height, oldFov);

    const delta = e.deltaY;
    const factor = delta < 0 ? 1 / 1.10 : 1.10;
    let newFov = camera.fov * factor;
    newFov = Math.max(MIN_FOV, Math.min(MAX_FOV, newFov));
    if (Math.abs(newFov - camera.fov) < 0.05) return;

    const newLocalDir = getCameraSpaceDirection(cursorX, cursorY, rect.width, rect.height, newFov);
    const zoomQuat = new THREE.Quaternion().setFromUnitVectors(newLocalDir, anchorDir);
    camera.fov = newFov;
    camera.updateProjectionMatrix();
    camera.quaternion.multiply(zoomQuat);
    camera.updateMatrixWorld(true);

    controls.yaw = camera.rotation.y;
    controls.pitch = camera.rotation.x;
    controls.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, controls.pitch));
    syncCameraFromControls(camera, controls);
    updateCompass(controls.yaw);
  };
  canvas.addEventListener('wheel', onWheel, { passive: false });

  const onDblClick = (e) => {
    e.preventDefault();
    camera.fov = DEFAULT_FOV;
    camera.updateProjectionMatrix();
  };
  canvas.addEventListener('dblclick', onDblClick);

  // Touch support
  let touchState = { active: false, mode: null, startX: 0, startY: 0, startYaw: 0, startPitch: 0, lastTouchDist: 0, lastFov: DEFAULT_FOV };
  const onTouchStart = (e) => {
    const touches = e.touches;
    if (touches.length === 1) {
      touchState.active = true;
      touchState.mode = 'drag';
      touchState.startX = touches[0].clientX;
      touchState.startY = touches[0].clientY;
      touchState.startYaw = controls.yaw;
      touchState.startPitch = controls.pitch;
      e.preventDefault();
    } else if (touches.length === 2) {
      touchState.active = true;
      touchState.mode = 'pinch';
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      touchState.lastTouchDist = Math.sqrt(dx * dx + dy * dy);
      touchState.lastFov = camera.fov;
      e.preventDefault();
    }
  };
  const onTouchMove = (e) => {
    if (!touchState.active) return;
    const touches = e.touches;
    if (touchState.mode === 'drag' && touches.length === 1) {
      const dx = touches[0].clientX - touchState.startX;
      const dy = touches[0].clientY - touchState.startY;
      const sensitivity = getDragSensitivity(camera);
      controls.yaw = touchState.startYaw + dx * sensitivity;
      controls.pitch = touchState.startPitch + dy * sensitivity;
      controls.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, controls.pitch));
      camera.rotation.y = controls.yaw;
      camera.rotation.x = controls.pitch;
      updateCompass(controls.yaw);
      e.preventDefault();
    } else if (touchState.mode === 'pinch' && touches.length === 2) {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (touchState.lastTouchDist > 0) {
        const ratio = dist / touchState.lastTouchDist;
        let newFov = touchState.lastFov / ratio;
        newFov = Math.max(MIN_FOV, Math.min(MAX_FOV, newFov));
        camera.fov = newFov;
        camera.updateProjectionMatrix();
      }
      e.preventDefault();
    }
  };
  const onTouchEnd = (e) => {
    if (!touchState.active) return;
    if (e.touches.length === 0) {
      touchState.active = false;
      touchState.mode = null;
    } else if (e.touches.length === 1 && touchState.mode === 'pinch') {
      const t = e.touches[0];
      touchState.mode = 'drag';
      touchState.startX = t.clientX;
      touchState.startY = t.clientY;
      touchState.startYaw = controls.yaw;
      touchState.startPitch = controls.pitch;
    }
  };
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });
  canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });

  const onKeyDown = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      let newFov = camera.fov / 1.10;
      newFov = Math.max(MIN_FOV, newFov);
      camera.fov = newFov;
      camera.updateProjectionMatrix();
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      let newFov = camera.fov * 1.10;
      newFov = Math.min(MAX_FOV, newFov);
      camera.fov = newFov;
      camera.updateProjectionMatrix();
    } else if (e.key === '0' || e.key === 'Escape') {
      e.preventDefault();
      camera.fov = DEFAULT_FOV;
      camera.updateProjectionMatrix();
    }
  };
  window.addEventListener('keydown', onKeyDown);

  viewer._cleanup = () => {
    canvas.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('dblclick', onDblClick);
    canvas.removeEventListener('touchstart', onTouchStart);
    canvas.removeEventListener('touchmove', onTouchMove);
    canvas.removeEventListener('touchend', onTouchEnd);
    canvas.removeEventListener('touchcancel', onTouchEnd);
    window.removeEventListener('keydown', onKeyDown);
  };
}

export function destroyPanoViewer() {
  if (gameViewer) {
    if (gameViewer._cleanup) gameViewer._cleanup();
    destroyViewer(gameViewer);
    gameViewer = null;
  }
  container.style.cursor = 'default';
}