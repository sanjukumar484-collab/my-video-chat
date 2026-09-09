const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static(path.join(__dirname, 'public')));

let waitingUser = null;

io.on('connection', (socket) => {

    socket.on('find-partner', () => {
        findPartner(socket);
    });

    socket.on('next-partner', () => {
        disconnectPartner(socket);
        findPartner(socket);
    });

    socket.on('signal', (data) => {
        if (data.target) {
            io.to(data.target).emit('signal', {
                sender: socket.id,
                signal: data.signal
            });
        }
    });

    socket.on('send-message', (msg) => {
        if (socket.partnerId) {
            io.to(socket.partnerId).emit('receive-message', msg);
        }
    });

    socket.on('disconnect', () => {
        if (waitingUser && waitingUser.id === socket.id) {
            waitingUser = null;
        }
        disconnectPartner(socket);
    });

    function findPartner(sock) {
        if (sock.partnerId) return;

        // अगर कोई यूजर पहले से वेट कर रहा है और वो खुद वही यूजर नहीं है
        if (waitingUser && waitingUser.id !== sock.id) {
            let partner = waitingUser;
            waitingUser = null;

            sock.partnerId = partner.id;
            partner.partnerId = sock.id;

            sock.emit('match-found', { partnerId: partner.id, initiate: true });
            partner.emit('match-found', { partnerId: sock.id, initiate: false });
        } else {
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
        if (waitingUser && waitingUser.id === sock.id) {
            waitingUser = null;
        }
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
