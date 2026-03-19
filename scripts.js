// --- 1. SETUP & NETWORKING ---
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
canvas.width = 600; canvas.height = 600;
ctx.imageSmoothingEnabled = false;
document.body.appendChild(canvas);

// Your specific Render URL
const socket = io("https://cutter-rpg-server.onrender.com"); 
let remotePlayers = {}; 

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

let localWorlds = JSON.parse(localStorage.getItem('rpg_worlds') || '[]');
let serverList = JSON.parse(localStorage.getItem('rpg_servers') || '[]');

let player = {
    direction: "down", isMoving: false, speed: 6,
    wood: 0, money: 0, axeLevel: 1,
    isSwinging: false, swingTimer: 0
};

const animations = { "down": 0, "left": 1, "right": 2, "up": 3 };

// --- 4. ENGINE FUNCTIONS ---
function initTrees(seed) {
    trees = [];
    let s = seed || 12345;
    for (let x = -2000; x < 2000; x += 220) {
        for (let y = -2000; y < 2000; y += 220) {
            s = (s * 9301 + 49297) % 233280;
            let val = s / 233280;
            if (Math.hypot(x, y) > 400 && val > 0.6) {
                trees.push({ x, y, wood: 5, shake: 0 });
            }
        }
    }
}

function spawnSlime() {
    if (mobs.length < 5) {
        mobs.push({ 
            x: camera.x + (Math.random() - 0.5) * 800, 
            y: camera.y + (Math.random() - 0.5) * 800, 
            hp: 30, frame: 0, timer: 0 
        });
    }
}

function drawButton(x, y, w, h, text, color = "#3498db") {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "white";
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "white";
    ctx.font = "bold 18px Arial";
    ctx.textAlign = "center";
    ctx.fillText(text, x + w/2, y + h/1.6);
}

