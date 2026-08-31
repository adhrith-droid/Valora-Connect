/**
 * VALORA — Global Header & Navigation System
 * Responsive Desktop & Mobile Auth Header, Profile Dropdowns, Modals & Drawer
 */

document.addEventListener('DOMContentLoaded', () => {
    initValoraHeader();
    syncActiveNavigation();
    initAuthState();
});

let currentUserData = null;

function normalizeCurrentPath() {
    let path = window.location.pathname.toLowerCase();
    if (path.endsWith('.html')) {
        path = path.replace('.html', '');
    }
    if (path === '' || path === '/index') {
        path = '/';
    }
    return path;
}

function syncActiveNavigation() {
    const currentPath = normalizeCurrentPath();

    // Sync desktop navigation items
    document.querySelectorAll('.vl-nav-links .vl-nav-item').forEach(item => {
        const href = item.getAttribute('href');
        if (!href) return;
        const normalizedHref = href.toLowerCase().replace('.html', '');
        
        if (currentPath === '/' && (normalizedHref === '/' || normalizedHref === '/index')) {
            item.classList.add('active');
        } else if (currentPath !== '/' && normalizedHref === currentPath) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // Sync mobile navigation links
    document.querySelectorAll('#vl-mobile-drawer .vl-mobile-nav-link').forEach(link => {
        const href = link.getAttribute('href');
        if (!href || href === '#') return;
        const normalizedHref = href.toLowerCase().replace('.html', '');

        if (currentPath === '/' && (normalizedHref === '/' || normalizedHref === '/index')) {
            link.classList.add('active');
        } else if (currentPath !== '/' && normalizedHref === currentPath) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

function initValoraHeader() {
    const mobileToggle = document.getElementById('vl-mobile-toggle');
    const mobileDrawer = document.getElementById('vl-mobile-drawer');

    // Ensure backdrop element exists
    let backdrop = document.getElementById('vl-drawer-backdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'vl-drawer-backdrop';
        backdrop.className = 'vl-drawer-backdrop';
        document.body.appendChild(backdrop);
    }

    if (backdrop) {
        backdrop.addEventListener('click', () => {
            closeMobileDrawer();
        });
    }

    if (mobileToggle && mobileDrawer) {
        mobileToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMobileDrawer();
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (mobileDrawer.classList.contains('open') && 
                !mobileDrawer.contains(e.target) && 
                !mobileToggle.contains(e.target) &&
                !e.target.closest('#vl-mobile-avatar-btn')) {
                closeMobileDrawer();
            }
        });

        // Close drawer when a navigation link is clicked
        mobileDrawer.querySelectorAll('.vl-mobile-nav-link').forEach(link => {
            link.addEventListener('click', () => {
                closeMobileDrawer();
            });
        });

        // Close button inside drawer
        const closeBtn = document.getElementById('vl-drawer-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                closeMobileDrawer();
            });
        }
    }

    // Global escape key listener to close active overlays
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeMobileDrawer();
            closeDesktopDropdown();
            closeAllModals();
        }
    });

    // Handle placeholder links gracefully with non-destructive toast feedback
    document.querySelectorAll('.vl-nav-placeholder').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const featureName = link.getAttribute('data-feature') || 'This section';
            showPlaceholderToast(`${featureName} will be available in the upcoming release.`);
        });
    });
}

function toggleMobileDrawer() {
    const mobileToggle = document.getElementById('vl-mobile-toggle');
    const mobileDrawer = document.getElementById('vl-mobile-drawer');
    const backdrop = document.getElementById('vl-drawer-backdrop');
    if (!mobileDrawer) return;

    const isOpen = mobileDrawer.classList.toggle('open');
    if (backdrop) {
        backdrop.classList.toggle('open', isOpen);
    }

    if (mobileToggle) {
        mobileToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }
}

function closeMobileDrawer() {
    const mobileToggle = document.getElementById('vl-mobile-toggle');
    const mobileDrawer = document.getElementById('vl-mobile-drawer');
    const backdrop = document.getElementById('vl-drawer-backdrop');
    if (mobileDrawer && mobileDrawer.classList.contains('open')) {
        mobileDrawer.classList.remove('open');
    }
    if (backdrop && backdrop.classList.contains('open')) {
        backdrop.classList.remove('open');
    }
    if (mobileToggle) {
        mobileToggle.setAttribute('aria-expanded', 'false');
    }
}

