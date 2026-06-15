import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyAnLTYi24LQlXVehkbrUESbWrf0auGpz_I",
    authDomain: "nova-chat-24378.firebaseapp.com",
    projectId: "nova-chat-24378",
    storageBucket: "nova-chat-24378.firebasestorage.app",
    messagingSenderId: "197888189650",
    appId: "1:197888189650:web:e3a4590c9d0236e49e390b",
    databaseURL: "https://nova-chat-24378-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
