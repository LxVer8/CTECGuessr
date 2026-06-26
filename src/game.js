// src/game.js
import { createCubeMapViewer, destroyPanoViewer } from './panorama.js';
import { LOCATIONS } from './locations.js';
import { ORIGIN_X, ORIGIN_Y, SCORE_SIGMA, MAX_SCORE } from './config.js';
import * as map from './map.js';

// DOM refs
const feedbackEl = document.getElementById('feedback');
const actionBtn = document.getElementById('action-btn');
const scoreValSpan = document.getElementById('score-val');
const roundValSpan = document.getElementById('round-val');
const endScreen = document.getElementById('end-screen');
const finalScoreSpan = document.getElementById('final-score');
const endTableBody = document.getElementById('end-table-body');
const playAgainBtn = document.getElementById('play-again-btn');

// Game state
const state = {
  settings: { dimension: 'overworld', gamemode: 'infinite', roundCount: Infinity },
  playlist: [],
  currentRound: 0,
  totalScore: 0,
  history: [],
  currentLocation: null,
  isGuessed: false,
};

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function startGame(settings) {
  state.settings = { ...state.settings, ...settings };
  state.totalScore = 0;
  state.currentRound = 0;
  state.history = [];
  state.isGuessed = false;
  scoreValSpan.textContent = '0';
  roundValSpan.textContent = '0';
  endScreen.style.display = 'none';
  actionBtn.disabled = true;
  actionBtn.textContent = 'Guess';
  feedbackEl.textContent = '';

  const locationsWithRaw = LOCATIONS.map(loc => ({
    image: loc.image,
    x: loc.x,
    y: loc.z,
    rawX: ORIGIN_X + loc.x,
    rawY: ORIGIN_Y + loc.z
  }));
  let shuffled = shuffle([...locationsWithRaw]);
  if (state.settings.roundCount !== Infinity) {
    shuffled = shuffled.slice(0, state.settings.roundCount);
  }
  state.playlist = shuffled;

  map.resetPins();
  map.fitMap();

  // Start first round
  startRound();
}

function startRound() {
  // If we've reached the end of the playlist, show end screen
  if (state.currentRound >= state.playlist.length) {
    showEndScreen();
    return;
  }

  state.isGuessed = false;
  const loc = state.playlist[state.currentRound];
  state.currentLocation = loc;

  // Try to load the panorama; if it fails, skip this location
  createCubeMapViewer(loc.image)
    .then(() => {
      // Success: set up the round
      map.resetPins();
      roundValSpan.textContent = state.currentRound + 1;
      feedbackEl.textContent = 'Click the map to place your guess';
      actionBtn.textContent = 'Guess';
      actionBtn.disabled = true;
      const wrapper = document.getElementById('map-wrapper');
      wrapper.addEventListener('pinPlaced', onPinPlaced, { once: true });
    })
    .catch((err) => {
      // Panorama failed to load – skip this location
      console.warn(`Skipping location "${loc.image}" (missing panorama):`, err.message);
      state.currentRound++;
      // Recursively try the next location
      startRound();
    });
}

function onPinPlaced(e) {
  const { rawX, rawY } = e.detail;
  map.placeGuessPin(rawX, rawY);
  const coords = map.getGuessCoords();
  feedbackEl.textContent = `Pin placed at X: ${coords.x}, Z: ${coords.z}`;
  actionBtn.disabled = false;
}

export function submitGuess() {
  if (state.isGuessed) {
    state.currentRound++;
    startRound();
    return;
  }

  const coords = map.getGuessCoords();
  if (!coords) {
    feedbackEl.textContent = 'Click on the map first.';
    return;
  }

  state.isGuessed = true;
  actionBtn.disabled = true;

  const loc = state.currentLocation;
  map.placeActualPin(loc.rawX, loc.rawY);
  map.setGuessed(true);

  const dx = coords.x - loc.x;
  const dy = coords.z - loc.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  let points = Math.round(MAX_SCORE * Math.exp(-(distance ** 2) / (2 * SCORE_SIGMA ** 2)));
  points = Math.max(0, points);
  state.totalScore += points;
  scoreValSpan.textContent = state.totalScore;

  state.history.push({
    location: { x: loc.x, y: loc.y },
    guessX: coords.x,
    guessZ: coords.z,
    distance,
    points
  });

  feedbackEl.textContent = `${Math.round(distance)} blocks away. +${points} points`;
  actionBtn.textContent = 'Next Round';
  actionBtn.disabled = false;
}

function showEndScreen() {
  let html = '';
  state.history.forEach((entry, index) => {
    html += `<tr>
      <td>${index + 1}</td>
      <td>(${entry.location.x}, ${entry.location.y})</td>
      <td>(${entry.guessX}, ${entry.guessZ})</td>
      <td>${Math.round(entry.distance)}</td>
      <td>${entry.points}</td>
    </tr>`;
  });
  endTableBody.innerHTML = html;
  finalScoreSpan.textContent = state.totalScore;
  endScreen.style.display = 'flex';
  actionBtn.textContent = 'New Game';
  actionBtn.disabled = false;
  window.dispatchEvent(new CustomEvent('game-ended'));
}

// Event binding
actionBtn.addEventListener('click', () => {
  if (endScreen.style.display === 'flex') {
    endScreen.style.display = 'none';
    startGame(state.settings);
  } else {
    submitGuess();
  }
});

playAgainBtn.addEventListener('click', () => {
  endScreen.style.display = 'none';
  startGame(state.settings);
});

document.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Space') {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();
    if (!actionBtn.disabled) actionBtn.click();
  }
});

map.initMap();