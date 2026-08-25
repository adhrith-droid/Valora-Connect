// VALORA Admin Panel Logic
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    initSidebar();
    
    // Check which page we are on
    if (document.getElementById('liveUsersChart')) {
        initDashboard();
    }
    
    if (document.getElementById('all-reports-body')) {
        initReportsPage();
    }
});

// Sidebar Logic
function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const mobileToggle = document.getElementById('mobile-toggle');
    const mainContent = document.getElementById('main-content');
    
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            mainContent.classList.toggle('expanded');
            
            // Update icon
            const icon = sidebarToggle.querySelector('i');
            if (sidebar.classList.contains('collapsed')) {
                icon.setAttribute('data-lucide', 'chevron-right');
            } else {
                icon.setAttribute('data-lucide', 'chevron-left');
            }
            lucide.createIcons();
        });
    }
    
    if (mobileToggle) {
        mobileToggle.addEventListener('click', () => {
            sidebar.classList.toggle('mobile-open');
        });
    }

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 1024) {
            if (!sidebar.contains(e.target) && !mobileToggle.contains(e.target) && sidebar.classList.contains('mobile-open')) {
                sidebar.classList.remove('mobile-open');
            }
        }
    });
}

// Dashboard Logic
let liveUsersChart = null;
const chartData = {
    labels: [],
    datasets: [{
        label: 'Live Users',
        data: [],
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 0
    }]
};

function initDashboard() {
    const ctx = document.getElementById('liveUsersChart').getContext('2d');
    liveUsersChart = new Chart(ctx, {
        type: 'line',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    titleColor: '#9ca3af',
                    bodyColor: '#fff',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    display: false
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255,255,255,0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#6b7280',
                        font: { size: 10 },
                        stepSize: 1
                    }
                }
            }
        }
    });

    fetchDashboardData();
    setInterval(fetchDashboardData, 5000);
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
            
            // Update recent reports table
            if (reportsRes.ok) {
                const reports = await reportsRes.json();
                updateRecentReportsTable(reports.slice(0, 5));
            }

            // Update Chart
            const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            chartData.labels.push(now);
            chartData.datasets[0].data.push(stats.liveUsers);
            
            if (chartData.labels.length > 20) {
                chartData.labels.shift();
                chartData.datasets[0].data.shift();
            }
            
            liveUsersChart.update('none');
        }
    } catch (err) {
        console.error('Dashboard data fetch error:', err);
    }
}

function updateStat(id, value) {
    const el = document.getElementById(id);
    if (el) {
        const current = parseInt(el.innerText) || 0;
        animateValue(el, current, value, 1000);
    }
}

function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

function updateRecentReportsTable(reports) {
    const tbody = document.getElementById('recent-reports-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    reports.forEach(report => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <div class="flex flex-col">
                    <span class="font-medium text-white">${report.reporterEmail}</span>
                    <span class="text-[10px] text-gray-500 uppercase tracking-wider">${report._id.substring(0, 8)}</span>
                </div>
            </td>
            <td>
                <span class="px-2 py-1 bg-white/5 rounded text-xs">${report.reason}</span>
            </td>
            <td class="text-gray-400 text-xs">
                ${new Date(report.reportedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
            </td>
            <td>
                <span class="status-badge status-${report.status}">${report.status}</span>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Reports Page Logic
async function initReportsPage() {
    await fetchAllReports();
    setInterval(fetchAllReports, 30000);
}

async function fetchAllReports() {
    const tbody = document.getElementById('all-reports-body');
    if (!tbody) return;

    try {
        const response = await fetch('/admin/api/reports');
        if (response.ok) {
            const reports = await response.json();
            tbody.innerHTML = '';
            
            reports.forEach(report => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>
                        <div class="flex flex-col">
                            <span class="font-medium text-white">${report.reporterEmail}</span>
                            <span class="text-[10px] text-gray-500">${report._id}</span>
                        </div>
                    </td>
                    <td><span class="px-2 py-1 bg-white/5 rounded text-xs">${report.reason}</span></td>
                    <td class="max-w-[200px] truncate text-gray-400" title="${report.message || 'No message'}">
                        ${report.message || '<span class="italic opacity-30">No message</span>'}
                    </td>
                    <td>
                        <div class="flex flex-col">
                            <span class="text-xs text-blue-400 font-mono">${report.reportedIP || 'Unknown'}</span>
                            <span class="text-[10px] text-gray-600">${report.reportedUserSocketId}</span>
                        </div>
                    </td>
                    <td class="text-gray-400 text-xs">
                        ${new Date(report.reportedAt).toLocaleString()}
                    </td>
                    <td><span class="status-badge status-${report.status}">${report.status}</span></td>
                    <td>
                        <div class="flex gap-2">
                            <button onclick="updateReportStatus('${report._id}', 'reviewed')" class="btn-action" title="Mark Reviewed">
                                <i data-lucide="check-circle" class="w-4 h-4"></i>
                            </button>
                            <button onclick="updateReportStatus('${report._id}', 'resolved')" class="btn-action text-emerald-500" title="Resolve">
                                <i data-lucide="shield-check" class="w-4 h-4"></i>
                            </button>
                            <button onclick="banUser('${report.reportedIP}')" class="btn-action text-amber-500" title="Ban IP">
                                <i data-lucide="user-x" class="w-4 h-4"></i>
                            </button>
                            <button onclick="deleteReport('${report._id}')" class="btn-action btn-delete" title="Delete">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(row);
            });
            lucide.createIcons();
        }
    } catch (err) {
        console.error('Reports fetch error:', err);
    }
}

async function updateReportStatus(id, status) {
    try {
        const response = await fetch(`/admin/api/reports/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (response.ok) {
            if (document.getElementById('all-reports-body')) fetchAllReports();
            else fetchDashboardData();
        }
    } catch (err) {
        alert('Failed to update status');
    }
}

async function deleteReport(id) {
    if (!confirm('Are you sure you want to delete this report?')) return;
    try {
        const response = await fetch(`/admin/api/reports/${id}`, {
            method: 'DELETE'
        });
        if (response.ok) {
            if (document.getElementById('all-reports-body')) fetchAllReports();
            else fetchDashboardData();
        }
    } catch (err) {
        alert('Failed to delete report');
    }
}

async function banUser(ip) {
    if (!ip || ip === 'unknown') return alert('Cannot ban unknown IP');
    if (!confirm(`Are you sure you want to ban IP: ${ip}?`)) return;
    
    try {
        const response = await fetch('/admin/ban', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip })
        });
        if (response.ok) {
            alert('User banned successfully');
        } else {
            const data = await response.json();
            alert(data.error || 'Failed to ban user');
        }
    } catch (err) {
        alert('Error banning user');
    }
}

// Make functions global for onclick handlers
window.updateReportStatus = updateReportStatus;
window.deleteReport = deleteReport;
window.banUser = banUser;
