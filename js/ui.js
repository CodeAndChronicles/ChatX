// js/ui.js
import firebaseService from './firebase.js';
import realTimeService from './realtime.js';
import chatManager from './chat.js';
import utils from './utils.js';

class UIManager {
    constructor() {
        this.currentPage = 'chats';
        this.modals = new Map();
        this.dropdowns = new Map();
        this.loadingOverlays = new Map();
    }
    
    // ===== INITIALIZATION =====
    
    async initialize(userId) {
        this.currentUserId = userId;
        
        // Initialize UI components
        await this.initializeTheme();
        this.initializeNavigation();
        this.initializeModals();
        this.initializeDropdowns();
        this.initializeSettings();
        this.initializeSearch();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Load initial data
        await this.loadInitialData();
    }
    
    async initializeTheme() {
        // Get theme from user settings or localStorage
        const userData = firebaseService.getCurrentUserData();
        const theme = userData?.theme || utils.getTheme();
        const colorTheme = userData?.colorTheme || utils.getColorTheme();
        
        // Apply theme
        this.applyTheme(theme, colorTheme);
        
        // Update theme selector
        this.updateThemeSelector(theme, colorTheme);
    }
    
    applyTheme(theme, colorTheme) {
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.setAttribute('data-color-theme', colorTheme);
        
        // Save to localStorage
        utils.setTheme(theme);
        utils.setColorTheme(colorTheme);
    }
    
    updateThemeSelector(theme, colorTheme) {
        // Update theme options
        document.querySelectorAll('.theme-option').forEach(option => {
            option.classList.remove('active');
            if (option.dataset.theme === theme) {
                option.classList.add('active');
            }
        });
        
        // Update color options
        document.querySelectorAll('.color-option').forEach(option => {
            option.classList.remove('active');
            if (option.dataset.color === colorTheme) {
                option.classList.add('active');
            }
        });
    }
    
