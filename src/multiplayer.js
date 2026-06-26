// src/multiplayer.js
import { db } from './firebase.js';

const PLAYER_NAME = 'Guest'; // could be set via a prompt later

// ----- Room operations -----
export function createRoom() {
  const roomId = generateRoomCode();
  const roomRef = db.ref(`rooms/${roomId}`);
  // Secret is generated server-side; we only create the room stub here.
  // The server will set the secret when the game starts.
  return roomRef.set({
    host: PLAYER_NAME,
    status: 'waiting',
    players: {
      [PLAYER_NAME]: { name: PLAYER_NAME, guess: null, points: 0 }
    }
  }).then(() => roomId);
}

export function joinRoom(roomId) {
  const roomRef = db.ref(`rooms/${roomId}`);
  return roomRef.once('value').then(snapshot => {
    const room = snapshot.val();
    if (!room) throw new Error('Room not found');
    if (room.status !== 'waiting') throw new Error('Game already started');
    if (Object.keys(room.players).length >= 4) throw new Error('Room full');
    // Add player
    return roomRef.child(`players/${PLAYER_NAME}`).set({
      name: PLAYER_NAME,
      guess: null,
      points: 0
    });
  });
}

export function listenToLobby(roomId, onUpdate) {
  const roomRef = db.ref(`rooms/${roomId}`);
  const callback = (snapshot) => {
    const data = snapshot.val();
    if (data && data.players) {
      onUpdate(data.players, data.host);
    } else {
      onUpdate(null, null);
    }
  };
  roomRef.on('value', callback);
  // Return a function to detach
  return () => roomRef.off('value', callback);
}

export function startGame(roomId) {
  // Notify server to start the game (will set secret and status)
  return fetch('/start-game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId })
  }).then(res => res.json());
}

export function submitGuessMultiplayer(roomId, guessX, guessZ) {
  return fetch('/submit-guess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId, playerName: PLAYER_NAME, guessX, guessZ })
  }).then(res => res.json());
}

// Helper: generate 6‑character room code
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}