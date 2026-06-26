// src/menu.js
import { startGame } from './game.js';
import { createRoom, joinRoom, listenToLobby, startGame as startMultiplayerGame } from './multiplayer.js';
import { destroyPanoViewer } from './panorama.js';

// Helper: safe get element with warning
function safeGet(id) {
  const el = document.getElementById(id);
  if (!el) console.warn(`Element #${id} not found`);
  return el;
}

// DOM refs
const menuOverlay = safeGet('menu-overlay');
if (menuOverlay) menuOverlay.style.display = 'flex';
if (menuOverlay) {
  menuOverlay.style.backgroundColor = 'transparent';
}
const dimensionOptions = document.querySelectorAll('#dimension-options .menu-option');
const gamemodeOptions = document.querySelectorAll('#gamemode-options .menu-option');
const playBtn = safeGet('play-btn');
const menuFeedback = safeGet('menu-feedback');
const multiplayerSection = safeGet('multiplayer-section');
const roomCodeInput = safeGet('room-code-input');
const joinBtn = safeGet('join-room-btn');
const createBtn = safeGet('create-room-btn');
const roomFeedback = safeGet('room-feedback');
const roomCodeDisplay = safeGet('room-code-display');
const lobbyTbody = safeGet('lobby-tbody');
const startGameBtn = safeGet('start-game-btn');
const multiplayerBtn = safeGet('multiplayer-btn');

let selectedDimension = 'overworld';
let selectedGamemode = 'infinite';
let gameActive = false;

// Helper: toggle active class
function setActiveOption(buttons, value) {
  buttons.forEach(btn => {
    if (!btn.classList.contains('unavailable')) {
      btn.classList.toggle('active', btn.dataset.value === value);
    }
  });
}

// ----- Dimension options -----
dimensionOptions.forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.classList.contains('unavailable')) {
      if (menuFeedback) menuFeedback.textContent = 'This dimension is not available yet!';
      return;
    }
    selectedDimension = btn.dataset.value;
    setActiveOption(dimensionOptions, selectedDimension);
    if (menuFeedback) menuFeedback.textContent = '';
  });
});

// ----- Gamemode options -----
gamemodeOptions.forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.classList.contains('unavailable')) {
      if (menuFeedback) menuFeedback.textContent = 'This gamemode is not available yet!';
      return;
    }
    selectedGamemode = btn.dataset.value;
    setActiveOption(gamemodeOptions, selectedGamemode);
    if (menuFeedback) menuFeedback.textContent = '';
    if (multiplayerSection) {
      multiplayerSection.style.display = (selectedGamemode === 'multiplayer') ? 'block' : 'none';
    }
  });
});

// Multiplayer button toggle
if (multiplayerBtn) {
  multiplayerBtn.addEventListener('click', () => {
    selectedGamemode = 'multiplayer';
    setActiveOption(gamemodeOptions, 'multiplayer');
    if (multiplayerSection) multiplayerSection.style.display = 'block';
  });
}

// ----- Play / Resume button -----
if (playBtn) {
  playBtn.addEventListener('click', () => {
    // Resume mode: just hide the menu
    if (gameActive && playBtn.textContent === 'Resume') {
      if (menuOverlay) menuOverlay.style.display = 'none';
      return;
    }

    // Otherwise, start a new game
    if (selectedGamemode === 'multiplayer') {
      if (menuFeedback) menuFeedback.textContent = 'Please create or join a room first.';
      return;
    }

    // Clear any previous game viewer
    destroyPanoViewer();

    if (menuOverlay) menuOverlay.style.display = 'none';
    gameActive = true;
    playBtn.textContent = 'Play';
    startGame({
      dimension: selectedDimension,
      gamemode: selectedGamemode,
      roundCount: selectedGamemode === 'round' ? 5 : Infinity
    });
  });
}

// ============================================================
// ===== ESCAPE: Toggles menu WITHOUT destroying game viewer ===
// ============================================================
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!menuOverlay) return;
    const isMenuVisible = menuOverlay.style.display !== 'none';

    if (gameActive) {
      // Toggle pause/resume while game is running
      if (isMenuVisible) {
        menuOverlay.style.display = 'none';
        playBtn.textContent = 'Play';
      } else {
        menuOverlay.style.display = 'flex';
        playBtn.textContent = 'Resume';
      }
    } else {
      // No game active – just toggle the menu
      menuOverlay.style.display = isMenuVisible ? 'none' : 'flex';
    }
  }
});

// ----- Multiplayer UI (unchanged) -----
let currentRoomId = null;
let detachLobbyListener = null;

if (createBtn) {
  createBtn.addEventListener('click', () => {
    createRoom().then(roomId => {
      currentRoomId = roomId;
      if (roomCodeDisplay) roomCodeDisplay.textContent = `Room: ${roomId}`;
      if (roomFeedback) roomFeedback.textContent = 'Room created! Share the code.';
      if (roomCodeInput) roomCodeInput.value = roomId;
      attachLobbyListener(roomId);
    }).catch(err => {
      if (roomFeedback) roomFeedback.textContent = 'Error: ' + err.message;
    });
  });
}

if (joinBtn) {
  joinBtn.addEventListener('click', () => {
    const roomId = roomCodeInput ? roomCodeInput.value.trim().toUpperCase() : '';
    if (!roomId) {
      if (roomFeedback) roomFeedback.textContent = 'Please enter a room code.';
      return;
    }
    joinRoom(roomId).then(() => {
      currentRoomId = roomId;
      if (roomCodeDisplay) roomCodeDisplay.textContent = `Joined Room: ${roomId}`;
      if (roomFeedback) roomFeedback.textContent = 'Joined successfully!';
      attachLobbyListener(roomId);
    }).catch(err => {
      if (roomFeedback) roomFeedback.textContent = 'Error: ' + err.message;
    });
  });
}

function attachLobbyListener(roomId) {
  if (detachLobbyListener) detachLobbyListener();
  detachLobbyListener = listenToLobby(roomId, (players, host) => {
    if (!players) {
      if (lobbyTbody) lobbyTbody.innerHTML = '<tr><td colspan="2" style="text-align:center; color:#666;">No players yet</td></tr>';
      if (startGameBtn) startGameBtn.style.display = 'none';
      return;
    }
    let html = '';
    let count = 0;
    for (const [key, player] of Object.entries(players)) {
      count++;
      const status = player.guess ? '✅ Ready' : '⏳ Waiting';
      html += `<tr><td>${player.name}</td><td style="text-align:center;">${status}</td></tr>`;
    }
    if (lobbyTbody) lobbyTbody.innerHTML = html;
    if (startGameBtn) {
      if (host === 'Guest') {
        startGameBtn.style.display = 'block';
        startGameBtn.textContent = `🚀 Start Game (${count} players)`;
      } else {
        startGameBtn.style.display = 'none';
      }
    }
  });
}

if (startGameBtn) {
  startGameBtn.addEventListener('click', () => {
    if (!currentRoomId) return;
    startMultiplayerGame(currentRoomId).then(() => {
      if (roomFeedback) roomFeedback.textContent = 'Game started! Loading...';
      if (menuOverlay) menuOverlay.style.display = 'none';
      alert('Multiplayer game starting – feature not fully implemented yet.');
    }).catch(err => {
      if (roomFeedback) roomFeedback.textContent = 'Error starting game: ' + err.message;
    });
  });
}