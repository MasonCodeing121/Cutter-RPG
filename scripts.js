// --- 1. SETUP & NETWORKING ---
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
canvas.width = 600; canvas.height = 600;
ctx.imageSmoothingEnabled = false;
document.body.appendChild(canvas);

// Unified Socket Setup - Bypasses some school blocks using 'polling'
const socket = io("https://cutter-rpg-server.onrender.com", {
    transports: ['websocket', 'polling']
}); 

let remotePlayers = {}; 
let isOnline = false;

socket.on('connect', () => { isOnline = true; console.log("Connected!"); });
socket.on('connect_error', () => { isOnline = false; });
socket.on('update-players', (data) => {
    remotePlayers = data;
    if (socket.id && remotePlayers[socket.id]) delete remotePlayers[socket.id]; 
});

// --- 2. ASSETS ---
const assetPaths = {
    sprite: "images/image.png",
    axe: "images/axe.png",
    grass: "images/grass.jpg",
    tree: "images/tree.png",
    stump: "images/c_tree.png",
    shop: "images/shop.png",
    background: "images/t_background.png",
    slime: "images/slime.png" 
};

// --- 3. STATE ---
let gameState = "MENU";
let gameFrame = 0;
let typingName = "";
let camera = { x: 0, y: 0 };
let trees = [], mobs = [];
const keys = {};
const animations = { "down": 0, "left": 1, "right": 2, "up": 3 };

let localWorlds = JSON.parse(localStorage.getItem('rpg_worlds') || '[]');
let serverList = JSON.parse(localStorage.getItem('rpg_servers') || '[]');

let player = {
    direction: "down", isMoving: false, speed: 6,
    wood: 0, money: 0, isSwinging: false, swingTimer: 0
};

// --- 4. ENGINE FUNCTIONS ---
function initTrees(seed) {
    trees = [];
    let s = seed || 12345;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let x = -2000; x < 2000; x += 220) {
        for (let y = -2000; y < 2000; y += 220) {
            if (Math.hypot(x, y) > 400 && rnd() > 0.6) {
                trees.push({ x, y, wood: 5 });
            }
        }
    }
}

function drawButton(x, y, w, h, text, color = "#3498db") {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "white";
    ctx.font = "bold 18px Arial";
    ctx.textAlign = "center";
    ctx.fillText(text, x + w/2, y + h/1.6);
}

// --- 5. MAIN GAME LOOP ---
function animate() {
    let mx = (keys['KeyD']||keys['ArrowRight']?1:0) - (keys['KeyA']||keys['ArrowLeft']?1:0);
    let my = (keys['KeyS']||keys['ArrowDown']?1:0) - (keys['KeyW']||keys['ArrowUp']?1:0);

    player.isMoving = (mx !== 0 || my !== 0) && !player.isSwinging;
    
    if (player.isMoving) {
        camera.x += mx * player.speed; 
        camera.y += my * player.speed;
        if(mx > 0) player.direction = "right"; 
        else if(mx < 0) player.direction = "left";
        else if(my > 0) player.direction = "down"; 
        else if(my < 0) player.direction = "up";
        
        if (isOnline) socket.emit('move', { x: camera.x, y: camera.y, dir: player.direction, moving: true });
    }

    if (player.isSwinging) {
        player.swingTimer--;
        if (player.swingTimer <= 0) player.isSwinging = false;
    }

    ctx.clearRect(0, 0, 600, 600);
    ctx.save();
    ctx.translate(-camera.x + 300, -camera.y + 300);

    if (grassPattern) { 
        ctx.fillStyle = grassPattern; 
        ctx.fillRect(camera.x - 1000, camera.y - 1000, 2000, 2000); 
    }
    
    ctx.drawImage(images.shop, 700, 700, 300, 200);

    let drawList = [];
    trees.forEach(t => drawList.push({ ...t, type: t.wood > 0 ? 'tree' : 'stump', y: t.y }));
    if (isOnline) {
        for (let id in remotePlayers) drawList.push({ ...remotePlayers[id], type: 'other', y: remotePlayers[id].y });
    }
    drawList.push({ x: camera.x, y: camera.y, type: 'player', y: camera.y });

    drawList.sort((a, b) => a.y - b.y);

    drawList.forEach(obj => {
        if (obj.type === 'tree') ctx.drawImage(images.tree, obj.x - 80, obj.y - 160, 160, 180);
        else if (obj.type === 'stump') ctx.drawImage(images.stump, obj.x - 40, obj.y - 40, 80, 80);
        else if (obj.type === 'player' || obj.type === 'other') {
            let grid = images.sprite.width / 4;
            let f = (obj.moving || (obj.type === 'player' && player.isMoving) ? Math.floor(gameFrame / 8) % 4 : 0);
            let dir = obj.dir || player.direction;
            ctx.drawImage(images.sprite, f * grid, animations[dir] * grid, grid, grid, obj.x - 32, obj.y - 32, 64, 64);
            
            if (obj.type === 'player' && player.isSwinging) {
                ctx.save(); ctx.translate(obj.x, obj.y);
                ctx.rotate(player.swingTimer * -0.3);
                ctx.drawImage(images.axe, 15, -35, 40, 40); ctx.restore();
            }
        }
    });
    ctx.restore();

    ctx.fillStyle = "white"; ctx.font = "14px monospace"; ctx.textAlign = "left";
    ctx.fillText(`X: ${Math.floor(camera.x)} Y: ${Math.floor(camera.y)} ${isOnline ? "● ONLINE" : "○ OFFLINE"}`, 15, 25);
    
    // Mini-map
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(475, 15, 110, 110);
    ctx.fillStyle = "lime"; ctx.fillRect(475 + 55 + (camera.x/100), 15 + 55 + (camera.y/100), 4, 4);

    gameFrame++;
    requestAnimationFrame(animate);
}

