// --- 1. CORE ENGINE & SOCKET SETUP ---
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
canvas.width = 600; canvas.height = 600;
ctx.imageSmoothingEnabled = false;
document.body.appendChild(canvas);

// Multiplayer Connection
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

// --- 2. ASSETS & DATA ---
const assetPaths = {
    sprite: "images/image.png", axe: "images/axe.png", log: "images/log.png",
    grass: "images/grass.jpg", tree: "images/tree.png", stump: "images/c_tree.png",
    shop: "images/shop.png", desk: "images/desk.png", background: "images/t_background.png",
    house: "images/house.png", shovel: "images/shovel.png", questGiver: "images/questGiver1.png",
    slime: "images/slime_spritesheet.png"
};

const questList = [
    { id: 1, text: "Greetings! Bring me 5 logs for a prize.", target: 5, reward: 150, type: "WOOD", doneText: "Elder Oak: Amazing! Here is 150 gold." },
    { id: 2, text: "The forest slimes are restless. Slay 3 of them!", target: 3, reward: 300, type: "MOBS", doneText: "Elder Oak: You are a warrior. Take this gold." },
    { id: 3, text: "I need 20 logs to repair my roots.", target: 20, reward: 500, type: "WOOD", doneText: "Elder Oak: My roots feel strong again!" }
];

// --- 3. VARIABLES & STATE ---
let gameState = "MENU"; 
let currentSaveSlot = null, currentWorldSeed = 0, gameFrame = 0;
let trees = [], houses = [], mobs = [], currentRoom = "forest";
let player = {
    w: 64, h: 64, direction: "down", isMoving: false, speed: 6,
    hp: 100, maxHp: 100, wood: 0, money: 0, axeLevel: 1, 
    isSwinging: false, swingTimer: 0, blueprints: 0, hasStumpRemover: false 
};
let camera = { x: 0, y: 0 };
let typingName = "", scrollY = 0, selectedWorld = null, selectedSlot = 0;
let waypoint = null, dialogueText = "", showShopGUI = false;
let currentQuestIndex = 0, questProgress = 0, currentQuestState = "IDLE";
const keys = {}, animations = { "down": 0, "left": 1, "right": 2, "up": 3 }, stagger = 8;
const miniMapSize = 130, miniMapScale = 0.04;

const shopBuilding = { x: 800, y: 800, w: 489, h: 272 };
const shopDoor = { x: shopBuilding.x + (489/2) - 40, y: shopBuilding.y + 250, w: 80, h: 40 };
const deskPos = { x: 300, y: 200 };
const npc = { x: 400, y: 1200, w: 64, h: 64, range: 120, name: "Elder Oak" };

// --- 4. WORLD & AI LOGIC ---
function initTrees(seed) {
    trees = []; mobs = [];
    const spacing = 220, range = 2500;
    const rnd = (s) => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    let s = seed;
    for (let x = -range; x < range; x += spacing) {
        for (let y = -range; y < range; y += spacing) {
            s = (s * 9301 + 49297) % 233280;
            if (Math.hypot(x, y) > 400 && s > 0.6) {
                trees.push({ x: x, y: y, wood: 5, maxWood: 5, respawnTimer: 0, shakeTimer: 0 });
            }
        }
    }
}

function updateSlimes() {
    if (gameFrame % 100 === 0 && mobs.length < 10) {
        let sx = (Math.random() - 0.5) * 2000, sy = (Math.random() - 0.5) * 2000;
        if (Math.hypot(sx - camera.x, sy - camera.y) > 400) {
            mobs.push({ x: sx, y: sy, hp: 40, maxHp: 40, speed: 1.5, damage: 10, lastHit: 0, frame: 0, frameTimer: 0 });
        }
    }
    mobs.forEach(m => {
        let dx = camera.x - m.x, dy = camera.y - m.y, dist = Math.hypot(dx, dy);
        if (dist < 500 && dist > 20) {
            m.x += (dx / dist) * m.speed; m.y += (dy / dist) * m.speed;
        }
        m.frameTimer++; if (m.frameTimer > 8) { m.frame = (m.frame + 1) % 12; m.frameTimer = 0; }
        if (dist < 40 && Date.now() - m.lastHit > 1000) { player.hp -= m.damage; m.lastHit = Date.now(); }
    });
}

