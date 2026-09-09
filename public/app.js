const socket = io({ transports: ['websocket', 'polling'] });

let localStream = null;
let peerConnection = null;
let currentPartnerId = null;
let pendingCandidates = [];
let isInitiator = false;
let makingOffer = false;
let ignoreOffer = false;
let restartInProgress = false;

// WebRTC ICE configuration.
// TURN is essential when the two users are on different networks/NATs.
const config = {
    iceServers: [
        { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
        {
            urls: [
                'turn:global.relay.metered.ca:80?transport=udp',
                'turn:global.relay.metered.ca:80?transport=tcp',
                'turn:global.relay.metered.ca:443?transport=tcp',
                'turns:global.relay.metered.ca:443?transport=tcp'
            ],
            username: '0ba08670c5ee918eb64ebbc3',
            credential: '8I+9UTo9sN0fI/4v'
        }
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
};

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startBtn = document.getElementById('startBtn');
const nextBtn = document.getElementById('nextBtn');
const sendBtn = document.getElementById('sendBtn');
const messageInput = document.getElementById('messageInput');
const chatBox = document.getElementById('chat-box');

async function initCamera() {
    if (localStream) return true;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        localVideo.srcObject = localStream;
        await localVideo.play().catch(() => {});
        return true;
    } catch (err) {
        console.error('getUserMedia failed:', err);
        alert('Camera and Microphone access required!');
        return false;
    }
}

function resetConnection(keepPartner = false) {
    if (peerConnection) {
        peerConnection.ontrack = null;
        peerConnection.onicecandidate = null;
        peerConnection.onicecandidateerror = null;
        peerConnection.onconnectionstatechange = null;
        peerConnection.oniceconnectionstatechange = null;
        peerConnection.onsignalingstatechange = null;
        try { peerConnection.close(); } catch (_) {}
        peerConnection = null;
    }
    remoteVideo.srcObject = null;
    pendingCandidates = [];
    makingOffer = false;
    ignoreOffer = false;
    restartInProgress = false;
    if (!keepPartner) currentPartnerId = null;
}

function sendSignal(target, signal) {
    if (!target || !socket.connected) return;
    socket.emit('signal', { target, signal });
}

function createPeerConnection(partnerId) {
    if (peerConnection) resetConnection(true);

    currentPartnerId = partnerId;
    peerConnection = new RTCPeerConnection(config);

    if (localStream) {
        for (const track of localStream.getTracks()) {
            peerConnection.addTrack(track, localStream);
        }
    }

    peerConnection.ontrack = async (event) => {
        const stream = event.streams?.[0];
        if (!stream) return;
        remoteVideo.srcObject = stream;
        remoteVideo.muted = false;
        try { await remoteVideo.play(); } catch (e) {
            console.warn('Remote video autoplay blocked:', e);
        }
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate && currentPartnerId) {
            sendSignal(currentPartnerId, { candidate: event.candidate });
        }
    };

    peerConnection.onicecandidateerror = (event) => {
        console.warn('ICE candidate error:', event.errorCode, event.errorText, event.url);
    };

    peerConnection.oniceconnectionstatechange = async () => {
        if (!peerConnection) return;
        const state = peerConnection.iceConnectionState;
        console.log('ICE connection state:', state);

        if (state === 'connected' || state === 'completed') {
            restartInProgress = false;
            appendMessage('System', 'Video connection established.');
        } else if (state === 'failed') {
            await restartIce();
        } else if (state === 'disconnected') {
            // Give ICE a moment to recover before restarting.
            setTimeout(async () => {
                if (peerConnection && peerConnection.iceConnectionState === 'disconnected') {
                    await restartIce();
                }
            }, 2500);
        }
    };

    peerConnection.onconnectionstatechange = () => {
        if (!peerConnection) return;
        console.log('Peer connection state:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'failed') restartIce();
    };

    peerConnection.onsignalingstatechange = () => {
        if (peerConnection) console.log('Signaling state:', peerConnection.signalingState);
    };

    return peerConnection;
}

async function restartIce() {
    if (!peerConnection || !currentPartnerId || !isInitiator || restartInProgress) return;
    restartInProgress = true;
    try {
        console.log('Starting ICE restart...');
        const offer = await peerConnection.createOffer({ iceRestart: true });
        await peerConnection.setLocalDescription(offer);
        sendSignal(currentPartnerId, { offer: peerConnection.localDescription, iceRestart: true });
    } catch (err) {
        console.error('ICE restart failed:', err);
    } finally {
        setTimeout(() => { restartInProgress = false; }, 5000);
    }
}

async function flushPendingCandidates() {
    if (!peerConnection?.remoteDescription) return;
    while (pendingCandidates.length) {
        const candidate = pendingCandidates.shift();
        try { await peerConnection.addIceCandidate(candidate); }
        catch (err) { console.warn('Queued ICE candidate failed:', err); }
    }
}

startBtn.addEventListener('click', async () => {
    if (!(await initCamera())) return;
    resetConnection();
    appendMessage('System', 'Searching for a stranger...');
    socket.emit('find-partner');
});

nextBtn.addEventListener('click', async () => {
    resetConnection();
    if (!(await initCamera())) return;
    chatBox.innerHTML = '';
    appendMessage('System', 'Finding a new stranger...');
    socket.emit('next-partner');
});

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !currentPartnerId) return;
    appendMessage('You', text);
    socket.emit('send-message', text);
    messageInput.value = '';
}

