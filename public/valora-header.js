/**
 * VALORA — Global Header & Navigation Interactions
 * Includes: Responsive navigation drawer, user auth state check & dynamic header rendering
 */

document.addEventListener('DOMContentLoaded', () => {
    initValoraHeader();
    initAuthState();
});

function initValoraHeader() {
    const mobileToggle = document.getElementById('vl-mobile-toggle');
    const mobileDrawer = document.getElementById('vl-mobile-drawer');

    if (mobileToggle && mobileDrawer) {
        mobileToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = mobileDrawer.classList.toggle('open');
            mobileToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            
            // Switch hamburger / close icon if available
            const iconSvg = mobileToggle.querySelector('svg');
            if (iconSvg) {
                if (isOpen) {
                    iconSvg.innerHTML = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>';
                } else {
                    iconSvg.innerHTML = '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>';
                }
            }
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!mobileDrawer.contains(e.target) && !mobileToggle.contains(e.target) && mobileDrawer.classList.contains('open')) {
                mobileDrawer.classList.remove('open');
                mobileToggle.setAttribute('aria-expanded', 'false');
                const iconSvg = mobileToggle.querySelector('svg');
                if (iconSvg) {
                    iconSvg.innerHTML = '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>';
                }
            }
        });
    }

    // Handle placeholder links gracefully with non-destructive toast/feedback
    const placeholderLinks = document.querySelectorAll('.vl-nav-placeholder');
    placeholderLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const featureName = link.getAttribute('data-feature') || 'This section';
            showPlaceholderToast(`${featureName} is coming in the upcoming phase.`);
        });
    });
}

let isUserLoggedIn = false;

