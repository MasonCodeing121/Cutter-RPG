// --- 1. CORE ENGINE SETUP ---
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
canvas.width = 600; 
canvas.height = 600;
ctx.imageSmoothingEnabled = false;
document.body.appendChild(canvas);

// --- 2. MULTIPLAYER (Live Render Server) ---
const socket = io("https://cutter-rpg-server.onrender.com"); 
let remotePlayers = {}; 

socket.on('update-players', (data) => {
    remotePlayers = data;
    if (socket.id && remotePlayers[socket.id]) delete remotePlayers[socket.id]; 
});

// --- 3. ASSETS & ANIMATION DATA ---
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

const animations = { "down": 0, "left": 1, "right": 2, "up": 3 };
const SLIME_COLS = 3; 
const SLIME_ROWS = 4;

// --- 4. GAME STATE & SAVES ---
let gameState = "MENU";
let gameFrame = 0;
let typingName = "";
let camera = { x: 0, y: 0 };
let trees = [], mobs = [];
const keys = {};

// LocalStorage for Minecraft-style lists
let localWorlds = JSON.parse(localStorage.getItem('rpg_worlds') || '[]');
let serverList = JSON.parse(localStorage.getItem('rpg_servers') || '[]');

let player = {
    direction: "down", 
    isMoving: false, 
    speed: 6,
    wood: 0, 
    money: 0, 
    axeLevel: 1,
    isSwinging: false, 
    swingTimer: 0
};

