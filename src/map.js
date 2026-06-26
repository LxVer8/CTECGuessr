// src/map.js
import { MAP_FILE, ORIGIN_X, ORIGIN_Y } from './config.js';

// Preload the map image as early as possible
const mapPreload = new Image();
mapPreload.src = MAP_FILE;
mapPreload.decode?.().catch(() => {});

// DOM refs
const mapImage = document.getElementById('map-image');
const mapWrapper = document.getElementById('map-wrapper');
const mapCorner = document.getElementById('map-corner');
const mapInner = document.getElementById('map-inner');
const guessPin = document.getElementById('guess-pin');
const actualPin = document.getElementById('actual-pin');
const svgLine = document.querySelector('#connection-line line');
let zoomTransitionTimeout = null;

// Internal state
let mapZoom = 1;
let mapPanX = 0, mapPanY = 0;
let selectedRawX = null, selectedRawY = null;
let actualRawX = null, actualRawY = null;
let isGuessed = false;
let wrapperWidth = 0;
let wrapperHeight = 0;

// Pin size scaling
const BASE_PIN_SIZE = 28;
const BASE_LINE_STROKE = 3.2;

// ---------- Initialization ----------
export function initMap() {
  if (mapImage.src !== MAP_FILE) {
    mapImage.src = MAP_FILE;
  }
  mapImage.onerror = () => console.warn('Map image failed to load');

  function handleMapLoaded() {
    mapImage.decode?.().catch(() => {});
    requestAnimationFrame(fitMapToWrapper);
  }

  if (mapImage.complete && mapImage.naturalWidth > 0) {
    handleMapLoaded();
  } else {
    mapImage.addEventListener('load', handleMapLoaded, { once: true });
  }

  // Attach wheel, drag, and click events
  mapWrapper.addEventListener('wheel', onWheel, { passive: false });
  mapWrapper.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  mapWrapper.addEventListener('contextmenu', e => e.preventDefault());
  let resizeTimeout = null;
  const scheduleResize = () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => requestAnimationFrame(handleWrapperResize), 50);
  };

  const wrapperObserver = new ResizeObserver(scheduleResize);
  wrapperObserver.observe(mapWrapper);
  window.addEventListener('resize', scheduleResize);
  return {
    placeGuessPin,
    placeActualPin,
    resetPins,
    getGuessCoords,
    setGuessed,
    fitMap
  };
}

// ---------- Public API ----------
export function placeGuessPin(rawX, rawY) {
  selectedRawX = rawX;
  selectedRawY = rawY;
  guessPin.style.left = rawX + 'px';
  guessPin.style.top = rawY + 'px';
  guessPin.style.display = 'block';
  updateDynamicScale();
}

export function placeActualPin(rawX, rawY) {
  actualRawX = rawX;
  actualRawY = rawY;
  actualPin.style.left = rawX + 'px';
  actualPin.style.top = rawY + 'px';
  actualPin.style.display = 'block';
  updateDynamicScale();
  updateConnectionLine();
}

export function resetPins() {
  selectedRawX = selectedRawY = null;
  actualRawX = actualRawY = null;
  guessPin.style.display = 'none';
  actualPin.style.display = 'none';
  svgLine.setAttribute('x1', 0);
  svgLine.setAttribute('x2', 0);
  svgLine.setAttribute('y1', 0);
  svgLine.setAttribute('y2', 0);
  isGuessed = false;
}

export function getGuessCoords() {
  if (selectedRawX === null || selectedRawY === null) return null;
  return {
    x: selectedRawX - ORIGIN_X,
    z: selectedRawY - ORIGIN_Y,
    rawX: selectedRawX,
    rawY: selectedRawY
  };
}

export function setGuessed(value) {
  isGuessed = value;
  if (!value) resetPins();
}

export function fitMap() {
  fitMapToWrapper();
}

// ---------- Internal helpers ----------
function fitMapToWrapper() {
  if (!mapImage.complete || mapImage.naturalWidth === 0) return;
  wrapperWidth = mapWrapper.clientWidth;
  wrapperHeight = mapWrapper.clientHeight;
  const wW = wrapperWidth, wH = wrapperHeight;
  const natW = mapImage.naturalWidth, natH = mapImage.naturalHeight;
  if (wW === 0 || wH === 0) return;
  const coverZoom = Math.max(wW / natW, wH / natH);
  mapZoom = coverZoom;
  mapPanX = (wW - natW * coverZoom) / 2;
  mapPanY = (wH - natH * coverZoom) / 2;
  applyTransform();
  updateDynamicScale();
}

