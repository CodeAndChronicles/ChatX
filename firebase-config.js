import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyBP5RFGuNk1C76Zc4uKMqNlVbFhQlLMWIc",
    authDomain: "novachat-6bc71.firebaseapp.com",
    projectId: "novachat-6bc71",
    storageBucket: "novachat-6bc71.firebasestorage.app",
    messagingSenderId: "1054649466061",
    appId: "1:1054649466061:web:2a141b642b9af00b971437",
    measurementId: "G-FDH7W64K1C",
    databaseURL: "https://novachat-6bc71-default-rtdb.firebaseio.com" // 🔥 أضف دي
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app); // 🔥 أضف دي
