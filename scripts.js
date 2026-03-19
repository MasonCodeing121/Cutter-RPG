// --- 1. CORE ENGINE & MULTIPLAYER SETUP ---
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
canvas.width = 600; 
canvas.height = 600;
ctx.imageSmoothingEnabled = false;
document.body.appendChild(canvas);

// UPDATED: Using your actual live Render URL
const socket = io("https://cutter-rpg-server.onrender.com"); 
let remotePlayers = {}; 

socket.on('update-players', (data) => {
    remotePlayers = data;
    if (socket.id) delete remotePlayers[socket.id]; 
});

socket.on('tree-chopped', (data) => {
    if (trees[data.index]) {
        trees[data.index].wood = data.newWood;
        trees[data.index].shakeTimer = 10;
    }
});

function broadcastMovement() {
    if (socket && socket.connected && gameState === "GAME") {
        socket.emit('move', {
            x: camera.x, 
            y: camera.y, 
            dir: player.direction, 
            moving: player.isMoving 
        });
    }
}

// --- 2. ASSETS & DATA ---
const assetPaths = {
    sprite: "images/image.png",
    axe: "images/axe.png",
    log: "images/log.png",
    grass: "images/grass.jpg",
    tree: "images/tree.png",
    stump: "images/c_tree.png",
    shop: "images/shop.png",
    desk: "images/desk.png",
    background: "images/t_background.png",
    house: "images/house.png",
    shovel: "images/shovel.png",
    questGiver: "images/questGiver1.png",
    slime: "images/slime.png" // UPDATED: Correct filename
};

const questList = [
    { id: 1, text: "Elder Oak: Bring me 5 logs for a prize.", target: 5, reward: 150, type: "WOOD" },
    { id: 2, text: "Elder Oak: Slay 3 forest slimes!", target: 3, reward: 300, type: "MOBS" }
];

// --- 3. VARIABLES & CONSTANTS ---
let gameState = "MENU"; 
let gameFrame = 0;
let showShopGUI = false;
let dialogueText = "";
const stagger = 8;
const animations = { "down": 0, "left": 1, "right": 2, "up": 3 };

let player = {
    direction: "down", isMoving: false, speed: 6,
    hp: 100, maxHp: 100, wood: 0, money: 0, axeLevel: 1,
    isSwinging: false, swingTimer: 0, hasStumpRemover: false
};

let camera = { x: 0, y: 0 };
let trees = [], mobs = [];
const keys = {};

const shopBuilding = { x: 800, y: 800, w: 489, h: 272 };
const npc = { x: 400, y: 1200, range: 120 };

// 3x4 Spritesheet logic for slime.png
const SLIME_COLS = 3;
const SLIME_ROWS = 4;

// --- 4. WORLD LOGIC ---
function initTrees(seed) {
    trees = [];
    const rnd = (s) => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    let s = seed;
    for (let x = -2000; x < 2000; x += 220) {
        for (let y = -2000; y < 2000; y += 220) {
            s = (s * 9301 + 49297) % 233280;
            if (Math.hypot(x, y) > 400 && s > 0.6) {
                trees.push({ x, y, wood: 5, shakeTimer: 0 });
            }
        }
    }
}

function updateSlimes() {
    if (gameFrame % 150 === 0 && mobs.length < 5) {
        mobs.push({ 
            x: camera.x + (Math.random() - 0.5) * 1000, 
            y: camera.y + (Math.random() - 0.5) * 1000, 
            hp: 40, frame: 0, frameTimer: 0 
        });
    }
    mobs.forEach((m, index) => {
        let dx = camera.x - m.x, dy = camera.y - m.y, dist = Math.hypot(dx, dy);
        if (dist < 400 && dist > 20) {
            m.x += (dx / dist) * 2; m.y += (dy / dist) * 2;
        }
        m.frameTimer++;
        if (m.frameTimer > 10) {
            m.frame = (m.frame + 1) % (SLIME_COLS * SLIME_ROWS);
            m.frameTimer = 0;
        }
        if (m.hp <= 0) mobs.splice(index, 1);
    });
}

// --- 5. RENDER FUNCTIONS ---
function drawShopGUI() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
    ctx.fillRect(100, 100, 400, 400);
    ctx.strokeStyle = "#00ffcc";
    ctx.strokeRect(100, 100, 400, 400);

    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.font = "24px Arial";
    ctx.fillText("WOODCUTTER SHOP", 300, 150);

    // EXIT BUTTON
    ctx.fillStyle = "#ff4444";
    ctx.fillRect(430, 110, 60, 30);
    ctx.fillStyle = "white";
    ctx.font = "14px Arial";
    ctx.fillText("CLOSE", 460, 130);

    ctx.textAlign = "left";
    ctx.fillText(`Gold: ${player.money}`, 130, 200);
    ctx.fillText("1. Upgrade Axe (50 Wood)", 130, 250);
    ctx.fillText("2. Stump Remover (100 Wood)", 130, 300);
}