function handleWrapperResize() {
  if (!mapImage.complete || mapImage.naturalWidth === 0) return;
  const newWidth = mapWrapper.clientWidth;
  const newHeight = mapWrapper.clientHeight;
  if (newWidth === 0 || newHeight === 0) return;

  const oldWidth = wrapperWidth || newWidth;
  const oldHeight = wrapperHeight || newHeight;

  const oldCenterX = (oldWidth / 2 - mapPanX) / mapZoom;
  const oldCenterY = (oldHeight / 2 - mapPanY) / mapZoom;
  const minZoom = Math.max(newWidth / mapImage.naturalWidth, newHeight / mapImage.naturalHeight);

  mapZoom = Math.max(mapZoom, minZoom);
  mapPanX = newWidth / 2 - oldCenterX * mapZoom;
  mapPanY = newHeight / 2 - oldCenterY * mapZoom;

  wrapperWidth = newWidth;
  wrapperHeight = newHeight;

  clampPan();
  applyTransform();
  updateDynamicScale();
}

function applyTransform() {
  mapInner.style.transform = `translate(${mapPanX}px, ${mapPanY}px) scale(${mapZoom})`;
}

function clampPan() {
  const wW = mapWrapper.clientWidth, wH = mapWrapper.clientHeight;
  const scaledW = mapImage.naturalWidth * mapZoom, scaledH = mapImage.naturalHeight * mapZoom;
  if (scaledW <= wW) mapPanX = (wW - scaledW) / 2;
  else mapPanX = Math.min(0, Math.max(mapPanX, wW - scaledW));
  if (scaledH <= wH) mapPanY = (wH - scaledH) / 2;
  else mapPanY = Math.min(0, Math.max(mapPanY, wH - scaledH));
}

function updateDynamicScale() {
  if (!mapZoom || mapZoom <= 0) return;
  const invScale = 1 / mapZoom;
  const scaleStr = `translate(-50%, -50%) scale(${invScale})`;
  if (guessPin.style.display !== 'none') {
    guessPin.style.transform = scaleStr;
  }
  if (actualPin.style.display !== 'none') {
    actualPin.style.transform = scaleStr;
  }
  svgLine.style.strokeWidth = Math.max(1.5, BASE_LINE_STROKE * invScale);
}

function updateConnectionLine() {
  if (selectedRawX === null || selectedRawY === null || actualRawX === null || actualRawY === null) return;
  svgLine.setAttribute('x1', selectedRawX);
  svgLine.setAttribute('y1', selectedRawY);
  svgLine.setAttribute('x2', actualRawX);
  svgLine.setAttribute('y2', actualRawY);
  updateDynamicScale();
}

// ---------- Event Handlers ----------
function onWheel(e) {
  e.preventDefault();
  if (!mapImage.complete) return;
  const rect = mapWrapper.getBoundingClientRect();
  const cursorX = e.clientX - rect.left, cursorY = e.clientY - rect.top;
  const oldZoom = mapZoom;
  const factor = e.deltaY < 0 ? 1.10 : 1 / 1.10;
  let newZoom = oldZoom * factor;
  const minZoom = Math.max(mapWrapper.clientWidth / mapImage.naturalWidth, mapWrapper.clientHeight / mapImage.naturalHeight);
  newZoom = Math.min(2.8, Math.max(minZoom, newZoom));
  if (newZoom === oldZoom) return;
  mapZoom = newZoom;
  mapPanX = cursorX - ((cursorX - mapPanX) / oldZoom) * mapZoom;
  mapPanY = cursorY - ((cursorY - mapPanY) / oldZoom) * mapZoom;
  clampPan();
  mapInner.classList.add('zoom-transition');
  clearTimeout(zoomTransitionTimeout);
  zoomTransitionTimeout = setTimeout(() => {
    mapInner.classList.remove('zoom-transition');
  }, 150);
  applyTransform();
  updateDynamicScale();
}

let dragging = false, didDrag = false;
let dragStartX = 0, dragStartY = 0, dragPanX0 = 0, dragPanY0 = 0;
const DRAG_THRESHOLD = 4;

function onMouseDown(e) {
  if (e.button !== 0) return;
  dragging = true;
  didDrag = false;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  dragPanX0 = mapPanX;
  dragPanY0 = mapPanY;
  e.preventDefault();
}

function onMouseMove(e) {
  if (!dragging) return;
  const dx = e.clientX - dragStartX, dy = e.clientY - dragStartY;
  if (!didDrag && Math.abs(dx) <= DRAG_THRESHOLD && Math.abs(dy) <= DRAG_THRESHOLD) return;
  didDrag = true;
  mapPanX = dragPanX0 + dx;
  mapPanY = dragPanY0 + dy;
  clampPan();
  applyTransform();
  updateDynamicScale();
}

function onMouseUp(e) {
  if (!dragging || e.button !== 0) return;
  dragging = false;
  // If not dragged, treat as a click to place pin
  if (!didDrag && !isGuessed) {
    const rect = mapWrapper.getBoundingClientRect();
    const cursorX = e.clientX - rect.left, cursorY = e.clientY - rect.top;
    const rawX = Math.round((cursorX - mapPanX) / mapZoom);
    const rawY = Math.round((cursorY - mapPanY) / mapZoom);
    // Emit custom event for pin placement
    const event = new CustomEvent('pinPlaced', { detail: { rawX, rawY } });
    mapWrapper.dispatchEvent(event);
  }
}

function onResize() {
  if (mapImage.complete) fitMapToWrapper();
}