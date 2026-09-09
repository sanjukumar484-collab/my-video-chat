const socket = io();

let localStream;
let peerConnection;
let currentPartnerId = null;
let pendingCandidates = [];

// Metered Static TURN Configuration (100% Working Format)
const config = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        {
            urls: [
                "turn:global.relay.metered.ca:80",
                "turn:global.relay.metered.ca:443",
                "turn:global.relay.metered.ca:443?transport=tcp"
            ],
            username: "0ba08670c5ee918eb64ebbc3",
            credential: "8I+9UTo9sN0fI/4v"
        }
    ],
    iceCandidatePoolSize: 10
};

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startBtn = document.getElementById('startBtn');
const nextBtn = document.getElementById('nextBtn');
const sendBtn = document.getElementById('sendBtn');
const messageInput = document.getElementById('messageInput');
const chatBox = document.getElementById('chat-box');

async function initCamera() {
    if (!localStream) {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;
        } catch (err) {
            alert('Camera and Microphone access required!');
            console.error(err);
        }
    }
}

function resetConnection() {
    if (peerConnection) {
        peerConnection.ontrack = null;
        peerConnection.onicecandidate = null;
        peerConnection.close();
        peerConnection = null;
    }
    remoteVideo.srcObject = null;
    currentPartnerId = null;
    pendingCandidates = [];
}

function createPeerConnection(partnerId) {
    peerConnection = new RTCPeerConnection(config);

    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }

    peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
            if (remoteVideo.srcObject !== event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
                remoteVideo.play().catch(e => console.log("Auto-play error:", e));
            }
        }
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate && currentPartnerId) {
            socket.emit('signal', { target: currentPartnerId, signal: { candidate: event.candidate } });
        }
    };

    peerConnection.oniceconnectionstatechange = () => {
        console.log("ICE Connection State:", peerConnection.iceConnectionState);
    };
}

startBtn.addEventListener('click', async () => {
    await initCamera();
    resetConnection();
    appendMessage('System', 'Searching for a stranger...');
    socket.emit('find-partner');
});

nextBtn.addEventListener('click', async () => {
    resetConnection();
    await initCamera();
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
    if (text !== '') {
        appendMessage('You', text);
        socket.emit('send-message', text);
        messageInput.value = '';
    }
}

function appendMessage(sender, msg) {
    const p = document.createElement('p');
    p.style.margin = '5px 0';
    p.innerHTML = `<strong>${sender}:</strong> ${msg}`;
    chatBox.appendChild(p);
    chatBox.scrollTop = chatBox.scrollHeight;
}

socket.on('match-found', async ({ partnerId, initiate }) => {
    appendMessage('System', 'Connected with a stranger!');
    currentPartnerId = partnerId;
    createPeerConnection(partnerId);

    if (initiate) {
        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('signal', { target: partnerId, signal: { offer: offer } });
        } catch (err) {
            console.error("Offer error:", err);
        }
    }
});

socket.on('signal', async ({ sender, signal }) => {
    if (!peerConnection) {
        currentPartnerId = sender;
        createPeerConnection(sender);
    }

    try {
        if (signal.offer) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.offer));
            
            while (pendingCandidates.length) {
                const cand = pendingCandidates.shift();
                await peerConnection.addIceCandidate(cand);
            }

            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('signal', { target: sender, signal: { answer: answer } });

        } else if (signal.answer) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.answer));

        } else if (signal.candidate) {
            const candidate = new RTCIceCandidate(signal.candidate);
            if (peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
                await peerConnection.addIceCandidate(candidate);
            } else {
                pendingCandidates.push(candidate);
            }
        }
    } catch (err) {
        console.error("Signal error:", err);
    }
});

socket.on('receive-message', (msg) => {
    appendMessage('Stranger', msg);
});

socket.on('partner-disconnected', () => {
    appendMessage('System', 'Stranger disconnected.');
    resetConnection();
});
