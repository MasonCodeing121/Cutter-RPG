const http = require("http");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");

function serveStatic(req, res) {
    let filePath = path.join(__dirname, req.url === "/" ? "index.html" : req.url);
    const ext = path.extname(filePath);
    const mimeTypes = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
    };
    const contentType = mimeTypes[ext] || "application/octet-stream";

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end("Not found");
            return;
        }
        res.writeHead(200, { "Content-Type": contentType });
        res.end(data);
    });
}

const server = http.createServer(serveStatic);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

let rooms = {};

io.on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on("join-room", (roomName) => {
        socket.join(roomName);
        if (!rooms[roomName]) rooms[roomName] = {};
        console.log(`User ${socket.id} joined room: ${roomName}`);
    });

    socket.on("move", (data) => {
        const roomName = Array.from(socket.rooms)[1];
        if (roomName && rooms[roomName]) {
            rooms[roomName][socket.id] = data;
            io.to(roomName).emit("update-players", rooms[roomName]);
        }
    });

    socket.on("disconnecting", () => {
        socket.rooms.forEach(roomName => {
            if (rooms[roomName] && rooms[roomName][socket.id]) {
                delete rooms[roomName][socket.id];
                io.to(roomName).emit("update-players", rooms[roomName]);
                if (Object.keys(rooms[roomName]).length === 0) delete rooms[roomName];
            }
        });
        console.log(`User disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
