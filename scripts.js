const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
canvas.width = 600; canvas.height = 600;
ctx.imageSmoothingEnabled = false;
document.body.appendChild(canvas);

const SHEET_WIDTH = 236;
const SHEET_HEIGHT = 315;
const SLIME_FRAME_W = SHEET_WIDTH / 3; // 78.66...
const SLIME_FRAME_H = SHEET_HEIGHT / 4; // 78.75

// --- Socket.io Connection ---
// --- Socket.io Setup ---
const socket = io("https://your-socket-server.onrender.com"); 
let remotePlayers = {}; 

socket.on('update-players', (data) => {
    remotePlayers = data;
    // Remove ourselves so we don't draw a "ghost" of our own character
    delete remotePlayers[socket.id]; 
});

function joinRoom(roomName) {
    socket.emit('join-room', roomName);
    // Note: Use your existing initTrees function here
    initTrees(Math.random()); 
    gameState = "GAME";
    console.log("Joined Room: " + roomName);
}

// Listen for the server sending us other players' data
socket.on('update-players', (data) => {
    remotePlayers = data;
    // We remove ourselves from this list so we don't draw our own "ghost"
    delete remotePlayers[socket.id];
});




// --- Socket.io Setup ---
const socket = io("https://your-socket-server.onrender.com"); 
let remotePlayers = {}; 

socket.on('update-players', (data) => {
    remotePlayers = data;
    // Remove ourselves so we don't draw a "ghost" of our own character
    delete remotePlayers[socket.id]; 
});




function hostOrJoin(roomName) {
    // 1. Initialize Peer with the typed Room Name (Attempt to be the Host)
    peer = new Peer(roomName);

    peer.on('open', (id) => {
        console.log("Room Address Active: " + id);
        // The Host needs a world to play in!
        initTrees(Math.random()); 
        
        // IMPORTANT: This line switches the screen from Menu to Game
        gameState = "GAME"; 
    });

    // 2. If the name is already taken, it means a room exists. We "Join" it.
    peer.on('error', (err) => {
        if (err.type === 'id-taken') {
            console.log("Room exists. Joining...");
            
            // Get a random ID for ourselves as a Guest
            peer = new Peer(); 
            
            peer.on('open', () => {
                // Connect to the Host's room name
                conn = peer.connect(roomName);
                
                // When the connection is established, start the game
                conn.on('open', () => {
                    setupNetListeners(conn);
                    gameState = "GAME"; // Switch screen to game for the Guest
                    console.log("Connected to Host!");
                });
            });
        } else {
            console.error("Peer Error: ", err.type);
            alert("Connection error: " + err.type);
        }
    });

    // 3. Listen for people joining US (If we are the Host)
    peer.on('connection', (newConn) => {
        conn = newConn;
        setupNetListeners(conn);
        console.log("A friend has joined your room!");
        
        // Ensure we stay in the game state
        gameState = "GAME"; 
    });
}




function setupNetListeners(connection) {
    connection.on('data', (data) => {
        if (data.type === 'sync') {
            remotePlayers[connection.peer] = data.payload;
        }
    });
}

// Call this inside your animate() loop to send your data
function broadcastMovement() {
    if (socket && socket.connected) {
        socket.emit('move', {
            x: camera.x, 
            y: camera.y, 
            dir: player.direction, 
            moving: player.isMoving 
        });
    }
}




// --- 1. Assets & Loading ---
const assetPaths = {
    sprite: "images/image.png", axe: "images/axe.png", log: "images/log.png",
    grass: "images/grass.jpg", tree: "images/tree.png", stump: "images/c_tree.png",
    shop: "images/shop.png", desk: "images/desk.png", background: "images/t_background.png",
    house: "images/house.png", shovel: "images/shovel.png", questGiver: "images/questGiver1.png",
    slime: "images/slime_spritesheet.png"
};
// Replace your old quest variables with this
const questList = [
    { 
        id: 1, 
        text: "Greetings! Bring me 5 logs for a prize.", 
        target: 5, 
        reward: 150, 
        type: "WOOD", 
        doneText: "Elder Oak: Amazing! Here is 150 gold." 
    },
    { 
        id: 2, 
        text: "The forest slimes are restless. Slay 3 of them!", 
        target: 3, 
        reward: 300, 
        type: "MOBS", 
        doneText: "Elder Oak: You are a true warrior. Take this gold." 
    },
    { 
        id: 3, 
        text: "I need 20 logs to repair my roots. Can you help?", 
        target: 20, 
        reward: 500, 
        type: "WOOD", 
        doneText: "Elder Oak: My roots feel strong again! Thank you." 
    }
];

const MAX_SLIMES = 10;
let slimeSpawnTimer = 0;


let currentQuestIndex = 0; // Tracks which quest we are on
let questProgress = 0;     // Tracks progress (logs collected or mobs killed)


const images = {};
let grassPattern, gridCellSize = 0, loadedCount = 0;
const totalAssets = Object.keys(assetPaths).length;

function loadAssets(callback) {
    for (let key in assetPaths) {
        images[key] = new Image();
        images[key].onload = () => {
            loadedCount++;
            if (key === 'grass') grassPattern = ctx.createPattern(images.grass, 'repeat');
            if (key === 'sprite') gridCellSize = images.sprite.width / 4;
            if (loadedCount === totalAssets) callback();
        };
        images[key].src = assetPaths[key];
    }
}

// --- 2. Game State & Variables ---
let gameState = "MENU"; 
let currentSaveSlot = null, currentWorldSeed = 0;
let trees = [], houses = [], currentRoom = "forest", showShopGUI = false, gameFrame = 0;
const stagger = 8, keys = {};
let typingName = "", scrollY = 0, selectedWorld = null;

let waypoint = null; 
const miniMapSize = 130;
const miniMapScale = 0.04; 

let selectedSlot = 0; 
let mouseWorldX = 0, mouseWorldY = 0;

const btnNew = { x: 200, y: 250, w: 200, h: 50, text: "NEW WORLD" };
const btnLoad = { x: 200, y: 320, w: 200, h: 50, text: "LOAD WORLD" };
const btnMulti = { x: 200, y: 390, w: 200, h: 50, text: "MULTIPLAYER" }; // Positioned at y: 390


