const http = require("http");
const { Server } = require("socket.io");

// 1. Create the HTTP server
const server = http.createServer();

// 2. Initialize Socket.io with CORS enabled
// This allows your index.html (the client) to talk to this server 
// even if they are hosted on different websites.
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// This object will store player data grouped by room
// Structure: { "Room1": { "socketId": {x, y, dir...} }, "Room2": {...} }
let rooms = {}; 

io.on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Handle joining a room
    socket.on("join-room", (roomName) => {
        socket.join(roomName);
        
        if (!rooms[roomName]) {
            rooms[roomName] = {};
        }

        console.log(`User ${socket.id} joined room: ${roomName}`);
    });

    // Handle player movement
    socket.on("move", (data) => {
        // Find which room the player is currently in
        // (Socket.io rooms include the socket's own ID as the first room, so we take the second)
        const roomName = Array.from(socket.rooms)[1]; 

        if (roomName && rooms[roomName]) {
            // Update this specific player's data in the room
            rooms[roomName][socket.id] = data;

            // Broadcast the updated player list ONLY to people in that specific room
            io.to(roomName).emit("update-players", rooms[roomName]);
        }
    });

    // Handle disconnecting
    socket.on("disconnecting", () => {
        // Before the socket fully leaves, remove them from any rooms they were in
        socket.rooms.forEach(roomName => {
            if (rooms[roomName] && rooms[roomName][socket.id]) {
                delete rooms[roomName][socket.id];
                
                // Notify remaining players in the room to remove the ghost character
                io.to(roomName).emit("update-players", rooms[roomName]);
                
                // Optional: Delete the room if it's empty to save memory
                if (Object.keys(rooms[roomName]).length === 0) {
                    delete rooms[roomName];
                }
            }
        });
        console.log(`User disconnected: ${socket.id}`);
    });
});

// 3. 
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