function checkCollision(nx, ny) {
    if (currentRoom !== "forest") return false;
    for (let t of trees) if (t.wood > 0 && Math.hypot(nx - t.x, ny - t.y) < 40) return true;
    if (Math.hypot(nx - npc.x, ny - npc.y) < 50) return true;
    return false;
}

// --- 5. RENDERERS ---
function drawAxeSwing(centerX, centerY) {
    if (!player.isSwinging) return;
    ctx.save(); ctx.translate(centerX, centerY);
    let progress = 1 - (player.swingTimer / 15);
    let rot = (player.direction === "left") ? (Math.PI/4 - (progress * Math.PI/1.5)) : 
              (player.direction === "right") ? (-Math.PI/4 + (progress * Math.PI/1.5)) :
              (player.direction === "up") ? (-Math.PI/2 + (progress * Math.PI/2) - Math.PI/4) :
              (Math.PI/2 - (progress * Math.PI/2) + Math.PI/4);
    ctx.rotate(rot); if (player.direction === "left") ctx.scale(-1, 1);
    ctx.drawImage(images.axe, 10, (player.direction === "up" ? -40 : -10), 40, 40);
    ctx.restore(); player.swingTimer--; if (player.swingTimer <= 0) player.isSwinging = false;
}

function drawMiniMap() {
    const mx = 600 - miniMapSize - 10, my = 10, centerX = mx + miniMapSize / 2, centerY = my + miniMapSize / 2;
    ctx.fillStyle = "rgba(0,0,0,0.8)"; ctx.fillRect(mx, my, miniMapSize, miniMapSize);
    ctx.save(); ctx.beginPath(); ctx.rect(mx, my, miniMapSize, miniMapSize); ctx.clip();
    trees.forEach(t => {
        const tx = centerX + (t.x - camera.x) * miniMapScale, ty = centerY + (t.y - camera.y) * miniMapScale;
        ctx.fillStyle = t.wood > 0 ? "#2d5a27" : "#5a3d27"; ctx.fillRect(tx - 1, ty - 1, 2, 2);
    });
    ctx.fillStyle = "white"; ctx.beginPath(); ctx.arc(centerX, centerY, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

function drawHotbar() {
    const slotSize = 60, startX = (600 - (60*4 + 30)) / 2, startY = 600 - 80;
    const icons = [images.axe, images.shovel, images.log, images.house];
    for (let i = 0; i < 4; i++) {
        ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.strokeStyle = selectedSlot === i ? "#00ffcc" : "white";
        ctx.fillRect(startX + i*70, startY, slotSize, slotSize); ctx.strokeRect(startX + i*70, startY, slotSize, slotSize);
        if (icons[i]) ctx.drawImage(icons[i], startX + i*70 + 5, startY + 5, 50, 50);
    }
}

// --- 6. MAIN ANIMATION LOOP ---
function animate() {
    updateSlimes();
    
    // Player Movement
    let mX = (keys['KeyD']||keys['ArrowRight']?1:0) - (keys['KeyA']||keys['ArrowLeft']?1:0);
    let mY = (keys['KeyS']||keys['ArrowDown']?1:0) - (keys['KeyW']||keys['ArrowUp']?1:0);
    player.isMoving = false;
    if ((mX !== 0 || mY !== 0) && dialogueText === "" && !showShopGUI && !player.isSwinging) {
        let mag = Math.hypot(mX, mY), sX = (mX / mag) * player.speed, sY = (mY / mag) * player.speed;
        if (currentRoom === "forest") {
            if (!checkCollision(camera.x + sX, camera.y)) camera.x += sX;
            if (!checkCollision(camera.x, camera.y + sY)) camera.y += sY;
        } else { camera.x += sX; camera.y += sY; }
        player.isMoving = true;
        if(mY < 0) player.direction = "up"; else if(mY > 0) player.direction = "down"; 
        else if(mX < 0) player.direction = "left"; else if(mX > 0) player.direction = "right";
    }

    broadcastMovement();

    // Background Rendering
    if (currentRoom === "forest") {
        if(grassPattern) { 
            ctx.save(); ctx.translate(-camera.x+300, -camera.y+300); 
            ctx.fillStyle=grassPattern; ctx.fillRect(camera.x-2500, camera.y-2500, 5000, 5000); 
            ctx.restore(); 
        }
        ctx.drawImage(images.shop, shopBuilding.x - camera.x + 300, shopBuilding.y - camera.y + 300, shopBuilding.w, shopBuilding.h);

        // Sorting Entities
        let dl = trees.map(t => ({...t, d: t.wood > 0 ? 't' : 's'}));
        dl.push({x: camera.x, y: camera.y, d: 'p', dir: player.direction, moving: player.isMoving});
        dl.push({x: npc.x, y: npc.y, d: 'n'});
        mobs.forEach(m => dl.push({...m, d: 'm'}));
        for (let id in remotePlayers) dl.push({...remotePlayers[id], d: 'other'});

        dl.sort((a,b) => a.y - b.y);

        dl.forEach(o => {
            let sX = o.x - camera.x + 300, sY = o.y - camera.y + 300;
            if(o.d==='t') ctx.drawImage(images.tree, sX-100, sY-180, 200, 200);
            else if(o.d==='s') ctx.drawImage(images.stump, sX-60, sY-70, 120, 120);
            else if(o.d==='n') ctx.drawImage(images.questGiver, sX-32, sY-32, 64, 64);
            else if(o.d==='m') {
                let sW = images.slime.width/3, sH = images.slime.height/4;
                ctx.drawImage(images.slime, (o.frame%3)*sW, Math.floor(o.frame/3)*sH, sW, sH, sX-32, sY-32, 64, 64);
            } else if(o.d==='p' || o.d==='other') {
                let gridCellSize = images.sprite.width/4;
                ctx.drawImage(images.sprite, (o.moving?Math.floor(gameFrame/stagger)%4:0)*gridCellSize, animations[o.dir]*gridCellSize, gridCellSize, gridCellSize, sX-32, sY-32, 64, 64);
                if(o.d === 'p') drawAxeSwing(300, 300);
            }
        });

        drawMiniMap(); drawHotbar();
    } else {
        // Shop Logic (simplified for space)
        ctx.fillStyle="#2e1a0a"; ctx.fillRect(0,0,600,600);
        ctx.drawImage(images.desk, deskPos.x - 150, deskPos.y - 50, 300, 100);
    }
}

// --- 7. INPUT HANDLING ---
window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'Space' && gameState === "GAME") {
        let dNPC = Math.hypot(camera.x - npc.x, camera.y - npc.y);
        if (dNPC < 120) {
            let q = questList[currentQuestIndex];
            dialogueText = q ? q.text : "No more quests!";
        } else if (selectedSlot === 0) {
            player.isSwinging = true; player.swingTimer = 15;
            trees.forEach(t => { if(t.wood > 0 && Math.hypot(camera.x-t.x, camera.y-t.y)<100) { t.wood--; if(t.wood<=0) player.wood+=5; }});
        }
    }
    if (e.key === "1") selectedSlot = 0; if (e.key === "2") selectedSlot = 1;
    if (e.key === "3") selectedSlot = 2; if (e.key === "4") selectedSlot = 3;
});
window.addEventListener('keyup', e => keys[e.code] = false);

