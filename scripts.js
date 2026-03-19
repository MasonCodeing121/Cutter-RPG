// --- 1. SETUP & NETWORKING ---
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
canvas.width = 600; canvas.height = 600;
ctx.imageSmoothingEnabled = false;
document.body.appendChild(canvas);

const socket = io("https://cutter-rpg-server.onrender.com", { transports: ['websocket', 'polling'] }); 
let remotePlayers = {}; 
let isOnline = false;

socket.on('connect', () => { isOnline = true; });
socket.on('update-players', (data) => {
    remotePlayers = data;
    if (socket.id) delete remotePlayers[socket.id];
});

// --- 2. ASSETS ---
const assetPaths = {
    sprite: "images/image.png", axe: "images/axe.png", grass: "images/grass.jpg",
    tree: "images/tree.png", stump: "images/c_tree.png", shop: "images/shop.png",
    background: "images/t_background.png", slime: "images/slime.png", 
    log: "images/log.png", house: "images/house.png" 
};

// --- 3. STATE & WORLD DATA ---
let gameState = "MENU";
let gameFrame = 0;
let typingName = "";
let camera = { x: 0, y: 0 };
let trees = [], houses = [];
const keys = {};
const animations = { "down": 0, "left": 1, "right": 2, "up": 3 };

let inventory = [ {id: 'axe'}, {id: 'log'}, {id: 'blueprint'}, {id: null} ];
let selectedSlot = 0;
let marker = null; 

let localWorlds = JSON.parse(localStorage.getItem('rpg_worlds') || '[]');
let serverList = JSON.parse(localStorage.getItem('rpg_servers') || '[]');

let player = {
    direction: "down", isMoving: false, speed: 5,
    wood: 0, isSwinging: false, swingTimer: 0
};

const shopBounds = { x: 700, y: 700, w: 250, h: 150 };

// --- 4. ENGINE FUNCTIONS ---
function initTrees(seed) {
    trees = []; houses = [];
    let s = seed || 12345;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let x = -1500; x < 1500; x += 250) {
        for (let y = -1500; y < 1500; y += 250) {
            if (Math.hypot(x, y) > 400 && rnd() > 0.6) {
                trees.push({ x, y, wood: 5, shake: 0, respawn: 0 });
            }
        }
    }
}

function checkCollision(nx, ny) {
    // Tree Collisions
    for (let t of trees) {
        if (t.wood > 0 && Math.hypot(nx - t.x, ny - t.y) < 45) return true;
    }
    // House Collisions
    for (let h of houses) {
        if (nx > h.x - 40 && nx < h.x + 80 && ny > h.y - 40 && ny < h.y + 40) return true;
    }
    // Shop Collision
    if (nx > shopBounds.x && nx < shopBounds.x + shopBounds.w && 
        ny > shopBounds.y && ny < shopBounds.y + shopBounds.h) return true;
    return false;
}

function drawButton(x, y, w, h, text, color = "#3498db") {
    ctx.fillStyle = color; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "white"; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "white"; ctx.font = "bold 18px Arial"; ctx.textAlign = "center";
    ctx.fillText(text, x + w/2, y + h/1.6);
}

