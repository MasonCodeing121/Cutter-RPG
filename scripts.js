// --- 1. NETWORKING & ENGINE SETUP ---
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
canvas.width = 600; 
canvas.height = 600;
ctx.imageSmoothingEnabled = false;
document.body.appendChild(canvas);

// Change this to your Render URL when you go live!
const socket = io("http://localhost:3000"); 
let remotePlayers = {}; 

socket.on('update-players', (data) => {
    remotePlayers = data;
    if (socket.id) delete remotePlayers[socket.id]; 
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

// --- 2. GAME DATA & ASSETS ---
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
    slime: "images/slime_spritesheet.png"
};

const images = {};
let grassPattern;
const animations = { "down": 0, "left": 1, "right": 2, "up": 3 };
const stagger = 8;

// Slime Sheet Constants
const SLIME_COLUMNS = 3;
const SLIME_ROWS = 4;

// --- 3. PLAYER & WORLD STATE ---
let gameState = "MENU"; 
let gameFrame = 0;
let currentRoom = "forest"; 
let showShopGUI = false;

let player = {
    x: 0, y: 0, // Logic coords
    w: 64, h: 64,
    direction: "down",
    isMoving: false,
    speed: 6,
    hp: 100,
    maxHp: 100,
    wood: 0,
    money: 0,
    axeLevel: 1,
    isSwinging: false,
    swingTimer: 0,
    hasStumpRemover: false
};

let camera = { x: 0, y: 0 };
let trees = [];
let mobs = [];

const shopBuilding = { x: 800, y: 800, w: 489, h: 272 };
const npc = { x: 400, y: 1200, name: "Elder Oak" };

// --- 4. WORLD LOGIC ---
function initTrees(seed) {
    trees = [];
    const rnd = (s) => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    let s = seed;
    for (let x = -2000; x < 2000; x += 220) {
        for (let y = -2000; y < 2000; y += 220) {
            s = (s * 9301 + 49297) % 233280;
            if (Math.hypot(x, y) > 400 && s > 0.6) {
                trees.push({ 
                    x: x, y: y, 
                    wood: 5, 
                    maxWood: 5, 
                    shakeTimer: 0 
                });
            }
        }
    }
}

function updateSlimes() {
    if (gameFrame % 120 === 0 && mobs.length < 5) {
        mobs.push({ 
            x: camera.x + (Math.random() - 0.5) * 800, 
            y: camera.y + (Math.random() - 0.5) * 800, 
            hp: 30, 
            frame: 0, 
            frameTimer: 0 
        });
    }

    mobs.forEach(m => {
        let dx = camera.x - m.x;
        let dy = camera.y - m.y;
        let dist = Math.hypot(dx, dy);
        if (dist < 400 && dist > 30) {
            m.x += (dx / dist) * 2;
            m.y += (dy / dist) * 2;
        }
        // Fix slime animation frame logic
        m.frameTimer++;
        if (m.frameTimer > 10) {
            m.frame = (m.frame + 1) % (SLIME_COLUMNS * SLIME_ROWS);
            m.frameTimer = 0;
        }
    });
}

// --- 5. RENDERING ---
function drawShopGUI() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
    ctx.fillRect(100, 100, 400, 400);
    ctx.strokeStyle = "#00ffcc";
    ctx.lineWidth = 3;
    ctx.strokeRect(100, 100, 400, 400);

    ctx.fillStyle = "white";
    ctx.font = "24px Arial";
    ctx.textAlign = "center";
    ctx.fillText("WOOD SHOP", 300, 150);

    // EXIT BUTTON
    ctx.fillStyle = "#ff4444";
    ctx.fillRect(440, 110, 50, 30);
    ctx.fillStyle = "white";
    ctx.font = "16px Arial";
    ctx.fillText("EXIT", 465, 130);

    // SHOP ITEMS
    ctx.textAlign = "left";
    ctx.fillText("1. Upgrade Axe (50 Wood)", 130, 220);
    ctx.fillText("2. Stump Remover (100 Wood)", 130, 270);
}

