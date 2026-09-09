const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public')); // आपकी फ्रंटएंड फाइल्स (HTML/JS) के लिए

let waitingUser = null;
const activePartners = {}; // कौन किससे जुड़ा है, उसका रिकॉर्ड रखने के लिए

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // पार्टनर खोजना शुरू करें
    socket.on('find-partner', () => {
        handleMatch(socket);
    });

    // अगला पार्टनर (Next) ढूंढना
    socket.on('next-partner', () => {
        disconnectPartner(socket);
        handleMatch(socket);
    });

    // WebRTC सिग्नलिंग (Offer, Answer, ICE Candidates को आगे भेजना)
    socket.on('signal', ({ target, signal }) => {
        io.to(target).emit('signal', { sender: socket.id, signal });
    });

    // चैट मैसेज भेजना
    socket.on('send-message', (msg) => {
        const partnerId = activePartners[socket.id];
        if (partnerId) {
            io.to(partnerId).emit('receive-message', msg);
        }
    });

    // यूजर के कटने या बंद होने पर
    socket.on('disconnect', () => {
        if (waitingUser === socket.id) {
            waitingUser = null;
        }
        disconnectPartner(socket);
        console.log('User disconnected:', socket.id);
    });
});

// पार्टनर मिलाने का फंक्शन
function handleMatch(socket) {
    if (waitingUser && waitingUser !== socket.id) {
        const partnerId = waitingUser;
        waitingUser = null;

        // दोनों को आपस में लिंक करें
        activePartners[socket.id] = partnerId;
        activePartners[partnerId] = socket.id;

        // दोनों को बताएं कि मैच मिल गया है
        socket.emit('match-found', { partnerId: partnerId, initiate: true });
        io.to(partnerId).emit('match-found', { partnerId: socket.id, initiate: false });
    } else {
        waitingUser = socket.id;
    }
}

// पुराने पार्टनर को हटाने का फंक्शन
function disconnectPartner(socket) {
    const partnerId = activePartners[socket.id];
    if (partnerId) {
        io.to(partnerId).emit('partner-disconnected');
        delete activePartners[partnerId];
        delete activePartners[socket.id];
    }
    if (waitingUser === socket.id) {
        waitingUser = null;
    }
}

server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
