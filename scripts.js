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

// --- 3. STATE & SAVES ---
let gameState = "MENU";
let gameFrame = 0;
let typingName = "";
let camera = { x: 0, y: 0 };
let trees = [], mobs = [];
const keys = {};
const animations = { "down": 0, "left": 1, "right": 2, "up": 3 };

// Inventory & Markers
let inventory = [ {id: 'axe', count: 1}, {id: 'log', count: 0}, {id: 'blueprint', count: 1}, {id: null, count: 0} ];
let selectedSlot = 0;
let marker = null; 

let localWorlds = JSON.parse(localStorage.getItem('rpg_worlds') || '[]');
let serverList = JSON.parse(localStorage.getItem('rpg_servers') || '[]');

let player = {
    direction: "down", isMoving: false, speed: 5,
    wood: 0, isSwinging: false, swingTimer: 0,
    width: 40, height: 40
};

// --- 4. ENGINE FUNCTIONS ---
function initTrees(seed) {
    trees = [];
    let s = seed || 12345;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let x = -1500; x < 1500; x += 250) {
        for (let y = -1500; y < 1500; y += 250) {
            if (Math.hypot(x, y) > 400 && rnd() > 0.6) {
                trees.push({ x, y, wood: 5, shake: 0, w: 60, h: 40 });
            }
        }
    }
}

function drawButton(x, y, w, h, text, color = "#3498db") {
    ctx.fillStyle = color; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "white"; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "white"; ctx.font = "bold 18px Arial"; ctx.textAlign = "center";
    ctx.fillText(text, x + w/2, y + h/1.6);
}

function isClicked(mx, my, x, y, w, h) {
    return mx > x && mx < x + w && my > y && my < y + h;
}

// --- 5. MAIN ANIMATION ---
function animate() {
    let mx = (keys['KeyD']||keys['ArrowRight']?1:0) - (keys['KeyA']||keys['ArrowLeft']?1:0);
    let my = (keys['KeyS']||keys['ArrowDown']?1:0) - (keys['KeyW']||keys['ArrowUp']?1:0);

    if ((mx !== 0 || my !== 0) && !player.isSwinging) {
        camera.x += mx * player.speed; camera.y += my * player.speed;
        player.isMoving = true;
        if(mx > 0) player.direction = "right"; else if(mx < 0) player.direction = "left";
        else if(my > 0) player.direction = "down"; else if(my < 0) player.direction = "up";
    } else { player.isMoving = false; }

    if (player.isSwinging) {
        player.swingTimer--;
        if (player.swingTimer <= 0) player.isSwinging = false;
    }

    ctx.clearRect(0, 0, 600, 600);
    ctx.save();
    ctx.translate(-camera.x + 300, -camera.y + 300);

    if (grassPattern) { ctx.fillStyle = grassPattern; ctx.fillRect(camera.x - 1000, camera.y - 1000, 2000, 2000); }
    ctx.drawImage(images.shop, 700, 700, 250, 150);
    
    let drawList = trees.map(t => ({ ...t, type: t.wood > 0 ? 'tree' : 'stump' }));
    drawList.push({ x: camera.x, y: camera.y, type: 'player' });
    drawList.sort((a, b) => a.y - b.y);

    drawList.forEach(obj => {
        let sX = (obj.shake > 0) ? Math.sin(gameFrame * 2) * 5 : 0;
        if (obj.shake > 0) obj.shake--;
        if (obj.type === 'tree') ctx.drawImage(images.tree, obj.x - 80 + sX, obj.y - 160, 160, 180);
        else if (obj.type === 'stump') ctx.drawImage(images.stump, obj.x - 40, obj.y - 40, 80, 80);
        else if (obj.type === 'player') {
            let grid = images.sprite.width / 4;
            let f = (player.isMoving ? Math.floor(gameFrame / 8) % 4 : 0);
            ctx.drawImage(images.sprite, f * grid, animations[player.direction] * grid, grid, grid, obj.x - 32, obj.y - 32, 64, 64);
            if (player.isSwinging) {
                ctx.save(); ctx.translate(obj.x, obj.y); ctx.rotate(player.swingTimer * -0.3);
                ctx.drawImage(images.axe, 15, -35, 40, 40); ctx.restore();
            }
        }
    });

    if (marker) { ctx.fillStyle = "red"; ctx.beginPath(); ctx.arc(marker.x, marker.y, 8, 0, Math.PI*2); ctx.fill(); }
    ctx.restore();

    // UI: Minimap, Arrow, Inventory
    ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(480, 10, 110, 110);
    ctx.fillStyle = "lime"; ctx.fillRect(480 + 55 + (camera.x/30), 10 + 55 + (camera.y/30), 4, 4);
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
        player.isSwinging = true; player.swingTimer = 12;
        trees.forEach(t => {
            if (t.wood > 0 && Math.hypot(camera.x - t.x, camera.y - t.y) < 100) {
                t.wood--; t.shake = 10;
                if (t.wood <= 0) player.wood += 5;
            }
        });
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
    
    if (gameState === "MENU") {
        if (isClicked(mx, my, 150, 250, 300, 50)) { typingName = ""; gameState = "CREATE"; }
        if (isClicked(mx, my, 150, 320, 300, 50)) gameState = "LOAD_LIST";
        if (isClicked(mx, my, 150, 390, 300, 50)) gameState = "MULTI_LIST";
    } 
    else if (gameState === "LOAD_LIST") {
        localWorlds.forEach((w, i) => { if (isClicked(mx, my, 150, 100 + i*60, 300, 50)) { initTrees(w.seed); gameState = "GAME"; animate(); }});
        if (isClicked(mx, my, 150, 520, 300, 40)) gameState = "MENU";
    }
    else if (gameState === "MULTI_LIST") {
        serverList.forEach((s, i) => { if (isClicked(mx, my, 150, 100 + i*60, 300, 50)) { if(isOnline) socket.emit('join-room', s); initTrees(12345); gameState = "GAME"; animate(); }});
        if (isClicked(mx, my, 150, 400, 300, 50)) {
            let n = prompt("Server Name:"); 
            if(n) { serverList.push(n); localStorage.setItem('rpg_servers', JSON.stringify(serverList)); if(isOnline) socket.emit('join-room', n); initTrees(12345); gameState = "GAME"; animate(); }
        }
        if (isClicked(mx, my, 150, 520, 300, 40)) gameState = "MENU";
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