// --- 5. HELPER FUNCTIONS ---
function initTrees(seed) {
    trees = [];
    let s = seed || 12345;
    for (let x = -2000; x < 2000; x += 220) {
        for (let y = -2000; y < 2000; y += 220) {
            s = (s * 9301 + 49297) % 233280;
            if (Math.hypot(x, y) > 400 && (s / 233280) > 0.6) {
                trees.push({ x, y, wood: 5, shake: 0 });
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

function isClicked(mx, my, x, y, w, h) {
    return mx > x && mx < x + w && my > y && my < y + h;
}

// --- 6. MAIN GAME LOOP (The "Body") ---
function animate() {
    // A. Movement & Physics
    let mx = 0, my = 0;
    if (keys['KeyD'] || keys['ArrowRight']) mx = 1;
    if (keys['KeyA'] || keys['ArrowLeft']) mx = -1;
    if (keys['KeyW'] || keys['ArrowUp']) my = -1;
    if (keys['KeyS'] || keys['ArrowDown']) my = 1;

    player.isMoving = (mx !== 0 || my !== 0) && !player.isSwinging;
    
    if (player.isMoving) {
        camera.x += mx * player.speed; 
        camera.y += my * player.speed;
        if(mx > 0) player.direction = "right"; 
        else if(mx < 0) player.direction = "left";
        else if(my > 0) player.direction = "down"; 
        else if(my < 0) player.direction = "up";
        
        socket.emit('move', { x: camera.x, y: camera.y, dir: player.direction, moving: true });
    }

    if (player.isSwinging) {
        player.swingTimer--;
        if (player.swingTimer <= 0) player.isSwinging = false;
    }

    // B. Slime Logic
    if (gameFrame % 300 === 0 && mobs.length < 5) {
        mobs.push({ x: camera.x + 400, y: camera.y + 400, hp: 20, frame: 0, timer: 0 });
    }
    mobs.forEach(m => {
        let dist = Math.hypot(camera.x - m.x, camera.y - m.y);
        if (dist < 300 && dist > 30) {
            m.x += (camera.x - m.x) / dist * 2;
            m.y += (camera.y - m.y) / dist * 2;
        }
        m.timer++;
        if (m.timer > 10) { m.frame = (m.frame + 1) % 12; m.timer = 0; }
    });

    // C. Rendering (Camera Fix)
    ctx.clearRect(0, 0, 600, 600);
    ctx.save();
    // Shift the whole world so player stays centered
    ctx.translate(-camera.x + 300, -camera.y + 300);

    // Grass Pattern
    if (grassPattern) { 
        ctx.fillStyle = grassPattern; 
        ctx.fillRect(camera.x - 1000, camera.y - 1000, 2000, 2000); 
    }
    
    // Shop at Spawn
    ctx.drawImage(images.shop, 700, 700, 300, 200);

    // Depth Sorted Draw List
    let drawList = [];
    trees.forEach((t, i) => drawList.push({ ...t, type: t.wood > 0 ? 'tree' : 'stump', y: t.y }));
    mobs.forEach(m => drawList.push({ ...m, type: 'slime', y: m.y }));
    for (let id in remotePlayers) drawList.push({ ...remotePlayers[id], type: 'other', y: remotePlayers[id].y });
    drawList.push({ x: camera.x, y: camera.y, type: 'player', y: camera.y, dir: player.direction, moving: player.isMoving });

    drawList.sort((a, b) => a.y - b.y);

    drawList.forEach(obj => {
        let sx = obj.x, sy = obj.y; // Using raw coords because of translate()
        
        if (obj.type === 'tree') ctx.drawImage(images.tree, sx - 80, sy - 160, 160, 180);
        else if (obj.type === 'stump') ctx.drawImage(images.stump, sx - 40, sy - 40, 80, 80);
        else if (obj.type === 'slime') {
            let sw = images.slime.width / SLIME_COLS, sh = images.slime.height / SLIME_ROWS;
            ctx.drawImage(images.slime, (obj.frame % 3) * sw, Math.floor(obj.frame / 3) * sh, sw, sh, sx - 25, sy - 25, 50, 50);
        }
        else if (obj.type === 'player' || obj.type === 'other') {
            let grid = images.sprite.width / 4;
            let f = (obj.moving ? Math.floor(gameFrame / 8) % 4 : 0);
            ctx.drawImage(images.sprite, f * grid, animations[obj.dir] * grid, grid, grid, sx - 32, sy - 32, 64, 64);
            
            if (obj.type === 'player' && player.isSwinging) {
                ctx.save();
                ctx.translate(sx, sy);
                ctx.rotate(player.swingTimer * -0.3);
                ctx.drawImage(images.axe, 15, -35, 40, 40);
                ctx.restore();
            }
        }
    });
    ctx.restore();

    // D. UI (Fixed on Screen)
    ctx.fillStyle = "white"; ctx.font = "14px monospace"; ctx.textAlign = "left";
    ctx.fillText(`COORD: ${Math.floor(camera.x)}, ${Math.floor(camera.y)}`, 15, 25);
    
    // Mini-map
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(475, 15, 110, 110);
    ctx.fillStyle = "lime"; ctx.fillRect(475 + 55 + (camera.x/100), 15 + 55 + (camera.y/100), 4, 4);

    gameFrame++;
    requestAnimationFrame(animate);
}

// --- 7. INPUT LISTENERS ---
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
        if (isClicked(mx, my, 150, 250, 300, 50)) { typingName = ""; gameState = "CREATE"; }
        if (isClicked(mx, my, 150, 320, 300, 50)) gameState = "LOAD_LIST";
        if (isClicked(mx, my, 150, 390, 300, 50)) gameState = "MULTI_LIST";
    } 
    else if (gameState === "LOAD_LIST") {
        localWorlds.forEach((w, i) => {
            if (isClicked(mx, my, 150, 100 + i*60, 300, 50)) { initTrees(w.seed); gameState = "GAME"; animate(); }
        });
        if (isClicked(mx, my, 150, 520, 300, 40)) gameState = "MENU";
    }
    else if (gameState === "MULTI_LIST") {
        serverList.forEach((s, i) => {
            if (isClicked(mx, my, 150, 100 + i*60, 300, 50)) { 
                socket.emit('join-room', s); initTrees(12345); gameState = "GAME"; animate();
            }
        });
        if (isClicked(mx, my, 150, 400, 300, 50)) {
            let n = prompt("Server Room Name:"); 
            if(n) { serverList.push(n); localStorage.setItem('rpg_servers', JSON.stringify(serverList)); }
        }
        if (isClicked(mx, my, 150, 520, 300, 40)) gameState = "MENU";
    }
});

// --- 8. STARTUP ENGINE ---
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
                    ctx.fillStyle="white"; ctx.textAlign="center"; ctx.fillText("LOAD A WORLD", 300, 60);
                    localWorlds.forEach((w, i) => drawButton(150, 100 + i*60, 300, 50, w.name));
                    drawButton(150, 520, 300, 40, "BACK", "gray");
                } else if (gameState === "MULTI_LIST") {
                    ctx.fillStyle="white"; ctx.textAlign="center"; ctx.fillText("SAVED SERVERS", 300, 60);
                    serverList.forEach((s, i) => drawButton(150, 100 + i*60, 300, 50, s));
                    drawButton(150, 400, 300, 50, "+ ADD SERVER", "green");
                    drawButton(150, 520, 300, 40, "BACK", "gray");
                } else if (gameState === "CREATE") {
                    ctx.fillStyle="white"; ctx.textAlign="center"; 
                    ctx.fillText("TYPE WORLD NAME: " + typingName + "_", 300, 300);
                }
                requestAnimationFrame(menuLoop);
            }
            menuLoop();
        }
    };
}