function animate() {
    if (showShopGUI) { drawShopGUI(); return; }

    updateSlimes();

    let mx = (keys['KeyD']?1:0) - (keys['KeyA']?1:0);
    let my = (keys['KeyS']?1:0) - (keys['KeyW']?1:0);
    player.isMoving = false;
    if (mx !== 0 || my !== 0) {
        camera.x += mx * player.speed; camera.y += my * player.speed;
        player.isMoving = true;
        if(mx > 0) player.direction = "right"; else if(mx < 0) player.direction = "left";
        else if(my > 0) player.direction = "down"; else if(my < 0) player.direction = "up";
    }

    broadcastMovement();

    ctx.save();
    ctx.translate(-camera.x + 300, -camera.y + 300);
    if (grassPattern) {
        ctx.fillStyle = grassPattern;
        ctx.fillRect(camera.x - 1000, camera.y - 1000, 2000, 2000);
    }
    ctx.restore();

    let drawList = trees.map((t, i) => ({ ...t, d: t.wood > 0 ? 't' : 's', index: i }));
    drawList.push({ x: camera.x, y: camera.y, d: 'p', dir: player.direction, moving: player.isMoving });
    drawList.push({ x: npc.x, y: npc.y, d: 'n' });
    mobs.forEach(m => drawList.push({ ...m, d: 'm' }));
    for (let id in remotePlayers) drawList.push({ ...remotePlayers[id], d: 'other' });

    drawList.sort((a, b) => a.y - b.y);

    drawList.forEach(obj => {
        let sx = obj.x - camera.x + 300, sy = obj.y - camera.y + 300;
        if (obj.d === 't') ctx.drawImage(images.tree, sx - 80, sy - 160, 160, 180);
        else if (obj.d === 's') ctx.drawImage(images.stump, sx - 40, sy - 40, 80, 80);
        else if (obj.d === 'n') ctx.drawImage(images.questGiver, sx - 32, sy - 32, 64, 64);
        else if (obj.d === 'm') {
            let sw = images.slime.width / SLIME_COLS, sh = images.slime.height / SLIME_ROWS;
            ctx.drawImage(images.slime, (obj.frame % SLIME_COLS) * sw, Math.floor(obj.frame / SLIME_COLS) * sh, sw, sh, sx - 32, sy - 32, 64, 64);
        }
        else if (obj.d === 'p' || obj.d === 'other') {
            let grid = images.sprite.width / 4;
            let f = (obj.moving ? Math.floor(gameFrame / stagger) % 4 : 0);
            ctx.drawImage(images.sprite, f * grid, animations[obj.dir] * grid, grid, grid, sx - 32, sy - 32, 64, 64);
        }
    });

    ctx.fillStyle = "white"; ctx.font = "18px Arial"; ctx.textAlign = "left";
    ctx.fillText(`Wood: ${player.wood} | Gold: ${player.money}`, 20, 30);
}

// --- 6. INTERACTION & INPUT ---
window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === "Space" && gameState === "GAME") {
        trees.forEach((t, i) => {
            if (t.wood > 0 && Math.hypot(camera.x - t.x, camera.y - t.y) < 100) {
                t.wood -= player.axeLevel;
                socket.emit('chop-tree', { index: i, newWood: t.wood }); 
                if (t.wood <= 0) player.wood += 5;
            }
        });
    }
});
window.addEventListener('keyup', e => keys[e.code] = false);

canvas.addEventListener('mousedown', e => {
    const rect = canvas.getBoundingClientRect(), mx = e.clientX - rect.left, my = e.clientY - rect.top;
    
    if (showShopGUI) {
        if (mx > 430 && mx < 490 && my > 110 && my < 140) showShopGUI = false;
        return;
    }

    if (gameState === "MENU") {
        if (my > 250 && my < 300) { initTrees(Date.now()); gameState = "GAME"; }
        if (my > 390 && my < 440) {
            const room = prompt("Room Name:");
            if (room) { socket.emit('join-room', room); initTrees(12345); gameState = "GAME"; }
        }
    } else if (gameState === "GAME") {
        if (Math.hypot(camera.x - shopBuilding.x, camera.y - shopBuilding.y) < 150) showShopGUI = true;
    }
});

// --- 7. STARTUP ---
const images = {};
let grassPattern, loaded = 0;
for (let k in assetPaths) {
    images[k] = new Image();
    images[k].src = assetPaths[k];
    images[k].onload = () => {
        if (k === 'grass') grassPattern = ctx.createPattern(images.grass, 'repeat');
        if (++loaded === Object.keys(assetPaths).length) {
            function main() {
                ctx.clearRect(0,0,600,600);
                if (gameState === "GAME") animate();
                else {
                    ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.font = "30px Arial";
                    ctx.fillText("NEW GAME", 300, 280);
                    ctx.fillText("MULTIPLAYER", 300, 420);
                }
                gameFrame++; requestAnimationFrame(main);
            }
            main();
        }
    };
}