function closeDesktopDropdown() {
    const dropdown = document.getElementById('vl-profile-dropdown');
    const chipBtn = document.getElementById('vl-profile-chip-btn');
    if (dropdown && dropdown.classList.contains('open')) {
        dropdown.classList.remove('open');
        if (chipBtn) chipBtn.setAttribute('aria-expanded', 'false');
    }
}

function initAuthState() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('login_success') === '1') {
        showPlaceholderToast('Signed in successfully with Google. Welcome to VALORA!');
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (urlParams.get('logged_out') === '1') {
        showPlaceholderToast('You have been signed out.');
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Default hero & connect buttons
    const connectButtons = document.querySelectorAll('.vl-drawer-connect-btn, .btn-enter, #hero-enter-btn');
    connectButtons.forEach(btn => {
        btn.setAttribute('href', '/login');
    });

    fetch('/api/auth/user', {
        headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
        }
    })
    .then(res => res.json())
    .then(data => {
        const headerRight = document.querySelector('.vl-header-right');
        const mobileDrawer = document.getElementById('vl-mobile-drawer');

        if (data.authenticated && data.user) {
            currentUserData = data.user;
            const userName = data.user.name || 'Valora User';
            const userEmail = data.user.email || '';
            const userAvatar = data.user.avatar_url || '';
            const firstName = userName.split(' ')[0];
            const initial = firstName.charAt(0).toUpperCase();

            // HERO CTA is the primary chat entry point
            const heroButtons = document.querySelectorAll('.btn-enter, #hero-enter-btn');
            heroButtons.forEach(btn => {
                btn.setAttribute('href', '/chat');
            });

            // ----------------------------------------------------
            // Redesign Authenticated Header Right
            // ----------------------------------------------------
            if (headerRight) {
                // Remove legacy CTA and standalone buttons
                const legacyCta = headerRight.querySelector('.vl-header-cta');
                if (legacyCta) legacyCta.remove();
                const legacyLogin = headerRight.querySelector('.vl-header-login-btn');
                if (legacyLogin) legacyLogin.remove();
                const legacyUserPill = document.getElementById('vl-header-user-profile');
                if (legacyUserPill) legacyUserPill.remove();

                const mobileToggle = headerRight.querySelector('.vl-mobile-toggle');

                // 1. Mobile Circular Avatar Button (Mobile Only)
                let mobileAvatarBtn = document.getElementById('vl-mobile-avatar-btn');
                if (!mobileAvatarBtn) {
                    mobileAvatarBtn = document.createElement('button');
                    mobileAvatarBtn.type = 'button';
                    mobileAvatarBtn.id = 'vl-mobile-avatar-btn';
                    mobileAvatarBtn.className = 'vl-mobile-avatar-btn';
                    mobileAvatarBtn.setAttribute('aria-label', 'Open User Menu');
                    
                    if (userAvatar) {
                        mobileAvatarBtn.innerHTML = `<img src="${userAvatar}" alt="${userName}" referrerpolicy="no-referrer">`;
                    } else {
                        mobileAvatarBtn.innerHTML = `<div class="vl-mobile-avatar-fallback">${initial}</div>`;
                    }

                    mobileAvatarBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        toggleMobileDrawer();
                    });

                    if (mobileToggle) {
                        headerRight.insertBefore(mobileAvatarBtn, mobileToggle);
                    } else {
                        headerRight.appendChild(mobileAvatarBtn);
                    }
                }

                // 2. Desktop Profile Menu & Dropdown (Desktop Only)
                let desktopMenu = document.getElementById('vl-profile-menu-container');
                if (!desktopMenu) {
                    desktopMenu = document.createElement('div');
                    desktopMenu.id = 'vl-profile-menu-container';
                    desktopMenu.className = 'vl-profile-menu-container';
                    desktopMenu.innerHTML = `
                        <button type="button" id="vl-profile-chip-btn" class="vl-profile-chip" aria-haspopup="true" aria-expanded="false">
                            <div class="vl-profile-avatar-wrap">
                                ${userAvatar ? `<img src="${userAvatar}" alt="${userName}" referrerpolicy="no-referrer">` : `<span>${initial}</span>`}
                            </div>
                            <span class="vl-profile-name">${firstName}</span>
                            <svg class="vl-profile-chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="6 9 12 15 18 9"/>
                            </svg>
                        </button>
                        <div id="vl-profile-dropdown" class="vl-profile-dropdown" role="menu">
                            <div class="vl-dropdown-header">
                                <div class="vl-dropdown-avatar">
                                    ${userAvatar ? `<img src="${userAvatar}" alt="${userName}" referrerpolicy="no-referrer">` : `<span>${initial}</span>`}
                                </div>
                                <div class="vl-dropdown-user-info">
                                    <span class="vl-dropdown-name">${userName}</span>
                                    ${userEmail ? `<span class="vl-dropdown-email">${userEmail}</span>` : ''}
                                </div>
                            </div>
                            <button type="button" class="vl-dropdown-item" id="desktop-menu-profile">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                                </svg>
                                <span>My Profile</span>
                            </button>
                            <button type="button" class="vl-dropdown-item" id="desktop-menu-settings">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                                </svg>
                                <span>Settings</span>
                            </button>
                            <div class="vl-dropdown-divider"></div>
                            <a href="/api/auth/logout" class="vl-dropdown-item vl-dropdown-item-danger" id="desktop-menu-logout">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>
                                </svg>
                                <span>Log Out</span>
                            </a>
                        </div>
                    `;

                    if (mobileAvatarBtn) {
                        headerRight.insertBefore(desktopMenu, mobileAvatarBtn);
                    } else if (mobileToggle) {
                        headerRight.insertBefore(desktopMenu, mobileToggle);
                    } else {
                        headerRight.appendChild(desktopMenu);
                    }

                    // Dropdown click handlers
                    const chipBtn = desktopMenu.querySelector('#vl-profile-chip-btn');
                    const dropdown = desktopMenu.querySelector('#vl-profile-dropdown');

                    chipBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const isOpen = dropdown.classList.toggle('open');
                        chipBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
                    });

                    // Dropdown options actions
                    desktopMenu.querySelector('#desktop-menu-profile').addEventListener('click', (e) => {
                        e.preventDefault();
                        closeDesktopDropdown();
                        openProfileModal(data.user);
                    });

                    desktopMenu.querySelector('#desktop-menu-settings').addEventListener('click', (e) => {
                        e.preventDefault();
                        closeDesktopDropdown();
                        openSettingsModal();
                    });

                    // Outside click listener for desktop dropdown
                    document.addEventListener('click', (e) => {
                        if (!desktopMenu.contains(e.target)) {
                            closeDesktopDropdown();
                        }
                    });
                }
            }

            // ----------------------------------------------------
            // Redesign Authenticated Mobile Navigation Drawer
            // ----------------------------------------------------
            if (mobileDrawer) {
                mobileDrawer.innerHTML = `
                    <div class="vl-drawer-header">
                        <a href="/" class="vl-wordmark" aria-label="VALORA Home">
                            <span>VALORA</span><span class="vl-wordmark-dot"></span>
                        </a>
                        <button type="button" id="vl-drawer-close" class="vl-drawer-close-btn" aria-label="Close Navigation Menu">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    </div>

                    <nav class="vl-drawer-nav" aria-label="Mobile Menu Links">
                        <a href="/" class="vl-mobile-nav-link">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                            <span>Home</span>
                        </a>
                        <a href="/chat" class="vl-mobile-nav-link">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>
                            <span>Video Chat</span>
                        </a>
                        <a href="/messages" class="vl-mobile-nav-link" id="mobile-drawer-messages-link">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                            <span>Messages</span>
                        </a>
                        <a href="/contact" class="vl-mobile-nav-link">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>
                            <span>Support</span>
                        </a>
                        <a href="https://status.ryntly.in" target="_blank" rel="noopener noreferrer" class="vl-mobile-nav-link">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                            <span>Server Status</span>
                        </a>
                        <a href="/privacy" class="vl-mobile-nav-link">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                            <span>Privacy Policy</span>
                        </a>
                        <a href="/terms" class="vl-mobile-nav-link">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>
                            <span>Terms & Community Rules</span>
                        </a>
                    </nav>

                    <div class="vl-drawer-actions">
                        <button type="button" class="vl-drawer-login-btn" id="mobile-menu-profile">
                            <div class="vl-profile-avatar-wrap" style="width: 22px; height: 22px; flex-shrink: 0;">
                                ${userAvatar ? `<img src="${userAvatar}" alt="${userName}" referrerpolicy="no-referrer">` : `<span style="font-size: 0.75rem;">${initial}</span>`}
                            </div>
                            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${userName}</span>
                        </button>
                        <a href="/chat" class="vl-drawer-cta-btn vl-drawer-connect-btn" id="drawer-connect-btn">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                            <span>Start Connecting</span>
                        </a>
                    </div>

                    <div class="vl-drawer-footer-badges">
                        <div class="vl-drawer-badge">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>
                            <span>18+ Age Restricted</span>
                        </div>
                        <div class="vl-drawer-badge vl-badge-encrypted">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                            <span>End-to-End Encrypted</span>
                        </div>
                    </div>
                `;

                // Sync active nav item on mobile drawer
                syncActiveNavigation();

                // Close drawer when link clicked
                mobileDrawer.querySelectorAll('.vl-mobile-nav-link').forEach(link => {
                    link.addEventListener('click', () => {
                        closeMobileDrawer();
                    });
                });

                // Close button listener
                const closeBtn = mobileDrawer.querySelector('#vl-drawer-close');
                if (closeBtn) {
                    closeBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        closeMobileDrawer();
                    });
                }

                // Bind drawer listeners
                mobileDrawer.querySelector('#mobile-menu-profile').addEventListener('click', () => {
                    closeMobileDrawer();
                    openProfileModal(data.user);
                });

                mobileDrawer.querySelector('#mobile-menu-settings').addEventListener('click', () => {
                    closeMobileDrawer();
                    openSettingsModal();
                });
            }

        } else {
            // Unauthenticated state
            const connectButtons = document.querySelectorAll('.vl-drawer-connect-btn, .btn-enter, #hero-enter-btn');
            connectButtons.forEach(btn => {
                btn.setAttribute('href', '/login');
            });
        }
    })
    .catch(err => {
        console.warn('[Valora Auth] Session check error:', err);
    });
}