const createNewPlayer = () => ({
    w: 64, h: 64, direction: "down", isMoving: false, speed: 6,
    hp: 100, maxHp: 100, wood: 0, money: 0, axeLevel: 1, 
    isSwinging: false, swingTimer: 0, blueprints: 0, hasStumpRemover: false 
});

let player = createNewPlayer();
let camera = { x: 0, y: 0 }; 

const shopBuilding = { x: 800, y: 800, w: 489, h: 272 };
const shopDoor = { x: shopBuilding.x + (489/2) - 40, y: shopBuilding.y + 250, w: 80, h: 40 };
const deskPos = { x: 300, y: 200 }; 
const animations = { "down": 0, "left": 1, "right": 2, "up": 3 };

let currentQuestState = "IDLE"; 
let dialogueText = "";
const npc = { x: 400, y: 1200, w: 64, h: 64, range: 120, name: "Elder Oak", questTarget: 5 };
let mobs = [];

// --- 3. Persistent Save/Load Engine ---
function getSaveRegistry() { return JSON.parse(localStorage.getItem('world_registry') || "[]"); }
function deleteWorld(name) {
    let reg = getSaveRegistry().filter(n => n !== name);
    localStorage.setItem('world_registry', JSON.stringify(reg));
    localStorage.removeItem('save_' + name);
    selectedWorld = null;
}
function saveGame() {
    if (!currentSaveSlot || gameState !== "GAME") return;
    const saveData = { player, camera, currentRoom, worldSeed: currentWorldSeed, trees, houses, waypoint, currentQuestState, npc, mobs };
    localStorage.setItem('save_' + currentSaveSlot, JSON.stringify(saveData));
    let reg = getSaveRegistry();
    if (!reg.includes(currentSaveSlot)) { reg.push(currentSaveSlot); localStorage.setItem('world_registry', JSON.stringify(reg)); }
}
function loadWorld(name) {
    const data = JSON.parse(localStorage.getItem('save_' + name));
    if (data) {
        player = data.player; camera = data.camera; currentRoom = data.currentRoom; 
        currentWorldSeed = data.worldSeed; trees = data.trees || []; houses = data.houses || [];
        waypoint = data.waypoint || null; currentQuestState = data.currentQuestState || "IDLE";
        if (data.npc) { npc.x = data.npc.x; npc.y = data.npc.y; }
        mobs = data.mobs || [];
        currentSaveSlot = name; gameState = "GAME"; selectedWorld = null; showShopGUI = false;
    }
}

function updateSlimes() {
    // 1. Handle Spawning
    slimeSpawnTimer++;
    if (slimeSpawnTimer >= 40 && mobs.length < MAX_SLIMES) {
        // Random position within world bounds
        let sx = (Math.random() - 0.5) * 2500;
        let sy = (Math.random() - 0.5) * 2500;

        // Only spawn if far from player AND not colliding with a tree/building
        if (Math.hypot(sx - camera.x, sy - camera.y) > 400 && !checkCollision(sx, sy)) {
            mobs.push({ 
                x: sx, 
                y: sy, 
                hp: 40, 
                maxHp: 40, 
                speed: 1.5, 
                damage: 10, 
                lastHit: 0, 
                type: 'slime', 
                frame: 0,       // Current frame index (0-11)
                frameTimer: 0   // Timer to control animation speed
            });
            slimeSpawnTimer = 0; 
        }
    }

    // 2. Handle AI Movement & Animation
    mobs.forEach((m, index) => {
        // Calculate distance to player
        let dx = (camera.x) - m.x;
        let dy = (camera.y) - m.y;
        let dist = Math.hypot(dx, dy);

        // Simple Chase AI: Move towards player if they are nearby
        if (dist < 500 && dist > 20) {
            let vx = (dx / dist) * m.speed;
            let vy = (dy / dist) * m.speed;
            
            // Move only if path is clear
            if (!checkCollision(m.x + vx, m.y + vy)) {
                m.x += vx;
                m.y += vy;
            }
        }

        // Sprite Sheet Animation Logic
        m.frameTimer++;
        if (m.frameTimer > 8) { // Adjust this number to make them "bounce" faster or slower
            m.frame = (m.frame + 1) % 12; // Cycles through the 12 frames in your 3x4 sheet
            m.frameTimer = 0;
        }

        // Damage Player on contact (with invincibility frames)
        if (dist < 40 && Date.now() - m.lastHit > 1000) {
            player.hp -= m.damage;
            m.lastHit = Date.now();
            console.log("Player hit! HP:", player.hp);
        }
    });
}
    


// --- 4. World Generation ---
function initTrees(seed) {
    trees = [];
    mobs = []; // Clear existing mobs on new world
    const spacing = 220, range = 2500; 
    for (let x = -range; x < range; x += spacing) {
        for (let y = -range; y < range; y += spacing) {
            let dS = Math.sqrt(x*x + y*y);
            let dSh = Math.sqrt((x - (shopBuilding.x + shopBuilding.w/2))**2 + (y - (shopBuilding.y + shopBuilding.h/2))**2);
            if (dS > 400 && dSh > 400 && Math.sin(x * 12.9 + y * 78.2 + seed) > 0.3) { 
                trees.push({ x: x, y: y, wood: 5, maxWood: 5, respawnTimer: 0, shakeTimer: 0 });
            }
        }
    }
    spawnSafeNPC();
    
    // Spawn 5 slimes initially within 2000px
    // Inside initTrees(seed) on Page 5:
    for(let i = 0; i < 5; i++) {
        let rx, ry, attempts = 0;
        do {
            rx = (Math.random() - 0.5) * 2000;
            ry = (Math.random() - 0.5) * 2000;
            attempts++;
        } while (checkCollision(rx, ry) && attempts < 10); // Try to find a clear spot

        mobs.push({ 
            x: rx, y: ry, hp: 40, maxHp: 40, speed: 1.5, damage: 10, 
            lastHit: 0, type: 'slime', frame: 0, frameTimer: 0 
        });
}

}


function spawnSafeNPC() {
    let valid = false, attempts = 0;
    while (!valid && attempts < 100) {
        let tx = (Math.random() - 0.5) * 1500, ty = (Math.random() - 0.5) * 1500;
        valid = true;
        for (let t of trees) if (Math.hypot(tx - t.x, ty - t.y) < 150) valid = false;
        if (valid) { npc.x = tx; npc.y = ty; }
        attempts++;
    }
}

