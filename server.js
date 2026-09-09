const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling'],
    pingInterval: 25000,
    pingTimeout: 20000
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true, service: 'random-video-chat' }));

let waitingUser = null;

io.on('connection', (socket) => {
    socket.partnerId = null;

    socket.on('find-partner', () => findPartner(socket));

    socket.on('next-partner', () => {
        disconnectPartner(socket);
        findPartner(socket);
    });

    socket.on('signal', (data) => {
        if (!data?.target || !data?.signal) return;
        const target = io.sockets.sockets.get(data.target);
        // Only relay signaling data to the socket's current partner.
        if (!target || socket.partnerId !== target.id) return;
        target.emit('signal', { sender: socket.id, signal: data.signal });
    });

    socket.on('send-message', (msg) => {
        if (!socket.partnerId) return;
        const partner = io.sockets.sockets.get(socket.partnerId);
        if (partner) partner.emit('receive-message', String(msg).slice(0, 2000));
    });

    socket.on('disconnect', () => {
        if (waitingUser?.id === socket.id) waitingUser = null;
        disconnectPartner(socket);
    });

    function findPartner(sock) {
        if (sock.partnerId) return;

        if (waitingUser && waitingUser.id !== sock.id && io.sockets.sockets.has(waitingUser.id)) {
            const partner = waitingUser;
            waitingUser = null;

            sock.partnerId = partner.id;
            partner.partnerId = sock.id;

            // Exactly one side initiates the WebRTC offer.
            sock.emit('match-found', { partnerId: partner.id, initiate: true });
            partner.emit('match-found', { partnerId: sock.id, initiate: false });
        } else {
            waitingUser = sock;
        }
    }

    function disconnectPartner(sock) {
        const partnerId = sock.partnerId;
        if (partnerId) {
            const partnerSocket = io.sockets.sockets.get(partnerId);
            if (partnerSocket) {
                partnerSocket.partnerId = null;
                partnerSocket.emit('partner-disconnected');
            }
            sock.partnerId = null;
        }
        if (waitingUser?.id === sock.id) waitingUser = null;
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
