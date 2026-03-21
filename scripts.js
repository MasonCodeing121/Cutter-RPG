// --- 1. SETUP & NETWORKING ---
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
canvas.width = 600; canvas.height = 600;
ctx.imageSmoothingEnabled = false;
document.body.appendChild(canvas);

const socket = io("https://server-5jkd.onrender.com/", { transports: ['websocket', 'polling'] });
let remotePlayers = {}; 
let isOnline = false;
let lastTime = 0;
let currentRoomId = null;

socket.on('connect', () => { isOnline = true; });
socket.on('room:joined', (data) => { currentRoomId = data.room.id; });
socket.on('game:event', (data) => { if (data.senderId !== socket.id) remotePlayers[data.senderId] = data.payload; });
socket.on('room:player_left', (data) => { delete remotePlayers[data.player.id]; });

// --- ADMIN COMMAND LISTENERS ---
socket.on("player:teleport", (data) => {
    camera.x = data.x;
    camera.y = data.y;
    console.log("Admin teleported you to:", data.x, data.y);
});

socket.on("player:set_resource", (data) => {
    if (player.hasOwnProperty(data.type)) {
        player[data.type] = data.amount;
    }
});

socket.on("game:announcement", (msg) => {
    alert("SYSTEM ANNOUNCEMENT: " + msg);
});

// --- 2. ASSETS ---
const assetPaths = {
    sprite: "images/image.png", axe: "images/axe.png", grass: "images/grass.jpg",
    tree: "images/tree.png", stump: "images/c_tree.png", shop: "images/shop.png",
    background: "images/t_background.png", log: "images/log.png", house: "images/house.png",
    bush: "images/bush.png", leaves: "images/leaves.png", slime: "images/slime.png",
    gel: "images/slime_gel.png" 
};

// --- 3. STATE ---
let gameState = "MENU";
let gameFrame = 0;
let typingName = "";
let showShop = false;
let camera = { x: 0, y: 0 };
let trees = [], houses = [], bushes = [], mobs = [];
const keys = {};
const animations = { "down": 0, "left": 1, "right": 2, "up": 3 };

let inventory = [{id: 'axe'}, {id: 'log'}, {id: 'leaves'}, {id: 'slime_gel'}];
let selectedSlot = 0;

let player = {
    direction: "down", isMoving: false, 
    baseSpeed: 250, hp: 100, maxHp: 100,
    wood: 0, money: 0, leaves: 0, gel: 0,
    isSwinging: false, swingTimer: 0, invuln: 0
};

const shopBounds = { x: 700, y: 700, w: 250, h: 150 };

// --- 4. ENGINE FUNCTIONS ---
function initWorld(seed) {
    trees = []; houses = []; bushes = []; mobs = [];
    let s = seed || 12345;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let x = -2000; x < 2000; x += 250) {
        for (let y = -2000; y < 2000; y += 250) {
            if (Math.hypot(x, y) > 400) {
                let r = rnd();
                if (r > 0.8) trees.push({ x, y, wood: 5, shake: 0, respawn: 0 });
                else if (r > 0.6) bushes.push({ x, y, health: 3, shake: 0, respawn: 0 });
                else if (r > 0.55) spawnSlime(x, y);
            }
        }
    }
}

function spawnSlime(x, y) {
    mobs.push({ x, y, hp: 3, type: 'slime', dir: 'down', targetX: x, targetY: y, state: 'WANDER', timer: 0, shake: 0 });
}

function checkCollision(nx, ny) {
    for (let t of trees) if (t.wood > 0 && Math.hypot(nx - t.x, ny - t.y) < 50) return true;
    for (let b of bushes) if (b.health > 0 && Math.hypot(nx - b.x, ny - b.y) < 40) return true;
    if (nx > shopBounds.x && nx < shopBounds.x + shopBounds.w && ny > shopBounds.y && ny < shopBounds.y + shopBounds.h) return true;
    return false;
}

function drawButton(x, y, w, h, text, color = "#3498db") {
    ctx.fillStyle = color; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "white"; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "white"; ctx.font = "bold 16px Arial"; ctx.textAlign = "center";
    ctx.fillText(text, x + w/2, y + h/1.6);
}

