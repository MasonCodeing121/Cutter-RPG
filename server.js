const io = require("socket.io")(process.env.PORT || 3000, {
    cors: { origin: "*" } // Allows your local file to connect
});

let rooms = {}; // Stores players by room: { roomName: { socketId: data } }

io.on("connection", (socket) => {
    socket.on("join-room", (roomName) => {
        socket.join(roomName);
        if (!rooms[roomName]) rooms[roomName] = {};
        console.log(`User ${socket.id} joined room: ${roomName}`);
    });

    socket.on("move", (data) => {
        // Find which room this socket is in
        const roomName = Array.from(socket.rooms)[1]; 
        if (roomName && rooms[roomName]) {
            rooms[roomName][socket.id] = data;
            // Send updated player list to everyone in that room
            io.to(roomName).emit("update-players", rooms[roomName]);
        }
    });

    socket.on("disconnecting", () => {
        socket.rooms.forEach(roomName => {
            if (rooms[roomName]) {
                delete rooms[roomName][socket.id];
                io.to(roomName).emit("update-players", rooms[roomName]);
            }
        });
    });
});