function spawnMob(x, y) {
    mobs.push({ x: x, y: y, hp: 40, maxHp: 40, speed: 2, damage: 10, lastHit: 0 });
}

function checkCollision(nx, ny) {
    if (currentRoom !== "forest") return false;
    if (nx > shopBuilding.x - 10 && nx < shopBuilding.x + shopBuilding.w + 10 && ny > shopBuilding.y + 40 && ny < shopBuilding.y + shopBuilding.h) return true;
    for (let h of houses) if (nx > h.x + 80 && nx < h.x + 420 && ny > h.y + 250 && ny < h.y + 460) return true;
    if (Math.hypot(nx - npc.x, ny - npc.y) < 50) return true;
    for (let t of trees) {
        if (t.wood > 0 && Math.hypot(nx - t.x, (ny + 20) - t.y) < 40) return true;
    }
    return false;
}

// --- 5. Rendering Helpers ---
function drawHotbar() {
    const slotSize = 60, padding = 10, totalWidth = (slotSize * 4) + (padding * 3);
    const startX = (canvas.width - totalWidth) / 2, startY = canvas.height - slotSize - 20;
    const inventoryIcons = [images.axe, images.shovel, images.log, images.house];
    for (let i = 0; i < 4; i++) {
        let x = startX + i * (slotSize + padding);
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)"; ctx.strokeStyle = (selectedSlot === i) ? "#00ffcc" : "white";
        ctx.lineWidth = (selectedSlot === i) ? 3 : 1; ctx.fillRect(x, startY, slotSize, slotSize); ctx.strokeRect(x, startY, slotSize, slotSize);
        if (i === 1 && !player.hasStumpRemover) continue;
        if (i === 3 && player.blueprints <= 0) continue;
        if (inventoryIcons[i]) ctx.drawImage(inventoryIcons[i], x + 5, startY + 5, slotSize - 10, slotSize - 10);
        ctx.fillStyle = "white"; ctx.font = "bold 12px Arial"; ctx.textAlign = "right";
        if (i === 2) ctx.fillText(player.wood, x + slotSize - 5, startY + slotSize - 5);
        if (i === 3) ctx.fillText(player.blueprints, x + slotSize - 5, startY + slotSize - 5);
    }
}

function drawAxeSwing(centerX, centerY) {
    if (!player.isSwinging) return;
    // Change on Page 17
   
    ctx.save(); ctx.translate(centerX, centerY);
    let progress = 1 - (player.swingTimer / 15);
    let rot = (player.direction === "left") ? (Math.PI/4 - (progress * Math.PI/1.5)) : 
              (player.direction === "right") ? (-Math.PI/4 + (progress * Math.PI/1.5)) :
              (player.direction === "up") ? (-Math.PI/2 + (progress * Math.PI/2) - Math.PI/4) :
              (Math.PI/2 - (progress * Math.PI/2) + Math.PI/4);
    ctx.rotate(rot); if (player.direction === "left") ctx.scale(-1, 1);
    ctx.drawImage(images.axe, 10, (player.direction === "up" ? -40 : player.direction === "down" ? -10 : -30), 40, 40);
    ctx.restore(); player.swingTimer--; if (player.swingTimer <= 0) player.isSwinging = false;
}

function drawNavigation() {
    if (!waypoint || currentRoom !== "forest") return;
    const dx = waypoint.x - camera.x, dy = waypoint.y - camera.y, dist = Math.floor(Math.sqrt(dx*dx + dy*dy));
    if (dist < 50) return; 
    const angle = Math.atan2(dy, dx), arrowX = 300 + Math.cos(angle) * 80, arrowY = 300 + Math.sin(angle) * 80;
    ctx.save(); ctx.translate(arrowX, arrowY); ctx.rotate(angle); ctx.fillStyle = "#00ccff";
    ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-10, -8); ctx.lineTo(-10, 8); ctx.closePath(); ctx.fill(); ctx.restore();
}