function initAuthState() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('login_success') === '1') {
        showPlaceholderToast('Signed in successfully with Google. Welcome to VALORA!');
        // Clean URL without refresh
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (urlParams.get('logged_out') === '1') {
        showPlaceholderToast('You have been signed out.');
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Default to /login for all connect/enter buttons initially
    const connectButtons = document.querySelectorAll('.vl-header-cta, .vl-drawer-connect-btn, .btn-enter, #header-connect-btn, #hero-enter-btn');
    connectButtons.forEach(btn => {
        btn.setAttribute('href', '/login');
    });

    fetch('/api/auth/user')
        .then(res => res.json())
        .then(data => {
            const headerRight = document.querySelector('.vl-header-right');
            const mobileDrawer = document.getElementById('vl-mobile-drawer');

            if (data.authenticated && data.user) {
                isUserLoggedIn = true;
                const userName = data.user.name || 'User';
                const userAvatar = data.user.avatar_url || '';
                const firstName = userName.split(' ')[0];

                // If user is authenticated, update all action buttons to open /chat directly
                const authActionButtons = document.querySelectorAll('.vl-header-cta, .vl-drawer-connect-btn, .btn-enter, #header-connect-btn, #hero-enter-btn');
                authActionButtons.forEach(btn => {
                    btn.setAttribute('href', '/chat');
                });

                // Update Header Right with user pill & logout
                if (headerRight) {
                    const mobileToggle = headerRight.querySelector('.vl-mobile-toggle');
                    
                    // Profile Pill element
                    let userPill = document.getElementById('vl-header-user-profile');
                    if (!userPill) {
                        userPill = document.createElement('div');
                        userPill.id = 'vl-header-user-profile';
                        userPill.style.cssText = 'display:flex;align-items:center;gap:8px;';
                        userPill.innerHTML = `
                            <div style="display:flex;align-items:center;gap:8px;padding:4px 10px 4px 4px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:9999px;">
                                ${userAvatar ? `<img src="${userAvatar}" alt="${userName}" referrerpolicy="no-referrer" style="width:26px;height:26px;border-radius:50%;object-fit:cover;border:1px solid var(--vl-accent,#dc2626);">` : `<div style="width:26px;height:26px;border-radius:50%;background:var(--vl-accent,#dc2626);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;">${firstName.charAt(0)}</div>`}
                                <span style="font-size:0.8125rem;font-weight:600;color:#f8fafc;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${firstName}</span>
                            </div>
                            <a href="/chat" class="vl-btn vl-btn-primary vl-header-cta" style="padding:8px 16px;font-size:0.875rem;">
                                Start Chat
                            </a>
                            <a href="/api/auth/logout" class="vl-btn vl-btn-ghost" title="Log Out" style="padding:8px 12px;font-size:0.8125rem;color:#94a3b8;">
                                Log out
                            </a>
                        `;
                        // Replace existing CTA if present, keeping mobile toggle
                        const existingCta = headerRight.querySelector('.vl-header-cta');
                        if (existingCta) existingCta.remove();
                        const existingLogin = headerRight.querySelector('.vl-header-login-btn');
                        if (existingLogin) existingLogin.remove();

                        if (mobileToggle) {
                            headerRight.insertBefore(userPill, mobileToggle);
                        } else {
                            headerRight.appendChild(userPill);
                        }
                    }
                }

                // Update Mobile Drawer
                if (mobileDrawer) {
                    let drawerUser = document.getElementById('vl-drawer-user-section');
                    if (!drawerUser) {
                        drawerUser = document.createElement('div');
                        drawerUser.id = 'vl-drawer-user-section';
                        drawerUser.style.cssText = 'padding:12px 0;border-top:1px solid var(--vl-border-subtle);margin-top:12px;display:flex;align-items:center;justify-content:space-between;';
                        drawerUser.innerHTML = `
                            <div style="display:flex;align-items:center;gap:8px;">
                                ${userAvatar ? `<img src="${userAvatar}" alt="${userName}" referrerpolicy="no-referrer" style="width:28px;height:28px;border-radius:50%;border:1px solid var(--vl-accent,#dc2626);">` : `<div style="width:28px;height:28px;border-radius:50%;background:var(--vl-accent,#dc2626);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;">${firstName.charAt(0)}</div>`}
                                <span style="font-size:0.875rem;font-weight:600;color:#f8fafc;">${userName}</span>
                            </div>
                            <a href="/api/auth/logout" style="font-size:0.8125rem;color:#ef4444;text-decoration:none;font-weight:600;">Log out</a>
                        `;
                        mobileDrawer.appendChild(drawerUser);
                    }
                }
            } else {
                isUserLoggedIn = false;
                // User is not authenticated -> Ensure all start connecting / enter buttons point to /login
                const unauthActionButtons = document.querySelectorAll('.vl-header-cta, .vl-drawer-connect-btn, .btn-enter, #header-connect-btn, #hero-enter-btn');
                unauthActionButtons.forEach(btn => {
                    btn.setAttribute('href', '/login');
                });

                // Ensure Login button in header on desktop
                if (headerRight && !headerRight.querySelector('.vl-header-login-btn')) {
                    const mobileToggle = headerRight.querySelector('.vl-mobile-toggle');
                    const loginBtn = document.createElement('a');
                    loginBtn.href = '/login';
                    loginBtn.className = 'vl-btn vl-btn-ghost vl-header-login-btn';
                    loginBtn.textContent = 'Log In';

                    const ctaBtn = headerRight.querySelector('.vl-header-cta');
                    if (ctaBtn) {
                        headerRight.insertBefore(loginBtn, ctaBtn);
                    } else if (mobileToggle) {
                        headerRight.insertBefore(loginBtn, mobileToggle);
                    }
                }
            }
        })
        .catch(err => {
            console.warn('[Valora Auth] Auth status check error:', err);
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
            background: rgba(22, 22, 28, 0.95);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.12);
            color: #f8fafc;
            padding: 10px 20px;
            border-radius: 9999px;
            font-size: 0.875rem;
            font-weight: 500;
            box-shadow: 0 10px 30px rgba(0,0,0,0.6);
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
    toast.innerHTML = `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#ef4444;"></span> ${message}`;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';

    clearTimeout(window._vlToastTimer);
    window._vlToastTimer = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(100px)';
    }, 3200);
}

