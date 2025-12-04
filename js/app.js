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
        this.authUnsubscribe = null;
    }
    
    async initialize() {
        try {
            console.log('🚀 Starting ChatX App...');
            
            // Show loading screen
            this.showLoading('جاري تهيئة التطبيق...');
            
            // Setup auth listener
            this.setupAuthListener();
            
            // Setup global error handling
            this.setupErrorHandling();
            
            // Setup beforeunload handler
            this.setupBeforeUnload();
            
            // Setup click handlers
            this.setupClickHandlers();
            
        } catch (error) {
            console.error('❌ App initialization error:', error);
            utils.createToast('حدث خطأ في تهيئة التطبيق', 'error');
            
            // Hide loading screen after delay
            setTimeout(() => {
                this.hideLoading();
            }, 2000);
        }
    }
    
    setupAuthListener() {
        this.authUnsubscribe = firebaseService.setupAuthListener(async (user) => {
            console.log('👤 Auth state changed:', user ? 'Logged in' : 'Logged out');
            
            if (user) {
                // User is signed in
                await this.handleUserSignedIn(user);
            } else {
                // User is signed out
                this.handleUserSignedOut();
            }
        });
    }
    
    async handleUserSignedIn(user) {
        try {
            console.log('👤 User signed in:', user.email);
            this.currentUser = user;
            
            // Get user data
            const userResult = await firebaseService.getUserDocument(user.uid);
            
            if (!userResult.success) {
                console.log('📝 Creating new user document...');
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
            console.error('❌ Handle user signed in error:', error);
            utils.createToast('حدث خطأ في تحميل بيانات المستخدم', 'error');
            
            // Hide loading screen
            this.hideLoading();
        }
    }
    
    async initializeManagers(userId) {
        if (this.initialized) return;
        
        try {
            console.log('🔄 Initializing managers...');
            
            // Initialize chat manager
            await chatManager.initialize(userId);
            
            // Initialize UI manager
            await uiManager.initialize(userId);
            
            // Setup real-time service
            realTimeService.setupUserStatusUpdates(userId, 'auto');
            
            this.initialized = true;
            console.log('✅ App initialized successfully');
            
        } catch (error) {
            console.error('❌ Initialize managers error:', error);
            throw error;
        }
    }
    
    handleUserSignedOut() {
        console.log('👤 User signed out');
        
        // Cleanup managers
        this.cleanupManagers();
        
        // Redirect to auth page
        window.location.href = 'auth.html';
    }
    
    cleanupManagers() {
        console.log('🧹 Cleaning up managers...');
        
        // Cleanup chat manager
        if (chatManager.cleanup) {
            chatManager.cleanup();
        }
        
        // Cleanup UI manager
        if (uiManager.cleanup) {
            uiManager.cleanup();
        }
        
        // Cleanup real-time service
        if (realTimeService.cleanup) {
            realTimeService.cleanup();
        }
        
        this.initialized = false;
        this.currentUser = null;
    }
    
    setupErrorHandling() {
        // Global error handler
        window.addEventListener('error', (event) => {
            console.error('❌ Global error:', event.error);
            utils.createToast('حدث خطأ غير متوقع', 'error');
        });
        
        // Unhandled promise rejection
        window.addEventListener('unhandledrejection', (event) => {
            console.error('❌ Unhandled promise rejection:', event.reason);
            utils.createToast('حدث خطأ في العملية', 'error');
        });
    }
    
    setupBeforeUnload() {
        window.addEventListener('beforeunload', async () => {
            console.log('🚪 Closing app...');
            if (this.currentUser) {
                try {
                    // Update user status to offline
                    await firebaseService.updateUserStatus(this.currentUser.uid, false);
                    
                    // Stop typing if active
                    if (realTimeService.getIsTyping && realTimeService.getIsTyping() && chatManager.currentChatId) {
                        await realTimeService.stopTyping(this.currentUser.uid, chatManager.currentChatId);
                    }
                    
                    // Cleanup listeners
                    if (firebaseService.cleanupListeners) {
                        firebaseService.cleanupListeners();
                    }
                } catch (error) {
                    console.error('❌ Beforeunload cleanup error:', error);
                }
            }
        });
    }
    
    setupClickHandlers() {
        // Theme toggle
        document.getElementById('themeBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = document.getElementById('themeDropdown');
            if (dropdown) {
                dropdown.classList.toggle('show');
            }
        });
        
        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#themeBtn') && !e.target.closest('#themeDropdown')) {
                document.getElementById('themeDropdown')?.classList.remove('show');
            }
            
            if (!e.target.closest('#chatMenuBtn') && !e.target.closest('#chatDropdown')) {
                document.getElementById('chatDropdown')?.classList.remove('show');
            }
        });
        
        // Theme options
        document.querySelectorAll('.theme-option').forEach(option => {
            option.addEventListener('click', () => {
                const theme = option.dataset.theme;
                this.setTheme(theme);
                document.getElementById('themeDropdown')?.classList.remove('show');
            });
        });
        
        // Color options
        document.querySelectorAll('.color-option').forEach(option => {
            option.addEventListener('click', () => {
                const color = option.dataset.color;
                this.setColorTheme(color);
                document.getElementById('themeDropdown')?.classList.remove('show');
            });
        });
    }
    
    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        utils.setTheme(theme);
        
        // Update active theme option
        document.querySelectorAll('.theme-option').forEach(option => {
            option.classList.remove('active');
            if (option.dataset.theme === theme) {
                option.classList.add('active');
            }
        });
        
        utils.createToast(`تم التغيير إلى الثيم ${theme === 'dark' ? 'الداكن' : 'الفاتح'}`, 'success');
    }
    
    setColorTheme(color) {
        document.documentElement.setAttribute('data-color-theme', color);
        utils.setColorTheme(color);
        
        // Update active color option
        document.querySelectorAll('.color-option').forEach(option => {
            option.classList.remove('active');
            if (option.dataset.color === color) {
                option.classList.add('active');
            }
        });
        
        utils.createToast('تم تغيير اللون الرئيسي', 'success');
    }
    
    showLoading(message) {
        const loadingScreen = document.getElementById('loadingScreen');
        const loadingMessage = document.getElementById('loadingMessage');
        const appContainer = document.getElementById('appContainer');
        
        if (loadingScreen) {
            loadingScreen.classList.remove('hidden');
        }
        
        if (appContainer) {
            appContainer.classList.add('hidden');
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
}

// Create global app instance
const app = new ChatXApp();

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM loaded, initializing app...');
    app.initialize();
});

// Export for debugging and testing
export default app;
