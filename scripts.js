// --- 1. CORE ENGINE & MULTIPLAYER SETUP ---
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
canvas.width = 600; canvas.height = 600;
ctx.imageSmoothingEnabled = false;
document.body.appendChild(canvas);

// Live Render Server
const socket = io("https://cutter-rpg-server.onrender.com"); 
let remotePlayers = {}; 

socket.on('update-players', (data) => {
    remotePlayers = data;
    if (socket.id) delete remotePlayers[socket.id]; 
});

socket.on('tree-chopped', (data) => {
    if (trees[data.index]) {
        trees[data.index].wood = data.newWood;
    }
});

function broadcastMovement() {
    if (socket && socket.connected && gameState === "GAME") {
        socket.emit('move', {
            x: camera.x, y: camera.y, 
            dir: player.direction, moving: player.isMoving 
        });
    }
}

// --- 2. ASSETS & UI DATA ---
const assetPaths = {
    sprite: "images/image.png", axe: "images/axe.png", log: "images/log.png",
    grass: "images/grass.jpg", tree: "images/tree.png", stump: "images/c_tree.png",
    shop: "images/shop.png", desk: "images/desk.png", background: "images/t_background.png",
    house: "images/house.png", shovel: "images/shovel.png", questGiver: "images/questGiver1.png",
    slime: "images/slime.png" 
};

// Original Button Layouts
const btnNew = { x: 150, y: 250, w: 300, h: 50, text: "NEW WORLD" };
const btnLoad = { x: 150, y: 320, w: 300, h: 50, text: "LOAD WORLD" };
const btnMulti = { x: 150, y: 390, w: 300, h: 50, text: "MULTIPLAYER" };

// --- 3. STATE VARIABLES ---
let gameState = "MENU"; 
let typingName = "";
let gameFrame = 0;
let showShopGUI = false;
const stagger = 8;
const animations = { "down": 0, "left": 1, "right": 2, "up": 3 };

let player = {
    direction: "down", isMoving: false, speed: 6,
    hp: 100, maxHp: 100, wood: 0, money: 0, axeLevel: 1
};

let camera = { x: 0, y: 0 };
let trees = [], mobs = [];
const keys = {};

const shopBuilding = { x: 800, y: 800, w: 489, h: 272 };
const npc = { x: 400, y: 1200, range: 120 };

// 3x4 Slime Sheet
const SLIME_COLS = 3;
const SLIME_ROWS = 4;

// --- 4. ENGINE FUNCTIONS ---
function initTrees(seed) {
    trees = [];
    const rnd = (s) => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    let s = seed || 12345;
    for (let x = -2000; x < 2000; x += 220) {
        for (let y = -2000; y < 2000; y += 220) {
            s = (s * 9301 + 49297) % 233280;
            if (Math.hypot(x, y) > 400 && s > 0.6) {
                trees.push({ x, y, wood: 5 });
            }
        }
    }
}

function drawButton(btn) {
    ctx.fillStyle = "#3498db";
    ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
    ctx.strokeStyle = "white";
    ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);
    ctx.fillStyle = "white";
    ctx.font = "20px Arial";
    ctx.textAlign = "center";
    ctx.fillText(btn.text, btn.x + btn.w / 2, btn.y + btn.h / 1.5);
}

// --- 5. MAIN RENDER LOOP ---
function animate() {
    if (showShopGUI) {
        // Shop UI restored
        ctx.fillStyle = "rgba(0,0,0,0.8)";
        ctx.fillRect(100, 100, 400, 400);
        ctx.fillStyle = "white";
        ctx.fillText("SHOP (CLICK RED BOX TO EXIT)", 300, 150);
        ctx.fillStyle = "red";
        ctx.fillRect(430, 110, 50, 30);
        return;
    }

    // Movement & Multiplayer Sync
    let mx = (keys['KeyD']?1:0) - (keys['KeyA']?1:0);
    let my = (keys['KeyS']?1:0) - (keys['KeyW']?1:0);
    player.isMoving = (mx !== 0 || my !== 0);
    if (player.isMoving) {
        camera.x += mx * player.speed; camera.y += my * player.speed;
        if(mx > 0) player.direction = "right"; else if(mx < 0) player.direction = "left";
        else if(my > 0) player.direction = "down"; else if(my < 0) player.direction = "up";
    }
    broadcastMovement();

    // Drawing World
    ctx.save();
    ctx.translate(-camera.x + 300, -camera.y + 300);
    if (grassPattern) {
        ctx.fillStyle = grassPattern;
        ctx.fillRect(camera.x - 1000, camera.y - 1000, 2000, 2000);
    }
    ctx.restore();

    // Entity Sorting
    let drawList = trees.map((t, i) => ({ ...t, d: t.wood > 0 ? 't' : 's', index: i }));
    drawList.push({ x: camera.x, y: camera.y, d: 'p', dir: player.direction, moving: player.isMoving });
    drawList.sort((a, b) => a.y - b.y);

    drawList.forEach(obj => {
        let sx = obj.x - camera.x + 300, sy = obj.y - camera.y + 300;
        if (obj.d === 't') ctx.drawImage(images.tree, sx - 80, sy - 160, 160, 180);
        else if (obj.d === 's') ctx.drawImage(images.stump, sx - 40, sy - 40, 80, 80);
        else if (obj.d === 'p') {
            let grid = images.sprite.width / 4;
            let f = (obj.moving ? Math.floor(gameFrame / stagger) % 4 : 0);
            ctx.drawImage(images.sprite, f * grid, animations[obj.dir] * grid, grid, grid, sx - 32, sy - 32, 64, 64);
        }
    });

    gameFrame++;
}

// --- 6. INPUTS & ORIGINAL UI LOGIC ---
window.addEventListener('keydown', e => {
    if (gameState === "CREATE") {
        if (e.key === "Enter") { initTrees(Date.now()); gameState = "GAME"; }
        else if (e.key === "Backspace") typingName = typingName.slice(0, -1);
        else if (e.key.length === 1) typingName += e.key;
        return;
    }
    keys[e.code] = true;
});

window.addEventListener('keyup', e => keys[e.code] = false);

canvas.addEventListener('mousedown', e => {
    const rect = canvas.getBoundingClientRect(), mx = e.clientX - rect.left, my = e.clientY - rect.top;
    
    if (gameState === "MENU") {
        if (mx > btnNew.x && mx < btnNew.x + btnNew.w && my > btnNew.y && my < btnNew.y + btnNew.h) gameState = "CREATE";
        if (mx > btnMulti.x && mx < btnMulti.x + btnMulti.w && my > btnMulti.y && my < btnMulti.y + btnMulti.h) {
            const room = prompt("Room Name:");
            if (room) { socket.emit('join-room', room); initTrees(12345); gameState = "GAME"; }
        }
    }
});

// --- 7. LOAD & START ---
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
                else if (gameState === "MENU") {
                    if (images.background) ctx.drawImage(images.background, 0, 0, 600, 600);
                    drawButton(btnNew); drawButton(btnLoad); drawButton(btnMulti);
                } else if (gameState === "CREATE") {
                    ctx.fillStyle = "black"; ctx.fillRect(0,0,600,600);
                    ctx.fillStyle = "white"; ctx.textAlign = "center";
                    ctx.fillText("Name World: " + typingName, 300, 250);
                    ctx.fillText("Press ENTER to start", 300, 350);
                }
                requestAnimationFrame(main);
            }
            main();
        }
    };
}