function drawMiniMap() {
    const mx = 600 - miniMapSize - 10, my = 10, centerX = mx + miniMapSize / 2, centerY = my + miniMapSize / 2;
    ctx.fillStyle = "rgba(0,0,0,0.8)"; ctx.fillRect(mx, my, miniMapSize, miniMapSize);
    ctx.strokeStyle = "#00ffcc"; ctx.lineWidth = 2; ctx.strokeRect(mx, my, miniMapSize, miniMapSize);
    ctx.save(); ctx.beginPath(); ctx.rect(mx, my, miniMapSize, miniMapSize); ctx.clip();
    trees.forEach(t => {
        const tx = centerX + (t.x - camera.x) * miniMapScale, ty = centerY + (t.y - camera.y) * miniMapScale;
        ctx.fillStyle = t.wood > 0 ? "#2d5a27" : "#5a3d27"; ctx.fillRect(tx - 1, ty - 1, 2, 2);
    });
    ctx.restore();
    if (waypoint) {
        const wx = centerX + (waypoint.x - camera.x) * miniMapScale, wy = centerY + (waypoint.y - camera.y) * miniMapScale;
        ctx.fillStyle = "red"; ctx.beginPath(); ctx.arc(wx, wy, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "white"; ctx.beginPath(); ctx.arc(centerX, centerY, 3, 0, Math.PI * 2); ctx.fill();
}

function drawButton(btn, color = "rgba(0, 255, 204, 0.2)") {
    ctx.fillStyle = color; ctx.strokeStyle = "#00ffcc"; ctx.lineWidth = 2;
    ctx.fillRect(btn.x, btn.y, btn.w, btn.h); ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);
    ctx.fillStyle = "white"; ctx.font = "18px Arial"; ctx.textAlign = "center";
    ctx.fillText(btn.text, btn.x + btn.w/2, btn.y + btn.h/2 + 7);
}

function drawLoadList() {
    ctx.fillStyle = "black"; ctx.fillRect(0, 0, 600, 600);
    ctx.fillStyle = "white"; ctx.font = "30px Arial"; ctx.textAlign = "center";
    ctx.fillText("SELECT A WORLD", 300, 60);
    const reg = getSaveRegistry(), lX = 100, lY = 100, lW = 400, lH = 360;
    ctx.save(); ctx.beginPath(); ctx.rect(lX, lY, lW, lH); ctx.clip();
    reg.forEach((name, i) => {
        let y = lY + (i * 60) - scrollY;
        ctx.fillStyle = (selectedWorld === name) ? "rgba(0, 255, 204, 0.3)" : "rgba(255,255,255,0.1)";
        ctx.fillRect(lX, y, lW, 50);
        ctx.fillStyle = "white"; ctx.font = "18px Arial"; ctx.textAlign = "center";
        ctx.fillText(name, 300, y + 32);
    });
    ctx.restore();
    const tH = reg.length * 60;
    if (tH > lH) {
        const bX = lX + lW + 10, bH = (lH / tH) * lH, bY = lY + (scrollY / tH) * lH;
        ctx.fillStyle = "rgba(255,255,255,0.2)"; ctx.fillRect(bX, lY, 10, lH);
        ctx.fillStyle = "#00ffcc"; ctx.fillRect(bX, bY, 10, bH);
    }
    drawButton({x: 225, y: 520, w: 150, h: 40, text: "BACK"});
    if (selectedWorld) {
        ctx.fillStyle = "rgba(0,0,0,0.9)"; ctx.fillRect(0,0,600,600);
        ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.fillText(selectedWorld, 300, 250);
        drawButton({x: 150, y: 300, w: 140, h: 50, text: "LOAD"}, "rgba(0,255,100,0.2)");
        drawButton({x: 310, y: 300, w: 140, h: 50, text: "DELETE"}, "rgba(255,50,50,0.2)");
        drawButton({x: 230, y: 380, w: 140, h: 40, text: "CANCEL"});
    }
}


function broadcastMovement() {
    if (conn && conn.open) {
        conn.send({
            type: 'sync',
            payload: { 
                x: camera.x, 
                y: camera.y,
                dir: player.direction,
                moving: player.isMoving
            }
        });
    }
}



// --- 6. Core Game Loop ---
function animate() {
    // --- 1. Entity, Mob & World Logic ---
    updateSlimes(); // Spawns slimes and moves them
    
    

    trees.forEach(t => { 
        if(t.wood <= 0) { 
            t.respawnTimer--; 
            if(t.respawnTimer <= 0) t.wood = t.maxWood; 
        } 
        if(t.shakeTimer > 0) t.shakeTimer--; 
    });

    // --- 2. Player Movement Logic ---
    let mX = (keys['ArrowRight']||keys['KeyD']?1:0) - (keys['ArrowLeft']||keys['KeyA']?1:0);
    let mY = (keys['ArrowDown']||keys['KeyS']?1:0) - (keys['ArrowUp']||keys['KeyW']?1:0);
    player.isMoving = false;

    if ((mX !== 0 || mY !== 0) && dialogueText === "" && !showShopGUI && !player.isSwinging) {
        let mag = Math.hypot(mX, mY), sX = (mX / mag) * player.speed, sY = (mY / mag) * player.speed;
        
        if (currentRoom === "forest") {
            if (!checkCollision(camera.x + sX, camera.y)) camera.x += sX;
            if (!checkCollision(camera.y + sY, camera.y)) camera.y += sY;
            
            // Room Transition: Enter Shop
            if (camera.x > shopDoor.x && camera.x < shopDoor.x + shopDoor.w && 
                camera.y > shopDoor.y && camera.y < shopDoor.y + shopDoor.h) { 
                currentRoom = "insideShop"; camera.x = 300; camera.y = 500; 
            }
        } else {
            camera.x += sX; camera.y += sY;
            // Room Transition: Exit Shop
            if (camera.y > 560) { currentRoom = "forest"; camera.x = shopDoor.x + 40; camera.y = shopDoor.y + 60; }
            camera.x = Math.max(100, Math.min(500, camera.x)); camera.y = Math.max(150, camera.y);
        }
        
        player.isMoving = true;
        if(mY < 0) player.direction = "up"; else if(mY > 0) player.direction = "down"; 
        else if(mX < 0) player.direction = "left"; else if(mX > 0) player.direction = "right";
    }

    // --- 3. Multiplayer Sync ---
    if (typeof broadcastMovement === "function") broadcastMovement();

    // --- 4. Rendering (Forest Room) ---
    if (currentRoom === "forest") {
        let buildZoom = (selectedSlot === 3 && player.blueprints > 0) ? 0.5 : 1.0;
        ctx.save();
        if(buildZoom < 1.0) { ctx.translate(300, 300); ctx.scale(buildZoom, buildZoom); ctx.translate(-300, -300); }
        
        // Background Grass
        if(grassPattern) { 
            ctx.save(); ctx.translate(-camera.x+300, -camera.y+300); 
            ctx.fillStyle=grassPattern; ctx.fillRect(camera.x-2500, camera.y-2500, 5000, 5000); 
            ctx.restore(); 
        }
        
        // Static Buildings
        ctx.drawImage(images.shop, shopBuilding.x - camera.x + 300, shopBuilding.y - camera.y + 300, shopBuilding.w, shopBuilding.h);
        houses.forEach(h => ctx.drawImage(images.house, h.x - camera.x + 300, h.y - camera.y + 300, 500, 500));
        
        // --- 5. Depth-Sorted Rendering ---
        let drawList = trees.map(t => ({...t, d: t.wood > 0 ? 't' : 's'}));
        drawList.push({x: camera.x, y: camera.y, d: 'p'}); // Local Player
        // --- SOCKET.IO ADDITION ---
        for (let id in remotePlayers) {
            if (id !== socket.id) { // Don't draw yourself twice
                drawList.push({ ...remotePlayers[id], d: 'other', id: id });
            }
        }

        drawList.push({x: npc.x, y: npc.y, d: 'n'});       // NPC
        mobs.forEach(m => drawList.push({...m, d: 'm'})); // Slimes
        
        // Add Multiplayer Remote Players to Draw List
        for (let id in remotePlayers) {
            drawList.push({ ...remotePlayers[id], d: 'other', id: id });
        }

        drawList.sort((a,b) => a.y - b.y);
        
        drawList.forEach(o => {
            let sX = o.x - camera.x + 300, sY = o.y - camera.y + 300;
            
            if(o.d === 't') {
                ctx.drawImage(images.tree, 0,0,499,499, sX-100 + (o.shakeTimer?Math.sin(gameFrame*2)*5:0), sY-180, 200, 200);
            } else if(o.d === 's') {
                ctx.drawImage(images.stump, 0,0,499,499, sX-60, sY-70, 120, 120);
            } else if(o.d === 'n') {
                ctx.drawImage(images.questGiver, sX-32, sY-32, 64, 64);
            } else if(o.d === 'm') {
                // Fixed Slime Rendering
                let sW = images.slime.width / 3, sH = images.slime.height / 4;
                ctx.drawImage(images.slime, (o.frame||0)*sW, 0, sW, sH, sX-32, sY-32, 64, 64);
            } else if(o.d === 'other' || o.d === 'p') {
                // Player Rendering (Local or Remote)
                let pDir = o.d === 'p' ? player.direction : o.dir;
                let pMoving = o.d === 'p' ? player.isMoving : o.moving;
                ctx.drawImage(images.sprite, (pMoving?Math.floor(gameFrame/stagger)%4:0)*gridCellSize, animations[pDir]*gridCellSize, gridCellSize, gridCellSize, sX-32, sY-32, 64, 64);
                if(o.d === 'p') drawAxeSwing(300, 300);
            }else if (o.d === 'other') {
                ctx.drawImage(
                    images.sprite, 
                    (o.moving ? Math.floor(gameFrame/stagger)%4 : 0) * gridCellSize, 
                    animations[o.dir] * gridCellSize, 
                    gridCellSize, gridCellSize, 
                    o.x - camera.x + 300 - 32, 
                    o.y - camera.y + 300 - 32, 
                    64, 64
                );
            }
            


            



        });
        ctx.restore(); 
        
        // --- 6. HUD Elements ---
        drawNavigation();     // Waypoint Arrow
        drawSlimeTracker();   // NEW: Yellow Slime Arrow
        drawMiniMap(); 
        drawHotbar();

        // Coordinates with Inverted Y
        ctx.fillStyle = "white"; ctx.font = "bold 14px Arial"; ctx.textAlign = "left"; 
        ctx.fillText(`X: ${Math.floor(camera.x)} Y: ${Math.floor(camera.y * -1)}`, 10, 25);

        if (dialogueText) {
            ctx.fillStyle="rgba(0,0,0,0.85)"; ctx.fillRect(50, 450, 500, 100); ctx.strokeStyle="#00ffcc"; ctx.strokeRect(50, 450, 500, 100);
            ctx.fillStyle="white"; ctx.textAlign="center"; ctx.font="18px Arial"; ctx.fillText(dialogueText, 300, 500);
        }
    } else {
        // --- Shop Rendering ---
        ctx.fillStyle="#2e1a0a"; ctx.fillRect(0,0,600,600); 
        ctx.drawImage(images.desk, deskPos.x - 150, deskPos.y - 50, 300, 100);
        ctx.drawImage(images.sprite, (player.isMoving?Math.floor(gameFrame/stagger)%4:0)*gridCellSize, animations[player.direction]*gridCellSize, gridCellSize, gridCellSize, camera.x-32, camera.y-32, 64, 64);
        
        if(Math.hypot(camera.x - deskPos.x, camera.y - deskPos.y) < 80) {
            showShopGUI = true;
            ctx.fillStyle="rgba(0,0,0,0.9)"; ctx.fillRect(100, 50, 400, 350);
            ctx.fillStyle="white"; ctx.textAlign="center"; ctx.fillText("VILLAGE SHOP", 300, 90);
            drawButton({x: 150, y: 130, w: 300, h: 50, text: "SELL 10 LOGS (+$10)"});
            drawButton({x: 150, y: 200, w: 300, h: 50, text: player.hasStumpRemover ? "OWNED" : "BUY SHOVEL ($100)"});
            drawButton({x: 150, y: 270, w: 300, h: 50, text: `UPGRADE AXE ($75)`});
        } else { showShopGUI = false; }
        drawHotbar();
    }
}


// --- 7. Controls ---
canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect(); let bZ = (selectedSlot === 3 && player.blueprints > 0) ? 0.5 : 1.0;
    mouseWorldX = ((e.clientX - rect.left - 300) / bZ) + camera.x; mouseWorldY = ((e.clientY - rect.top - 300) / bZ) + camera.y;
});

