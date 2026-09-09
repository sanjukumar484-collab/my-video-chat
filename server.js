const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static(path.join(__dirname, 'public')));

let waitingUser = null; // ऑनलाइन यूज़र का इंतज़ार करने के लिए

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // पार्टनर ढूंढने का लॉजिक
    socket.on('find-partner', () => {
        findPartner(socket);
    });

    // Next Stranger बटन दबाने पर
    socket.on('next-partner', () => {
        disconnectPartner(socket);
        findPartner(socket);
    });

    // WebRTC सिग्नलिंग (Offer, Answer, ICE Candidates शेयर करना)
    socket.on('signal', (data) => {
        io.to(data.target).emit('signal', {
            sender: socket.id,
            signal: data.signal
        });
    });

    // टेक्स्ट मैसेज भेजना
    socket.on('send-message', (msg) => {
        if (socket.partnerId) {
            io.to(socket.partnerId).emit('receive-message', msg);
        }
    });

    // डिस्कनेक्ट होने पर
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (waitingUser === socket) {
            waitingUser = null;
        }
        disconnectPartner(socket);
    });

    function findPartner(sock) {
        if (sock.partnerId) return; // अगर पहले से कनेक्टेड है तो कुछ न करें

        if (waitingUser && waitingUser.id !== sock.id) {
            // कोई यूज़र पहले से इंतज़ार कर रहा है - दोनों को कनेक्ट करें
            let partner = waitingUser;
            waitingUser = null;

            sock.partnerId = partner.id;
            partner.partnerId = sock.id;

            sock.emit('match-found', { partnerId: partner.id, initiate: true });
            partner.emit('match-found', { partnerId: sock.id, initiate: false });
        } else {
            // कोई इंतज़ार नहीं कर रहा, इस यूज़र को वेटिंग में रखें
            waitingUser = sock;
        }
    }

    function disconnectPartner(sock) {
        if (sock.partnerId) {
            io.to(sock.partnerId).emit('partner-disconnected');
            const partnerSocket = io.sockets.sockets.get(sock.partnerId);
            if (partnerSocket) {
                partnerSocket.partnerId = null;
            }
            sock.partnerId = null;
        }
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
