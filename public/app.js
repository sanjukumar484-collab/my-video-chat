const socket = io();

let localStream;
let peerConnection;
let currentPartnerId = null;

// TURN और STUN सर्वर्स (अलग-अलग नेटवर्क/फ़ायरवॉल के बीच वीडियो स्ट्रीम चालू रखने के लिए)
const config = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        {
            urls: "turn:openrelay.metered.ca:80",
            username: "openrelayproject",
            credential: "openrelayproject"
        },
        {
            urls: "turn:openrelay.metered.ca:443",
            username: "openrelayproject",
            credential: "openrelayproject"
        },
        {
            urls: "turn:openrelay.metered.ca:443?transport=tcp",
            username: "openrelayproject",
            credential: "openrelayproject"
        }
    ]
};

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startBtn = document.getElementById('startBtn');
const nextBtn = document.getElementById('nextBtn');
const sendBtn = document.getElementById('sendBtn');
const messageInput = document.getElementById('messageInput');
const chatBox = document.getElementById('chat-box');

// 1. कैमरा और माइक चालू करना
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

// 2. पुराना कनेक्शन रीसेट करना
function resetConnection() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    remoteVideo.srcObject = null;
    currentPartnerId = null;
}

// 3. WebRTC Peer Connection बनाना
function createPeerConnection(partnerId) {
    peerConnection = new RTCPeerConnection(config);

    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }

    peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
        }
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate && partnerId) {
            socket.emit('signal', { target: partnerId, signal: { candidate: event.candidate } });
        }
    };
}

// 4. बटन इवेंट्स
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

// 5. टेक्स्ट मैसेजिंग
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

// 6. सॉकेट सिग्नलिंग और डेटा शेयरिंग
socket.on('match-found', async ({ partnerId, initiate }) => {
    appendMessage('System', 'Connected with a stranger!');
    currentPartnerId = partnerId;
    createPeerConnection(partnerId);

    if (initiate) {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('signal', { target: partnerId, signal: { offer: offer } });
    }
});

socket.on('signal', async ({ sender, signal }) => {
    if (!peerConnection && sender) {
        currentPartnerId = sender;
        createPeerConnection(sender);
    }

    const targetId = sender || currentPartnerId;

    if (signal.offer) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('signal', { target: targetId, signal: { answer: answer } });
    } else if (signal.answer) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.answer));
    } else if (signal.candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
    }
});

socket.on('receive-message', (msg) => {
    appendMessage('Stranger', msg);
});

socket.on('partner-disconnected', () => {
    appendMessage('System', 'Stranger disconnected.');
    resetConnection();
});
