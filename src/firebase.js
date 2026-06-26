// src/firebase.js
const firebaseConfig = {
  apiKey: "AIzaSyCtxVEHee-DMS722zKFDvqpgziKWdZk9hc",
  authDomain: "ctecguessr.firebaseapp.com",
  databaseURL: "https://ctecguessr-default-rtdb.firebaseio.com",
  projectId: "ctecguessr",
  storageBucket: "ctecguessr.firebasestorage.app",
  messagingSenderId: "972065425081",
  appId: "1:972065425081:web:2a5b0c67cf4b8c26587d68"
};

firebase.initializeApp(firebaseConfig);
export const db = firebase.database();