canvas.addEventListener('mousedown', e => {
    const rect = canvas.getBoundingClientRect(), mx = e.clientX - rect.left, my = e.clientY - rect.top;
    if (gameState === "GAME") {
        if (showShopGUI) {
            if (my > 130 && my < 180 && player.wood >= 10) { player.wood -= 10; player.money += 10; }
            if (my > 200 && my < 250 && player.money >= 100 && !player.hasStumpRemover) { player.money -= 100; player.hasStumpRemover = true; }
            if (my > 270 && my < 320 && player.money >= 75) { player.money -= 75; player.axeLevel++; }
            return;
        }
        if (selectedSlot === 3 && player.blueprints > 0 && currentRoom === "forest") {
            let hX = mouseWorldX - 250, hY = mouseWorldY - 500;
            if (!isPlacementBlocked(hX, hY)) { houses.push({ x: hX, y: hY }); player.blueprints--; } return;
        }
        if (mx > 600 - miniMapSize - 10 && my < miniMapSize + 10) { waypoint = { x: camera.x + (mx - (600 - miniMapSize - 10) - miniMapSize/2) / miniMapScale, y: camera.y + (my - 10 - miniMapSize/2) / miniMapScale }; return; }
    }
    // --- Replace your entire mousedown/click logic section with this ---
    if (gameState === "GAME") {
        if (showShopGUI) {
            if (my > 130 && my < 180 && player.wood >= 10) { player.wood -= 10; player.money += 10; }
            if (my > 200 && my < 250 && player.money >= 100 && !player.hasStumpRemover) { player.money -= 100; player.hasStumpRemover = true; }
            if (my > 270 && my < 320 && player.money >= 75) { player.money -= 75; player.axeLevel++; }
            return;
        }
        if (selectedSlot === 3 && player.blueprints > 0 && currentRoom === "forest") {
            let hX = mouseWorldX - 250, hY = mouseWorldY - 500;
            if (!isPlacementBlocked(hX, hY)) { houses.push({ x: hX, y: hY }); player.blueprints--; } return;
        }
        if (mx > 600 - miniMapSize - 10 && my < miniMapSize + 10) { 
            waypoint = { x: camera.x + (mx - (600 - miniMapSize - 10) - miniMapSize/2) / miniMapScale, y: camera.y + (my - 10 - miniMapSize/2) / miniMapScale }; 
            return; 
        }
        // Ensure this is inside your MENU state drawing logic (Page 12/18)
        if (gameState === "MENU") {
            if (images.background) ctx.drawImage(images.background, 0, 0, 600, 600);
            drawButton(btnNew);
            drawButton(btnLoad);
            // This is the missing line that actually shows the button
            drawButton({ x: 200, y: 390, w: 200, h: 50, text: "MULTIPLAYER" }); 
        }



    } else if (gameState === "CREATE") {
        if (mx > 150 && mx < 290 && my > 350 && my < 390 && typingName.trim() !== "") { 
            currentWorldSeed = Math.floor(Math.random()*1e6); currentSaveSlot = typingName; 
            initTrees(currentWorldSeed); saveGame(); gameState = "GAME"; 
        } else if (mx > 310 && mx < 450 && my > 350 && my < 390) { 
            gameState = "MENU"; typingName = ""; 
        }
    } else if (gameState === "LOAD") {
        if (selectedWorld) {
            if (mx > 150 && mx < 290 && my > 300 && my < 350) loadWorld(selectedWorld);
            if (mx > 310 && mx < 450 && my > 300 && my < 350) deleteWorld(selectedWorld);
            if (mx > 230 && mx < 370 && my > 380 && my < 420) selectedWorld = null;
        } else {
            if (mx > 225 && mx < 375 && my > 520 && my < 560) gameState = "MENU";
            getSaveRegistry().forEach((name, i) => { 
                let y = 100 + (i * 60) - scrollY; 
                if (mx > 100 && mx < 500 && my > y && my < y + 50) selectedWorld = name; 
            });
        }
    }// Inside your loadAssets(() => { function main() { ... } }) loop:
    


});