// --- 5. MAIN GAME LOOP ---
function animate(currentTime) {
    const dt = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    if (gameState === "GAME") {
        if (!showShop) {
            let mx = (keys['KeyD']||keys['ArrowRight']?1:0) - (keys['KeyA']||keys['ArrowLeft']?1:0);
            let my = (keys['KeyS']||keys['ArrowDown']?1:0) - (keys['KeyW']||keys['ArrowUp']?1:0);

            if ((mx !== 0 || my !== 0) && !player.isSwinging) {
                let moveDist = player.baseSpeed * dt;
                let nX = camera.x + mx * moveDist, nY = camera.y + my * moveDist;
                if (!checkCollision(nX, camera.y)) camera.x = nX;
                if (!checkCollision(camera.x, nY)) camera.y = nY;
                player.isMoving = true;
                player.direction = mx > 0 ? "right" : mx < 0 ? "left" : my > 0 ? "down" : "up";
            } else { player.isMoving = false; }

            if (player.isSwinging) { player.swingTimer -= dt * 30; if (player.swingTimer <= 0) player.isSwinging = false; }
            if (player.invuln > 0) player.invuln -= dt;

            // Mob AI
            mobs.forEach(m => {
                let distToPlayer = Math.hypot(camera.x - m.x, camera.y - m.y);
                m.state = distToPlayer < 250 ? 'CHASE' : 'WANDER';
                let speed = (m.state === 'CHASE' ? 120 : 40) * dt;
                let tx = (m.state === 'CHASE' ? camera.x : m.targetX);
                let ty = (m.state === 'CHASE' ? camera.y : m.targetY);
                if (Math.hypot(tx - m.x, ty - m.y) > 5) {
                    let angle = Math.atan2(ty - m.y, tx - m.x);
                    m.x += Math.cos(angle) * speed; m.y += Math.sin(angle) * speed;
                    m.dir = Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle)) ? (Math.cos(angle)>0?'right':'left') : (Math.sin(angle)>0?'down':'up');
                } else if (m.state === 'WANDER') {
                    m.targetX = m.x + (Math.random() - 0.5) * 200; m.targetY = m.y + (Math.random() - 0.5) * 200;
                }
                if (distToPlayer < 40 && player.invuln <= 0) {
                    player.hp -= 10; player.invuln = 1.0;
                    if (player.hp <= 0) { camera.x = 0; camera.y = 0; player.hp = 100; }
                }
            });

            // Multiplayer Sync
            if (isOnline && currentRoomId && gameFrame % 3 === 0) {
                socket.emit('game:event', { 
                    roomId: currentRoomId, 
                    payload: { 
                        x: camera.x, y: camera.y, dir: player.direction, 
                        moving: player.isMoving, swinging: player.isSwinging, hp: player.hp 
                    } 
                });
            }
        }

        ctx.clearRect(0, 0, 600, 600);
        ctx.save(); ctx.translate(-camera.x + 300, -camera.y + 300);

        if (grassPattern) { ctx.fillStyle = grassPattern; ctx.fillRect(camera.x - 2500, camera.y - 2500, 5000, 5000); }
        ctx.drawImage(images.shop, shopBounds.x, shopBounds.y, shopBounds.w, shopBounds.h);

        // Sort everything for depth rendering
        let drawList = [];
        trees.forEach(t => { 
            if(t.wood <= 0) { t.respawn += dt; if(t.respawn > 15) { t.wood = 5; t.respawn = 0; t.shake = 0; } }
            drawList.push({...t, type: t.wood > 0 ? 'tree' : 'stump'}); 
        });
        bushes.forEach(b => { 
            if(b.health <= 0) { b.respawn += dt; if(b.respawn > 12) { b.health = 3; b.respawn = 0; b.shake = 0; } }
            drawList.push({...b, type: 'bush'}); 
        });
        mobs.forEach(m => drawList.push({...m, type: 'slime_mob'}));
        for (let id in remotePlayers) drawList.push({ ...remotePlayers[id], type: 'other' });
        drawList.push({ x: camera.x, y: camera.y, type: 'player' });
        drawList.sort((a, b) => a.y - b.y);

        drawList.forEach(obj => {
            let sX = (obj.shake > 0) ? Math.sin(gameFrame * 0.8) * 4 : 0;
            if (obj.shake > 0) obj.shake -= dt * 40;
            if (obj.type === 'tree') ctx.drawImage(images.tree, obj.x - 80 + sX, obj.y - 160, 160, 180);
            else if (obj.type === 'stump') ctx.drawImage(images.stump, obj.x - 40, obj.y - 40, 80, 80);
            else if (obj.type === 'bush') {
                let fX = (obj.health <= 0) ? images.bush.width / 2 : 0;
                ctx.drawImage(images.bush, fX, 0, images.bush.width / 2, images.bush.height, obj.x - 40 + sX, obj.y - 40, 80, 80);
            }
            else if (obj.type === 'slime_mob') {
                let gridW = images.slime.width / 3; let gridH = images.slime.height / 4; 
                let f = Math.floor(gameFrame / 10) % 3;
                ctx.drawImage(images.slime, f * gridW, animations[obj.dir] * gridH, gridW, gridH, obj.x - 32 + sX, obj.y - 32, 64, 64);
            }
            else if (obj.type === 'player' || obj.type === 'other') {
                let grid = images.sprite.width / 4;
                let isM = (obj.type === 'player') ? player.isMoving : obj.moving;
                let d = (obj.type === 'player') ? player.direction : obj.dir;
                let f = isM ? Math.floor(gameFrame / 10) % 4 : 0;
                if (obj.type === 'player' && player.invuln > 0 && gameFrame % 4 < 2) ctx.globalAlpha = 0.3;
                ctx.drawImage(images.sprite, f * grid, animations[d] * grid, grid, grid, obj.x - 32, obj.y - 32, 64, 64);
                ctx.globalAlpha = 1.0;
                if ((obj.type==='player' && player.isSwinging) || (obj.type==='other' && obj.swinging)) {
                    ctx.save(); ctx.translate(obj.x, obj.y); ctx.rotate(-0.5);
                    ctx.drawImage(images.axe, 15, -35, 40, 40); ctx.restore();
                }
            }
        });
        ctx.restore();

        // UI Layer
        ctx.fillStyle = "black"; ctx.fillRect(20, 20, 200, 20);
        ctx.fillStyle = "red"; ctx.fillRect(20, 20, (player.hp / player.maxHp) * 200, 20);
        ctx.strokeStyle = "white"; ctx.strokeRect(20, 20, 200, 20);

        if (showShop) {
            ctx.fillStyle = "rgba(0,0,0,0.9)"; ctx.fillRect(100, 100, 400, 400);
            ctx.fillStyle = "white"; ctx.textAlign="center"; ctx.fillText("SHOP", 300, 150);
            drawButton(200, 200, 200, 40, "SELL WOOD (+$5)");
            drawButton(200, 260, 200, 40, "SELL LEAVES (+$2)");
            drawButton(200, 320, 200, 40, "SELL GEL (+$10)");
            ctx.fillText(`Money: $${player.money}`, 300, 420);
        }

        // Inventory bar
        for (let i = 0; i < 4; i++) {
            ctx.fillStyle = (selectedSlot === i) ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.6)";
            ctx.fillRect(190 + i * 55, 530, 50, 50); ctx.strokeRect(190 + i * 55, 530, 50, 50);
            let itm = inventory[i];
            if (itm.id === 'axe') ctx.drawImage(images.axe, 200 + i * 55, 540, 30, 30);
            if (itm.id === 'log') { 
                ctx.drawImage(images.log, 200 + i * 55, 540, 30, 30); 
                ctx.fillStyle="white"; ctx.fillText(player.wood, 230 + i * 55, 575); 
            }
        }
    }
    gameFrame++;
    requestAnimationFrame(animate);
}

