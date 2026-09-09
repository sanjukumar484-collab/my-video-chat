const socket = io();

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

const startBtn = document.getElementById("startBtn");
const muteBtn = document.getElementById("muteBtn");
const cameraBtn = document.getElementById("cameraBtn");
const skipBtn = document.getElementById("skipBtn");

const statusText = document.getElementById("status");

let localStream;
let peerConnection;
let partnerId;

const configuration = {
    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302"
        }
    ]
};

async function startCamera() {
    localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    });

    localVideo.srcObject = localStream;

    muteBtn.disabled = false;
    cameraBtn.disabled = false;
}

async function createConnection(isCaller) {
    peerConnection = new RTCPeerConnection(configuration);

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    peerConnection.ontrack = event => {
        remoteVideo.srcObject = event.streams[0];
    };

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.emit("signal", {
                to: partnerId,
                data: {
                    type: "candidate",
                    candidate: event.candidate
                }
            });
        }
    };

    if (isCaller) {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        socket.emit("signal", {
            to: partnerId,
            data: {
                type: "offer",
                offer
            }
        });
    }
}

startBtn.onclick = async () => {
    try {
        await startCamera();
        statusText.innerText = "Finding someone...";

        startBtn.disabled = true;
        skipBtn.disabled = false;

        socket.emit("findPartner");
    } catch (error) {
        console.error(error);
        statusText.innerText = "Camera/Microphone permission is required.";
    }
};

socket.on("waiting", () => {
    statusText.innerText = "Waiting for another person...";
});

socket.on("matched", async ({ partner }) => {
    partnerId = partner;
    statusText.innerText = "Connected!";

    const isCaller = socket.id < partnerId;
    await createConnection(isCaller);
});

socket.on("signal", async ({ from, data }) => {
    partnerId = from;

    if (!peerConnection) {
        await createConnection(false);
    }

    if (data.type === "offer") {
        await peerConnection.setRemoteDescription(
            new RTCSessionDescription(data.offer)
        );

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        socket.emit("signal", {
            to: from,
            data: {
                type: "answer",
                answer
            }
        });
    } else if (data.type === "answer") {
        await peerConnection.setRemoteDescription(
            new RTCSessionDescription(data.answer)
        );
    } else if (data.type === "candidate") {
        try {
            await peerConnection.addIceCandidate(
                new RTCIceCandidate(data.candidate)
            );
        } catch (error) {
            console.error(error);
        }
    }
});

skipBtn.onclick = () => {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    remoteVideo.srcObject = null;
    partnerId = null;

    statusText.innerText = "Finding next person...";
    socket.emit("skip");
};

socket.on("partnerSkipped", () => {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    remoteVideo.srcObject = null;
    statusText.innerText = "The other person skipped. Finding someone...";
});

// Auto Reconnect ऑन पार्टनर डिस्कनेक्ट
socket.on("partnerDisconnected", () => {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    remoteVideo.srcObject = null;
    partnerId = null;
    statusText.innerText = "Partner disconnected. Finding new user...";
    socket.emit("findPartner");
});

muteBtn.onclick = () => {
    const track = localStream.getAudioTracks()[0];
    track.enabled = !track.enabled;
    muteBtn.innerText = track.enabled ? "🎤 Mute" : "🔇 Unmute";
};

cameraBtn.onclick = () => {
    const track = localStream.getVideoTracks()[0];
    track.enabled = !track.enabled;
    cameraBtn.innerText = track.enabled ? "📷 Camera" : "🚫 Camera";
};