canvas.addEventListener('mousedown', e => {
    const rect = canvas.getBoundingClientRect(), mx = e.clientX - rect.left, my = e.clientY - rect.top;
    if (gameState === "MENU") {
        if (my > 250 && my < 300) { initTrees(Date.now()); gameState = "GAME"; }
        if (my > 390 && my < 440) gameState = "MULTI_MENU";
    } else if (gameState === "MULTI_MENU") {
        if (my > 200 && my < 250) {
            const room = prompt("Room Name:");
            if(room) { socket.emit('join-room', room); initTrees(12345); gameState = "GAME"; }
        }
    }
});

// --- 8. INITIALIZATION ---
const images = {};
let grassPattern;
let loaded = 0;
for (let key in assetPaths) {
    images[key] = new Image();
    images[key].onload = () => {
        loaded++;
        if (key === 'grass') grassPattern = ctx.createPattern(images.grass, 'repeat');
        if (loaded === Object.keys(assetPaths).length) {
            function main() {
                ctx.clearRect(0,0,600,600);
                if(gameState === "GAME") animate();
                else if(gameState === "MENU") { 
                    ctx.fillStyle = "white"; ctx.textAlign = "center";
                    ctx.fillText("NEW WORLD", 300, 280); ctx.fillText("MULTIPLAYER", 300, 420);
                } else if(gameState === "MULTI_MENU") {
                    ctx.fillText("JOIN ROOM", 300, 230);
                }
                gameFrame++; requestAnimationFrame(main);
            }
            main();
        }
    };
    images[key].src = assetPaths[key];
}