// ----------------------------------------------------
// Interactive User Modals (Profile & Settings)
// ----------------------------------------------------

function openProfileModal(user) {
    closeAllModals();

    const name = user?.name || 'Valora User';
    const email = user?.email || 'Authenticated with Google';
    const avatar = user?.avatar_url || '';
    const initial = name.charAt(0).toUpperCase();

    const modal = document.createElement('div');
    modal.className = 'vl-modal-backdrop';
    modal.id = 'vl-user-profile-modal';
    modal.innerHTML = `
        <div class="vl-modal-card">
            <div class="vl-modal-header">
                <div class="vl-modal-title">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--vl-accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    <span>My Profile</span>
                </div>
                <button type="button" class="vl-modal-close-btn" aria-label="Close">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
                </button>
            </div>
            
            <div style="display:flex;flex-direction:column;align-items:center;text-align:center;padding:8px 0 20px;">
                <div style="width:72px;height:72px;border-radius:50%;overflow:hidden;background:linear-gradient(135deg,var(--vl-accent) 0%,#991b1b 100%);border:3px solid rgba(255,255,255,0.2);box-shadow:0 0 24px var(--vl-accent-glow);margin-bottom:14px;display:flex;align-items:center;justify-content:center;">
                    ${avatar ? `<img src="${avatar}" alt="${name}" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover;">` : `<span style="color:#fff;font-size:2rem;font-weight:800;">${initial}</span>`}
                </div>
                <h3 style="margin:0 0 4px;font-size:1.25rem;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">${name}</h3>
                <p style="margin:0 0 16px;font-size:0.875rem;color:#94a3b8;">${email}</p>
                <div style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:9999px;background:rgba(16,185,129,0.14);border:1px solid rgba(16,185,129,0.3);color:#6ee7b7;font-size:0.75rem;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                    <span>Google Verified Account</span>
                </div>
            </div>

            <div style="background:rgba(255,255,255,0.03);border:1px solid var(--vl-border-subtle);border-radius:var(--vl-radius-md);padding:14px 16px;margin-bottom:20px;display:flex;flex-direction:column;gap:10px;">
                <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.8125rem;">
                    <span style="color:#94a3b8;">Authentication</span>
                    <span style="color:#f8fafc;font-weight:600;">Google OAuth 2.0</span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.8125rem;">
                    <span style="color:#94a3b8;">Status</span>
                    <span style="color:#34d399;font-weight:600;">Active & Encrypted</span>
                </div>
            </div>

            <div style="display:flex;gap:10px;">
                <button type="button" class="vl-btn vl-btn-secondary" id="modal-profile-close-btn" style="flex:1;">Close</button>
                <a href="/chat" class="vl-btn vl-btn-primary" style="flex:1;">Enter Chat</a>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('open'));

    modal.querySelector('.vl-modal-close-btn').addEventListener('click', closeAllModals);
    modal.querySelector('#modal-profile-close-btn').addEventListener('click', closeAllModals);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeAllModals();
    });
}