// --- 6. INPUTS ---
window.addEventListener('keydown', e => {
    if (gameState === "CREATE") {
        if (e.key === "Enter" && typingName) {
            let worlds = JSON.parse(localStorage.getItem('rpg_worlds') || '[]');
            worlds.push({ name: typingName, seed: Date.now() });
            localStorage.setItem('rpg_worlds', JSON.stringify(worlds));
            initWorld(Date.now()); gameState = "GAME"; animate(performance.now());
        } else if (e.key === "Backspace") typingName = typingName.slice(0, -1);
        else if (e.key.length === 1) typingName += e.key;
        return;
    }
    if (e.code === "KeyE" && gameState === "GAME") {
        if (Math.hypot(camera.x - (shopBounds.x + 125), camera.y - (shopBounds.y + 75)) < 180) showShop = !showShop;
    }
    keys[e.code] = true;
    if (["1","2","3","4"].includes(e.key)) selectedSlot = parseInt(e.key) - 1;

    if (e.code === "Space" && gameState === "GAME" && !player.isSwinging && !showShop) {
        if (inventory[selectedSlot].id === 'axe') {
            player.isSwinging = true; player.swingTimer = 10;
            // Interaction logic
            trees.forEach(t => { if (t.wood > 0 && Math.hypot(camera.x - t.x, camera.y - t.y) < 110) { t.wood--; t.shake = 10; if (t.wood <= 0) player.wood += 5; } });
            bushes.forEach(b => { if (b.health > 0 && Math.hypot(camera.x - b.x, camera.y - b.y) < 80) { b.health--; b.shake = 10; if (b.health <= 0) player.leaves += 3; } });
            mobs.forEach((m, i) => { if (Math.hypot(camera.x - m.x, camera.y - m.y) < 100) { m.hp--; m.shake = 10; if (m.hp <= 0) { player.gel++; mobs.splice(i, 1); } } });
        }
    }
});
window.addEventListener('keyup', e => keys[e.code] = false);