window.addEventListener('keyup', e => keys[e.code] = false);

function loadAssets(callback) {
    for (let key in assetPaths) {
        images[key] = new Image();
        images[key].onload = () => {
            loadedCount++;
            if (key === 'grass') grassPattern = ctx.createPattern(images.grass, 'repeat');
            if (key === 'sprite') gridCellSize = images.sprite.width / 4;
            if (loadedCount === totalAssets) callback();
        };
        images[key].onerror = () => {
            console.error("Failed to load: " + assetPaths[key]);
            loadedCount++;
            if (loadedCount === totalAssets) callback();
        };
        images[key].src = assetPaths[key];
    }
}
function drawSlimeTracker() {
    if (mobs.length === 0 || currentRoom !== "forest") return;
    
    // Find closest slime
    let closest = mobs.reduce((prev, curr) => {
        let d1 = Math.hypot(prev.x - camera.x, prev.y - camera.y);
        let d2 = Math.hypot(curr.x - camera.x, curr.y - camera.y);
        return d1 < d2 ? prev : curr;
    });

    const dx = closest.x - camera.x, dy = closest.y - camera.y;
    const dist = Math.hypot(dx, dy);
    
    // Show yellow arrow if slime is off-screen (> 400px away)
    if (dist > 400) {
        const angle = Math.atan2(dy, dx);
        const arrowX = 300 + Math.cos(angle) * 120;
        const arrowY = 300 + Math.sin(angle) * 120;

        ctx.save();
        ctx.translate(arrowX, arrowY);
        ctx.rotate(angle);
        ctx.fillStyle = "yellow";
        ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-10, -8); ctx.lineTo(-10, 8); ctx.closePath();
        ctx.fill(); ctx.restore();
    }
}