// --- 6. INPUTS & SERVER LOGIC ---
window.addEventListener('keydown', e => {
    if (gameState === "CREATE") {
        if (e.key === "Enter" && typingName) {
            localWorlds.push({ name: typingName, seed: Date.now() });
            localStorage.setItem('rpg_worlds', JSON.stringify(localWorlds));
            initTrees(Date.now()); gameState = "GAME"; animate();
        } else if (e.key === "Backspace") typingName = typingName.slice(0, -1);
        else if (e.key.length === 1) typingName += e.key;
        return;
    }
    keys[e.code] = true;

    if (e.code === "Space" && gameState === "GAME" && !player.isSwinging) {
        player.isSwinging = true; player.swingTimer = 12;
        trees.forEach(t => {
            if (t.wood > 0 && Math.hypot(camera.x - t.x, camera.y - t.y) < 100) t.wood--;
        });
    }
});

window.addEventListener('keyup', e => keys[e.code] = false);

canvas.addEventListener('mousedown', e => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    
    if (gameState === "MENU") {
        if (my > 250 && my < 300) { typingName = ""; gameState = "CREATE"; }
        if (my > 320 && my < 370) gameState = "LOAD_LIST";
        if (my > 390 && my < 440) gameState = "MULTI_LIST";
    } 
    else if (gameState === "LOAD_LIST") {
        localWorlds.forEach((w, i) => {
            if (my > 100 + i*60 && my < 150 + i*60) { initTrees(w.seed); gameState = "GAME"; animate(); }
        });
        if (my > 520) gameState = "MENU";
    }
    else if (gameState === "MULTI_LIST") {
        // Joining existing server from list
        serverList.forEach((s, i) => {
            if (my > 100 + i*60 && my < 150 + i*60) { 
                if(isOnline) socket.emit('join-room', s); 
                initTrees(12345); gameState = "GAME"; animate();
            }
        });
        // CREATE SERVER BUTTON (FIXED)
        if (my > 400 && my < 450) {
            let n = prompt("Enter New Server Name:"); 
            if(n) { 
                serverList.push(n); 
                localStorage.setItem('rpg_servers', JSON.stringify(serverList));
                // Automatically join the newly created server
                if(isOnline) socket.emit('join-room', n);
                initTrees(12345); gameState = "GAME"; animate();
            }
        }
        if (my > 520) gameState = "MENU";
    }
});

// --- 7. STARTUP ---
const images = {}; let grassPattern, loaded = 0;
for (let k in assetPaths) {
    images[k] = new Image(); images[k].src = assetPaths[k];
    images[k].onload = () => {
        if (k === 'grass') grassPattern = ctx.createPattern(images.grass, 'repeat');
        if (++loaded === Object.keys(assetPaths).length) {
            function menuLoop() {
                if (gameState === "GAME") return;
                ctx.clearRect(0,0,600,600);
                if (images.background) ctx.drawImage(images.background, 0,0,600,600);
                if (gameState === "MENU") {
                    drawButton(150, 250, 300, 50, "NEW WORLD");
                    drawButton(150, 320, 300, 50, "LOAD WORLD");
                    drawButton(150, 390, 300, 50, "MULTIPLAYER");
                } else if (gameState === "LOAD_LIST") {
                    ctx.fillStyle="white"; ctx.textAlign="center"; ctx.fillText("LOAD WORLD", 300, 60);
                    localWorlds.forEach((w, i) => drawButton(150, 100 + i*60, 300, 50, w.name));
                    drawButton(150, 520, 300, 40, "BACK", "gray");
                } else if (gameState === "MULTI_LIST") {
                    ctx.fillStyle="white"; ctx.textAlign="center"; ctx.fillText("MULTIPLAYER SERVERS", 300, 60);
                    serverList.forEach((s, i) => drawButton(150, 100 + i*60, 300, 50, s));
                    drawButton(150, 400, 300, 50, "+ CREATE SERVER", "#27ae60");
                    drawButton(150, 520, 300, 40, "BACK", "gray");
                } else if (gameState === "CREATE") {
                    ctx.fillStyle="white"; ctx.textAlign="center";
                    ctx.fillText("TYPE WORLD NAME: " + typingName + "_", 300, 300);
                    ctx.font="12px Arial"; ctx.fillText("Press ENTER to start", 300, 330);
                }
                requestAnimationFrame(menuLoop);
            }
            menuLoop();
        }
    };
}