canvas.addEventListener('mousedown', e => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    if (showShop) {
        if (mx > 200 && mx < 400) {
            if (my > 200 && my < 240) { player.money += player.wood * 5; player.wood = 0; }
            if (my > 260 && my < 300) { player.money += player.leaves * 2; player.leaves = 0; }
            if (my > 320 && my < 360) { player.money += player.gel * 10; player.gel = 0; }
        }
        return;
    }
    if (gameState === "MENU") {
        if (mx > 150 && mx < 450) {
            if (my > 200 && my < 250) { typingName = ""; gameState = "CREATE"; }
            if (my > 270 && my < 320) gameState = "LOAD_LIST";
            if (my > 340 && my < 390) gameState = "MULTI_LIST";
        }
    } 
    else if (gameState === "LOAD_LIST") {
        let worlds = JSON.parse(localStorage.getItem('rpg_worlds') || '[]');
        worlds.forEach((w, i) => {
            if (mx > 150 && mx < 350 && my > 100 + i*60 && my < 150 + i*60) { initWorld(w.seed); gameState = "GAME"; animate(performance.now()); }
        });
        if (my > 520) gameState = "MENU";
    }
    else if (gameState === "MULTI_LIST") {
        let servers = JSON.parse(localStorage.getItem('rpg_servers') || '[]');
        servers.forEach((s, i) => {
            if (mx > 150 && mx < 350 && my > 100 + i*60 && my < 150 + i*60) { socket.emit('room:join', { roomId: s, playerName: 'Player' }); initWorld(12345); gameState = "GAME"; animate(performance.now()); }
        });
        if (mx > 150 && mx < 450 && my > 400 && my < 450) {
            let n = prompt("Server Name:"); if(n) { servers.push(n); localStorage.setItem('rpg_servers', JSON.stringify(servers)); }
        }
        if (my > 520) gameState = "MENU";
    }
});

// --- 7. ASSET LOADING & MENU ---
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
                    drawButton(150, 200, 300, 50, "NEW WORLD");
                    drawButton(150, 270, 300, 50, "LOAD WORLD");
                    drawButton(150, 340, 300, 50, "MULTIPLAYER");
                } else if (gameState === "CREATE") {
                    ctx.fillStyle="white"; ctx.textAlign="center"; ctx.fillText("NAME: " + typingName + "_", 300, 300);
                } else if (gameState === "LOAD_LIST" || gameState === "MULTI_LIST") {
                    drawButton(150, 520, 300, 40, "BACK", "gray");
                }
                requestAnimationFrame(loop);
            }
            loop();
        }
    };
}
