// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCReHz05nrLsGmV0ChgVRc58AYWX0Z9REI",
  authDomain: "chatxappv2.firebaseapp.com",
  projectId: "chatxappv2",
  storageBucket: "chatxappv2.firebasestorage.app",
  messagingSenderId: "340731115488",
  appId: "1:340731115488:web:3e25aff8aae95262d45d85",
  measurementId: "G-HLLW71MYYJ"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);