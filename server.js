const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let waitingUser = null;

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("findPartner", () => {

        if (waitingUser && waitingUser !== socket.id) {
            const partner = waitingUser;
            waitingUser = null;

            socket.partner = partner;
            io.sockets.sockets.get(partner).partner = socket.id;

            io.to(socket.id).emit("matched", { partner });
            io.to(partner).emit("matched", { partner: socket.id });

            console.log("Matched:", socket.id, partner);

        } else {
            waitingUser = socket.id;
            socket.emit("waiting");
        }
    });

    socket.on("signal", ({ to, data }) => {
        io.to(to).emit("signal", {
            from: socket.id,
            data
        });
    });

    socket.on("skip", () => {
        const partner = socket.partner;

        if (partner) {
            io.to(partner).emit("partnerSkipped");
            const partnerSocket = io.sockets.sockets.get(partner);

            if (partnerSocket) {
                partnerSocket.partner = null;
            }

            socket.partner = null;
        }

        waitingUser = socket.id;
        socket.emit("waiting");
    });

    socket.on("disconnect", () => {
        if (waitingUser === socket.id) {
            waitingUser = null;
        }

        const partner = socket.partner;

        if (partner) {
            io.to(partner).emit("partnerDisconnected");

            const partnerSocket = io.sockets.sockets.get(partner);

            if (partnerSocket) {
                partnerSocket.partner = null;
            }
        }

        console.log("User disconnected:", socket.id);
    });
});

server.listen(3000, () => {
    console.log("Video chat running at http://localhost:3000");
});