function appendMessage(sender, msg) {
    const p = document.createElement('p');
    p.style.margin = '5px 0';
    const strong = document.createElement('strong');
    strong.textContent = `${sender}: `;
    p.appendChild(strong);
    p.appendChild(document.createTextNode(String(msg)));
    chatBox.appendChild(p);
    chatBox.scrollTop = chatBox.scrollHeight;
}

socket.on('connect', () => console.log('Signaling connected:', socket.id));
socket.on('disconnect', () => console.warn('Signaling disconnected'));

socket.on('match-found', async ({ partnerId, initiate }) => {
    appendMessage('System', 'Connected with a stranger!');
    currentPartnerId = partnerId;
    isInitiator = !!initiate;
    createPeerConnection(partnerId);

    if (isInitiator) {
        try {
            makingOffer = true;
            const offer = await peerConnection.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
            await peerConnection.setLocalDescription(offer);
            sendSignal(partnerId, { offer: peerConnection.localDescription });
        } catch (err) {
            console.error('Offer error:', err);
        } finally {
            makingOffer = false;
        }
    }
});

socket.on('signal', async ({ sender, signal }) => {
    try {
        if (!currentPartnerId) currentPartnerId = sender;
        if (currentPartnerId !== sender) return;
        if (!peerConnection) createPeerConnection(sender);

        if (signal.candidate) {
            const candidate = new RTCIceCandidate(signal.candidate);
            if (peerConnection.remoteDescription?.type) {
                await peerConnection.addIceCandidate(candidate);
            } else {
                pendingCandidates.push(candidate);
            }
            return;
        }

        if (signal.offer) {
            const offerCollision = makingOffer || peerConnection.signalingState !== 'stable';
            ignoreOffer = !isInitiator && offerCollision;
            if (ignoreOffer) return;

            await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.offer));
            await flushPendingCandidates();

            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            sendSignal(sender, { answer: peerConnection.localDescription });
            return;
        }

        if (signal.answer) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.answer));
            await flushPendingCandidates();
        }
    } catch (err) {
        console.error('Signal/WebRTC error:', err);
    }
});

socket.on('receive-message', (msg) => appendMessage('Stranger', msg));

socket.on('partner-disconnected', () => {
    appendMessage('System', 'Stranger disconnected.');
    resetConnection();
});
