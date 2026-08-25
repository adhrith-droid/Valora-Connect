const socket = io();

const config = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

const startOverlay = document.getElementById('start-overlay');
const startBtn = document.getElementById('start-btn');
const nextBtn = document.getElementById('next-btn');
const reportBtn = document.getElementById('report-btn');
const headerReportBtn = document.getElementById('header-report-btn');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const statusDiv = document.getElementById('status');
const headerStatus = document.getElementById('header-status');
const headerStatusText = document.getElementById('header-status-text');
const flipBtn = document.getElementById('flip-btn');
const micBtn = document.getElementById('mic-btn');
const camBtn = document.getElementById('cam-btn');
const localLabel = document.getElementById('local-label');
const remoteLabel = document.getElementById('remote-label');

const chatToggleBtn = document.getElementById('chat-toggle-btn');
const chatPanel = document.getElementById('chat-panel');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const closeChat = document.getElementById('close-chat');
const videoMain = document.querySelector('.video-main');

const ageGateModal = document.getElementById('age-gate-modal');
const ageGateForm = document.getElementById('age-gate-form');
const modalName = document.getElementById('modal-name');
const modal18Confirm = document.getElementById('modal-18-confirm');
const modalGender = document.getElementById('modal-gender');
const modalSubmit = document.getElementById('modal-submit');
const genderBtns = document.querySelectorAll('.gender-btn');
const modalError = document.getElementById('modal-error');

const reportModal = document.getElementById('report-modal');
const reportForm = document.getElementById('report-form');
const reportEmail = document.getElementById('report-email');
const reportReason = document.getElementById('report-reason');
const reportMessage = document.getElementById('report-message');
const reportError = document.getElementById('report-error');
const reportCancelBtn = document.getElementById('report-cancel-btn');
const reportFormContainer = document.getElementById('report-form-container');
const reportSuccessContainer = document.getElementById('report-success-container');
const reportCloseBtn = document.getElementById('report-close-btn');

let localStream;
let peerConnection;
let partnerId = null;
let currentFacingMode = 'user';
let isAudioMuted = false;
let isVideoDisabled = false;

// Status Display Helper
function updateStatus(state, message) {
    if (statusDiv) {
        statusDiv.innerText = message;
        if (state === 'connected') {
            statusDiv.style.display = 'none';
        } else {
            statusDiv.style.display = 'inline-flex';
        }
    }

    if (headerStatus && headerStatusText) {
        headerStatusText.innerText = state === 'connected' ? (partnerId ? 'Connected' : 'Ready') : message;
        headerStatus.className = 'vl-badge';
        if (state === 'connected') {
            headerStatus.classList.add('vl-badge-live');
        } else if (state === 'searching' || state === 'waiting') {
            headerStatus.classList.add('vl-badge-amber');
        } else if (state === 'disconnected') {
            headerStatus.classList.add('vl-badge-accent');
        } else {
            headerStatus.classList.add('vl-badge-subtle');
        }
    }
}

// Check if user is already in session
function initSession() {
    const storedUser = sessionStorage.getItem('valora_user');
    if (storedUser) {
        try {
            const userData = JSON.parse(storedUser);
            window.userName = userData.name;
            if (localLabel) localLabel.innerText = window.userName;
        } catch (e) {
            sessionStorage.removeItem('valora_user');
        }
    }
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initSession);
} else {
    initSession();
}

function validateModal() {
    if (!modalName || !modal18Confirm || !modalGender || !modalSubmit) return;
    const name = modalName.value.trim();
    const is18 = modal18Confirm.checked;
    const gender = modalGender.value;
    
    modalSubmit.disabled = !(name && is18 && gender);
}

if (modalName) modalName.addEventListener('input', validateModal);
if (modal18Confirm) modal18Confirm.addEventListener('change', validateModal);

genderBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        genderBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        if (modalGender) modalGender.value = btn.dataset.gender;
        validateModal();
    });
});

if (ageGateForm) {
    ageGateForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = modalName.value.trim();
        const gender = modalGender.value;
        const is18 = modal18Confirm.checked;
        
        if (!name || !is18 || !gender) {
            if (modalError) {
                modalError.innerText = "Please complete all fields.";
                modalError.classList.remove('hidden');
            }
            return;
        }
        
        sessionStorage.setItem('valora_user', JSON.stringify({ name, gender }));
        window.userName = name;
        if (localLabel) localLabel.innerText = name;
        
        ageGateModal.classList.add('hidden');
        startMedia();
    });
}

if (startBtn) {
    startBtn.onclick = () => {
        const storedUser = sessionStorage.getItem('valora_user');
        if (storedUser) {
            startMedia();
        } else {
            if (ageGateModal) ageGateModal.classList.remove('hidden');
        }
    };
}

