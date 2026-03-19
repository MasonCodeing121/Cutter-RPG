// --- 1. SETUP & NETWORKING ---
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
canvas.width = 600; canvas.height = 600;
ctx.imageSmoothingEnabled = false;
document.body.appendChild(canvas);

const socket = io("https://cutter-rpg-server.onrender.com"); 
let remotePlayers = {}; 

socket.on('update-players', (data) => {
    remotePlayers = data;
    if (socket.id) delete remotePlayers[socket.id]; 
});

// --- 2. ASSETS ---
const assetPaths = {
    sprite: "images/image.png", axe: "images/axe.png", log: "images/log.png",
    grass: "images/grass.jpg", tree: "images/tree.png", stump: "images/c_tree.png",
    shop: "images/shop.png", desk: "images/desk.png", background: "images/t_background.png",
    house: "images/house.png", shovel: "images/shovel.png", questGiver: "images/questGiver1.png",
    slime: "images/slime.png" 
};

// --- 3. STATE & SAVES ---
let gameState = "MENU";
let gameFrame = 0;
let showShopGUI = false;
let typingName = "";
let camera = { x: 0, y: 0 };
let trees = [], mobs = [];
const keys = {};

// Load saved worlds and servers from LocalStorage
let localWorlds = JSON.parse(localStorage.getItem('rpg_worlds') || '[]');
let serverList = JSON.parse(localStorage.getItem('rpg_servers') || '[]');

let player = {
    direction: "down", isMoving: false, speed: 6,
    wood: 0, money: 0, axeLevel: 1,
    isSwinging: false, swingTimer: 0
};

// 3x4 Slime Sheet
const SLIME_COLS = 3; const SLIME_ROWS = 4;

// --- 4. ENGINE FUNCTIONS ---
function initTrees(seed) {
    trees = [];
    const rnd = (s) => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    let s = seed || 12345;
    for (let x = -2000; x < 2000; x += 220) {
        for (let y = -2000; y < 2000; y += 220) {
            s = (s * 9301 + 49297) % 233280;
            if (Math.hypot(x, y) > 400 && s > 0.6) {
                trees.push({ x, y, wood: 5, shake: 0 });
            }
        }
    }
}

function drawButton(x, y, w, h, text, color = "#3498db") {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "white";
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "white";
    ctx.font = "18px Arial";
    ctx.textAlign = "center";
    ctx.fillText(text, x + w/2, y + h/1.7);
}

// --- 5. GAME LOOP ---
function animate() {
    // 1. Logic
    let mx = (keys['KeyD']?1:0) - (keys['KeyA']?1:0);
    let my = (keys['KeyS']?1:0) - (keys['KeyW']?1:0);
    player.isMoving = (mx !== 0 || my !== 0) && !player.isSwinging;
    
    if (player.isMoving) {
        camera.x += mx * player.speed; camera.y += my * player.speed;
        if(mx > 0) player.direction = "right"; else if(mx < 0) player.direction = "left";
        else if(my > 0) player.direction = "down"; else if(my < 0) player.direction = "up";
        socket.emit('move', { x: camera.x, y: camera.y, dir: player.direction, moving: true });
    }

    if (player.isSwinging) {
        player.swingTimer--;
        if (player.swingTimer <= 0) player.isSwinging = false;
    }

    // 2. Rendering
    ctx.clearRect(0, 0, 600, 600);
    
    // World Translation
    ctx.save();
    ctx.translate(-camera.x + 300, -camera.y + 300);
    if (grassPattern) { ctx.fillStyle = grassPattern; ctx.fillRect(camera.x - 600, camera.y - 600, 1200, 1200); }
    
    // Shop Building near spawn
    ctx.drawImage(images.shop, 700, 700, 300, 200);

    // Entities
    let drawList = trees.map((t, i) => ({ ...t, d: t.wood > 0 ? 't' : 's', index: i }));
    drawList.push({ x: camera.x, y: camera.y, d: 'p', dir: player.direction, moving: player.isMoving });
    drawList.sort((a, b) => a.y - b.y);

    drawList.forEach(obj => {
        let sx = obj.x - camera.x + 300, sy = obj.y - camera.y + 300;
        let shake = obj.shake > 0 ? Math.sin(gameFrame) * 5 : 0;
        if (obj.shake > 0) obj.shake--;

        if (obj.d === 't') ctx.drawImage(images.tree, sx - 80 + shake, sy - 160, 160, 180);
        else if (obj.d === 's') ctx.drawImage(images.stump, sx - 40, sy - 40, 80, 80);
        else if (obj.d === 'p') {
            let grid = images.sprite.width / 4;
            let f = (obj.moving ? Math.floor(gameFrame / 8) % 4 : 0);
            ctx.drawImage(images.sprite, f * grid, animations[obj.dir] * grid, grid, grid, sx - 32, sy - 32, 64, 64);
            
            // AXE SWING RENDER
            if (player.isSwinging) {
                ctx.save();
                ctx.translate(sx, sy);
                ctx.rotate(player.swingTimer * 0.2);
                ctx.drawImage(images.axe, 10, -30, 40, 40);
                ctx.restore();
            }
        }
    });
    ctx.restore();

    // 3. UI OVERLAY
    // Coordinates (Top Left)
    ctx.fillStyle = "white"; ctx.textAlign = "left"; ctx.font = "14px monospace";
    ctx.fillText(`X: ${Math.floor(camera.x)} Y: ${Math.floor(camera.y)}`, 10, 20);

    // Mini-map (Top Right)
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(480, 10, 110, 110);
    ctx.fillStyle = "lime"; ctx.fillRect(480 + 55 + (camera.x/50), 10 + 55 + (camera.y/50), 4, 4);

    gameFrame++;
}

