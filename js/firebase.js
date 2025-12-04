// js/firebase.js - الجزء المعدل
import { app } from '../firebase-config.js';
import { 
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    updateProfile,
    updatePassword,
    deleteUser,
    reauthenticateWithCredential,
    EmailAuthProvider,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
    getFirestore,
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    addDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    onSnapshot,
    serverTimestamp,
    writeBatch,
    limit,
    increment,
    arrayUnion,
    arrayRemove
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import utils from './utils.js';

// ===== FIREBASE INITIALIZATION =====
const auth = getAuth(app);
const db = getFirestore(app);

class FirebaseService {
    constructor() {
        this.unsubscribers = new Map();
        this.currentUser = null;
        this.currentUserData = null;
        this.isInitialized = false;
    }

    // ===== AUTHENTICATION =====
    
    async signUp(email, password, name) {
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            
            // Update profile with name
            await updateProfile(user, {
                displayName: name
            });
            
            // Create user document
            await this.createUserDocument(user.uid, {
                email,
                name,
                createdAt: serverTimestamp()
            });
            
            return { success: true, user };
        } catch (error) {
            console.error('❌ Sign up error:', error);
            return { success: false, error: this.handleAuthError(error) };
        }
    }
    
    async signIn(email, password) {
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            return { success: true, user: userCredential.user };
        } catch (error) {
            console.error('❌ Sign in error:', error);
            return { success: false, error: this.handleAuthError(error) };
        }
    }
    
    async signOut() {
        try {
            console.log('🚪 Signing out...');
            
            // Update user status to offline
            if (this.currentUser) {
                await this.updateUserStatus(this.currentUser.uid, false);
            }
            
            await signOut(auth);
            this.cleanupListeners();
            
            return { success: true };
        } catch (error) {
            console.error('❌ Sign out error:', error);
            return { success: false, error: error.message };
        }
    }
    
    // ... باقي الدوال كما هي مع إضافة console.log للتصحيح
    
    setupAuthListener(callback) {
        return onAuthStateChanged(auth, async (user) => {
            console.log('👤 Auth state changed in FirebaseService:', user ? 'User found' : 'No user');
            
            if (user) {
                this.currentUser = user;
                this.isInitialized = true;
                
                // Get user document
                const userDoc = await this.getUserDocument(user.uid);
                if (userDoc.success) {
                    this.currentUserData = userDoc.data;
                    console.log('📄 User data loaded:', userDoc.data.name);
                } else {
                    console.log('⚠️ User document not found, creating...');
                    await this.createUserDocument(user.uid, {
                        email: user.email,
                        name: user.displayName || 'مستخدم جديد'
                    });
                    
                    // Retry getting user document
                    const newUserDoc = await this.getUserDocument(user.uid);
                    if (newUserDoc.success) {
                        this.currentUserData = newUserDoc.data;
                    }
                }
                
                // Update online status
                await this.updateUserStatus(user.uid, true);
            } else {
                this.currentUser = null;
                this.currentUserData = null;
                this.isInitialized = false;
                console.log('👤 User logged out');
            }
            
            if (callback) callback(user);
        });
    }
    
    // ... باقي الدوال
    
    getCurrentUser() {
        return this.currentUser;
    }
    
    getCurrentUserData() {
        return this.currentUserData;
    }
    
    setCurrentUserData(userData) {
        this.currentUserData = userData;
    }
    
    isInitialized() {
        return this.isInitialized;
    }
}

// Create global Firebase service instance
const firebaseService = new FirebaseService();

// Export for use in other modules
export default firebaseService;