// --- 5. MAIN ANIMATION ---
function animate() {
    // Movement Logic
    let mx = (keys['KeyD']||keys['ArrowRight']?1:0) - (keys['KeyA']||keys['ArrowLeft']?1:0);
    let my = (keys['KeyS']||keys['ArrowDown']?1:0) - (keys['KeyW']||keys['ArrowUp']?1:0);

    if ((mx !== 0 || my !== 0) && !player.isSwinging) {
        let nX = camera.x + mx * player.speed, nY = camera.y + my * player.speed;
        if (!checkCollision(nX, camera.y)) camera.x = nX;
        if (!checkCollision(camera.x, nY)) camera.y = nY;
        player.isMoving = true;
        if(mx > 0) player.direction = "right"; else if(mx < 0) player.direction = "left";
        else if(my > 0) player.direction = "down"; else if(my < 0) player.direction = "up";
        if (isOnline) socket.emit('move', { x: camera.x, y: camera.y, dir: player.direction, moving: true });
    } else {
        player.isMoving = false;
        if (isOnline && gameFrame % 10 === 0) socket.emit('move', { x: camera.x, y: camera.y, dir: player.direction, moving: false });
    }

    if (player.isSwinging) { player.swingTimer--; if (player.swingTimer <= 0) player.isSwinging = false; }

    // World Rendering
    ctx.clearRect(0, 0, 600, 600);
    ctx.save();
    ctx.translate(-camera.x + 300, -camera.y + 300);

    if (grassPattern) { ctx.fillStyle = grassPattern; ctx.fillRect(camera.x - 2000, camera.y - 2000, 4000, 4000); }
    ctx.drawImage(images.shop, shopBounds.x, shopBounds.y, shopBounds.w, shopBounds.h);
    
    // Sort and Draw Everything
    let drawList = [];
    trees.forEach(t => { 
        if (t.wood <= 0) { t.respawn++; if(t.respawn > 1000) t.wood = 5; }
        drawList.push({ ...t, type: t.wood > 0 ? 'tree' : 'stump' });
    });
    houses.forEach(h => drawList.push({ ...h, type: 'built_house' }));
    for (let id in remotePlayers) drawList.push({ ...remotePlayers[id], type: 'other' });
    drawList.push({ x: camera.x, y: camera.y, type: 'player' });
    drawList.sort((a, b) => a.y - b.y);

    drawList.forEach(obj => {
        let sX = (obj.shake > 0) ? Math.sin(gameFrame * 2) * 5 : 0;
        if (obj.shake > 0) obj.shake--;

        if (obj.type === 'tree') ctx.drawImage(images.tree, obj.x - 80 + sX, obj.y - 160, 160, 180);
        else if (obj.type === 'stump') ctx.drawImage(images.stump, obj.x - 40, obj.y - 40, 80, 80);
        else if (obj.type === 'built_house') ctx.drawImage(images.house, obj.x - 60, obj.y - 80, 120, 120);
        else if (obj.type === 'player' || obj.type === 'other') {
            let grid = images.sprite.width / 4;
            let isM = (obj.type === 'player') ? player.isMoving : obj.moving;
            let f = (isM ? Math.floor(gameFrame / 8) % 4 : 0);
            let d = (obj.type === 'player') ? player.direction : obj.dir;
            ctx.drawImage(images.sprite, f * grid, animations[d] * grid, grid, grid, obj.x - 32, obj.y - 32, 64, 64);
            if (obj.type === 'player' && player.isSwinging) {
                ctx.save(); ctx.translate(obj.x, obj.y); ctx.rotate(player.swingTimer * -0.3);
                ctx.drawImage(images.axe, 15, -35, 40, 40); ctx.restore();
            }
        }
    });

    if (marker) { ctx.fillStyle = "red"; ctx.beginPath(); ctx.arc(marker.x, marker.y, 8, 0, Math.PI*2); ctx.fill(); }
    ctx.restore();

    // UI: Minimap, Arrow, Inventory
    ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(480, 10, 110, 110);
    trees.forEach(t => { if(t.wood > 0) { ctx.fillStyle = "#5d4037"; ctx.fillRect(480 + 55 + (t.x/40), 10 + 55 + (t.y/40), 2, 2); } });
    ctx.fillStyle = "lime"; ctx.fillRect(480 + 55 + (camera.x/40), 10 + 55 + (camera.y/40), 4, 4);

    if (marker) {
        let angle = Math.atan2(marker.y - camera.y, marker.x - camera.x);
        ctx.save(); ctx.translate(300, 300); ctx.rotate(angle);
        ctx.fillStyle = "lime"; ctx.beginPath(); ctx.moveTo(50, 0); ctx.lineTo(35, -8); ctx.lineTo(35, 8); ctx.fill(); ctx.restore();
    }

    for (let i = 0; i < 4; i++) {
        ctx.fillStyle = (selectedSlot === i) ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.6)";
        ctx.fillRect(200 + i * 55, 530, 50, 50); ctx.strokeRect(200 + i * 55, 530, 50, 50);
        let item = inventory[i];
        if (item.id === 'axe') ctx.drawImage(images.axe, 210 + i * 55, 540, 30, 30);
        if (item.id === 'log') { ctx.drawImage(images.log, 210 + i * 55, 540, 30, 30); ctx.fillStyle="white"; ctx.fillText(player.wood, 240 + i * 55, 575); }
        if (item.id === 'blueprint') ctx.drawImage(images.house, 210 + i * 55, 540, 30, 30);
    }

    gameFrame++;
    requestAnimationFrame(animate);
}