// --- 6. Core Game Loop ---
function animate() {
    // Tree & Mob Logic
    trees.forEach(t => { 
        if(t.wood <= 0) { t.respawnTimer--; if(t.respawnTimer<=0) t.wood=t.maxWood; } 
        if(t.shakeTimer > 0) t.shakeTimer--; 
    });
    
    

    // Movement
    let mX = (keys['ArrowRight']||keys['KeyD']?1:0) - (keys['ArrowLeft']||keys['KeyA']?1:0);
    let mY = (keys['ArrowDown']||keys['KeyS']?1:0) - (keys['ArrowUp']||keys['KeyW']?1:0);
    player.isMoving = false;

    if ((mX !== 0 || mY !== 0) && dialogueText === "" && !showShopGUI && !player.isSwinging) {
        let mag = Math.hypot(mX, mY), sX = (mX / mag) * player.speed, sY = (mY / mag) * player.speed;
        if (currentRoom === "forest") {
            if (!checkCollision(camera.x + sX, camera.y)) camera.x += sX;
            if (!checkCollision(camera.x, camera.y + sY)) camera.y += sY;
            if (camera.x > shopDoor.x && camera.x < shopDoor.x + shopDoor.w && camera.y > shopDoor.y && camera.y < shopDoor.y + shopDoor.h) { 
                currentRoom = "insideShop"; camera.x = 300; camera.y = 500; 
            }
        } else {
            camera.x += sX; camera.y += sY;
            if (camera.y > 560) { currentRoom = "forest"; camera.x = shopDoor.x + 40; camera.y = shopDoor.y + 60; }
            camera.x = Math.max(100, Math.min(500, camera.x)); camera.y = Math.max(150, camera.y);
        }
        player.isMoving = true;
        if(mY < 0) player.direction = "up"; else if(mY > 0) player.direction = "down"; else if(mX < 0) player.direction = "left"; else if(mX > 0) player.direction = "right";
    }

    // Rendering Logic
    if (currentRoom === "forest") {
        let buildZoom = (selectedSlot === 3 && player.blueprints > 0) ? 0.5 : 1.0;
        ctx.save();
        if(buildZoom < 1.0) { ctx.translate(300, 300); ctx.scale(buildZoom, buildZoom); ctx.translate(-300, -300); }
        if(grassPattern) { ctx.save(); ctx.translate(-camera.x+300, -camera.y+300); ctx.fillStyle=grassPattern; ctx.fillRect(camera.x-2500, camera.y-2500, 5000, 5000); ctx.restore(); }
        
        ctx.drawImage(images.shop, shopBuilding.x - camera.x + 300, shopBuilding.y - camera.y + 300, shopBuilding.w, shopBuilding.h);
        houses.forEach(h => ctx.drawImage(images.house, h.x - camera.x + 300, h.y - camera.y + 300, 500, 500));
        
        // Ghost House
        if (selectedSlot === 3 && player.blueprints > 0) {
            let hX = mouseWorldX - camera.x + 300 - 250, hY = mouseWorldY - camera.y + 300 - 500;
            ctx.save(); ctx.globalAlpha = 0.4; 
            if (checkCollision(mouseWorldX, mouseWorldY)) ctx.fillStyle = "red";
            ctx.drawImage(images.house, hX, hY, 500, 500); ctx.restore();
        }

        // Depth Sort List
        let dl = trees.map(t => ({...t, d: t.wood > 0 ? 't' : 's'}));
        dl.push({x:camera.x, y:camera.y, d:'p'}); 
        dl.push({x:npc.x, y:npc.y, d:'n'});
        mobs.forEach(m => dl.push({x:m.x, y:m.y, d:'m'}));
        dl.sort((a,b)=>a.y-b.y);
        
        dl.forEach(o=>{
            let sX = o.x-camera.x+300, sY = o.y-camera.y+300;
            if(o.d==='t') ctx.drawImage(images.tree, 0,0,499,499, sX-100 + (o.shakeTimer?Math.sin(gameFrame*2)*5:0), sY-180, 200, 200);
            else if(o.d==='s') ctx.drawImage(images.stump, 0,0,499,499, sX-60, sY-70, 120, 120);
            else if(o.d==='n') ctx.drawImage(images.questGiver, sX-32, sY-32, 64, 64);
            else if (o.type === 'slime') {
                // SLIME SPRITE SHEET LOGIC
                const SW = 236 / 3; // Source Width per frame (~78.6)
                const SH = 315 / 4; // Source Height per frame (~78.7)
                
                let col = o.frame % 3;
                let row = Math.floor(o.frame / 3);

                ctx.drawImage(
                    assets.slimeSheet, 
                    col * SW, row * SH, // sx, sy (Where to crop from the sheet)
                    SW, SH,             // sw, sh (Size of the crop)
                    o.x - camera.x - 40, o.y - camera.y - 40, // dx, dy (Position on screen)
                    80, 80              // dw, dh (Size to draw in game)
                );
            }
            else {
                ctx.drawImage(images.sprite, (player.isMoving?Math.floor(gameFrame/stagger)%4:0)*gridCellSize, animations[player.direction]*gridCellSize, gridCellSize, gridCellSize, 300-32, 300-32, 64, 64);
                drawAxeSwing(300, 300);
            }
        });
        ctx.restore(); drawNavigation(); drawMiniMap(); drawHotbar();
        
        // UI Text
        ctx.fillStyle = "white"; ctx.font = "bold 14px Arial"; ctx.textAlign="left"; 
        ctx.fillText(`X: ${Math.floor(camera.x)} Y: ${Math.floor(camera.y*-1)}`, 10, 25);
        
        if (dialogueText) {
            ctx.fillStyle="rgba(0,0,0,0.8)"; ctx.fillRect(50, 450, 500, 100); ctx.strokeStyle="#00ffcc"; ctx.strokeRect(50, 450, 500, 100);
            ctx.fillStyle="white"; ctx.textAlign="center"; ctx.fillText(dialogueText, 300, 500);
            ctx.font="12px Arial"; ctx.fillText("Press ENTER to continue", 300, 530);
        }
    } else {
        // Shop Render
        ctx.fillStyle="#2e1a0a"; ctx.fillRect(0,0,600,600); ctx.drawImage(images.desk, deskPos.x - 150, deskPos.y - 50, 300, 100);
        ctx.drawImage(images.sprite, (player.isMoving?Math.floor(gameFrame/stagger)%4:0)*gridCellSize, animations[player.direction]*gridCellSize, gridCellSize, gridCellSize, camera.x-32, camera.y-32, 64, 64);
        if(Math.hypot(camera.x - deskPos.x, camera.y - deskPos.y) < 80) {
            showShopGUI = true; ctx.fillStyle="rgba(0,0,0,0.85)"; ctx.fillRect(100, 50, 400, 380);
            ctx.fillStyle="white"; ctx.textAlign="center"; ctx.fillText("SHOP", 300, 90);
            drawButton({x: 150, y: 130, w: 300, h: 50, text: "SELL 10 LOGS (+$10)"});
            drawButton({x: 150, y: 200, w: 300, h: 50, text: player.hasStumpRemover ? "OWNED" : "BUY SHOVEL ($100)"});
            drawButton({x: 150, y: 270, w: 300, h: 50, text: `UPGRADE AXE ($75)`});
        } else { showShopGUI = false; }
        drawHotbar();
    }
}

// --- 7. Controls & Loop ---
canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect(); 
    let bZ = (selectedSlot === 3 && player.blueprints > 0) ? 0.5 : 1.0;
    mouseWorldX = ((e.clientX - rect.left - 300) / bZ) + camera.x;
    mouseWorldY = ((e.clientY - rect.top - 300) / bZ) + camera.y;
});




