/**
 * VALORA — Global Header & Navigation Interactions
 * Phase 2: Responsive navigation drawer & non-destructive route placeholders
 */

document.addEventListener('DOMContentLoaded', () => {
    initValoraHeader();
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
    }, 2800);
}
