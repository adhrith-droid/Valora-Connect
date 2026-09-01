// ==========================================================================
// VALORA Admin Panel Logic & Application State
// ==========================================================================

// Client-Side Authentication Guard
(function() {
    const isAuth = sessionStorage.getItem('valora_admin_auth') === 'true' || localStorage.getItem('valora_admin_auth') === 'true';
    if (!isAuth) {
        window.location.replace('/admin/login.html');
    }
})();

// Global State
let dashboardChartInstance = null;
let reasonChartInstance = null;
let trendChartInstance = null;
let allReportsCache = [];
let allBansCache = [];
let activeReportFilter = 'all';

// Toast Notification Engine
function showToast(message, type = 'info') {
    let container = document.getElementById('admin-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'admin-toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `admin-toast toast-${type}`;

    let iconName = 'info';
    if (type === 'success') iconName = 'check-circle';
    if (type === 'error') iconName = 'alert-triangle';

    toast.innerHTML = `
        <i data-lucide="${iconName}" style="width: 18px; height: 18px; flex-shrink: 0;"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);
    if (window.lucide) lucide.createIcons();

    setTimeout(() => {
        toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, 3200);
}
window.showToast = showToast;

// Admin Logout
async function adminLogout(e) {
    if (e) e.preventDefault();
    
    sessionStorage.removeItem('valora_admin_auth');
    sessionStorage.removeItem('valora_admin_user');
    localStorage.removeItem('valora_admin_auth');
    document.cookie = "valora_admin=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    
    try {
        await fetch('/admin/logout', { method: 'POST' }).catch(() => {});
    } catch (err) {}
    
    window.location.replace('/admin/login.html');
}
window.adminLogout = adminLogout;

// Server Session Verification
async function verifyAdminSession() {
    try {
        const res = await fetch('/admin/api/auth-check');
        if (res.ok) {
            const data = await res.json();
            const username = data.username || sessionStorage.getItem('valora_admin_user') || 'Admin';
            sessionStorage.setItem('valora_admin_user', username);
            
            // Update admin username badge
            const nameEl = document.getElementById('admin-profile-name');
            if (nameEl) nameEl.textContent = username;
        } else {
            sessionStorage.removeItem('valora_admin_auth');
            sessionStorage.removeItem('valora_admin_user');
            localStorage.removeItem('valora_admin_auth');
            window.location.replace('/admin/login.html');
        }
    } catch (err) {
        console.warn('[Admin] Server session check error:', err);
    }
}

// Copy to Clipboard Helper
function copyToClipboard(text, label = 'Text') {
    if (!navigator.clipboard) {
        const temp = document.createElement('textarea');
        temp.value = text;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
        showToast(`${label} copied to clipboard!`, 'success');
        return;
    }
    navigator.clipboard.writeText(text).then(() => {
        showToast(`${label} copied to clipboard!`, 'success');
    }).catch(() => {
        showToast(`Failed to copy ${label}`, 'error');
    });
}
window.copyToClipboard = copyToClipboard;

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
    verifyAdminSession();
    initSidebar();
    if (window.lucide) lucide.createIcons();

    // Check current page
    if (document.getElementById('liveUsersChart')) {
        initDashboard();
    }
    if (document.getElementById('all-reports-body')) {
        initReportsPage();
    }
    if (document.getElementById('banned-ips-body')) {
        initBannedPage();
    }
    if (document.getElementById('reasonChart') || document.getElementById('trendChart')) {
        initAnalyticsPage();
    }
});

// ==========================================================================
// Sidebar & Navigation
// ==========================================================================
function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const mobileToggle = document.getElementById('mobile-toggle');
    const sidebarClose = document.getElementById('sidebar-close');
    const backdrop = document.getElementById('sidebar-backdrop');
    
    function openMobileSidebar() {
        if (sidebar) sidebar.classList.add('mobile-open');
        if (backdrop) backdrop.classList.add('active');
    }

    function closeMobileSidebar() {
        if (sidebar) sidebar.classList.remove('mobile-open');
        if (backdrop) backdrop.classList.remove('active');
    }

    if (mobileToggle) {
        mobileToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            if (sidebar && sidebar.classList.contains('mobile-open')) {
                closeMobileSidebar();
            } else {
                openMobileSidebar();
            }
        });
    }

    if (sidebarClose) {
        sidebarClose.addEventListener('click', closeMobileSidebar);
    }

    if (backdrop) {
        backdrop.addEventListener('click', closeMobileSidebar);
    }

    // Close on navigation click on mobile
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth <= 1024) closeMobileSidebar();
        });
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeMobileSidebar();
            closeAllModals();
        }
    });
}

function closeAllModals() {
    document.querySelectorAll('.admin-modal-backdrop').forEach(modal => {
        modal.classList.remove('open');
    });
}
window.closeAllModals = closeAllModals;

// Number Counter Animation
function animateValue(obj, start, end, duration) {
    if (!obj) return;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start).toLocaleString();
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

function updateStat(id, value) {
    const el = document.getElementById(id);
    if (el) {
        const current = parseInt(el.innerText.replace(/,/g, '')) || 0;
        animateValue(el, current, value || 0, 800);
    }
}

// ==========================================================================
// Dashboard Logic
// ==========================================================================
const dashboardHistory = {
    labels: [],
    data: []
};

function initDashboard() {
    const ctx = document.getElementById('liveUsersChart')?.getContext('2d');
    if (ctx) {
        dashboardChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dashboardHistory.labels,
                datasets: [{
                    label: 'Live Connected Users',
                    data: dashboardHistory.data,
                    borderColor: '#FF2444',
                    backgroundColor: 'rgba(255, 36, 68, 0.08)',
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.35,
                    pointRadius: 2,
                    pointHoverRadius: 5,
                    pointBackgroundColor: '#FF2444'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: '#161622',
                        titleColor: '#A1A1AA',
                        bodyColor: '#FFFFFF',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        padding: 10,
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                return `Live Users: ${context.parsed.y}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: '#71717A', font: { size: 10 }, maxTicksLimit: 6 }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
                        ticks: { color: '#71717A', font: { size: 10 }, stepSize: 1 }
                    }
                }
            }
        });
    }

    fetchDashboardData();
    setInterval(fetchDashboardData, 6000);
}

