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
socket.on('room:joined', (data) => { 
    currentRoomId = data.room.id; 
    loadPlayerData(); 
});
socket.on('game:event', (data) => { if (data.senderId !== socket.id) remotePlayers[data.senderId] = data.payload; });
socket.on('room:player_left', (data) => { delete remotePlayers[data.player.id]; });

// Admin Panel Listeners
socket.on("player:teleport", (data) => { camera.x = data.x; camera.y = data.y; savePlayerData(); });
socket.on("player:set_resource", (data) => {
    if (player.hasOwnProperty(data.type)) {
        player[data.type] = data.amount;
        if (data.type === 'wood') player.totalWood = Math.max(player.totalWood, data.amount);
        savePlayerData();
    }
});
socket.on("game:announcement", (msg) => { alert("SERVER MESSAGE: " + msg); });
// Listen for Admin overrides (Resources & Position)
socket.on("player:set_resource", (data) => {
    const { type, amount } = data;

    // 1. Handle Resources
    if (type === "wood") player.wood = amount;
    if (type === "money") player.money = amount;
    if (type === "hp") player.hp = amount;

    // 2. Handle Teleportation (Position)
    if (type === "x") player.x = amount;
    if (type === "y") player.y = amount;

    // 3. Update the UI locally so the player sees the change immediately
    updatePlayerUI(); 
    
    console.log(`Admin set ${type} to ${amount}`);
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
let showQuestGiver = false;
let showInventory = false;
let questPage = 0;
let questNotif = null;
let questNotifTimer = 0;
let camera = { x: 0, y: 0 };
let trees = [], houses = [], bushes = [], mobs = [], rocks = [], crystalNodes = [];
const keys = {};
const animations = { "down": 0, "left": 1, "right": 2, "up": 3 };

let inventory = [{id: 'axe'}, {id: 'log'}, {id: 'leaves'}, {id: 'slime_gel'}];
let selectedSlot = 0;

let player = {
    direction: "down", isMoving: false,
    baseSpeed: 250, hp: 100, maxHp: 100,
    wood: 0, money: 0, leaves: 0, gel: 0, stone: 0, crystals: 0,
    totalWood: 0, totalLeaves: 0, totalGel: 0, totalStone: 0, totalCrystals: 0, kills: 0,
    isSwinging: false, swingTimer: 0, invuln: 0
};

let completedQuests = [];

const QUESTS = [
    { id: 0, name: "First Steps", desc: "Chop 5 wood from trees.", check: p => p.totalWood >= 5, reward: p => { p.money += 25; }, rewardDesc: "$25" },
    { id: 1, name: "Leaf Gatherer", desc: "Collect 10 leaves from bushes.", check: p => p.totalLeaves >= 10, reward: p => { p.money += 40; }, rewardDesc: "$40" },
    { id: 2, name: "Slime Slayer", desc: "Kill 5 slimes.", check: p => p.kills >= 5, reward: p => { p.money += 75; }, rewardDesc: "$75" },
    { id: 3, name: "Stone Breaker", desc: "Mine 15 stone from rocks.", check: p => p.totalStone >= 15, reward: p => { p.money += 100; p.maxHp += 20; p.hp = Math.min(p.hp + 20, p.maxHp); }, rewardDesc: "$100 + Max HP +20" },
    { id: 4, name: "The Lumberjack", desc: "Chop 50 wood total.", check: p => p.totalWood >= 50, reward: p => { p.money += 200; }, rewardDesc: "$200" },
    { id: 5, name: "Bushmaster", desc: "Collect 30 leaves total.", check: p => p.totalLeaves >= 30, reward: p => { p.money += 150; p.baseSpeed += 25; }, rewardDesc: "$150 + Speed Up" },
    { id: 6, name: "Gel Collector", desc: "Collect 20 slime gel.", check: p => p.totalGel >= 20, reward: p => { p.money += 300; }, rewardDesc: "$300" },
    { id: 7, name: "Crystal Hunter", desc: "Find 3 crystals.", check: p => p.totalCrystals >= 3, reward: p => { p.money += 500; p.maxHp += 25; p.hp = Math.min(p.hp + 25, p.maxHp); }, rewardDesc: "$500 + Max HP +25" },
    { id: 8, name: "The Miner", desc: "Mine 75 stone total.", check: p => p.totalStone >= 75, reward: p => { p.money += 400; p.baseSpeed += 20; }, rewardDesc: "$400 + Speed Up" },
    { id: 9, name: "Slime Lord", desc: "Kill 30 slimes.", check: p => p.kills >= 30, reward: p => { p.money += 600; p.maxHp += 30; p.hp = Math.min(p.hp + 30, p.maxHp); }, rewardDesc: "$600 + Max HP +30" },
    { id: 10, name: "Master Lumberjack", desc: "Chop 200 wood total.", check: p => p.totalWood >= 200, reward: p => { p.money += 800; p.baseSpeed += 30; }, rewardDesc: "$800 + Speed Up" },
    { id: 11, name: "Crystal Collector", desc: "Find 10 crystals.", check: p => p.totalCrystals >= 10, reward: p => { p.money += 2000; p.baseSpeed += 25; }, rewardDesc: "$2000 + Speed Up" },
    { id: 12, name: "Nature's Champion", desc: "200 wood + 100 leaves + 50 gel.", check: p => p.totalWood >= 200 && p.totalLeaves >= 100 && p.totalGel >= 50, reward: p => { p.money += 2500; p.maxHp += 60; p.hp = Math.min(p.hp + 60, p.maxHp); }, rewardDesc: "$2500 + Max HP +60" },
    { id: 13, name: "Slime Exterminator", desc: "Kill 100 slimes.", check: p => p.kills >= 100, reward: p => { p.money += 3000; p.maxHp += 50; p.hp = Math.min(p.hp + 50, p.maxHp); }, rewardDesc: "$3000 + Max HP +50" },
    { id: 14, name: "The Deep Miner", desc: "Mine 300 stone total.", check: p => p.totalStone >= 300, reward: p => { p.money += 3500; p.baseSpeed += 40; }, rewardDesc: "$3500 + Big Speed Up" },
    { id: 15, name: "Crystal Legend", desc: "Find 30 crystals.", check: p => p.totalCrystals >= 30, reward: p => { p.money += 10000; p.baseSpeed += 50; p.maxHp += 100; p.hp = Math.min(p.hp + 100, p.maxHp); }, rewardDesc: "$10000 + Huge Bonuses!" }
];

const shopBounds = { x: 700, y: 700, w: 250, h: 150 };
const questGiverPos = { x: 320, y: -80 };

// --- 4. ENGINE FUNCTIONS ---
function savePlayerData() {
    const saveData = { player, completedQuests };
    localStorage.setItem(`rpg_save_${currentRoomId || 'solo'}`, JSON.stringify(saveData));
}

function loadPlayerData() {
    const data = localStorage.getItem(`rpg_save_${currentRoomId || 'solo'}`);
    if (data) {
        const parsed = JSON.parse(data);
        player = { ...player, ...parsed.player };
        completedQuests = parsed.completedQuests || [];
    }
}

function initWorld(seed) {
    trees = []; houses = []; bushes = []; mobs = []; rocks = []; crystalNodes = [];
    let s = seed || 12345;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let x = -2000; x < 2000; x += 250) {
        for (let y = -2000; y < 2000; y += 250) {
            if (Math.hypot(x, y) > 400) {
                let r = rnd();
                if (r > 0.82) trees.push({ x, y, wood: 5, shake: 0, respawn: 0 });
                else if (r > 0.65) bushes.push({ x, y, health: 3, shake: 0, respawn: 0 });
                else if (r > 0.55) spawnSlime(x, y);
                else if (r > 0.42) rocks.push({ x, y, hp: 8, maxHp: 8, shake: 0, respawn: 0 });
                else if (r > 0.415) crystalNodes.push({ x, y, hp: 15, maxHp: 15, shake: 0, respawn: 0 });
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
    for (let r of rocks) if (r.hp > 0 && Math.hypot(nx - r.x, ny - r.y) < 45) return true;
    for (let c of crystalNodes) if (c.hp > 0 && Math.hypot(nx - c.x, ny - c.y) < 45) return true;
    if (Math.hypot(nx - questGiverPos.x, ny - questGiverPos.y) < 60) return true;
    if (nx > shopBounds.x && nx < shopBounds.x + shopBounds.w && ny > shopBounds.y && ny < shopBounds.y + shopBounds.h) return true;
    return false;
}

function drawButton(x, y, w, h, text, color = "#3498db") {
    ctx.fillStyle = color; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "white"; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "white"; ctx.font = "bold 14px Arial"; ctx.textAlign = "center";
    ctx.fillText(text, x + w / 2, y + h / 1.6);
}

function drawRock(r) {
    const rx = r.x - camera.x + 300, ry = r.y - camera.y + 300;
    if (rx < -50 || rx > 650 || ry < -50 || ry > 650) return;
    ctx.save();
    if (r.shake > 0) ctx.translate(Math.sin(r.shake * 20) * 3, 0);
    ctx.fillStyle = "#7f8c8d";
    ctx.beginPath(); ctx.arc(rx, ry, 25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#95a5a6";
    ctx.beginPath(); ctx.arc(rx - 5, ry - 5, 10, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

function drawCrystalNode(c) {
    const cx = c.x - camera.x + 300, cy = c.y - camera.y + 300;
    if (cx < -50 || cx > 650 || cy < -50 || cy > 650) return;
    ctx.save();
    if (c.shake > 0) ctx.translate(Math.sin(c.shake * 20) * 3, 0);
    ctx.fillStyle = "#34495e";
    ctx.beginPath(); ctx.moveTo(cx, cy - 30); ctx.lineTo(cx + 25, cy); ctx.lineTo(cx, cy + 30); ctx.lineTo(cx - 25, cy); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#00d2ff";
    ctx.beginPath(); ctx.moveTo(cx, cy - 20); ctx.lineTo(cx + 15, cy); ctx.lineTo(cx, cy + 20); ctx.lineTo(cx - 15, cy); ctx.closePath(); ctx.fill();
    ctx.restore();
}

function drawQuestGiver() {
    const gx = questGiverPos.x - camera.x + 300, gy = questGiverPos.y - camera.y + 300;
    if (images.sprite) ctx.drawImage(images.sprite, 0, 0, 32, 32, gx - 32, gy - 32, 64, 64);
    ctx.fillStyle = "white"; ctx.font = "bold 12px Arial"; ctx.textAlign = "center";
    ctx.fillText("Quest Master", gx, gy - 40);
    ctx.fillStyle = "yellow"; ctx.font = "bold 20px Arial";
    ctx.fillText("!", gx, gy - 60);
}

function drawQuestUI() {
    ctx.fillStyle = "rgba(0,0,0,0.85)"; ctx.fillRect(50, 50, 500, 500);
    ctx.strokeStyle = "#f1c40f"; ctx.lineWidth = 4; ctx.strokeRect(50, 50, 500, 500);
    ctx.fillStyle = "#f1c40f"; ctx.font = "bold 24px Arial"; ctx.textAlign = "center";
    ctx.fillText("QUESTS (Page " + (questPage + 1) + ")", 300, 90);

    const startIdx = questPage * 4;
    for (let i = 0; i < 4; i++) {
        const q = QUESTS[startIdx + i];
        if (!q) break;
        const qy = 130 + i * 100;
        const isDone = completedQuests.includes(q.id);
        const canClaim = !isDone && q.check(player);

        ctx.fillStyle = isDone ? "#27ae60" : "#333";
        ctx.fillRect(70, qy, 460, 80);
        ctx.fillStyle = "white"; ctx.textAlign = "left"; ctx.font = "bold 16px Arial";
        ctx.fillText(q.name + (isDone ? " (COMPLETED)" : ""), 85, qy + 25);
        ctx.font = "12px Arial";
        ctx.fillText(q.desc, 85, qy + 45);
        ctx.fillStyle = "#f1c40f";
        ctx.fillText("Reward: " + q.rewardDesc, 85, qy + 65);

        if (canClaim) drawButton(400, qy + 20, 120, 40, "CLAIM", "#f1c40f");
    }

    drawButton(100, 480, 100, 40, "PREV", "gray");
    drawButton(400, 480, 100, 40, "NEXT", "gray");
    drawButton(250, 480, 100, 40, "CLOSE", "#e74c3c");
}

function drawInventory() {
    ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(150, 540, 300, 50);
    for (let i = 0; i < 4; i++) {
        const x = 160 + i * 72;
        ctx.strokeStyle = selectedSlot === i ? "white" : "#555";
        ctx.lineWidth = selectedSlot === i ? 3 : 1;
        ctx.strokeRect(x, 545, 60, 40);
        const item = inventory[i];
        if (item && images[item.id]) ctx.drawImage(images[item.id], x + 15, 550, 30, 30);
    }
}

// --- 5. MAIN ENGINE ---
function animate(currentTime) {
    const dt = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    if (gameState === "GAME") {
        ctx.clearRect(0, 0, 600, 600);
        if (images.grass) {
            const pattern = ctx.createPattern(images.grass, 'repeat');
            ctx.fillStyle = pattern;
            ctx.save(); ctx.translate(-camera.x % 128, -camera.y % 128);
            ctx.fillRect(-128, -128, 856, 856); ctx.restore();
        }

        if (!showShop && !showQuestGiver && !showInventory) {
            let mx = (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) - (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0);
            let my = (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0) - (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0);

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

            // Network Sync
            if (isOnline && currentRoomId && gameFrame % 3 === 0) {
                socket.emit('game:event', { 
                    roomId: currentRoomId, 
                    payload: { 
                        name: typingName, x: camera.x, y: camera.y, hp: player.hp,
                        wood: player.wood, money: player.money, dir: player.direction, 
                        moving: player.isMoving, swinging: player.isSwinging 
                    } 
                });
            }
        }

        // Draw World Objects
        if (images.shop) ctx.drawImage(images.shop, shopBounds.x - camera.x + 300, shopBounds.y - camera.y + 300, shopBounds.w, shopBounds.h);
        drawQuestGiver();
        rocks.forEach(drawRock);
        crystalNodes.forEach(drawCrystalNode);
        
        trees.forEach(t => {
            const tx = t.x - camera.x + 300, ty = t.y - camera.y + 300;
            if (t.wood > 0 && images.tree) ctx.drawImage(images.tree, tx - 64, ty - 96, 128, 128);
            else if (images.stump) ctx.drawImage(images.stump, tx - 32, ty - 32, 64, 64);
        });

        bushes.forEach(b => {
            const bx = b.x - camera.x + 300, by = b.y - camera.y + 300;
            if (b.health > 0 && images.bush) ctx.drawImage(images.bush, bx - 32, by - 32, 64, 64);
        });

        // Remote Players
        for (let id in remotePlayers) {
            const p = remotePlayers[id];
            const rx = p.x - camera.x + 300, ry = p.y - camera.y + 300;
            if (images.sprite) {
                const frame = p.moving ? (Math.floor(gameFrame / 10) % 4) * 32 : 32;
                ctx.drawImage(images.sprite, frame, animations[p.dir] * 32, 32, 32, rx - 32, ry - 32, 64, 64);
            }
            ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.fillText(p.name || "Player", rx, ry - 40);
        }

        // Local Player
        ctx.save();
        if (player.invuln > 0) ctx.globalAlpha = 0.5;
        if (images.sprite) {
            const frame = player.isMoving ? (Math.floor(gameFrame / 10) % 4) * 32 : 32;
            ctx.drawImage(images.sprite, frame, animations[player.direction] * 32, 32, 32, 268, 268, 64, 64);
        }
        if (player.isSwinging && images.axe) {
            ctx.translate(300, 300);
            const rot = { "down": 0, "up": Math.PI, "left": Math.PI / 2, "right": -Math.PI / 2 }[player.direction];
            ctx.rotate(rot + Math.sin(player.swingTimer * 0.5));
            ctx.drawImage(images.axe, -16, 20, 32, 32);
        }
        ctx.restore();

        // UI
        ctx.fillStyle = "white"; ctx.font = "bold 18px Arial"; ctx.textAlign = "left";
        ctx.fillText(`$${player.money} | Wood: ${player.wood} | Stone: ${player.stone}`, 20, 30);
        ctx.fillStyle = "red"; ctx.fillRect(20, 50, 150, 15);
        ctx.fillStyle = "green"; ctx.fillRect(20, 50, 150 * (player.hp / player.maxHp), 15);

        if (showShop) {
            ctx.fillStyle = "rgba(0,0,0,0.8)"; ctx.fillRect(100, 100, 400, 400);
            ctx.fillStyle = "white"; ctx.fillText("Wood -> $5 (W)", 150, 200);
            ctx.fillText("Stone -> $10 (S)", 150, 250);
            drawButton(250, 420, 100, 40, "CLOSE", "red");
        }
        if (showQuestGiver) drawQuestUI();
        drawInventory();
    }
    gameFrame++;
    requestAnimationFrame(animate);
}

function drawMenu() {
    ctx.clearRect(0, 0, 600, 600);
    if (images.background) ctx.drawImage(images.background, 0, 0, 600, 600);
    if (gameState === "MENU") {
        drawButton(150, 200, 300, 50, "NEW WORLD");
        drawButton(150, 270, 300, 50, "LOAD WORLD");
        drawButton(150, 340, 300, 50, "MULTIPLAYER");
    } else if (gameState === "CREATE") {
        ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.font = "bold 20px Arial";
        ctx.fillText("WORLD NAME: " + typingName + "_", 300, 300);
        drawButton(150, 500, 300, 40, "BACK", "gray");
    } else if (gameState === "LOAD_LIST") {
        let worlds = JSON.parse(localStorage.getItem('rpg_worlds') || '[]');
        worlds.forEach((w, i) => { 
            drawButton(150, 100 + i * 60, 200, 50, w.name); 
            drawButton(360, 100 + i * 60, 90, 50, "DELETE", "red"); 
        });
        drawButton(150, 520, 300, 40, "BACK", "gray");
    }
}

// --- 6. NAVIGATION & INPUTS ---
window.addEventListener('keydown', e => {
    if (gameState === "CREATE") {
        if (e.key === "Enter" && typingName) {
            let worlds = JSON.parse(localStorage.getItem('rpg_worlds') || '[]');
            const newWorld = { name: typingName, seed: Date.now() };
            worlds.push(newWorld);
            localStorage.setItem('rpg_worlds', JSON.stringify(worlds));
            initWorld(newWorld.seed); gameState = "GAME"; animate(performance.now());
        } else if (e.key === "Backspace") typingName = typingName.slice(0, -1);
        else if (e.key.length === 1) typingName += e.key;
        return;
    }
    if (e.code === "Space" && gameState === "GAME") {
        player.isSwinging = true; player.swingTimer = 10;
        // Interaction Logic
        if (Math.hypot(camera.x - questGiverPos.x, camera.y - questGiverPos.y) < 80) showQuestGiver = true;
        if (camera.x > shopBounds.x - 20 && camera.x < shopBounds.x + shopBounds.w + 20 && camera.y > shopBounds.y - 20 && camera.y < shopBounds.y + shopBounds.h + 20) showShop = true;
    }
    keys[e.code] = true;
});
window.addEventListener('keyup', e => keys[e.code] = false);

canvas.addEventListener('mousedown', e => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;

    if (gameState === "MENU") {
        if (mx > 150 && mx < 450) {
            if (my > 200 && my < 250) { typingName = ""; gameState = "CREATE"; }
            if (my > 270 && my < 320) gameState = "LOAD_LIST";
            if (my > 340 && my < 390) {
                const r = prompt("Room Name:"); 
                if(r) { socket.emit('room:join', { roomId: r, playerName: typingName || "Player" }); gameState = "GAME"; initWorld(555); animate(performance.now()); }
            }
        }
    } else if (gameState === "LOAD_LIST") {
        let worlds = JSON.parse(localStorage.getItem('rpg_worlds') || '[]');
        worlds.forEach((w, i) => {
            if (mx > 150 && mx < 350 && my > 100 + i * 60 && my < 150 + i * 60) { initWorld(w.seed); gameState = "GAME"; animate(performance.now()); }
            if (mx > 360 && mx < 450 && my > 100 + i * 60 && my < 150 + i * 60) { worlds.splice(i, 1); localStorage.setItem('rpg_worlds', JSON.stringify(worlds)); }
        });
        if (mx > 150 && mx < 450 && my > 520 && my < 560) gameState = "MENU";
    }
    if (showQuestGiver) {
        if (mx > 400 && mx < 500 && my > 480 && my < 520) questPage++;
        if (mx > 100 && mx < 200 && my > 480 && my < 520 && questPage > 0) questPage--;
        if (mx > 250 && mx < 350 && my > 480 && my < 520) showQuestGiver = false;
        
        const startIdx = questPage * 4;
        for (let i = 0; i < 4; i++) {
            const q = QUESTS[startIdx + i];
            if (q && q.check(player) && !completedQuests.includes(q.id)) {
                if (mx > 400 && mx < 520 && my > 130 + i * 100 + 20 && my < 130 + i * 100 + 60) {
                    q.reward(player); completedQuests.push(q.id); savePlayerData();
                }
            }
        }
    }
    if (showShop && mx > 250 && mx < 350 && my > 420 && my < 460) showShop = false;
});

// Assets Trigger
const images = {}; let loaded = 0;
for (let k in assetPaths) {
    images[k] = new Image(); images[k].src = assetPaths[k];
    images[k].onload = () => { if (++loaded === Object.keys(assetPaths).length) drawMenu(); };
}