async function startMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
        if (localVideo) localVideo.srcObject = localStream;
        if (startOverlay) startOverlay.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'inline-flex';
        if (chatToggleBtn) chatToggleBtn.style.display = 'inline-flex';
        findPartner();
    } catch (err) {
        console.error('Error accessing media devices:', err);
        alert('Camera and Microphone permissions are required to use VALORA Video Chat.');
    }
}

// Microphone Toggle
if (micBtn) {
    micBtn.onclick = () => {
        if (!localStream) return;
        const audioTracks = localStream.getAudioTracks();
        if (audioTracks.length > 0) {
            isAudioMuted = !isAudioMuted;
            audioTracks.forEach(track => {
                track.enabled = !isAudioMuted;
            });
            micBtn.classList.toggle('is-muted', isAudioMuted);
            micBtn.title = isAudioMuted ? 'Unmute Microphone' : 'Mute Microphone';
            micBtn.innerHTML = isAudioMuted ? 
                `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" x2="22" y1="2" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><line x1="12" x2="12" y1="19" y2="22"/></svg>` :
                `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`;
        }
    };
}

// Camera Video Toggle
if (camBtn) {
    camBtn.onclick = () => {
        if (!localStream) return;
        const videoTracks = localStream.getVideoTracks();
        if (videoTracks.length > 0) {
            isVideoDisabled = !isVideoDisabled;
            videoTracks.forEach(track => {
                track.enabled = !isVideoDisabled;
            });
            camBtn.classList.toggle('is-off', isVideoDisabled);
            camBtn.title = isVideoDisabled ? 'Enable Camera' : 'Disable Camera';
            camBtn.innerHTML = isVideoDisabled ?
                `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" x2="22" y1="2" y2="22"/><path d="m16 16 6 4V8l-6 4"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>` :
                `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>`;
        }
    };
}

// Report Logic
let lastReportTime = 0;

function openReportModal() {
    if (reportFormContainer) reportFormContainer.classList.remove('hidden');
    if (reportSuccessContainer) reportSuccessContainer.classList.add('hidden');
    if (reportForm) reportForm.reset();
    if (reportError) reportError.classList.add('hidden');
    if (reportModal) reportModal.classList.remove('hidden');
}

if (reportBtn) reportBtn.onclick = openReportModal;
if (headerReportBtn) headerReportBtn.onclick = openReportModal;

if (reportCancelBtn) {
    reportCancelBtn.onclick = () => {
        if (reportModal) reportModal.classList.add('hidden');
    };
}

if (reportCloseBtn) {
    reportCloseBtn.onclick = () => {
        if (reportModal) reportModal.classList.add('hidden');
    };
}

if (reportForm) {
    reportForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const now = Date.now();
        if (now - lastReportTime < 60000) {
            if (reportError) {
                reportError.innerText = "Please wait 60 seconds before reporting again.";
                reportError.classList.remove('hidden');
            }
            return;
        }

        const email = reportEmail.value.trim();
        const reason = reportReason.value;
        const message = reportMessage.value.trim();
        
        if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
            if (reportError) {
                reportError.innerText = "Please enter a valid email address.";
                reportError.classList.remove('hidden');
            }
            return;
        }
        
        if (!reason) {
            if (reportError) {
                reportError.innerText = "Please select a violation reason.";
                reportError.classList.remove('hidden');
            }
            return;
        }

        const reportedUserSocketId = partnerId || "none";

        try {
            const response = await fetch('/api/report', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    reporterEmail: email,
                    reason: reason,
                    message: message,
                    reportedUserSocketId: reportedUserSocketId
                })
            });

            if (!response.ok) {
                throw new Error('Network response was not ok');
            }

            lastReportTime = now;
            
            if (reportFormContainer) reportFormContainer.classList.add('hidden');
            if (reportSuccessContainer) reportSuccessContainer.classList.remove('hidden');
            
            // Automatically disconnect if connected
            if (partnerId) {
                clearChat();
                resetConnection();
                findPartner();
            }
        } catch (error) {
            if (reportError) {
                reportError.innerText = "Failed to submit report. Please try again.";
                reportError.classList.remove('hidden');
            }
        }
    });
}

