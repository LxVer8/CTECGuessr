// server/server.js
require('dotenv').config();
const express = require('express');
const admin = require('firebase-admin');

// Load service account from environment variable (JSON string)
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});
const db = admin.database();

const app = express();
app.use(express.json());

// Helper: generate room code
function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// Helper: distance (Euclidean, but in blocks; you can replace with Haversine if needed)
function calcDistance(x1, z1, x2, z2) {
  return Math.sqrt((x1 - x2) ** 2 + (z1 - z2) ** 2);
}

// ---------- Endpoints ----------
app.post('/create-room', (req, res) => {
  const { hostName } = req.body;
  const roomId = generateCode();
  // Generate secret location (in overworld coordinates)
  const secret = {
    x: Math.floor((Math.random() - 0.5) * 10000),
    z: Math.floor((Math.random() - 0.5) * 10000)
  };
  const roomRef = db.ref(`rooms/${roomId}`);
  roomRef.set({
    host: hostName,
    status: 'waiting',
    secret,
    players: {
      [hostName]: { name: hostName, guess: null, points: 0 }
    }
  }).then(() => {
    res.json({ roomId });
  }).catch(err => {
    res.status(500).json({ error: err.message });
  });
});

app.post('/join-room', (req, res) => {
  const { roomId, playerName } = req.body;
  const roomRef = db.ref(`rooms/${roomId}`);
  roomRef.once('value', snapshot => {
    const room = snapshot.val();
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.status !== 'waiting') return res.status(400).json({ error: 'Game already started' });
    if (Object.keys(room.players).length >= 4) return res.status(400).json({ error: 'Room full' });
    const updates = {};
    updates[`players/${playerName}`] = { name: playerName, guess: null, points: 0 };
    roomRef.update(updates).then(() => {
      res.json({ success: true });
    }).catch(err => res.status(500).json({ error: err.message }));
  });
});

app.post('/start-game', (req, res) => {
  const { roomId } = req.body;
  db.ref(`rooms/${roomId}/status`).set('playing').then(() => {
    res.json({ success: true });
  }).catch(err => res.status(500).json({ error: err.message }));
});

app.post('/submit-guess', (req, res) => {
  const { roomId, playerName, guessX, guessZ } = req.body;
  const roomRef = db.ref(`rooms/${roomId}`);
  roomRef.once('value', snapshot => {
    const room = snapshot.val();
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.status !== 'playing') return res.status(400).json({ error: 'Game not active' });
    const secret = room.secret;
    if (!secret) return res.status(400).json({ error: 'No secret set' });

    const distance = calcDistance(secret.x, secret.z, guessX, guessZ);
    // Score: max 5000, drops exponentially with sigma=200
    const sigma = 200;
    const maxScore = 5000;
    let points = Math.round(maxScore * Math.exp(-(distance ** 2) / (2 * sigma ** 2)));
    points = Math.max(0, points);

    const playerPath = `players/${playerName}`;
    roomRef.child(playerPath).update({
      guess: { x: guessX, z: guessZ },
      distance,
      points
    }).then(() => {
      res.json({ distance, points });
    }).catch(err => res.status(500).json({ error: err.message }));
  });
});

// Optional: get room data (for debugging)
app.get('/room/:roomId', (req, res) => {
  const { roomId } = req.params;
  db.ref(`rooms/${roomId}`).once('value', snap => {
    res.json(snap.val() || {});
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});