async function fetchDashboardData() {
    try {
        const [statsRes, reportsRes] = await Promise.all([
            fetch('/admin/api/stats'),
            fetch('/admin/api/reports')
        ]);

        if (statsRes.ok) {
            const stats = await statsRes.json();
            updateStat('total-reports', stats.totalReports);
            updateStat('live-users', stats.liveUsers);
            updateStat('reports-today', stats.reportsToday);
            updateStat('banned-today', stats.bannedToday);

            // Update live users chart
            const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            dashboardHistory.labels.push(now);
            dashboardHistory.data.push(stats.liveUsers);

            if (dashboardHistory.labels.length > 15) {
                dashboardHistory.labels.shift();
                dashboardHistory.data.shift();
            }

            if (dashboardChartInstance) {
                dashboardChartInstance.update('none');
            }
        }

        if (reportsRes.ok) {
            const reports = await reportsRes.json();
            renderRecentReports(reports.slice(0, 5));
        }
    } catch (err) {
        console.error('[Admin] Dashboard fetch error:', err);
    }
}
window.fetchDashboardData = fetchDashboardData;

function renderRecentReports(reports) {
    const tbody = document.getElementById('recent-reports-body');
    const emptyEl = document.getElementById('recent-reports-empty');
    const tableWrap = document.getElementById('recent-reports-table-wrap');

    if (!tbody) return;

    if (!reports || reports.length === 0) {
        if (emptyEl) emptyEl.style.display = 'flex';
        if (tableWrap) tableWrap.style.display = 'none';
        tbody.innerHTML = '';
        return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    if (tableWrap) tableWrap.style.display = 'block';

    tbody.innerHTML = '';
    reports.forEach(report => {
        const tr = document.createElement('tr');
        const reportId = report._id || report.id || 'N/A';
        const reporter = report.reporterEmail || 'Anonymous';
        const dateStr = new Date(report.reportedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
        const status = report.status || 'pending';

        tr.innerHTML = `
            <td>
                <div style="display: flex; flex-direction: column;">
                    <span style="font-weight: 600; color: #fff;">${reporter}</span>
                    <span style="font-size: 0.6875rem; color: #71717A; font-family: monospace;">#${reportId.substring(0, 8)}</span>
                </div>
            </td>
            <td>
                <span style="background: rgba(255,255,255,0.05); padding: 3px 8px; border-radius: 6px; font-size: 0.75rem; color: #E4E4E7; border: 1px solid rgba(255,255,255,0.08);">${report.reason || 'General'}</span>
            </td>
            <td style="color: #A1A1AA; font-size: 0.75rem;">${dateStr}</td>
            <td>
                <span class="status-badge status-${status}">
                    <span style="width: 5px; height: 5px; border-radius: 50%; background: currentColor;"></span>
                    ${status}
                </span>
            </td>
            <td>
                <div class="action-buttons-group">
                    <button onclick="updateReportStatus('${reportId}', 'reviewed')" class="btn-table-action btn-action-blue" title="Mark Reviewed">
                        <i data-lucide="eye" style="width: 14px; height: 14px;"></i>
                    </button>
                    <button onclick="updateReportStatus('${reportId}', 'resolved')" class="btn-table-action btn-action-green" title="Mark Resolved">
                        <i data-lucide="check-circle" style="width: 14px; height: 14px;"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (window.lucide) lucide.createIcons();
}

// ==========================================================================
// Reports Page Logic
// ==========================================================================
function initReportsPage() {
    fetchAllReports();
    
    // Search input listener
    const searchInput = document.getElementById('reports-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            applyReportsFilter();
        });
    }

    // Status filter tabs listener
    document.querySelectorAll('.reports-filter-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.reports-filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            activeReportFilter = tab.getAttribute('data-filter') || 'all';
            applyReportsFilter();
        });
    });
}

async function fetchAllReports() {
    const tbody = document.getElementById('all-reports-body');
    const refreshBtn = document.getElementById('reports-refresh-btn');
    if (refreshBtn) refreshBtn.classList.add('animate-spin');

    try {
        const response = await fetch('/admin/api/reports');
        if (response.ok) {
            allReportsCache = await response.json();
            
            // Update total badge
            const countBadge = document.getElementById('reports-total-count');
            if (countBadge) countBadge.textContent = allReportsCache.length;

            applyReportsFilter();
            showToast('Reports refreshed successfully', 'success');
        } else {
            showToast('Failed to load reports', 'error');
        }
    } catch (err) {
        console.error('[Admin] Error fetching all reports:', err);
        showToast('Network error while loading reports', 'error');
    } finally {
        if (refreshBtn) refreshBtn.classList.remove('animate-spin');
    }
}
window.fetchAllReports = fetchAllReports;

function applyReportsFilter() {
    const query = (document.getElementById('reports-search-input')?.value || '').toLowerCase().trim();
    let filtered = allReportsCache;

    // Filter by status tab
    if (activeReportFilter !== 'all') {
        filtered = filtered.filter(r => (r.status || 'pending').toLowerCase() === activeReportFilter.toLowerCase());
    }

    // Filter by search query
    if (query) {
        filtered = filtered.filter(r => {
            const reporter = (r.reporterEmail || '').toLowerCase();
            const reason = (r.reason || '').toLowerCase();
            const msg = (r.message || '').toLowerCase();
            const ip = (r.reportedIP || '').toLowerCase();
            const socket = (r.reportedUserSocketId || '').toLowerCase();
            const id = (r._id || r.id || '').toLowerCase();
            return reporter.includes(query) || reason.includes(query) || msg.includes(query) || ip.includes(query) || socket.includes(query) || id.includes(query);
        });
    }

    renderAllReportsTable(filtered);
}

function renderAllReportsTable(reports) {
    const tbody = document.getElementById('all-reports-body');
    const emptyEl = document.getElementById('reports-empty-state');
    const tableWrap = document.getElementById('reports-table-wrap');

    if (!tbody) return;

    if (!reports || reports.length === 0) {
        if (emptyEl) emptyEl.style.display = 'flex';
        if (tableWrap) tableWrap.style.display = 'none';
        tbody.innerHTML = '';
        return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    if (tableWrap) tableWrap.style.display = 'block';

    tbody.innerHTML = '';
    reports.forEach(report => {
        const tr = document.createElement('tr');
        const reportId = report._id || report.id || 'N/A';
        const reporter = report.reporterEmail || 'Anonymous';
        const reportedIp = report.reportedIP || 'Unknown IP';
        const dateStr = new Date(report.reportedAt).toLocaleString();
        const status = report.status || 'pending';
        const msg = report.message || 'No description provided.';

        tr.innerHTML = `
            <td>
                <div style="display: flex; flex-direction: column;">
                    <span style="font-weight: 600; color: #fff;">${reporter}</span>
                    <span style="font-size: 0.6875rem; color: #71717A; font-family: monospace;">#${reportId}</span>
                </div>
            </td>
            <td>
                <span style="background: rgba(255,255,255,0.05); padding: 3px 8px; border-radius: 6px; font-size: 0.75rem; color: #E4E4E7; border: 1px solid rgba(255,255,255,0.08); font-weight: 600;">${report.reason || 'General'}</span>
            </td>
            <td style="max-width: 260px;">
                <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #A1A1AA; cursor: pointer;" onclick="openReportMessageModal('${encodeURIComponent(msg)}', '${encodeURIComponent(reporter)}', '${encodeURIComponent(report.reason || 'Report')}')" title="Click to view full message">
                    ${msg}
                </div>
            </td>
            <td>
                <div style="display: flex; flex-direction: column;">
                    <span style="font-family: monospace; font-size: 0.8125rem; color: #60A5FA; cursor: pointer;" onclick="copyToClipboard('${reportedIp}', 'IP Address')" title="Click to copy IP">${reportedIp}</span>
                    <span style="font-size: 0.6875rem; color: #71717A;">${report.reportedUserSocketId || 'No Socket ID'}</span>
                </div>
            </td>
            <td style="color: #A1A1AA; font-size: 0.75rem; white-space: nowrap;">${dateStr}</td>
            <td>
                <span class="status-badge status-${status}">
                    <span style="width: 5px; height: 5px; border-radius: 50%; background: currentColor;"></span>
                    ${status}
                </span>
            </td>
            <td>
                <div class="action-buttons-group">
                    <button onclick="updateReportStatus('${reportId}', 'reviewed')" class="btn-table-action btn-action-blue" title="Mark Reviewed">
                        <i data-lucide="eye" style="width: 14px; height: 14px;"></i>
                    </button>
                    <button onclick="updateReportStatus('${reportId}', 'resolved')" class="btn-table-action btn-action-green" title="Resolve Report">
                        <i data-lucide="check-circle" style="width: 14px; height: 14px;"></i>
                    </button>
                    <button onclick="banReportedUser('${reportedIp}', '${report.reason || 'Report Ban'}')" class="btn-table-action btn-action-amber" title="Ban IP Address">
                        <i data-lucide="shield-alert" style="width: 14px; height: 14px;"></i>
                    </button>
                    <button onclick="deleteReport('${reportId}')" class="btn-table-action btn-action-red" title="Delete Report">
                        <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (window.lucide) lucide.createIcons();
}

function openReportMessageModal(encodedMsg, encodedReporter, encodedReason) {
    const msg = decodeURIComponent(encodedMsg);
    const reporter = decodeURIComponent(encodedReporter);
    const reason = decodeURIComponent(encodedReason);

    const modal = document.getElementById('report-message-modal');
    if (!modal) return;

    document.getElementById('modal-report-reporter').textContent = reporter;
    document.getElementById('modal-report-reason').textContent = reason;
    document.getElementById('modal-report-message').textContent = msg;

    modal.classList.add('open');
    if (window.lucide) lucide.createIcons();
}
window.openReportMessageModal = openReportMessageModal;

async function updateReportStatus(id, status) {
    try {
        const response = await fetch(`/admin/api/reports/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (response.ok) {
            showToast(`Report marked as ${status}`, 'success');
            if (document.getElementById('all-reports-body')) fetchAllReports();
            else fetchDashboardData();
        } else {
            showToast('Failed to update report status', 'error');
        }
    } catch (err) {
        showToast('Error updating status', 'error');
    }
}
window.updateReportStatus = updateReportStatus;

async function deleteReport(id) {
    if (!confirm('Are you sure you want to permanently delete this report?')) return;
    try {
        const response = await fetch(`/admin/api/reports/${id}`, {
            method: 'DELETE'
        });
        if (response.ok) {
            showToast('Report deleted successfully', 'success');
            if (document.getElementById('all-reports-body')) fetchAllReports();
            else fetchDashboardData();
        } else {
            showToast('Failed to delete report', 'error');
        }
    } catch (err) {
        showToast('Error deleting report', 'error');
    }
}
window.deleteReport = deleteReport;

async function banReportedUser(ip, reason) {
    if (!ip || ip === 'Unknown IP' || ip === 'unknown') {
        return showToast('Cannot ban unknown IP address', 'error');
    }
    if (!confirm(`Are you sure you want to BAN IP address: ${ip}? This will immediately terminate all active connections from this IP.`)) return;

    try {
        const response = await fetch('/admin/ban', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip, reason: reason || 'Admin Ban' })
        });
        if (response.ok) {
            showToast(`IP ${ip} has been banned`, 'success');
            if (document.getElementById('banned-ips-body')) fetchBannedIPs();
            else if (document.getElementById('all-reports-body')) fetchAllReports();
            else fetchDashboardData();
        } else {
            const data = await response.json();
            showToast(data.error || 'Failed to ban user', 'error');
        }
    } catch (err) {
        showToast('Error banning IP', 'error');
    }
}
window.banReportedUser = banReportedUser;

// ==========================================================================
// Banned Users Page Logic
// ==========================================================================
function initBannedPage() {
    fetchBannedIPs();

    const searchInput = document.getElementById('banned-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            applyBannedFilter();
        });
    }

    // New Ban Modal Form
    const banForm = document.getElementById('manual-ban-form');
    if (banForm) {
        banForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const ip = document.getElementById('ban-ip-input')?.value.trim();
            const reason = document.getElementById('ban-reason-input')?.value.trim() || 'Admin Ban';
            if (!ip) return;

            try {
                const response = await fetch('/admin/ban', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ip, reason })
                });
                if (response.ok) {
                    showToast(`IP ${ip} banned successfully`, 'success');
                    closeAllModals();
                    banForm.reset();
                    fetchBannedIPs();
                } else {
                    const data = await response.json();
                    showToast(data.error || 'Failed to ban IP', 'error');
                }
            } catch (err) {
                showToast('Error processing ban', 'error');
            }
        });
    }
}

async function fetchBannedIPs() {
    const refreshBtn = document.getElementById('banned-refresh-btn');
    if (refreshBtn) refreshBtn.classList.add('animate-spin');

    try {
        const response = await fetch('/admin/api/banned-ips');
        if (response.ok) {
            allBansCache = await response.json();
            const countBadge = document.getElementById('banned-total-count');
            if (countBadge) countBadge.textContent = allBansCache.length;

            applyBannedFilter();
            showToast('Banned list refreshed', 'success');
        } else {
            showToast('Failed to load banned users', 'error');
        }
    } catch (err) {
        console.error('[Admin] Banned fetch error:', err);
        showToast('Network error while loading banned list', 'error');
    } finally {
        if (refreshBtn) refreshBtn.classList.remove('animate-spin');
    }
}
window.fetchBannedIPs = fetchBannedIPs;

function applyBannedFilter() {
    const query = (document.getElementById('banned-search-input')?.value || '').toLowerCase().trim();
    let filtered = allBansCache;

    if (query) {
        filtered = filtered.filter(b => {
            const ip = (b.ip || '').toLowerCase();
            const reason = (b.reason || '').toLowerCase();
            return ip.includes(query) || reason.includes(query);
        });
    }

    renderBannedTable(filtered);
}

function renderBannedTable(bans) {
    const tbody = document.getElementById('banned-ips-body');
    const emptyEl = document.getElementById('banned-empty-state');
    const tableWrap = document.getElementById('banned-table-wrap');

    if (!tbody) return;

    if (!bans || bans.length === 0) {
        if (emptyEl) emptyEl.style.display = 'flex';
        if (tableWrap) tableWrap.style.display = 'none';
        tbody.innerHTML = '';
        return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    if (tableWrap) tableWrap.style.display = 'block';

    tbody.innerHTML = '';
    bans.forEach(ban => {
        const tr = document.createElement('tr');
        const banId = ban._id || ban.id;
        const ip = ban.ip || 'Unknown';
        const reason = ban.reason || 'Admin Ban';
        const dateStr = new Date(ban.bannedAt).toLocaleString();

        tr.innerHTML = `
            <td>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-family: monospace; font-size: 0.875rem; color: #F87171; font-weight: 600;">${ip}</span>
                    <button onclick="copyToClipboard('${ip}', 'IP Address')" class="btn-table-action" title="Copy IP" style="width: 24px; height: 24px;">
                        <i data-lucide="copy" style="width: 12px; height: 12px;"></i>
                    </button>
                </div>
            </td>
            <td>
                <span style="color: #E4E4E7; font-size: 0.8125rem;">${reason}</span>
            </td>
            <td style="color: #A1A1AA; font-size: 0.75rem;">${dateStr}</td>
            <td>
                <button onclick="unbanIP('${banId}', '${ip}')" class="btn btn-success" style="padding: 4px 10px; font-size: 0.75rem;">
                    <i data-lucide="unlock" style="width: 13px; height: 13px;"></i>
                    <span>Unban</span>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (window.lucide) lucide.createIcons();
}

async function unbanIP(id, ip) {
    if (!confirm(`Are you sure you want to UNBAN IP address: ${ip}?`)) return;
    try {
        const response = await fetch(`/admin/api/banned-ips/${id}`, {
            method: 'DELETE'
        });
        if (response.ok) {
            showToast(`IP ${ip} unbanned successfully`, 'success');
            fetchBannedIPs();
        } else {
            showToast('Failed to unban IP', 'error');
        }
    } catch (err) {
        showToast('Error unbanning IP', 'error');
    }
}
window.unbanIP = unbanIP;

// ==========================================================================
// Analytics Page Logic
// ==========================================================================
function initAnalyticsPage() {
    fetchAnalyticsData();
}

async function fetchAnalyticsData() {
    const refreshBtn = document.getElementById('analytics-refresh-btn');
    if (refreshBtn) refreshBtn.classList.add('animate-spin');

    try {
        const [analyticsRes, statsRes] = await Promise.all([
            fetch('/admin/api/analytics'),
            fetch('/admin/api/stats')
        ]);

        if (statsRes.ok) {
            const stats = await statsRes.json();
            updateStat('analytics-total-reports', stats.totalReports);
            updateStat('analytics-live-users', stats.liveUsers);
            updateStat('analytics-total-banned', stats.totalBanned || stats.bannedToday);
        }

        if (analyticsRes.ok) {
            const data = await analyticsRes.json();
            renderReasonChart(data.reportsByReason || []);
            renderTrendChart(data.reportsByDay || []);
            showToast('Analytics refreshed', 'success');
        }
    } catch (err) {
        console.error('[Admin] Analytics fetch error:', err);
        showToast('Failed to load analytics', 'error');
    } finally {
        if (refreshBtn) refreshBtn.classList.remove('animate-spin');
    }
}
window.fetchAnalyticsData = fetchAnalyticsData;

function renderReasonChart(reasonData) {
    const ctx = document.getElementById('reasonChart')?.getContext('2d');
    const emptyEl = document.getElementById('reason-chart-empty');
    const chartWrap = document.getElementById('reason-chart-wrap');

    if (!ctx) return;

    if (!reasonData || reasonData.length === 0) {
        if (emptyEl) emptyEl.style.display = 'flex';
        if (chartWrap) chartWrap.style.display = 'none';
        if (reasonChartInstance) reasonChartInstance.destroy();
        return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    if (chartWrap) chartWrap.style.display = 'block';

    const labels = reasonData.map(d => d._id || 'General');
    const counts = reasonData.map(d => d.count);

    if (reasonChartInstance) reasonChartInstance.destroy();

    reasonChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: counts,
                backgroundColor: [
                    '#FF2444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4'
                ],
                borderWidth: 2,
                borderColor: '#12121A',
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#A1A1AA', font: { size: 11 }, padding: 14 }
                },
                tooltip: {
                    backgroundColor: '#161622',
                    titleColor: '#A1A1AA',
                    bodyColor: '#FFFFFF',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 10
                }
            }
        }
    });
}

function renderTrendChart(trendData) {
    const ctx = document.getElementById('trendChart')?.getContext('2d');
    const emptyEl = document.getElementById('trend-chart-empty');
    const chartWrap = document.getElementById('trend-chart-wrap');

    if (!ctx) return;

    const labels = (trendData && trendData.length > 0) ? trendData.map(d => d._id) : ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'];
    const counts = (trendData && trendData.length > 0) ? trendData.map(d => d.count) : [0, 0, 0, 0, 0, 0, 0];

    const hasData = counts.some(c => c > 0);

    if (!hasData && (!trendData || trendData.length === 0)) {
        if (emptyEl) emptyEl.style.display = 'flex';
        if (chartWrap) chartWrap.style.display = 'none';
        if (trendChartInstance) trendChartInstance.destroy();
        return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    if (chartWrap) chartWrap.style.display = 'block';

    if (trendChartInstance) trendChartInstance.destroy();

    trendChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Reports Filed',
                data: counts,
                backgroundColor: 'rgba(255, 36, 68, 0.85)',
                hoverBackgroundColor: '#FF2444',
                borderRadius: 6,
                maxBarThickness: 32
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#161622',
                    titleColor: '#A1A1AA',
                    bodyColor: '#FFFFFF',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 10
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#71717A', font: { size: 10 } }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
                    ticks: { color: '#71717A', font: { size: 10 }, stepSize: 1 }
                }
            }
        }
    });
}