// Chat Logic
function appendMessage(message, type) {
    if (!chatMessages) return;
    const emptyState = chatMessages.querySelector('.chat-empty-state');
    if (emptyState) emptyState.remove();

    const div = document.createElement('div');
    div.className = `chat-msg ${type}`;
    div.innerText = message;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendMessage() {
    if (!chatInput) return;
    const message = chatInput.value.trim();
    if (message && partnerId) {
        socket.emit('chat-message', { message, partnerId });
        appendMessage(message, 'sent');
        chatInput.value = '';
    }
}

if (chatSendBtn) chatSendBtn.onclick = sendMessage;
if (chatInput) {
    chatInput.onkeypress = (e) => {
        if (e.key === 'Enter') sendMessage();
    };
}

if (chatToggleBtn) {
    chatToggleBtn.onclick = () => {
        if (!chatPanel) return;
        const isActive = chatPanel.classList.toggle('active');
        chatToggleBtn.classList.toggle('active', isActive);
        if (videoMain) videoMain.classList.toggle('chat-active', isActive);
        if (isActive && chatInput) {
            chatInput.focus();
        }
    };
}

if (closeChat) {
    closeChat.onclick = () => {
        if (chatPanel) chatPanel.classList.remove('active');
        if (chatToggleBtn) chatToggleBtn.classList.remove('active');
        if (videoMain) videoMain.classList.remove('chat-active');
    };
}

function clearChat() {
    if (chatMessages) {
        chatMessages.innerHTML = `
            <div class="chat-empty-state">
                Messages are private and cleared when moving to the next partner.
            </div>
        `;
    }
}

function setChatEnabled(enabled) {
    if (chatInput) chatInput.disabled = !enabled;
    if (chatSendBtn) chatSendBtn.disabled = !enabled;
}

// Camera Flip
if (flipBtn) {
    flipBtn.onclick = async () => {
        currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
        console.log('Flipping camera to:', currentFacingMode);
        
        try {
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
            }

            const newStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: currentFacingMode } },
                audio: true
            });
            
            // Respect previous mute states
            if (isAudioMuted) {
                newStream.getAudioTracks().forEach(t => t.enabled = false);
            }
            if (isVideoDisabled) {
                newStream.getVideoTracks().forEach(t => t.enabled = false);
            }

            const newVideoTrack = newStream.getVideoTracks()[0];
            const newAudioTrack = newStream.getAudioTracks()[0];
            
            if (peerConnection) {
                const senders = peerConnection.getSenders();
                const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
                
                if (videoSender && newVideoTrack) await videoSender.replaceTrack(newVideoTrack);
                if (audioSender && newAudioTrack) await audioSender.replaceTrack(newAudioTrack);
            }
            
            localStream = newStream;
            if (localVideo) localVideo.srcObject = localStream;
        } catch (err) {
            console.error('Error flipping camera:', err);
            currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
            alert('Could not flip camera: ' + err.message);
        }
    };
}

if (nextBtn) {
    nextBtn.onclick = () => {
        clearChat();
        resetConnection();
        findPartner();
    };
}

function findPartner() {
    setChatEnabled(false);
    updateStatus('searching', 'Searching for stranger...');
    if (remoteVideo) remoteVideo.srcObject = null;
    if (remoteLabel) remoteLabel.innerText = 'Stranger';
    socket.emit('find-partner', { name: window.userName });
}

function resetConnection() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    partnerId = null;
    if (remoteVideo) remoteVideo.srcObject = null;
}

socket.on('waiting', () => {
    updateStatus('waiting', 'Waiting for stranger...');
});

socket.on('match-found', async (data) => {
    partnerId = data.partnerId;
    updateStatus('connected', 'Connected');
    if (remoteLabel) remoteLabel.innerText = data.partnerName || 'Stranger';
    if (chatToggleBtn) chatToggleBtn.style.display = 'inline-flex';
    setChatEnabled(true);
    
    createPeerConnection();

    if (data.initiator) {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('signal', { signal: offer });
    }
});

socket.on('signal', async (data) => {
    if (!peerConnection) createPeerConnection();

    if (data.signal.type === 'offer') {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('signal', { signal: answer });
    } else if (data.signal.type === 'answer') {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal));
    } else if (data.signal.candidate) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.signal));
        } catch (e) {
            console.error('Error adding ice candidate', e);
        }
    }
});

socket.on('chat-message', (data) => {
    appendMessage(data.message, 'received');
});

socket.on('partner-disconnected', () => {
    updateStatus('disconnected', 'Stranger disconnected');
    clearChat();
    resetConnection();
    setTimeout(() => {
        findPartner();
    }, 600);
});

function createPeerConnection() {
    peerConnection = new RTCPeerConnection(config);

    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }

    peerConnection.ontrack = (event) => {
        if (remoteVideo && remoteVideo.srcObject !== event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
        }
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('signal', { signal: event.candidate });
        }
    };

    peerConnection.onconnectionstatechange = () => {
        if (peerConnection && (peerConnection.connectionState === 'disconnected' || 
            peerConnection.connectionState === 'failed' || 
            peerConnection.connectionState === 'closed')) {
            clearChat();
            resetConnection();
            findPartner();
        }
    };
}