function openSettingsModal() {
    closeAllModals();

    const modal = document.createElement('div');
    modal.className = 'vl-modal-backdrop';
    modal.id = 'vl-user-settings-modal';
    modal.innerHTML = `
        <div class="vl-modal-card">
            <div class="vl-modal-header">
                <div class="vl-modal-title">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--vl-accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    <span>Chat Settings</span>
                </div>
                <button type="button" class="vl-modal-close-btn" aria-label="Close">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
                </button>
            </div>

            <div style="display:flex;flex-direction:column;gap:14px;margin-bottom:24px;">
                <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:rgba(255,255,255,0.03);border:1px solid var(--vl-border-subtle);border-radius:var(--vl-radius-md);">
                    <div>
                        <div style="font-size:0.875rem;font-weight:600;color:#ffffff;">HD Video Quality</div>
                        <div style="font-size:0.75rem;color:#94a3b8;">Adaptive WebRTC 720p/1080p</div>
                    </div>
                    <span class="vl-badge vl-badge-live">Auto ON</span>
                </div>

                <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:rgba(255,255,255,0.03);border:1px solid var(--vl-border-subtle);border-radius:var(--vl-radius-md);">
                    <div>
                        <div style="font-size:0.875rem;font-weight:600;color:#ffffff;">Echo Cancellation</div>
                        <div style="font-size:0.75rem;color:#94a3b8;">Suppress acoustic feedback</div>
                    </div>
                    <span class="vl-badge vl-badge-live">Enabled</span>
                </div>

                <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:rgba(255,255,255,0.03);border:1px solid var(--vl-border-subtle);border-radius:var(--vl-radius-md);">
                    <div>
                        <div style="font-size:0.875rem;font-weight:600;color:#ffffff;">Safe Connection Filter</div>
                        <div style="font-size:0.75rem;color:#94a3b8;">Auto-moderate inappropriate content</div>
                    </div>
                    <span class="vl-badge vl-badge-accent">Protected</span>
                </div>
            </div>

            <button type="button" class="vl-btn vl-btn-primary" id="modal-settings-save-btn" style="width:100%;">Save Preferences</button>
        </div>
    `;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('open'));

    modal.querySelector('.vl-modal-close-btn').addEventListener('click', closeAllModals);
    modal.querySelector('#modal-settings-save-btn').addEventListener('click', () => {
        closeAllModals();
        showPlaceholderToast('Settings saved successfully.');
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeAllModals();
    });
}

function closeAllModals() {
    const modals = document.querySelectorAll('.vl-modal-backdrop');
    modals.forEach(m => {
        m.classList.remove('open');
        setTimeout(() => m.remove(), 250);
    });
}

function showPlaceholderToast(message) {
    let toast = document.getElementById('vl-global-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'vl-global-toast';
        toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%) translateY(100px);
            background: rgba(20, 20, 26, 0.96);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.14);
            color: #f8fafc;
            padding: 10px 20px;
            border-radius: 9999px;
            font-size: 0.875rem;
            font-weight: 600;
            box-shadow: 0 12px 32px rgba(0,0,0,0.7), 0 0 20px rgba(220,38,38,0.15);
            z-index: 9999;
            transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
            opacity: 0;
            pointer-events: none;
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        document.body.appendChild(toast);
    }
    toast.innerHTML = `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#ef4444;box-shadow:0 0 8px #ef4444;"></span> ${message}`;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';

    clearTimeout(window._vlToastTimer);
    window._vlToastTimer = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(100px)';
    }, 3200);
}
