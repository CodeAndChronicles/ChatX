// js/app.js
import firebaseService from './firebase.js';
import realTimeService from './realtime.js';
import chatManager from './chat.js';
import uiManager from './ui.js';
import utils from './utils.js';

class ChatXApp {
    constructor() {
        this.currentUser = null;
        this.initialized = false;
    }
    
    async initialize() {
        try {
            // Show loading screen
            this.showLoading('جاري تهيئة التطبيق...');
            
            // Setup auth listener
            this.setupAuthListener();
            
            // Setup global error handling
            this.setupErrorHandling();
            
            // Setup beforeunload handler
            this.setupBeforeUnload();
            
        } catch (error) {
            console.error('App initialization error:', error);
            utils.createToast('حدث خطأ في تهيئة التطبيق', 'error');
            
            // Hide loading screen after delay
            setTimeout(() => {
                this.hideLoading();
            }, 2000);
        }
    }
    
    setupAuthListener() {
        const unsubscribe = firebaseService.setupAuthListener(async (user) => {
            if (user) {
                // User is signed in
                await this.handleUserSignedIn(user);
            } else {
                // User is signed out
                this.handleUserSignedOut();
            }
        });
        
        // Store unsubscribe function
        this.authUnsubscribe = unsubscribe;
    }
    
    async handleUserSignedIn(user) {
        try {
            this.currentUser = user;
            
            // Get user data
            const userResult = await firebaseService.getUserDocument(user.uid);
            
            if (!userResult.success) {
                // Create user document if it doesn't exist
                await firebaseService.createUserDocument(user.uid, {
                    email: user.email,
                    name: user.displayName || 'مستخدم جديد'
                });
            }
            
            // Update user data in service
            const updatedUserResult = await firebaseService.getUserDocument(user.uid);
            if (updatedUserResult.success) {
                firebaseService.setCurrentUserData(updatedUserResult.data);
            }
            
            // Initialize managers
            await this.initializeManagers(user.uid);
            
            // Hide loading screen
            this.hideLoading();
            
            // Show welcome message
            setTimeout(() => {
                const userName = firebaseService.getCurrentUserData()?.name;
                if (userName) {
                    utils.createToast(`مرحباً ${userName}! 👋`, 'success');
                }
            }, 500);
            
        } catch (error) {
            console.error('Handle user signed in error:', error);
            utils.createToast('حدث خطأ في تحميل بيانات المستخدم', 'error');
            
            // Hide loading screen
            this.hideLoading();
        }
    }
    
    async initializeManagers(userId) {
        if (this.initialized) return;
        
        try {
            // Initialize chat manager
            await chatManager.initialize(userId);
            
            // Initialize UI manager
            await uiManager.initialize(userId);
            
            // Setup real-time service
            realTimeService.setupUserStatusUpdates(userId, 'auto');
            
            this.initialized = true;
            
        } catch (error) {
            console.error('Initialize managers error:', error);
            throw error;
        }
    }
    
    handleUserSignedOut() {
        // Cleanup managers
        this.cleanupManagers();
        
        // Redirect to auth page
        window.location.href = 'auth.html';
    }
    
    cleanupManagers() {
        // Cleanup chat manager
        chatManager.cleanup();
        
        // Cleanup UI manager
        uiManager.cleanup();
        
        // Cleanup real-time service
        realTimeService.cleanup();
        
        this.initialized = false;
        this.currentUser = null;
    }
    
    setupErrorHandling() {
        // Global error handler
        window.addEventListener('error', (event) => {
            console.error('Global error:', event.error);
            utils.createToast('حدث خطأ غير متوقع', 'error');
        });
        
        // Unhandled promise rejection
        window.addEventListener('unhandledrejection', (event) => {
            console.error('Unhandled promise rejection:', event.reason);
            utils.createToast('حدث خطأ في العملية', 'error');
        });
    }
    
    setupBeforeUnload() {
        window.addEventListener('beforeunload', async () => {
            if (this.currentUser) {
                // Update user status to offline
                await firebaseService.updateUserStatus(this.currentUser.uid, false);
                
                // Stop typing if active
                if (realTimeService.getIsTyping() && chatManager.currentChatId) {
                    await realTimeService.stopTyping(this.currentUser.uid, chatManager.currentChatId);
                }
                
                // Cleanup listeners
                firebaseService.cleanupListeners();
            }
        });
    }
    
    showLoading(message) {
        const loadingScreen = document.getElementById('loadingScreen');
        const loadingMessage = document.getElementById('loadingMessage');
        
        if (loadingScreen) {
            loadingScreen.classList.remove('hidden');
        }
        
        if (loadingMessage) {
            loadingMessage.textContent = message;
        }
    }
    
    hideLoading() {
        const loadingScreen = document.getElementById('loadingScreen');
        const appContainer = document.getElementById('appContainer');
        
        if (loadingScreen) {
            loadingScreen.classList.add('hidden');
        }
        
        if (appContainer) {
            appContainer.classList.remove('hidden');
        }
    }
    
    // ===== PUBLIC METHODS =====
    
    getCurrentUser() {
        return this.currentUser;
    }
    
    getCurrentUserId() {
        return this.currentUser?.uid;
    }
    
    isInitialized() {
        return this.initialized;
    }
    
    // ===== APP LIFECYCLE =====
    
    async restart() {
        // Cleanup everything
        this.cleanupManagers();
        
        if (this.authUnsubscribe) {
            this.authUnsubscribe();
        }
        
        // Clear app data
        utils.clearAppData();
        
        // Reinitialize
        await this.initialize();
    }
    
    async shutdown() {
        // Cleanup everything
        this.cleanupManagers();
        
        if (this.authUnsubscribe) {
            this.authUnsubscribe();
        }
        
        // Sign out
        await firebaseService.signOut();
        
        // Clear app data
        utils.clearAppData();
    }
}

// Create global app instance
const app = new ChatXApp();

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    app.initialize();
});

// Export for debugging and testing
export default app;
