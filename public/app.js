const socket = io();

let localStream;
let remoteStream;
let peerConnection;

const config = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startBtn = document.getElementById('startBtn');
const nextBtn = document.getElementById('nextBtn');
const sendBtn = document.getElementById('sendBtn');
const messageInput = document.getElementById('messageInput');
const chatBox = document.getElementById('chat-box');

// 1. कैमरा स्टार्ट करें
async function initCamera() {
    if (!localStream) {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;
        } catch (err) {
            alert('Camera and Microphone permissions are required!');
            console.error(err);
        }
    }
}

// 2. कनेक्शन रीसेट (पुराने पार्टनर को डिस्कनेक्ट करने के लिए)
function resetConnection() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    remoteVideo.srcObject = null;
}

// 3. WebRTC Peer Connection बनाना
function createPeerConnection(partnerId) {
    peerConnection = new RTCPeerConnection(config);

    // लोकल स्ट्रीम ट्रैक जोड़ें
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }

    // रिमोट वीडियो रिसीव करें
    peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
        }
    };

    // ICE Candidates भेजना
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('signal', { target: partnerId, signal: { candidate: event.candidate } });
        }
    };
}

// 4. Buttons Events
startBtn.addEventListener('click', async () => {
    await initCamera();
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

// 5. Messaging Logic
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

// 6. Socket Handling
socket.on('match-found', async ({ partnerId, initiate }) => {
    appendMessage('System', 'Connected with a stranger!');
    createPeerConnection(partnerId);

    if (initiate) {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('signal', { target: partnerId, signal: { offer: offer } });
    }
});

socket.on('signal', async ({ signal }) => {
    if (!peerConnection) return;

    if (signal.offer) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('signal', { target: socket.partnerId, signal: { answer: answer } });
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