// --- 6. INPUTS & MENU LOGIC ---
window.addEventListener('keydown', e => {
    if (gameState === "CREATE") {
        if (e.key === "Enter" && typingName) {
            localWorlds.push({ name: typingName, seed: Date.now() });
            localStorage.setItem('rpg_worlds', JSON.stringify(localWorlds));
            initTrees(Date.now()); gameState = "GAME";
        } else if (e.key === "Backspace") typingName = typingName.slice(0, -1);
        else if (e.key.length === 1) typingName += e.key;
    }
    keys[e.code] = true;

    if (e.code === "Space" && gameState === "GAME" && !player.isSwinging) {
        player.isSwinging = true; player.swingTimer = 15;
        // Hit logic
        trees.forEach(t => {
            if (t.wood > 0 && Math.hypot(camera.x - t.x, camera.y - t.y) < 100) {
                t.wood--; t.shake = 10;
                if (t.wood <= 0) player.wood += 5;
            }
        });
    }
});

window.addEventListener('keyup', e => keys[e.code] = false);

canvas.addEventListener('mousedown', e => {
    const rect = canvas.getBoundingClientRect(), mx = e.clientX - rect.left, my = e.clientY - rect.top;
    
    if (gameState === "MENU") {
        if (my > 250 && my < 300) gameState = "CREATE";
        if (my > 320 && my < 370) gameState = "LOAD_LIST";
        if (my > 390 && my < 440) gameState = "MULTI_LIST";
    } 
    else if (gameState === "LOAD_LIST") {
        localWorlds.forEach((w, i) => {
            if (my > 100 + i*60 && my < 150 + i*60) { initTrees(w.seed); gameState = "GAME"; }
        });
        if (my > 500) gameState = "MENU";
    }
    else if (gameState === "MULTI_LIST") {
        serverList.forEach((s, i) => {
            if (my > 100 + i*60 && my < 150 + i*60) { socket.emit('join-room', s); initTrees(12345); gameState = "GAME"; }
        });
        if (drawButton(150, 400, 300, 50, "ADD SERVER")) {
            let n = prompt("Server Name:"); 
            if(n) { serverList.push(n); localStorage.setItem('rpg_servers', JSON.stringify(serverList)); }
        }
        if (my > 500) gameState = "MENU";
    }
});

// --- 7. START ---
const images = {}; let grassPattern, loaded = 0;
for (let k in assetPaths) {
    images[k] = new Image(); images[k].src = assetPaths[k];
    images[k].onload = () => {
        if (k === 'grass') grassPattern = ctx.createPattern(images.grass, 'repeat');
        if (++loaded === Object.keys(assetPaths).length) {
            function main() {
                if (gameState === "GAME") animate();
                else {
                    ctx.clearRect(0,0,600,600);
                    if (images.background) ctx.drawImage(images.background, 0,0,600,600);
                    if (gameState === "MENU") {
                        drawButton(150, 250, 300, 50, "NEW WORLD");
                        drawButton(150, 320, 300, 50, "LOAD WORLD");
                        drawButton(150, 390, 300, 50, "MULTIPLAYER");
                    } else if (gameState === "LOAD_LIST") {
                        ctx.fillText("SELECT WORLD", 300, 50);
                        localWorlds.forEach((w, i) => drawButton(150, 100 + i*60, 300, 50, w.name));
                        drawButton(150, 520, 300, 40, "BACK", "gray");
                    } else if (gameState === "MULTI_LIST") {
                        ctx.fillText("SERVER LIST", 300, 50);
                        serverList.forEach((s, i) => drawButton(150, 100 + i*60, 300, 50, s));
                        drawButton(150, 400, 300, 50, "ADD SERVER", "green");
                        drawButton(150, 520, 300, 40, "BACK", "gray");
                    } else if (gameState === "CREATE") {
                        ctx.fillStyle="white"; ctx.fillText("WORLD NAME: " + typingName, 300, 300);
                    }
                }
                requestAnimationFrame(main);
            }
            main();
        }
    };
}