canvas.addEventListener('mousedown', e => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // --- 1. GAMEPLAY LOGIC ---
    if (gameState === "GAME") {
        // Shop Interaction
        if (showShopGUI) {
            if (my > 130 && my < 180 && player.wood >= 10) { player.wood -= 10; player.money += 10; }
            if (my > 200 && my < 250 && player.money >= 100 && !player.hasStumpRemover) { player.money -= 100; player.hasStumpRemover = true; }
            if (my > 270 && my < 320 && player.money >= 75) { player.money -= 75; player.axeLevel++; }
            return;
        }
        // Building Placement
        if (selectedSlot === 3 && player.blueprints > 0 && currentRoom === "forest") {
            let hX = mouseWorldX - 250, hY = mouseWorldY - 500;
            if (!checkCollision(mouseWorldX, mouseWorldY)) { 
                houses.push({ x: hX, y: hY }); 
                player.blueprints--; 
            } 
            return;
        }
        // Mini-Map Waypoint Logic
        if (mx > 600 - miniMapSize - 10 && my < miniMapSize + 10) { 
            waypoint = { 
                x: camera.x + (mx - (600 - miniMapSize - 10) - miniMapSize/2) / miniMapScale, 
                y: camera.y + (my - 10 - miniMapSize/2) / miniMapScale 
            }; 
            return; 
        }
    }

    // --- 2. MAIN MENU LOGIC ---
    else if (gameState === "MENU") {
        if (mx > btnNew.x && mx < btnNew.x + btnNew.w && my > btnNew.y && my < btnNew.y + btnNew.h) gameState = "CREATE";
        if (mx > btnLoad.x && mx < btnLoad.x + btnLoad.w && my > btnLoad.y && my < btnLoad.y + btnLoad.h) gameState = "LOAD";
        // Go to Multiplayer Page
        
    }
    else if (gameState === "MULTIPLAYER_MENU") {
        // JOIN/CREATE ROOM BUTTON
        if (mx > 150 && mx < 450 && my > 200 && my < 250) {
            const roomName = prompt("Enter a unique Room Name:");
            if (roomName) {
                socket.emit('join-room', roomName);
                initTrees(Math.random()); // Start the world
                gameState = "GAME";       // Enter the game
            }
        }
        // BACK BUTTON
        if (mx > 225 && mx < 375 && my > 400 && my < 440) {
            gameState = "MENU";
        }
    }


    // --- 3. NEW MULTIPLAYER PAGE LOGIC ---
   

    // --- 4. CREATE WORLD LOGIC ---
    else if (gameState === "CREATE") {
        if (mx > 150 && mx < 290 && my > 350 && my < 390 && typingName.trim() !== "") { 
            currentWorldSeed = Math.floor(Math.random()*1e6); 
            currentSaveSlot = typingName; 
            initTrees(currentWorldSeed); saveGame(); gameState = "GAME"; 
        } else if (mx > 310 && mx < 450 && my > 350 && my < 390) { 
            gameState = "MENU"; typingName = ""; 
        }
    }

    // --- 5. LOAD WORLD LOGIC ---
    else if (gameState === "LOAD") {
        if (selectedWorld) {
            if (mx > 150 && mx < 290 && my > 300 && my < 350) loadWorld(selectedWorld);
            if (mx > 310 && mx < 450 && my > 300 && my < 350) deleteWorld(selectedWorld);
            if (mx > 230 && mx < 370 && my > 380 && my < 420) selectedWorld = null;
        } else {
            if (mx > 225 && mx < 375 && my > 520 && my < 560) gameState = "MENU";
            getSaveRegistry().forEach((name, i) => { 
                let y = 100 + (i * 60) - scrollY; 
                if (mx > 100 && mx < 500 && my > y && my < y + 50) selectedWorld = name; 
            });
        }
    }
});


window.addEventListener('keydown', e => {
    // 1. Handle Typing for New World Name
    if (gameState === "CREATE") { 
        if (e.key === "Backspace") typingName = typingName.slice(0, -1); 
        else if (e.key.length === 1) typingName += e.key; 
        return; 
    }

    // 2. Handle Dialogue Closing (Enter Key)
    if (e.code === 'Enter' && dialogueText !== "") { 
        dialogueText = ""; 
        if(currentQuestState === "TALKING") currentQuestState = "ACTIVE"; 
        return; 
    }

    // 3. Track Movement Keys
    keys[e.code] = true;

    // 4. Hotbar Slot Selection (Digits 1-4)
    if (e.code === 'Digit1') selectedSlot = 0; 
    if (e.code === 'Digit2') selectedSlot = 1; 
    if (e.code === 'Digit3') selectedSlot = 2; 
    if (e.code === 'Digit4') selectedSlot = 3;

    // 5. THE SPACE BAR LOGIC (NPC Quests & Combat)
    if (e.code === 'Space' && gameState === "GAME" && !player.isSwinging && dialogueText === "") {
        let dNPC = Math.hypot(camera.x - npc.x, camera.y - npc.y);
        
        // NPC Interaction
        if (dNPC < npc.range) {
            let quest = questList[currentQuestIndex];
            if (!quest) {
                dialogueText = "Elder Oak: You have done much. Rest now.";
            } else if (currentQuestState === "IDLE" || currentQuestState === "DONE") {
                dialogueText = quest.text;
                currentQuestState = "TALKING";
                questProgress = 0;
            } else if (currentQuestState === "ACTIVE") {
                let isComplete = false;
                if (quest.type === "WOOD" && player.wood >= quest.target) {
                    player.wood -= quest.target;
                    isComplete = true;
                } else if (quest.type === "MOBS" && questProgress >= quest.target) {
                    isComplete = true;
                }

                if (isComplete) {
                    player.money += quest.reward;
                    dialogueText = quest.doneText;
                    currentQuestState = "DONE";
                    currentQuestIndex++;
                } else {
                    let needed = quest.target - (quest.type === "WOOD" ? player.wood : questProgress);
                    dialogueText = `Elder Oak: You still need ${needed} more ${quest.type === "WOOD" ? 'logs' : 'slimes'}!`;
                }
            }
        } 
        // Look for this in your input handling:
        

        // Axe Combat & Woodcutting
        else if (selectedSlot === 0) {
            player.isSwinging = true;
            player.swingTimer = 15;
            // Locate this inside the 'Space' bar logic for woodcutting:
            trees.forEach(t => { 
                if (t.wood > 0 && Math.hypot(camera.x - t.x, camera.y - t.y) < 100) { 
                    t.wood -= player.axeLevel; 
                    t.shakeTimer = 10; 
                    
                    if (t.wood <= 0) {
                        player.wood += 5; 
                        t.respawnTimer = 600; // ADD THIS: Set a timer (e.g., 600 frames/10 seconds)
                    }
                } 
            });

            mobs.forEach(m => { 
                if (Math.hypot(camera.x - m.x, camera.y - m.y) < 100) m.hp -= player.axeLevel * 15; 
            });
        }
    }
});

// Don't forget the KeyUp listener right below it to stop movement!
window.addEventListener('keyup', e => keys[e.code] = false);


loadAssets(() => {
    function main() { 
        ctx.clearRect(0,0,600,600); 
        if(gameState === "GAME") animate(); 
        else if(gameState === "MENU") { if(images.background) ctx.drawImage(images.background, 0,0,600,600); drawButton(btnNew); drawButton(btnLoad);drawButton(btnMulti); } 
        else if(gameState === "CREATE") { ctx.fillStyle="black"; ctx.fillRect(0,0,600,600); ctx.fillStyle="white"; ctx.fillText("Name World: " + typingName, 300, 250); drawButton({x:150, y:350, w:140, h:40, text:"START"}); drawButton({x:310, y:350, w:140, h:40, text:"CANCEL"}); }
        else if(gameState === "LOAD") drawLoadList();
        // Inside your loadAssets(() => { function main() { ... } }) loop:
        


        gameFrame++; requestAnimationFrame(main); 
    }
    main();
});
setInterval(() => saveGame(), 5000);