// --- 6. INPUTS ---
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
    if (["1","2","3","4"].includes(e.key)) selectedSlot = parseInt(e.key) - 1;
    if (e.key.toLowerCase() === "c") marker = null;

    if (e.code === "Space" && gameState === "GAME" && !player.isSwinging) {
        if (inventory[selectedSlot].id === 'axe') {
            player.isSwinging = true; player.swingTimer = 12;
            trees.forEach(t => {
                if (t.wood > 0 && Math.hypot(camera.x - t.x, camera.y - t.y) < 100) {
                    t.wood--; t.shake = 10; if (t.wood <= 0) { player.wood += 5; t.respawn = 0; }
                }
            });
        }
    }
});
window.addEventListener('keyup', e => keys[e.code] = false);

canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    if(gameState === "GAME") marker = { x: (e.clientX - canvas.offsetLeft) + camera.x - 300, y: (e.clientY - canvas.offsetTop) + camera.y - 300 };
});

canvas.addEventListener('mousedown', e => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    
    if (gameState === "GAME" && inventory[selectedSlot].id === 'blueprint') {
        if (player.wood >= 50) {
            houses.push({ x: mx + camera.x - 300, y: my + camera.y - 300 });
            player.wood -= 50;
        } else { alert("Need 50 Wood to build!"); }
        return;
    }

    if (gameState === "MENU") {
        if (mx > 150 && mx < 450) {
            if (my > 250 && my < 300) { typingName = ""; gameState = "CREATE"; }
            if (my > 320 && my < 370) gameState = "LOAD_LIST";
            if (my > 390 && my < 440) gameState = "MULTI_LIST";
        }
    } 
    else if (gameState === "LOAD_LIST") {
        localWorlds.forEach((w, i) => { if (my > 100 + i*60 && my < 150 + i*60) { initTrees(w.seed); gameState = "GAME"; animate(); }});
        if (my > 520) gameState = "MENU";
    }
    else if (gameState === "MULTI_LIST") {
        serverList.forEach((s, i) => { if (my > 100 + i*60 && my < 150 + i*60) { if(isOnline) socket.emit('join-room', s); initTrees(12345); gameState = "GAME"; animate(); }});
        if (my > 400 && my < 450) {
            let n = prompt("Server Name:"); 
            if(n) { serverList.push(n); localStorage.setItem('rpg_servers', JSON.stringify(serverList)); if(isOnline) socket.emit('join-room', n); initTrees(12345); gameState = "GAME"; animate(); }
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
            function loop() {
                if (gameState === "GAME") return;
                ctx.clearRect(0,0,600,600);
                if (images.background) ctx.drawImage(images.background, 0,0,600,600);
                if (gameState === "MENU") {
                    drawButton(150, 250, 300, 50, "NEW WORLD");
                    drawButton(150, 320, 300, 50, "LOAD WORLD");
                    drawButton(150, 390, 300, 50, "MULTIPLAYER");
                } else if (gameState === "LOAD_LIST") {
                    localWorlds.forEach((w, i) => drawButton(150, 100 + i*60, 300, 50, w.name));
                    drawButton(150, 520, 300, 40, "BACK", "gray");
                } else if (gameState === "MULTI_LIST") {
                    serverList.forEach((s, i) => drawButton(150, 100 + i*60, 300, 50, s));
                    drawButton(150, 400, 300, 50, "+ CREATE SERVER", "#27ae60");
                    drawButton(150, 520, 300, 40, "BACK", "gray");
                } else if (gameState === "CREATE") {
                    ctx.fillStyle="white"; ctx.textAlign="center"; ctx.fillText("WORLD NAME: " + typingName + "_", 300, 300);
                }
                requestAnimationFrame(loop);
            }
            loop();
        }
    };
}