// --- 5. MAIN ANIMATION ---
function animate() {
    // A. Movement Logic
    let mx = 0, my = 0;
    if (keys['KeyD'] || keys['ArrowRight']) mx = 1;
    if (keys['KeyA'] || keys['ArrowLeft']) mx = -1;
    if (keys['KeyW'] || keys['ArrowUp']) my = -1;
    if (keys['KeyS'] || keys['ArrowDown']) my = 1;

    player.isMoving = (mx !== 0 || my !== 0) && !player.isSwinging;
    
    if (player.isMoving) {
        camera.x += mx * player.speed; 
        camera.y += my * player.speed;
        if(mx > 0) player.direction = "right"; else if(mx < 0) player.direction = "left";
        else if(my > 0) player.direction = "down"; else if(my < 0) player.direction = "up";
        
        // Broadcast to server
        socket.emit('move', { x: camera.x, y: camera.y, dir: player.direction, moving: true });
    }

    if (player.isSwinging) {
        player.swingTimer--;
        if (player.swingTimer <= 0) player.isSwinging = false;
    }

    // B. Slime AI
    if (gameFrame % 200 === 0) spawnSlime();
    mobs.forEach(m => {
        let dx = camera.x - m.x, dy = camera.y - m.y;
        let dist = Math.hypot(dx, dy);
        if (dist < 300 && dist > 30) {
            m.x += (dx/dist) * 1.5; m.y += (dy/dist) * 1.5;
        }
        m.timer++;
        if (m.timer > 10) { m.frame = (m.frame + 1) % 12; m.timer = 0; }
    });

    // C. Draw World
    ctx.clearRect(0, 0, 600, 600);
    ctx.save();
    ctx.translate(-camera.x + 300, -camera.y + 300);

    // Background/Grass
    if (grassPattern) { 
        ctx.fillStyle = grassPattern; 
        ctx.fillRect(camera.x - 600, camera.y - 600, 1200, 1200); 
    }
    
    ctx.drawImage(images.shop, 700, 700, 300, 200);

    // Sorting and Drawing Entities
    let drawList = trees.map((t, i) => ({ ...t, d: t.wood > 0 ? 't' : 's' }));
    drawList.push({ x: camera.x, y: camera.y, d: 'p', dir: player.direction, moving: player.isMoving });
    mobs.forEach(m => drawList.push({...m, d: 'm'}));
    for (let id in remotePlayers) drawList.push({...remotePlayers[id], d: 'other'});

    drawList.sort((a, b) => a.y - b.y);

    drawList.forEach(obj => {
        let sx = obj.x - camera.x + 300, sy = obj.y - camera.y + 300;
        
        if (obj.d === 't') ctx.drawImage(images.tree, sx - 80, sy - 160, 160, 180);
        else if (obj.d === 's') ctx.drawImage(images.stump, sx - 40, sy - 40, 80, 80);
        else if (obj.d === 'm') {
            // 3 columns x 4 rows
            let sw = images.slime.width / 3, sh = images.slime.height / 4;
            ctx.drawImage(images.slime, (obj.frame % 3) * sw, Math.floor(obj.frame / 3) * sh, sw, sh, sx - 25, sy - 25, 50, 50);
        }
        else if (obj.d === 'p' || obj.d === 'other') {
            let grid = images.sprite.width / 4;
            let f = (obj.moving ? Math.floor(gameFrame / 8) % 4 : 0);
            ctx.drawImage(images.sprite, f * grid, animations[obj.dir] * grid, grid, grid, sx - 32, sy - 32, 64, 64);
            
            if (obj.d === 'p' && player.isSwinging) {
                ctx.save();
                ctx.translate(sx, sy);
                ctx.rotate(player.swingTimer * -0.3);
                ctx.drawImage(images.axe, 15, -35, 40, 40);
                ctx.restore();
            }
        }
    });
    ctx.restore();

    // D. UI
    ctx.fillStyle = "white"; ctx.textAlign = "left"; ctx.font = "14px monospace";
    ctx.fillText(`POS: ${Math.floor(camera.x)}, ${Math.floor(camera.y)}`, 15, 25);
    
    // Mini-map
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(475, 15, 110, 110);
    ctx.fillStyle = "lime"; ctx.fillRect(475 + 55 + (camera.x/100), 15 + 55 + (camera.y/100), 4, 4);

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
        serverList.forEach((s, i) => {
            if (my > 100 + i*60 && my < 150 + i*60) { 
                socket.emit('join-room', s); initTrees(12345); gameState = "GAME"; animate();
            }
        });
        if (my > 400 && my < 450) {
            let n = prompt("Server Room Name:"); 
            if(n) { serverList.push(n); localStorage.setItem('rpg_servers', JSON.stringify(serverList)); }
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
                if (gameState === "GAME") return; // Exit menu loop if game starts
                ctx.clearRect(0,0,600,600);
                if (images.background) ctx.drawImage(images.background, 0,0,600,600);
                
                if (gameState === "MENU") {
                    drawButton(150, 250, 300, 50, "NEW WORLD");
                    drawButton(150, 320, 300, 50, "LOAD WORLD");
                    drawButton(150, 390, 300, 50, "MULTIPLAYER");
                } else if (gameState === "LOAD_LIST") {
                    ctx.fillStyle="white"; ctx.fillText("SELECT SAVED WORLD", 300, 60);
                    localWorlds.forEach((w, i) => drawButton(150, 100 + i*60, 300, 50, w.name));
                    drawButton(150, 520, 300, 40, "BACK", "gray");
                } else if (gameState === "MULTI_LIST") {
                    ctx.fillStyle="white"; ctx.fillText("SAVED SERVERS", 300, 60);
                    serverList.forEach((s, i) => drawButton(150, 100 + i*60, 300, 50, s));
                    drawButton(150, 400, 300, 50, "+ ADD SERVER", "green");
                    drawButton(150, 520, 300, 40, "BACK", "gray");
                } else if (gameState === "CREATE") {
                    ctx.fillStyle="white"; ctx.fillText("TYPE WORLD NAME: " + typingName, 300, 300);
                }
                requestAnimationFrame(menuLoop);
            }
            menuLoop();
        }
    };
}
