// js/chat.js - الجزء المعدل
import firebaseService from './firebase.js';
import realTimeService from './realtime.js';
import utils from './utils.js';

class ChatManager {
    constructor() {
        this.currentChatId = null;
        this.currentChatUser = null;
        this.currentUserId = null;
        this.messages = [];
        this.cleanupFunctions = new Map();
        this.messageMenu = null;
        this.selectedMessageId = null;
        this.isInitialized = false;
    }
    
    // ===== INITIALIZATION =====
    
    async initialize(userId) {
        try {
            console.log('💬 Initializing ChatManager for user:', userId);
            this.currentUserId = userId;
            
            // Load initial chats
            await this.loadChats();
            
            // Setup real-time updates for chats
            this.setupChatsUpdates();
            
            // Setup event listeners
            this.setupEventListeners();
            
            this.isInitialized = true;
            console.log('✅ ChatManager initialized');
            
        } catch (error) {
            console.error('❌ ChatManager initialization error:', error);
            throw error;
        }
    }
    
    async loadChats() {
        try {
            console.log('📂 Loading chats...');
            const result = await firebaseService.getUserChats(this.currentUserId);
            
            if (result.success) {
                console.log(`✅ Loaded ${result.chats.length} chats`);
                this.renderChats(result.chats);
                return result.chats;
            } else {
                console.error('❌ Failed to load chats:', result.error);
                utils.createToast('فشل تحميل المحادثات', 'error');
                return [];
            }
        } catch (error) {
            console.error('❌ Load chats error:', error);
            utils.createToast('حدث خطأ في تحميل المحادثات', 'error');
            return [];
        }
    }
    
    setupChatsUpdates() {
        console.log('🔄 Setting up chats updates...');
        
        const cleanup = realTimeService.setupChatsListUpdates(this.currentUserId, {
            onChatsUpdate: (chats) => {
                console.log('📊 Chats updated:', chats.length);
                this.renderChats(chats);
            }
        });
        
        this.cleanupFunctions.set('chats', cleanup);
    }
    
    // ===== CHAT OPENING =====
    
    async openChat(chatId, otherUser) {
        try {
            console.log('💬 Opening chat:', chatId, 'with user:', otherUser.name);
            
            this.currentChatId = chatId;
            this.currentChatUser = otherUser;
            
            // Update UI
            this.showChatWindow();
            this.updateChatHeader(otherUser);
            
            // Load messages
            await this.loadMessages();
            
            // Mark messages as read
            await realTimeService.markAllMessagesAsRead(chatId, this.currentUserId);
            
            // Setup real-time updates for this chat
            this.setupChatUpdates();
            
            // Update active chat in sidebar
            this.updateActiveChatInSidebar();
            
            // Setup typing listener
            this.setupTypingListener();
            
            // Setup online status listener
            this.setupOnlineStatusListener();
            
            console.log('✅ Chat opened successfully');
            
        } catch (error) {
            console.error('❌ Open chat error:', error);
            utils.createToast('فشل فتح المحادثة', 'error');
        }
    }
    
    showChatWindow() {
        console.log('🪟 Showing chat window...');
        
        const emptyState = document.getElementById('emptyState');
        const chatWindow = document.getElementById('chatWindow');
        const pagesContainer = document.getElementById('pagesContainer');
        
        if (emptyState) {
            emptyState.classList.remove('active');
            console.log('📦 Empty state hidden');
        }
        
        if (chatWindow) {
            chatWindow.classList.add('active');
            console.log('💬 Chat window shown');
        }
        
        if (pagesContainer) {
            pagesContainer.classList.remove('active');
            console.log('📄 Pages container hidden');
        }
        
        // Update active nav item
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const chatsNavItem = document.querySelector('.nav-item[data-page="chats"]');
        if (chatsNavItem) {
            chatsNavItem.classList.add('active');
            console.log('📍 Chats nav item activated');
        }
    }
    
    // ... باقي الدوال مع إضافة console.log للتصحيح
    
    setupEventListeners() {
        console.log('🎧 Setting up chat event listeners...');
        
        // Send message button
        const sendBtn = document.getElementById('sendMessageBtn');
        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.sendMessage());
            console.log('✅ Send button listener added');
        }
        
        // Chat input
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            // Send on Enter (without Shift)
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
            
            // Typing indicator
            const typingHandler = utils.debounce(async () => {
                if (this.currentChatId && chatInput.value.trim()) {
                    await realTimeService.startTyping(this.currentUserId, this.currentChatId);
                }
            }, 500);
            
            chatInput.addEventListener('input', typingHandler);
            
            // Auto resize
            utils.autoResizeTextarea(chatInput);
            
            console.log('✅ Chat input listeners added');
        }
        
        // Chat back button
        const backBtn = document.getElementById('chatBackBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => this.closeChat());
            console.log('✅ Back button listener added');
        }
        
        // Chat action buttons
        this.setupChatActionButtons();
        
        console.log('🎧 Event listeners setup complete');
    }
    
    // ... باقي الدوال
    
    cleanup() {
        console.log('🧹 Cleaning up ChatManager...');
        this.closeChat();
        
        // Remove message menu
        if (this.messageMenu) {
            this.messageMenu.remove();
            this.messageMenu = null;
        }
        
        this.selectedMessageId = null;
        this.isInitialized = false;
        
        console.log('✅ ChatManager cleaned up');
    }
}

// Create global ChatManager instance
const chatManager = new ChatManager();

// Export for use in other modules
export default chatManager;