    initializeNavigation() {
        // Set active page
        this.setActivePage('chats');
        
        // Setup nav items
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.dataset.page;
                this.setActivePage(page);
            });
        });
    }
    
    setActivePage(page) {
        this.currentPage = page;
        
        // Update nav items
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.page === page) {
                item.classList.add('active');
            }
        });
        
        // Show/hide pages
        const pages = ['chats', 'requests', 'friends', 'settings'];
        pages.forEach(p => {
            const pageElement = document.getElementById(`${p}Page`);
            const isActive = p === page;
            
            if (pageElement) {
                pageElement.classList.toggle('active', isActive);
                pageElement.classList.toggle('hidden', !isActive);
            }
        });
        
        // Show/hide main content
        const emptyState = document.getElementById('emptyState');
        const chatWindow = document.getElementById('chatWindow');
        const pagesContainer = document.getElementById('pagesContainer');
        
        if (page === 'chats' && !chatManager.currentChatId) {
            if (emptyState) emptyState.classList.add('active');
            if (pagesContainer) pagesContainer.classList.remove('active');
        } else if (page === 'chats' && chatManager.currentChatId) {
            if (emptyState) emptyState.classList.remove('active');
            if (pagesContainer) pagesContainer.classList.remove('active');
        } else {
            if (emptyState) emptyState.classList.remove('active');
            if (pagesContainer) pagesContainer.classList.add('active');
        }
        
        // Load page data
        this.loadPageData(page);
    }
    
    async loadPageData(page) {
        switch (page) {
            case 'requests':
                await this.loadRequests();
                break;
            case 'friends':
                await this.loadFriends();
                break;
            case 'settings':
                this.loadSettings();
                break;
        }
    }
    
    initializeModals() {
        // Store modal references
        const modalIds = [
            'newChatModal', 'userProfileModal', 'deleteMessageModal',
            'changePasswordModal', 'deleteAccountModal'
        ];
        
        modalIds.forEach(id => {
            const modal = document.getElementById(id);
            if (modal) {
                this.modals.set(id, modal);
            }
        });
        
        // Setup modal close handlers
        this.modals.forEach((modal, id) => {
            const closeBtn = modal.querySelector('.btn-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.closeModal(id));
            }
            
            // Close on background click
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal(id);
                }
            });
        });
    }
    
    initializeDropdowns() {
        // Theme dropdown
        const themeBtn = document.getElementById('themeBtn');
        const themeDropdown = document.getElementById('themeDropdown');
        
        if (themeBtn && themeDropdown) {
            this.dropdowns.set('theme', { btn: themeBtn, dropdown: themeDropdown });
            
            themeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleDropdown('theme');
            });
        }
        
        // Chat dropdown
        const chatMenuBtn = document.getElementById('chatMenuBtn');
        const chatDropdown = document.getElementById('chatDropdown');
        
        if (chatMenuBtn && chatDropdown) {
            this.dropdowns.set('chat', { btn: chatMenuBtn, dropdown: chatDropdown });
            
            chatMenuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleDropdown('chat');
            });
        }
        
        // Close dropdowns when clicking outside
        document.addEventListener('click', () => {
            this.closeAllDropdowns();
        });
    }
    
    toggleDropdown(name) {
        const dropdown = this.dropdowns.get(name);
        if (!dropdown) return;
        
        // Close all other dropdowns
        this.closeAllDropdownsExcept(name);
        
        // Toggle current dropdown
        dropdown.dropdown.classList.toggle('show');
    }
    
    closeAllDropdowns() {
        this.dropdowns.forEach(dropdown => {
            dropdown.dropdown.classList.remove('show');
        });
    }
    
    closeAllDropdownsExcept(name) {
        this.dropdowns.forEach((dropdown, dropdownName) => {
            if (dropdownName !== name) {
                dropdown.dropdown.classList.remove('show');
            }
        });
    }
    
    initializeSettings() {
        // Load user settings
        this.loadUserSettings();
        
        // Setup settings event listeners
        this.setupSettingsListeners();
    }
    
    loadUserSettings() {
        const userData = firebaseService.getCurrentUserData();
        if (!userData) return;
        
        // Update settings form
        const settingsName = document.getElementById('settingsName');
        const settingsBio = document.getElementById('settingsBio');
        const showOnlineStatus = document.getElementById('showOnlineStatus');
        const showLastSeen = document.getElementById('showLastSeen');
        const readReceipts = document.getElementById('readReceipts');
        
        if (settingsName) settingsName.value = userData.name || '';
        if (settingsBio) settingsBio.value = userData.bio || '';
        if (showOnlineStatus) showOnlineStatus.checked = userData.showOnlineStatus !== false;
        if (showLastSeen) showLastSeen.checked = userData.showLastSeen !== false;
        if (readReceipts) readReceipts.checked = userData.readReceipts !== false;
        
        // Update online status mode
        const onlineStatusMode = userData.onlineStatusMode || 'auto';
        document.querySelector(`input[name="onlineStatus"][value="${onlineStatusMode}"]`).checked = true;
        
        // Update avatar color
        document.querySelectorAll('.color-picker-small .color-option').forEach(option => {
            option.classList.remove('active');
            if (option.dataset.color === userData.avatarColor) {
                option.classList.add('active');
            }
        });
    }
    
    setupSettingsListeners() {
        // Save profile
        const saveProfileBtn = document.getElementById('saveProfileBtn');
        if (saveProfileBtn) {
            saveProfileBtn.addEventListener('click', () => this.saveProfile());
        }
        
        // Change password
        const changePasswordBtn = document.getElementById('changePasswordBtn');
        if (changePasswordBtn) {
            changePasswordBtn.addEventListener('click', () => this.showChangePasswordModal());
        }
        
        // Delete account
        const deleteAccountBtn = document.getElementById('deleteAccountBtn');
        if (deleteAccountBtn) {
            deleteAccountBtn.addEventListener('click', () => this.showDeleteAccountModal());
        }
        
        // Settings toggles
        const toggleIds = ['showOnlineStatus', 'showLastSeen', 'readReceipts'];
        toggleIds.forEach(id => {
            const toggle = document.getElementById(id);
            if (toggle) {
                toggle.addEventListener('change', () => this.saveSetting(id, toggle.checked));
            }
        });
        
        // Online status mode
        document.querySelectorAll('input[name="onlineStatus"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.saveSetting('onlineStatusMode', e.target.value);
            });
        });
        
        // Avatar color picker
        const colorPicker = document.querySelector('.color-picker-small');
        if (colorPicker) {
            colorPicker.addEventListener('click', (e) => {
                if (e.target.classList.contains('color-option')) {
                    const color = e.target.dataset.color;
                    this.saveSetting('avatarColor', color);
                    
                    // Update active color
                    colorPicker.querySelectorAll('.color-option').forEach(option => {
                        option.classList.remove('active');
                    });
                    e.target.classList.add('active');
                }
            });
        }
    }
    
    initializeSearch() {
        // User search for new chat
        const userSearchInput = document.getElementById('userSearchInput');
        if (userSearchInput) {
            userSearchInput.addEventListener('input', utils.debounce(async (e) => {
                await this.searchUsers(e.target.value);
            }, 300));
        }
    }
    
    // ===== REQUESTS PAGE =====
    
    async loadRequests() {
        try {
            // Load incoming requests
            await this.loadIncomingRequests();
            
            // Load outgoing requests
            await this.loadOutgoingRequests();
            
            // Setup real-time updates
            this.setupRequestsUpdates();
            
        } catch (error) {
            console.error('Load requests error:', error);
            utils.createToast('فشل تحميل طلبات المحادثة', 'error');
        }
    }
    
    async loadIncomingRequests() {
        const container = document.getElementById('incomingRequests');
        if (!container) return;
        
        // Show loading
        container.innerHTML = `
            <div class="loading-container">
                <div class="loading-spinner-small"></div>
                <p class="loading-text">جاري تحميل الطلبات الواردة...</p>
            </div>
        `;
        
        const result = await firebaseService.getUserChatRequests(this.currentUserId, 'incoming');
        
        if (result.success) {
            this.renderIncomingRequests(result.requests, container);
        } else {
            container.innerHTML = `
                <div class="empty-state-compact">
                    <iconify-icon icon="mdi:account-clock" class="empty-icon"></iconify-icon>
                    <h3>لا توجد طلبات واردة</h3>
                    <p>لم يصلك أي طلبات محادثة بعد</p>
                </div>
            `;
        }
    }
    
    async loadOutgoingRequests() {
        const container = document.getElementById('outgoingRequests');
        if (!container) return;
        
        // Show loading
        container.innerHTML = `
            <div class="loading-container">
                <div class="loading-spinner-small"></div>
                <p class="loading-text">جاري تحميل الطلبات الصادرة...</p>
            </div>
        `;
        
        const result = await firebaseService.getUserChatRequests(this.currentUserId, 'outgoing');
        
        if (result.success) {
            this.renderOutgoingRequests(result.requests, container);
        } else {
            container.innerHTML = `
                <div class="empty-state-compact">
                    <iconify-icon icon="mdi:send-clock" class="empty-icon"></iconify-icon>
                    <h3>لا توجد طلبات صادرة</h3>
                    <p>لم ترسل أي طلبات محادثة بعد</p>
                </div>
            `;
        }
    }
    
    renderIncomingRequests(requests, container) {
        if (requests.length === 0) {
            container.innerHTML = `
                <div class="empty-state-compact">
                    <iconify-icon icon="mdi:account-clock" class="empty-icon"></iconify-icon>
                    <h3>لا توجد طلبات واردة</h3>
                    <p>لم يصلك أي طلبات محادثة بعد</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = '';
        
        requests.forEach(request => {
            const requestElement = this.createIncomingRequestElement(request);
            container.appendChild(requestElement);
        });
    }
    
    renderOutgoingRequests(requests, container) {
        if (requests.length === 0) {
            container.innerHTML = `
                <div class="empty-state-compact">
                    <iconify-icon icon="mdi:send-clock" class="empty-icon"></iconify-icon>
                    <h3>لا توجد طلبات صادرة</h3>
                    <p>لم ترسل أي طلبات محادثة بعد</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = '';
        
        requests.forEach(request => {
            const requestElement = this.createOutgoingRequestElement(request);
            container.appendChild(requestElement);
        });
    }
    
    createIncomingRequestElement(request) {
        const element = document.createElement('div');
        element.className = 'request-item';
        element.dataset.requestId = request.id;
        
        const time = request.createdAt ? utils.formatTime(request.createdAt) : '';
        
        element.innerHTML = `
            <div class="request-avatar">
                ${this.createAvatarElement(request.user)}
            </div>
            <div class="request-info">
                <h4 class="request-name">${request.user.name}</h4>
                <p class="request-username">@${request.user.username}</p>
                ${request.message ? `<p class="request-message">${request.message}</p>` : ''}
                <p class="request-time">${time}</p>
            </div>
            <div class="request-actions">
                <button class="btn-primary accept-btn" data-action="accept">
                    <iconify-icon icon="mdi:check"></iconify-icon>
                    قبول
                </button>
                <button class="btn-secondary reject-btn" data-action="reject">
                    <iconify-icon icon="mdi:close"></iconify-icon>
                    رفض
                </button>
                <button class="btn-danger block-btn" data-action="block">
                    <iconify-icon icon="mdi:block-helper"></iconify-icon>
                    حظر
                </button>
            </div>
        `;
        
        // Add event listeners
        element.querySelector('.accept-btn').addEventListener('click', () => {
            this.respondToRequest(request.id, 'accepted');
        });
        
        element.querySelector('.reject-btn').addEventListener('click', () => {
            this.respondToRequest(request.id, 'rejected');
        });
        
        element.querySelector('.block-btn').addEventListener('click', () => {
            this.blockFromRequest(request.id);
        });
        
        return element;
    }
    
    createOutgoingRequestElement(request) {
        const element = document.createElement('div');
        element.className = 'request-item';
        element.dataset.requestId = request.id;
        
        const time = request.createdAt ? utils.formatTime(request.createdAt) : '';
        const statusText = this.getRequestStatusText(request.status);
        const statusClass = this.getRequestStatusClass(request.status);
        
        element.innerHTML = `
            <div class="request-avatar">
                ${this.createAvatarElement(request.user)}
            </div>
            <div class="request-info">
                <h4 class="request-name">${request.user.name}</h4>
                <p class="request-username">@${request.user.username}</p>
                ${request.message ? `<p class="request-message">${request.message}</p>` : ''}
                <p class="request-time">${time}</p>
                <span class="request-status ${statusClass}">${statusText}</span>
            </div>
            <div class="request-actions">
                ${request.status === 'pending' ? `
                    <button class="btn-secondary cancel-btn" data-action="cancel">
                        <iconify-icon icon="mdi:close"></iconify-icon>
                        إلغاء
                    </button>
                ` : ''}
            </div>
        `;
        
        // Add event listener for cancel button
        if (request.status === 'pending') {
            element.querySelector('.cancel-btn').addEventListener('click', () => {
                this.cancelRequest(request.id);
            });
        }
        
        return element;
    }
    
    getRequestStatusText(status) {
        switch (status) {
            case 'pending': return 'قيد الانتظار';
            case 'accepted': return 'مقبول';
            case 'rejected': return 'مرفوض';
            case 'blocked': return 'محظور';
            default: return 'غير معروف';
        }
    }
    
    getRequestStatusClass(status) {
        switch (status) {
            case 'accepted': return 'status-accepted';
            case 'rejected': return 'status-rejected';
            case 'blocked': return 'status-blocked';
            default: return 'status-pending';
        }
    }
    
    async respondToRequest(requestId, response) {
        try {
            const result = await realTimeService.respondToChatRequestRealTime(
                requestId,
                response,
                this.currentUserId
            );
            
            if (result.success) {
                // Remove request from UI
                const requestElement = document.querySelector(`[data-request-id="${requestId}"]`);
                if (requestElement) {
                    requestElement.remove();
                }
                
                // Update badge
                this.updateRequestsBadge();
            }
        } catch (error) {
            console.error('Respond to request error:', error);
            utils.createToast('فشل الرد على طلب المحادثة', 'error');
        }
    }
    
    async blockFromRequest(requestId) {
        try {
            const result = await realTimeService.blockUserRealTime(requestId, this.currentUserId);
            
            if (result.success) {
                // Remove request from UI
                const requestElement = document.querySelector(`[data-request-id="${requestId}"]`);
                if (requestElement) {
                    requestElement.remove();
                }
                
                // Update badge
                this.updateRequestsBadge();
            }
        } catch (error) {
            console.error('Block from request error:', error);
            utils.createToast('فشل حظر المستخدم', 'error');
        }
    }
    
    async cancelRequest(requestId) {
        // Implementation for canceling outgoing request
        console.log('Cancel request:', requestId);
    }
    
    setupRequestsUpdates() {
        // Setup real-time updates for incoming requests
        realTimeService.setupRequestsUpdates(this.currentUserId, 'incoming', (requests) => {
            const container = document.getElementById('incomingRequests');
            if (container) {
                this.renderIncomingRequests(requests, container);
            }
            
            // Update badge
            this.updateRequestsBadge(requests.length);
        });
        
        // Setup real-time updates for outgoing requests
        realTimeService.setupRequestsUpdates(this.currentUserId, 'outgoing', (requests) => {
            const container = document.getElementById('outgoingRequests');
            if (container) {
                this.renderOutgoingRequests(requests, container);
            }
        });
    }
    
    updateRequestsBadge(count) {
        const badge = document.getElementById('requestsBadge');
        if (!badge) return;
        
        if (count === undefined) {
            // Get count from DOM
            const incomingRequests = document.querySelectorAll('#incomingRequests .request-item');
            count = incomingRequests.length;
        }
        
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
    
    // ===== FRIENDS PAGE =====
    
    async loadFriends() {
        // Implementation for loading friends
        console.log('Load friends');
    }
    
    // ===== SEARCH =====
    
    async searchUsers(query) {
        const searchResults = document.getElementById('searchResults');
        if (!searchResults) return;
        
        if (!query.trim()) {
            searchResults.innerHTML = `
                <div class="no-results">
                    <iconify-icon icon="mdi:account-search" style="font-size: 48px; opacity: 0.3;"></iconify-icon>
                    <p>اكتب للبحث عن مستخدمين</p>
                </div>
            `;
            return;
        }
        
        // Show loading
        searchResults.innerHTML = `
            <div class="loading-container">
                <div class="loading-spinner-small"></div>
                <p class="loading-text">جاري البحث...</p>
            </div>
        `;
        
        const result = await realTimeService.searchUsersRealTime(query, this.currentUserId);
        
        if (result.success) {
            this.renderSearchResults(result.users, searchResults);
        } else {
            searchResults.innerHTML = `
                <div class="no-results">
                    <iconify-icon icon="mdi:account-search" style="font-size: 48px; opacity: 0.3;"></iconify-icon>
                    <p>لم يتم العثور على مستخدمين</p>
                </div>
            `;
        }
    }
    
    renderSearchResults(users, container) {
        if (users.length === 0) {
            container.innerHTML = `
                <div class="no-results">
                    <iconify-icon icon="mdi:account-search" style="font-size: 48px; opacity: 0.3;"></iconify-icon>
                    <p>لم يتم العثور على مستخدمين</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = '';
        
        users.forEach(user => {
            const resultElement = this.createSearchResultElement(user);
            container.appendChild(resultElement);
        });
    }
    
    createSearchResultElement(user) {
        const element = document.createElement('div');
        element.className = 'search-result-item';
        element.dataset.userId = user.uid;
        
        element.innerHTML = `
            <div class="search-result-avatar" style="background: ${user.avatarColor || utils.getUserColor(user.uid)}">
                ${utils.getInitials(user.name)}
            </div>
            <div class="search-result-info">
                <div class="search-result-name">${user.name}</div>
                <div class="search-result-username">@${user.username}</div>
                <div class="search-result-status">${this.getUserStatusText(user)}</div>
            </div>
            <button class="btn-primary send-request-btn">
                <iconify-icon icon="mdi:send"></iconify-icon>
                إرسال طلب
            </button>
        `;
        
        // Add event listener
        element.querySelector('.send-request-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.sendChatRequest(user.uid);
        });
        
        // Add click to view profile
        element.addEventListener('click', () => {
            this.showUserProfile(user);
        });
        
        return element;
    }
    
    getUserStatusText(user) {
        const showOnlineStatus = firebaseService.getCurrentUserData()?.showOnlineStatus ?? true;
        
        if (showOnlineStatus && user.isOnline) {
            return 'متصل الآن';
        } else {
            return `آخر ظهور ${utils.formatLastSeen(user.lastSeen, false)}`;
        }
    }
    
    async sendChatRequest(userId) {
        try {
            const result = await realTimeService.sendChatRequestRealTime(
                this.currentUserId,
                userId
            );
            
            if (result.success) {
                utils.createToast('تم إرسال طلب المحادثة', 'success');
                this.closeModal('newChatModal');
            } else {
                utils.createToast(result.error || 'فشل إرسال طلب المحادثة', 'error');
            }
        } catch (error) {
            console.error('Send chat request error:', error);
            utils.createToast('حدث خطأ في إرسال طلب المحادثة', 'error');
        }
    }
    
    // ===== USER PROFILE =====
    
    showUserProfile(user) {
        const modal = this.modals.get('userProfileModal');
        if (!modal) return;
        
        const profileView = document.getElementById('profileView');
        if (!profileView) return;
        
        // Create profile content
        profileView.innerHTML = this.createProfileContent(user);
        
        // Show modal
        this.showModal('userProfileModal');
    }
    
    createProfileContent(user) {
        const userData = firebaseService.getCurrentUserData();
        const isBlocked = userData?.blockedUsers?.includes(user.uid) || false;
        
        return `
            <div class="profile-card">
                <div class="profile-header" style="background: ${utils.generateGradient(user.avatarColor || '#8B5CF6')}">
                    <div class="profile-avatar-large" style="background: ${user.avatarColor || utils.getUserColor(user.uid)}">
                        ${utils.getInitials(user.name)}
                        <div class="status-indicator ${user.isOnline ? 'online' : 'offline'}"></div>
                    </div>
                </div>
                <div class="profile-body">
                    <h2 class="profile-name">${user.name}</h2>
                    <p class="profile-username">@${user.username}</p>
                    ${user.bio ? `<p class="profile-bio">${user.bio}</p>` : ''}
                    <div class="profile-stats">
                        <div class="stat-item">
                            <span class="stat-value">${user.status || '📍 مشغول الآن'}</span>
                            <span class="stat-label">الحالة</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-value">${utils.formatLastSeen(user.lastSeen, false)}</span>
                            <span class="stat-label">آخر ظهور</span>
                        </div>
                    </div>
                    <div class="profile-actions">
                        ${isBlocked ? `
                            <button class="btn-secondary" id="unblockUserBtn">
                                <iconify-icon icon="mdi:block-helper"></iconify-icon>
                                إلغاء الحظر
                            </button>
                        ` : `
                            <button class="btn-primary" id="sendMessageBtn">
                                <iconify-icon icon="mdi:message"></iconify-icon>
                                إرسال رسالة
                            </button>
                            <button class="btn-danger" id="blockUserBtn">
                                <iconify-icon icon="mdi:block-helper"></iconify-icon>
                                حظر
                            </button>
                        `}
                    </div>
                </div>
            </div>
        `;
    }
    
    // ===== SETTINGS =====
    
    async saveProfile() {
        const nameInput = document.getElementById('settingsName');
        const bioInput = document.getElementById('settingsBio');
        
        if (!nameInput || !bioInput) return;
        
        const name = nameInput.value.trim();
        const bio = bioInput.value.trim();
        
        if (!name) {
            utils.createToast('الاسم مطلوب', 'error');
            return;
        }
        
        try {
            const updates = {
                name,
                bio
            };
            
            const result = await firebaseService.updateUserDocument(this.currentUserId, updates);
            
            if (result.success) {
                utils.createToast('تم حفظ التغييرات', 'success');
                
                // Update current user data
                const userData = firebaseService.getCurrentUserData();
                firebaseService.setCurrentUserData({ ...userData, ...updates });
                
                // Update UI
                this.updateUserInfo();
            } else {
                utils.createToast('فشل حفظ التغييرات', 'error');
            }
        } catch (error) {
            console.error('Save profile error:', error);
            utils.createToast('حدث خطأ في حفظ التغييرات', 'error');
        }
    }
    
    async saveSetting(key, value) {
        try {
            const updates = { [key]: value };
            
            const result = await firebaseService.updateUserDocument(this.currentUserId, updates);
            
            if (result.success) {
                // Update current user data
                const userData = firebaseService.getCurrentUserData();
                firebaseService.setCurrentUserData({ ...userData, ...updates });
                
                // Apply theme changes immediately
                if (key === 'theme' || key === 'colorTheme') {
                    const theme = key === 'theme' ? value : (userData.theme || 'dark');
                    const colorTheme = key === 'colorTheme' ? value : (userData.colorTheme || 'purple');
                    this.applyTheme(theme, colorTheme);
                }
                
                // Apply online status mode
                if (key === 'onlineStatusMode') {
                    realTimeService.setupUserStatusUpdates(this.currentUserId, value);
                }
                
                utils.createToast('تم حفظ الإعداد', 'success');
            }
        } catch (error) {
            console.error('Save setting error:', error);
            utils.createToast('فشل حفظ الإعداد', 'error');
        }
    }
    
    updateUserInfo() {
        const userData = firebaseService.getCurrentUserData();
        if (!userData) return;
        
        // Update sidebar
        const userName = document.getElementById('userName');
        const userAvatar = document.getElementById('userAvatar');
        const userStatusText = document.getElementById('userStatusText');
        
        if (userName) userName.textContent = userData.name;
        if (userAvatar) {
            userAvatar.textContent = utils.getInitials(userData.name);
            userAvatar.style.background = userData.avatarColor || utils.getUserColor(userData.uid);
        }
        if (userStatusText) {
            userStatusText.textContent = userData.status || '📍 مشغول الآن';
        }
    }
    
    // ===== MODALS =====
    
    showModal(modalId) {
        const modal = this.modals.get(modalId);
        if (modal) {
            modal.classList.add('active');
            utils.lockBodyScroll();
        }
    }
    
    closeModal(modalId) {
        const modal = this.modals.get(modalId);
        if (modal) {
            modal.classList.remove('active');
            utils.unlockBodyScroll();
            
            // Clear form if exists
            const form = modal.querySelector('form');
            if (form) {
                form.reset();
            }
        }
    }
    
    showChangePasswordModal() {
        this.showModal('changePasswordModal');
        
        // Setup form submission
        const confirmBtn = document.getElementById('confirmPasswordChange');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => this.changePassword(), { once: true });
        }
    }
    
    async changePassword() {
        const currentPassword = document.getElementById('currentPassword');
        const newPassword = document.getElementById('newPassword');
        const confirmPassword = document.getElementById('confirmPassword');
        
        if (!currentPassword || !newPassword || !confirmPassword) return;
        
        const current = currentPassword.value.trim();
        const newPass = newPassword.value.trim();
        const confirm = confirmPassword.value.trim();
        
        // Validation
        if (!current || !newPass || !confirm) {
            utils.createToast('يرجى ملء جميع الحقول', 'error');
            return;
        }
        
        if (newPass.length < 6) {
            utils.createToast('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'error');
            return;
        }
        
        if (newPass !== confirm) {
            utils.createToast('كلمات المرور غير متطابقة', 'error');
            return;
        }
        
        try {
            const result = await firebaseService.updateUserPassword(current, newPass);
            
            if (result.success) {
                utils.createToast('تم تغيير كلمة المرور بنجاح', 'success');
                this.closeModal('changePasswordModal');
                
                // Clear form
                currentPassword.value = '';
                newPassword.value = '';
                confirmPassword.value = '';
            } else {
                utils.createToast(result.error || 'فشل تغيير كلمة المرور', 'error');
            }
        } catch (error) {
            console.error('Change password error:', error);
            utils.createToast('حدث خطأ في تغيير كلمة المرور', 'error');
        }
    }
    
    showDeleteAccountModal() {
        this.showModal('deleteAccountModal');
        
        // Setup form submission
        const confirmBtn = document.getElementById('confirmDeleteAccount');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => this.deleteAccount(), { once: true });
        }
    }
    
    async deleteAccount() {
        const passwordInput = document.getElementById('deleteAccountPassword');
        if (!passwordInput) return;
        
        const password = passwordInput.value.trim();
        
        if (!password) {
            utils.createToast('يرجى إدخال كلمة المرور', 'error');
            return;
        }
        
        if (!confirm('هل أنت متأكد من حذف الحساب؟ هذا الإجراء لا يمكن التراجع عنه.')) {
            return;
        }
        
        try {
            const result = await firebaseService.deleteUserAccount(password);
            
            if (result.success) {
                utils.createToast('تم حذف الحساب بنجاح', 'success');
                
                // Redirect to auth page
                setTimeout(() => {
                    window.location.href = 'auth.html';
                }, 1500);
            } else {
                utils.createToast(result.error || 'فشل حذف الحساب', 'error');
            }
        } catch (error) {
            console.error('Delete account error:', error);
            utils.createToast('حدث خطأ في حذف الحساب', 'error');
        }
    }
    
    // ===== LOADING =====
    
    showLoading(container, message = 'جاري التحميل...') {
        const overlay = utils.createLoadingOverlay(container, message);
        this.loadingOverlays.set(container, overlay);
        return overlay;
    }
    
    hideLoading(container) {
        const overlay = this.loadingOverlays.get(container);
        if (overlay) {
            overlay.hide();
            this.loadingOverlays.delete(container);
        }
    }
    
    // ===== EVENT LISTENERS =====
    
    setupEventListeners() {
        // New chat button
        const newChatBtn = document.getElementById('newChatBtn');
        if (newChatBtn) {
            newChatBtn.addEventListener('click', () => this.showModal('newChatModal'));
        }
        
        // Start chat button
        const startChatBtn = document.getElementById('startChatBtn');
        if (startChatBtn) {
            startChatBtn.addEventListener('click', () => this.showModal('newChatModal'));
        }
        
        // Logout button
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                if (confirm('هل تريد تسجيل الخروج؟')) {
                    await firebaseService.signOut();
                    window.location.href = 'auth.html';
                }
            });
        }
        
        // Theme options
        document.querySelectorAll('.theme-option').forEach(option => {
            option.addEventListener('click', () => {
                const theme = option.dataset.theme;
                this.saveSetting('theme', theme);
            });
        });
        
        // Color options
        document.querySelectorAll('.color-option').forEach(option => {
            option.addEventListener('click', () => {
                const color = option.dataset.color;
                this.saveSetting('colorTheme', color);
            });
        });
        
        // Request tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                this.switchRequestTab(tab);
            });
        });
        
        // Window resize
        window.addEventListener('resize', utils.debounce(() => {
            this.handleResize();
        }, 250));
        
        // Online/offline detection
        window.addEventListener('online', () => {
            utils.createToast('تم استعادة الاتصال بالإنترنت', 'success');
        });
        
        window.addEventListener('offline', () => {
            utils.createToast('فقدان الاتصال بالإنترنت', 'warning');
        });
    }
    
    switchRequestTab(tab) {
        // Update active tab
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.tab === tab) {
                btn.classList.add('active');
            }
        });
        
        // Show/hide tabs
        document.querySelectorAll('.requests-tab').forEach(tabElement => {
            tabElement.classList.remove('active');
            if (tabElement.id === `${tab}Requests`) {
                tabElement.classList.add('active');
            }
        });
    }
    
    handleResize() {
        // Handle responsive adjustments
        const width = window.innerWidth;
        
        if (width < 768) {
            // Mobile adjustments
            this.handleMobileLayout();
        } else {
            // Desktop adjustments
            this.handleDesktopLayout();
        }
    }
    
    handleMobileLayout() {
        // Mobile-specific adjustments
        console.log('Mobile layout');
    }
    
    handleDesktopLayout() {
        // Desktop-specific adjustments
        console.log('Desktop layout');
    }
    
    // ===== INITIAL DATA LOADING =====
    
    async loadInitialData() {
        // Update user info
        this.updateUserInfo();
        
        // Update requests badge
        this.updateRequestsBadge();
        
        // Setup user status updates
        const userData = firebaseService.getCurrentUserData();
        const onlineStatusMode = userData?.onlineStatusMode || 'auto';
        realTimeService.setupUserStatusUpdates(this.currentUserId, onlineStatusMode);
    }
    
    // ===== UTILITY METHODS =====
    
    createAvatarElement(user) {
        return `
            <div class="avatar" style="background: ${user.avatarColor || utils.getUserColor(user.uid)}">
                ${utils.getInitials(user.name)}
            </div>
        `;
    }
    
    // ===== CLEANUP =====
    
    cleanup() {
        // Cleanup all resources
        this.closeAllDropdowns();
        
        this.modals.forEach(modal => {
            modal.classList.remove('active');
        });
        
        this.loadingOverlays.forEach(overlay => {
            overlay.hide();
        });
        this.loadingOverlays.clear();
        
        utils.unlockBodyScroll();
    }
}

// js/ui.js - إضافات جديدة
async function saveSetting(key, value) {
    try {
        const updates = { [key]: value };
        
        // Update in Firebase
        const result = await firebaseService.updateUserDocument(this.currentUserId, updates);
        
        if (result.success) {
            // Update local user data
            const userData = firebaseService.getCurrentUserData();
            firebaseService.setCurrentUserData({ ...userData, ...updates });
            
            // Apply theme changes immediately
            if (key === 'theme') {
                document.documentElement.setAttribute('data-theme', value);
                utils.setTheme(value);
            }
            
            if (key === 'colorTheme') {
                document.documentElement.setAttribute('data-color-theme', value);
                utils.setColorTheme(value);
            }
            
            // Apply online status mode
            if (key === 'onlineStatusMode') {
                realTimeService.setupUserStatusUpdates(this.currentUserId, value);
            }
            
            utils.createToast('تم حفظ الإعداد', 'success');
            return true;
        } else {
            utils.createToast('فشل حفظ الإعداد', 'error');
            return false;
        }
    } catch (error) {
        console.error('❌ Save setting error:', error);
        utils.createToast('حدث خطأ في حفظ الإعداد', 'error');
        return false;
    }
}

// تحديث saveProfile ليكون أكثر فاعلية
async function saveProfile() {
    const nameInput = document.getElementById('settingsName');
    const bioInput = document.getElementById('settingsBio');
    
    if (!nameInput || !bioInput) return;
    
    const name = nameInput.value.trim();
    const bio = bioInput.value.trim();
    
    if (!name) {
        utils.createToast('الاسم مطلوب', 'error');
        return;
    }
    
    // Show loading
    const saveBtn = document.getElementById('saveProfileBtn');
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = '<iconify-icon icon="mdi:loading"></iconify-icon> جاري الحفظ...';
    saveBtn.disabled = true;
    
    try {
        const updates = {
            name,
            bio
        };
        
        const result = await firebaseService.updateUserDocument(this.currentUserId, updates);
        
        if (result.success) {
            utils.createToast('تم حفظ التغييرات', 'success');
            
            // Update current user data
            const userData = firebaseService.getCurrentUserData();
            firebaseService.setCurrentUserData({ ...userData, ...updates });
            
            // Update UI
            this.updateUserInfo();
            
            // Close modal if open
            this.closeModal('userProfileModal');
            
        } else {
            utils.createToast('فشل حفظ التغييرات', 'error');
        }
    } catch (error) {
        console.error('❌ Save profile error:', error);
        utils.createToast('حدث خطأ في حفظ التغييرات', 'error');
    } finally {
        // Restore button
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;
    }
}

// Create global UIManager instance
const uiManager = new UIManager();

// Export for use in other modules
export default uiManager;