function animate() {
    if (showShopGUI) {
        drawShopGUI();
        return;
    }

    updateSlimes();

    // Movement Logic
    let moveX = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
    let moveY = (keys['KeyS'] ? 1 : 0) - (keys['KeyW'] ? 1 : 0);
    player.isMoving = false;

    if (moveX !== 0 || moveY !== 0) {
        camera.x += moveX * player.speed;
        camera.y += moveY * player.speed;
        player.isMoving = true;
        if (moveX > 0) player.direction = "right";
        else if (moveX < 0) player.direction = "left";
        else if (moveY > 0) player.direction = "down";
        else if (moveY < 0) player.direction = "up";
    }

    broadcastMovement();

    // Draw World
    ctx.save();
    ctx.translate(-camera.x + 300, -camera.y + 300);
    if (grassPattern) {
        ctx.fillStyle = grassPattern;
        ctx.fillRect(camera.x - 600, camera.y - 600, 1200, 1200);
    }
    ctx.restore();

    // Depth Sorted Draw List
    let entities = trees.map(t => ({ ...t, type: t.wood > 0 ? 'tree' : 'stump' }));
    entities.push({ x: camera.x, y: camera.y, type: 'player', dir: player.direction, moving: player.isMoving });
    entities.push({ x: npc.x, y: npc.y, type: 'npc' });
    mobs.forEach(m => entities.push({ ...m, type: 'slime' }));
    for (let id in remotePlayers) entities.push({ ...remotePlayers[id], type: 'remote' });

    entities.sort((a, b) => a.y - b.y);

    entities.forEach(ent => {
        let sx = ent.x - camera.x + 300;
        let sy = ent.y - camera.y + 300;

        if (ent.type === 'tree') ctx.drawImage(images.tree, sx - 80, sy - 160, 160, 180);
        else if (ent.type === 'stump') ctx.drawImage(images.stump, sx - 40, sy - 40, 80, 80);
        else if (ent.type === 'npc') ctx.drawImage(images.questGiver, sx - 32, sy - 32, 64, 64);
        else if (ent.type === 'slime') {
            // FIXED SLIME RENDERING MATH
            let sw = images.slime.width / SLIME_COLUMNS;
            let sh = images.slime.height / SLIME_ROWS;
            let col = ent.frame % SLIME_COLUMNS;
            let row = Math.floor(ent.frame / SLIME_COLUMNS);
            ctx.drawImage(images.slime, col * sw, row * sh, sw, sh, sx - 32, sy - 32, 64, 64);
        }
        else if (ent.type === 'player' || ent.type === 'remote') {
            let frame = (ent.moving ? Math.floor(gameFrame / stagger) % 4 : 0);
            let grid = images.sprite.width / 4;
            ctx.drawImage(images.sprite, frame * grid, animations[ent.dir] * grid, grid, grid, sx - 32, sy - 32, 64, 64);
        }
    });

    gameFrame++;
}

// --- 6. EVENT LISTENERS ---
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);

canvas.addEventListener('mousedown', e => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (showShopGUI) {
        // EXIT BUTTON CHECK (440, 110, 50, 30)
        if (mx > 440 && mx < 490 && my > 110 && my < 140) {
            showShopGUI = false;
        }
        return;
    }

    if (gameState === "MENU") {
        if (my > 250 && my < 300) { initTrees(Date.now()); gameState = "GAME"; }
        if (my > 390 && my < 440) gameState = "MULTI_MENU";
    } 
    else if (gameState === "MULTI_MENU") {
        if (my > 200 && my < 250) {
            const room = prompt("Enter Room Name:");
            if (room) { socket.emit('join-room', room); initTrees(12345); gameState = "GAME"; }
        }
    }
    else if (gameState === "GAME") {
        // Open Shop if near shop area (Example coords)
        if (Math.hypot(camera.x - shopBuilding.x, camera.y - shopBuilding.y) < 150) {
            showShopGUI = true;
        }
    }
});

// --- 7. BOOTSTRAP ---
function loadAssets(cb) {
    let count = 0;
    for (let k in assetPaths) {
        images[k] = new Image();
        images[k].src = assetPaths[k];
        images[k].onload = () => {
            if (k === 'grass') grassPattern = ctx.createPattern(images.grass, 'repeat');
            if (++count === Object.keys(assetPaths).length) cb();
        };
    }
}

loadAssets(() => {
    function main() {
        ctx.clearRect(0,0,600,600);
        if (gameState === "GAME") animate();
        else {
            ctx.fillStyle = "white";
            ctx.textAlign = "center";
            ctx.fillText(gameState === "MENU" ? "START GAME" : "JOIN MULTIPLAYER", 300, 300);
        }
        requestAnimationFrame(main);
    }
    main();
});
