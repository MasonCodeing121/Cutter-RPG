// ─── 1. CANVAS SETUP ────────────────────────────────────────────────────────
const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");
canvas.width = 600;
canvas.height = 600;
ctx.imageSmoothingEnabled = false;
document.body.appendChild(canvas);

// ─── 2. NETWORKING ──────────────────────────────────────────────────────────
const socket = io("https://server-5jkd.onrender.com/", {
    transports: ["websocket", "polling"],
});
let remotePlayers = {};
let isOnline = false;
let currentRoomId = null;
let playerName = "Player";

socket.on("connect", () => {
    isOnline = true;
});
socket.on("room:joined", (data) => {
    currentRoomId = data.room.id;
});
socket.on("game:event", (data) => {
    if (data.senderId !== socket.id)
        remotePlayers[data.senderId] = data.payload;
});
socket.on("room:player_left", (data) => {
    delete remotePlayers[data.player.id];
});

let pendingTeleport = null;

function applyTeleport(data) {
    const nx = parseFloat(data.x), ny = parseFloat(data.y);
    if (isNaN(nx) || isNaN(ny)) return;
    camera.x = nx;
    camera.y = ny;
    if (typeof showNotif === "function")
        showNotif("Teleported!", "#ce93d8", 3);
    console.log("[teleport] applied →", nx, ny);
}

socket.on("player:teleport", (data) => {
    console.log("[teleport] received", data);
    if (typeof gameState !== "undefined" && gameState === "GAME") {
        applyTeleport(data);
    } else {
        pendingTeleport = data;
    }
});

socket.on("player:set_resource", (data) => {
    const { type, amount } = data;
    if (!isNaN(amount)) {
        if (type === "wood") {
            player.wood = amount;
            player.totalWood = Math.max(player.totalWood, amount);
        } else if (type === "leaves") {
            player.leaves = amount;
            player.totalLeaves = Math.max(player.totalLeaves, amount);
        } else if (type === "gel") {
            player.gel = amount;
            player.totalGel = Math.max(player.totalGel, amount);
        } else if (type === "stone") {
            player.stone = amount;
            player.totalStone = Math.max(player.totalStone, amount);
        } else if (type === "crystals") {
            player.crystals = amount;
            player.totalCrystals = Math.max(player.totalCrystals, amount);
        } else if (type === "money") {
            player.money = amount;
        } else if (type === "hp") {
            player.hp = Math.min(amount, player.maxHp);
        }
    }
});

socket.on("game:announcement", (msg) => {
    showNotif("📢 " + msg, "#38bdf8", 6);
});

// ─── 3. ASSETS ──────────────────────────────────────────────────────────────
const assetPaths = {
    sprite: "images/image.png",
    axe: "images/axe.png",
    grass: "images/grass.jpg",
    tree: "images/tree.png",
    stump: "images/c_tree.png",
    shop: "images/shop.png",
    background: "images/t_background.png",
    log: "images/log.png",
    house: "images/house.png",
    bush: "images/bush.png",
    leaves: "images/leaves.png",
    slime: "images/slime.png",
    gel: "images/slime_gel.png",
};
const images = {};
let grassPattern = null;
let assetsLoaded = 0;

// ─── 4. STATE ────────────────────────────────────────────────────────────────
let gameState = "MENU";
let gameFrame = 0;
let lastTime = 0;
let typingName = "";

let showShop = false;
let showQuestGiver = false;
let showInventory = false;
let questPage = 0;

let notifText = null;
let notifColor = "#ffffff";
let notifTimer = 0;

let worldTime = 0;
let particles = [];
let speedBoostTimer = 0;
let arrows = [];
let shopTab = "sell";
const MOB_CAP = 4;
let mobRespawnTimer = 0;

let camera = { x: 0, y: 0 };
let trees = [],
    bushes = [],
    mobs = [],
    rocks = [],
    crystalNodes = [];

const keys = {};
const animations = { down: 0, left: 1, right: 2, up: 3 };

let inventory = [
    { id: "axe" },
    { id: "log" },
    { id: "leaves" },
    { id: "slime_gel" },
    { id: "empty" },
];
let selectedSlot = 0;

let player = {
    direction: "down",
    isMoving: false,
    baseSpeed: 250,
    hp: 100,
    maxHp: 100,
    wood: 0,
    money: 0,
    leaves: 0,
    gel: 0,
    stone: 0,
    crystals: 0,
    totalWood: 0,
    totalLeaves: 0,
    totalGel: 0,
    totalStone: 0,
    totalCrystals: 0,
    kills: 0,
    isSwinging: false,
    swingTimer: 0,
    invuln: 0,
    xp: 0,
    level: 1,
    xpToNext: 100,
    bowOwned: false,
    bowAmmo: 0,
    axeLevel: 0,
    hpUpgrades: 0,
    speedUpgrades: 0,
};

let completedQuests = [];

const shopBounds = { x: 700, y: 700, w: 250, h: 150 };
const questGiverPos = { x: 320, y: -80 };

// ─── 5. QUESTS ───────────────────────────────────────────────────────────────
const QUESTS = [
    {
        id: 0,
        name: "First Steps",
        desc: "Chop 5 wood from trees.",
        check: (p) => p.totalWood >= 5,
        reward: (p) => {
            p.money += 25;
        },
        rewardDesc: "$25",
    },
    {
        id: 1,
        name: "Leaf Gatherer",
        desc: "Collect 10 leaves from bushes.",
        check: (p) => p.totalLeaves >= 10,
        reward: (p) => {
            p.money += 40;
        },
        rewardDesc: "$40",
    },
    {
        id: 2,
        name: "Slime Slayer",
        desc: "Kill 5 slimes.",
        check: (p) => p.kills >= 5,
        reward: (p) => {
            p.money += 75;
        },
        rewardDesc: "$75",
    },
    {
        id: 3,
        name: "Stone Breaker",
        desc: "Mine 15 stone from rocks.",
        check: (p) => p.totalStone >= 15,
        reward: (p) => {
            p.money += 100;
            p.maxHp += 20;
            p.hp = Math.min(p.hp + 20, p.maxHp);
        },
        rewardDesc: "$100 + Max HP +20",
    },
    {
        id: 4,
        name: "The Lumberjack",
        desc: "Chop 50 wood total.",
        check: (p) => p.totalWood >= 50,
        reward: (p) => {
            p.money += 200;
        },
        rewardDesc: "$200",
    },
    {
        id: 5,
        name: "Bushmaster",
        desc: "Collect 30 leaves total.",
        check: (p) => p.totalLeaves >= 30,
        reward: (p) => {
            p.money += 150;
            p.baseSpeed += 25;
        },
        rewardDesc: "$150 + Speed Up",
    },
    {
        id: 6,
        name: "Gel Collector",
        desc: "Collect 20 slime gel.",
        check: (p) => p.totalGel >= 20,
        reward: (p) => {
            p.money += 300;
        },
        rewardDesc: "$300",
    },
    {
        id: 7,
        name: "Crystal Hunter",
        desc: "Find 3 crystals.\n(Rare drop from rocks!)",
        check: (p) => p.totalCrystals >= 3,
        reward: (p) => {
            p.money += 500;
            p.maxHp += 25;
            p.hp = Math.min(p.hp + 25, p.maxHp);
        },
        rewardDesc: "$500 + Max HP +25",
    },
    {
        id: 8,
        name: "The Miner",
        desc: "Mine 75 stone total.",
        check: (p) => p.totalStone >= 75,
        reward: (p) => {
            p.money += 400;
            p.baseSpeed += 20;
        },
        rewardDesc: "$400 + Speed Up",
    },
    {
        id: 9,
        name: "Slime Lord",
        desc: "Kill 30 slimes.",
        check: (p) => p.kills >= 30,
        reward: (p) => {
            p.money += 600;
            p.maxHp += 30;
            p.hp = Math.min(p.hp + 30, p.maxHp);
        },
        rewardDesc: "$600 + Max HP +30",
    },
    {
        id: 10,
        name: "Master Lumberjack",
        desc: "Chop 200 wood total.",
        check: (p) => p.totalWood >= 200,
        reward: (p) => {
            p.money += 800;
            p.baseSpeed += 30;
        },
        rewardDesc: "$800 + Speed Up",
    },
    {
        id: 11,
        name: "Crystal Collector",
        desc: "Find 10 crystals.\n(Extremely rare!)",
        check: (p) => p.totalCrystals >= 10,
        reward: (p) => {
            p.money += 2000;
            p.baseSpeed += 25;
        },
        rewardDesc: "$2000 + Speed Up",
    },
    {
        id: 12,
        name: "Nature's Champion",
        desc: "200 wood + 100 leaves + 50 gel.",
        check: (p) =>
            p.totalWood >= 200 && p.totalLeaves >= 100 && p.totalGel >= 50,
        reward: (p) => {
            p.money += 2500;
            p.maxHp += 60;
            p.hp = Math.min(p.hp + 60, p.maxHp);
        },
        rewardDesc: "$2500 + Max HP +60",
    },
    {
        id: 13,
        name: "Slime Exterminator",
        desc: "Kill 100 slimes.\nGood luck.",
        check: (p) => p.kills >= 100,
        reward: (p) => {
            p.money += 3000;
            p.maxHp += 50;
            p.hp = Math.min(p.hp + 50, p.maxHp);
        },
        rewardDesc: "$3000 + Max HP +50",
    },
    {
        id: 14,
        name: "The Deep Miner",
        desc: "Mine 300 stone total.\nThe rocks await.",
        check: (p) => p.totalStone >= 300,
        reward: (p) => {
            p.money += 3500;
            p.baseSpeed += 40;
        },
        rewardDesc: "$3500 + Big Speed Up",
    },
    {
        id: 15,
        name: "Crystal Legend",
        desc: "Find 30 crystals.\n(Incredibly rare drops!)",
        check: (p) => p.totalCrystals >= 30,
        reward: (p) => {
            p.money += 10000;
            p.baseSpeed += 50;
            p.maxHp += 100;
            p.hp = Math.min(p.hp + 100, p.maxHp);
        },
        rewardDesc: "$10000 + Huge Bonuses!",
    },
];

// ─── 6. HELPERS ──────────────────────────────────────────────────────────────
function showNotif(text, color, duration) {
    notifText = text;
    notifColor = color || "#ffffff";
    notifTimer = duration || 4;
}

function initWorld(seed) {
    trees = [];
    bushes = [];
    mobs = [];
    rocks = [];
    crystalNodes = [];
    showShop = false;
    showQuestGiver = false;
    showInventory = false;
    let s = seed || 12345;
    const rnd = () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
    };
    for (let x = -2000; x < 2000; x += 250) {
        for (let y = -2000; y < 2000; y += 250) {
            if (Math.hypot(x, y) > 400) {
                let r = rnd();
                if (r > 0.82)
                    trees.push({ x, y, wood: 5, shake: 0, respawn: 0 });
                else if (r > 0.65)
                    bushes.push({ x, y, health: 3, shake: 0, respawn: 0 });
                else if (r > 0.60) spawnSlime(x, y);
                else if (r > 0.53) spawnGoblin(x, y);
                else if (r > 0.42)
                    rocks.push({ x, y, hp: 8, maxHp: 8, shake: 0, respawn: 0 });
                else if (r > 0.415)
                    crystalNodes.push({
                        x,
                        y,
                        hp: 15,
                        maxHp: 15,
                        shake: 0,
                        respawn: 0,
                    });
            }
        }
    }
}

function spawnSlime(x, y) {
    if (mobs.length >= MOB_CAP) return;
    mobs.push({
        x,
        y,
        hp: 3,
        maxHp: 3,
        type: "slime",
        dir: "down",
        targetX: x,
        targetY: y,
        state: "WANDER",
        timer: 0,
        shake: 0,
    });
}

function spawnGoblin(x, y) {
    if (mobs.length >= MOB_CAP) return;
    mobs.push({
        x,
        y,
        hp: 5,
        maxHp: 5,
        type: "goblin",
        dir: "down",
        targetX: x,
        targetY: y,
        state: "WANDER",
        timer: 0,
        shake: 0,
    });
}

function gainXP(amount) {
    player.xp += amount;
    while (player.xp >= player.xpToNext) {
        player.xp -= player.xpToNext;
        player.level++;
        player.xpToNext = player.level * 100;
        player.maxHp += 10;
        player.hp = Math.min(player.hp + 10, player.maxHp);
        player.baseSpeed += 5;
        showNotif(
            "Level Up! Now Level " + player.level + "! (+10 HP, +5 Speed)",
            "#ffd54f",
            5,
        );
    }
}

function spawnParticles(wx, wy, color, count) {
    for (let i = 0; i < count; i++) {
        let angle = Math.random() * Math.PI * 2;
        let spd = 60 + Math.random() * 80;
        particles.push({
            wx,
            wy,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            color,
            life: 1.0,
            size: 2 + Math.random() * 3,
        });
    }
}

function generateGoblinSheet() {
    const fw = 32, fh = 32;
    const oc = document.createElement("canvas");
    oc.width = fw * 3; oc.height = fh * 4;
    const c = oc.getContext("2d");
    c.imageSmoothingEnabled = false;
    const C = {
        body:"#2d7a36", headL:"#4caf50", headM:"#388e3c", ear:"#1b5e20",
        eye:"#cc1111", pupil:"#111", tooth:"#e0e0e0", mouth:"#1a1a1a",
        club:"#5d4037", clubH:"#4e342e", pants:"#1b5e20", skin:"#388e3c"
    };
    function r(x,y,w,h,col){ c.fillStyle=col; c.fillRect(x,y,w,h); }
    function sh(ox,oy){ c.fillStyle="rgba(0,0,0,0.2)"; c.beginPath(); c.ellipse(ox+16,oy+30,8,3,0,0,Math.PI*2); c.fill(); }
    function drawDown(ox,oy,fr) {
        const lL=fr===1?-2:fr===2?2:0, lR=-lL, aL=fr===1?1:fr===2?-1:0, aR=-aL;
        sh(ox,oy);
        r(ox+9,oy+22+lL,5,8,C.pants); r(ox+8,oy+28+lL,6,2,C.skin);
        r(ox+18,oy+22+lR,5,8,C.pants); r(ox+17,oy+28+lR,6,2,C.skin);
        r(ox+8,oy+13,16,10,C.body);
        r(ox+4,oy+13+aL,5,9,C.skin); r(ox+0,oy+10+aL,5,5,C.clubH); r(ox+1,oy+14+aL,4,3,C.club);
        r(ox+23,oy+13+aR,5,9,C.skin);
        r(ox+6,oy+3,3,8,C.ear); r(ox+7,oy+1,2,3,C.ear);
        r(ox+23,oy+3,3,8,C.ear); r(ox+23,oy+1,2,3,C.ear);
        r(ox+9,oy+5,14,9,C.headL); r(ox+8,oy+6,16,7,C.headL);
        r(ox+11,oy+7,3,3,C.eye); r(ox+18,oy+7,3,3,C.eye);
        r(ox+12,oy+8,1,1,C.pupil); r(ox+19,oy+8,1,1,C.pupil);
        r(ox+15,oy+10,2,2,C.headM);
        r(ox+12,oy+12,8,1,C.mouth);
        r(ox+13,oy+12,2,2,C.tooth); r(ox+17,oy+12,2,2,C.tooth);
    }
    function drawLeft(ox,oy,fr) {
        const lF=fr===1?-2:fr===2?2:0, lB=-lF;
        sh(ox,oy);
        r(ox+12,oy+22+lB,5,8,C.pants); r(ox+11,oy+28+lB,6,2,C.skin);
        r(ox+14,oy+14,4,8,C.skin);
        r(ox+8,oy+13,15,10,C.body);
        r(ox+3,oy+14,6,7,C.skin); r(ox+0,oy+10,5,5,C.clubH); r(ox+0,oy+14,4,3,C.club);
        r(ox+10,oy+22+lF,5,8,C.pants); r(ox+9,oy+28+lF,6,2,C.skin);
        r(ox+8,oy+3,3,8,C.ear); r(ox+9,oy+1,2,3,C.ear);
        r(ox+8,oy+5,14,8,C.headL); r(ox+7,oy+6,15,6,C.headL);
        r(ox+7,oy+6,2,4,C.headM);
        r(ox+10,oy+7,3,3,C.eye); r(ox+11,oy+8,1,1,C.pupil);
        r(ox+21,oy+9,2,2,C.headM);
    }
    function drawRight(ox,oy,fr) {
        const lF=fr===1?-2:fr===2?2:0, lB=-lF;
        sh(ox,oy);
        r(ox+15,oy+22+lB,5,8,C.pants); r(ox+15,oy+28+lB,6,2,C.skin);
        r(ox+14,oy+14,4,8,C.skin);
        r(ox+9,oy+13,15,10,C.body);
        r(ox+23,oy+14,6,7,C.skin); r(ox+27,oy+10,5,5,C.clubH); r(ox+28,oy+14,4,3,C.club);
        r(ox+17,oy+22+lF,5,8,C.pants); r(ox+17,oy+28+lF,6,2,C.skin);
        r(ox+21,oy+3,3,8,C.ear); r(ox+21,oy+1,2,3,C.ear);
        r(ox+10,oy+5,14,8,C.headL); r(ox+9,oy+6,15,6,C.headL);
        r(ox+23,oy+6,2,4,C.headM);
        r(ox+19,oy+7,3,3,C.eye); r(ox+20,oy+8,1,1,C.pupil);
        r(ox+11,oy+9,2,2,C.headM);
    }
    function drawUp(ox,oy,fr) {
        const lL=fr===1?-2:fr===2?2:0, lR=-lL;
        sh(ox,oy);
        r(ox+9,oy+22+lL,5,8,C.pants); r(ox+8,oy+28+lL,6,2,C.skin);
        r(ox+18,oy+22+lR,5,8,C.pants); r(ox+17,oy+28+lR,6,2,C.skin);
        r(ox+8,oy+13,16,10,C.body);
        r(ox+4,oy+13,5,9,C.skin); r(ox+23,oy+13,5,9,C.skin);
        r(ox+6,oy+2,3,9,C.ear); r(ox+7,oy+0,2,3,C.ear);
        r(ox+23,oy+2,3,9,C.ear); r(ox+23,oy+0,2,3,C.ear);
        r(ox+9,oy+5,14,9,C.headM); r(ox+8,oy+6,16,7,C.headM);
        r(ox+12,oy+5,4,3,C.headL); r(ox+17,oy+6,3,2,C.headL);
    }
    for (let fr = 0; fr < 3; fr++) {
        const ox = fr * fw;
        drawDown(ox, 0,     fr);
        drawLeft(ox, fh,    fr);
        drawRight(ox,fh*2,  fr);
        drawUp(ox,   fh*3,  fr);
    }
    const img = new Image();
    img.src = oc.toDataURL();
    return img;
}

function checkCollision(nx, ny) {
    for (let t of trees)
        if (t.wood > 0 && Math.hypot(nx - t.x, ny - t.y) < 50) return true;
    for (let b of bushes)
        if (b.health > 0 && Math.hypot(nx - b.x, ny - b.y) < 40) return true;
    for (let r of rocks)
        if (r.hp > 0 && Math.hypot(nx - r.x, ny - r.y) < 45) return true;
    for (let c of crystalNodes)
        if (c.hp > 0 && Math.hypot(nx - c.x, ny - c.y) < 45) return true;
    if (Math.hypot(nx - questGiverPos.x, ny - questGiverPos.y) < 60)
        return true;
    if (
        nx > shopBounds.x &&
        nx < shopBounds.x + shopBounds.w &&
        ny > shopBounds.y &&
        ny < shopBounds.y + shopBounds.h
    )
        return true;
    return false;
}

function drawButton(x, y, w, h, text, color) {
    color = color || "#3498db";
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "white";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.fillText(text, x + w / 2, y + h / 1.6);
}

// ─── 7. DRAW WORLD OBJECTS ───────────────────────────────────────────────────
function drawRock(x, y, hpRatio, shake) {
    let sX = shake > 0 ? Math.sin(gameFrame * 0.8) * 3 : 0;
    ctx.save();
    ctx.translate(x + sX, y);
    ctx.fillStyle = hpRatio < 0.4 ? "#7a7a7a" : "#9e9e9e";
    ctx.beginPath();
    ctx.ellipse(0, 8, 28, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#bdbdbd";
    ctx.beginPath();
    ctx.ellipse(-6, 0, 18, 14, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#757575";
    ctx.beginPath();
    ctx.ellipse(8, 4, 10, 8, 0.4, 0, Math.PI * 2);
    ctx.fill();
    if (hpRatio < 1) {
        ctx.strokeStyle = "#424242";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-5, -2);
        ctx.lineTo(2, 6);
        ctx.stroke();
    }
    ctx.restore();
}

function drawCrystalNode(x, y, hpRatio, shake) {
    let sX = shake > 0 ? Math.sin(gameFrame * 0.8) * 3 : 0;
    ctx.save();
    ctx.translate(x + sX, y);
    let pulse = 0.85 + Math.sin(gameFrame * 0.05) * 0.15;
    ctx.globalAlpha = pulse;
    [
        [0, -22, 10, 20],
        [-14, -12, 8, 18],
        [14, -10, 8, 18],
        [-7, -30, 7, 16],
        [7, -28, 7, 16],
    ].forEach(([cx, cy, w, h]) => {
        ctx.fillStyle = hpRatio < 0.4 ? "#80cbc4" : "#00e5ff";
        ctx.beginPath();
        ctx.moveTo(cx, cy - h / 2);
        ctx.lineTo(cx + w / 2, cy + h / 2);
        ctx.lineTo(cx - w / 2, cy + h / 2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#b2ebf2";
        ctx.lineWidth = 1;
        ctx.stroke();
    });
    ctx.fillStyle = "#37474f";
    ctx.beginPath();
    ctx.ellipse(0, 10, 18, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
}

function drawQuestGiver(x, y) {
    ctx.save();
    ctx.translate(x, y);
    let bob = Math.sin(gameFrame * 0.04) * 2;
    ctx.translate(0, bob);
    ctx.fillStyle = "#4a148c";
    ctx.fillRect(-14, -8, 28, 28);
    ctx.fillStyle = "#7b1fa2";
    ctx.fillRect(-12, -6, 24, 14);
    ctx.fillStyle = "#ffcc80";
    ctx.beginPath();
    ctx.arc(0, -20, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4a148c";
    ctx.fillRect(-13, -30, 26, 12);
    ctx.fillStyle = "#ffa726";
    ctx.fillRect(-14, -32, 28, 5);
    ctx.fillStyle = "#ffcc80";
    ctx.fillRect(-18, -22, 6, 14);
    ctx.fillRect(12, -22, 6, 14);
    let hasUnclaimed = QUESTS.some(
        (q) => !completedQuests.includes(q.id) && q.check(player),
    );
    let excY = -50 + Math.sin(gameFrame * 0.07) * 4;
    ctx.font = "bold 20px Arial";
    ctx.textAlign = "center";
    ctx.fillStyle = hasUnclaimed ? "#ffeb3b" : "#ffffff";
    ctx.fillText(hasUnclaimed ? "!" : "?", 0, excY);
    ctx.restore();
}

// ─── 8. DRAW UI PANELS ───────────────────────────────────────────────────────
function drawQuestUI() {
    ctx.fillStyle = "rgba(0,0,0,0.93)";
    ctx.fillRect(60, 40, 480, 520);
    ctx.strokeStyle = "#7b1fa2";
    ctx.lineWidth = 3;
    ctx.strokeRect(60, 40, 480, 520);
    ctx.fillStyle = "#ce93d8";
    ctx.font = "bold 22px Arial";
    ctx.textAlign = "center";
    ctx.fillText("⚔ QUEST GIVER ⚔", 300, 75);
    ctx.fillStyle = "#9e9e9e";
    ctx.font = "12px Arial";
    ctx.fillText(
        `Completed: ${completedQuests.length} / ${QUESTS.length}`,
        300,
        100,
    );

    const visibleCount = 4;
    const startIdx = questPage * visibleCount;
    const visibleQuests = QUESTS.slice(startIdx, startIdx + visibleCount);

    visibleQuests.forEach((q, i) => {
        let yBase = 120 + i * 105;
        let isDone = completedQuests.includes(q.id);
        let canClaim = !isDone && q.check(player);
        ctx.fillStyle = isDone
            ? "rgba(46,125,50,0.4)"
            : canClaim
              ? "rgba(123,31,162,0.4)"
              : "rgba(255,255,255,0.07)";
        ctx.fillRect(75, yBase, 450, 95);
        ctx.strokeStyle = isDone ? "#4caf50" : canClaim ? "#ce93d8" : "#444";
        ctx.lineWidth = 1;
        ctx.strokeRect(75, yBase, 450, 95);
        ctx.textAlign = "left";
        ctx.fillStyle = isDone ? "#81c784" : canClaim ? "#ce93d8" : "#fff";
        ctx.font = "bold 15px Arial";
        ctx.fillText((isDone ? "✓ " : "") + q.name, 90, yBase + 22);
        ctx.fillStyle = "#bdbdbd";
        ctx.font = "12px Arial";
        q.desc
            .split("\n")
            .forEach((ln, li) => ctx.fillText(ln, 90, yBase + 40 + li * 15));
        ctx.fillStyle = "#ffd54f";
        ctx.font = "12px Arial";
        ctx.fillText("Reward: " + q.rewardDesc, 90, yBase + 78);
        if (canClaim) {
            ctx.fillStyle = "#ab47bc";
            ctx.fillRect(380, yBase + 55, 130, 30);
            ctx.strokeStyle = "#ce93d8";
            ctx.strokeRect(380, yBase + 55, 130, 30);
            ctx.fillStyle = "white";
            ctx.font = "bold 13px Arial";
            ctx.textAlign = "center";
            ctx.fillText("CLAIM REWARD", 445, yBase + 75);
        }
        if (isDone) {
            ctx.fillStyle = "#4caf50";
            ctx.font = "bold 13px Arial";
            ctx.textAlign = "center";
            ctx.fillText("COMPLETED", 445, yBase + 75);
        }
    });

    if (questPage > 0) drawButton(75, 490, 100, 32, "◀ PREV", "#555");
    if ((questPage + 1) * visibleCount < QUESTS.length)
        drawButton(425, 490, 100, 32, "NEXT ▶", "#555");
    drawButton(220, 490, 120, 32, "CLOSE", "#c62828");
    ctx.fillStyle = "#757575";
    ctx.font = "11px Arial";
    ctx.textAlign = "center";
    ctx.fillText(
        `Page ${questPage + 1} / ${Math.ceil(QUESTS.length / visibleCount)}`,
        300,
        550,
    );
}

function drawInventory() {
    ctx.fillStyle = "rgba(0,0,0,0.92)";
    ctx.fillRect(80, 60, 440, 480);
    ctx.strokeStyle = "#ffd54f";
    ctx.lineWidth = 2;
    ctx.strokeRect(80, 60, 440, 480);
    ctx.fillStyle = "#ffd54f";
    ctx.font = "bold 20px Arial";
    ctx.textAlign = "center";
    ctx.fillText("INVENTORY", 300, 92);

    const items = [
        {
            label: "Wood",
            value: player.wood,
            total: player.totalWood,
            color: "#8d6e63",
        },
        {
            label: "Leaves",
            value: player.leaves,
            total: player.totalLeaves,
            color: "#66bb6a",
        },
        {
            label: "Slime Gel",
            value: player.gel,
            total: player.totalGel,
            color: "#26c6da",
        },
        {
            label: "Stone",
            value: player.stone,
            total: player.totalStone,
            color: "#90a4ae",
        },
        {
            label: "Crystals",
            value: player.crystals,
            total: player.totalCrystals,
            color: "#00e5ff",
        },
    ];
    items.forEach((item, i) => {
        let row = Math.floor(i / 2),
            col = i % 2;
        let x = 105 + col * 210,
            y = 115 + row * 90;
        ctx.fillStyle = "rgba(255,255,255,0.07)";
        ctx.fillRect(x, y, 190, 75);
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, 190, 75);
        ctx.fillStyle = item.color;
        ctx.font = "bold 14px Arial";
        ctx.textAlign = "left";
        ctx.fillText(item.label, x + 10, y + 22);
        ctx.fillStyle = "white";
        ctx.font = "bold 26px Arial";
        ctx.fillText(item.value, x + 10, y + 55);
        ctx.fillStyle = "#9e9e9e";
        ctx.font = "11px Arial";
        ctx.fillText("total: " + item.total, x + 100, y + 55);
    });

    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fillRect(105, 385, 410, 75);
    ctx.strokeStyle = "#ffd54f";
    ctx.lineWidth = 1;
    ctx.strokeRect(105, 385, 410, 75);
    ctx.fillStyle = "#ffd54f";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "left";
    ctx.fillText("Money", 115, 407);
    ctx.fillStyle = "white";
    ctx.font = "bold 26px Arial";
    ctx.fillText("$" + player.money, 115, 447);

    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fillRect(105, 470, 410, 55);
    ctx.strokeStyle = "#ef9a9a";
    ctx.lineWidth = 1;
    ctx.strokeRect(105, 470, 410, 55);
    ctx.fillStyle = "#ef9a9a";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "left";
    ctx.fillText("Slimes Killed", 115, 492);
    ctx.fillStyle = "white";
    ctx.font = "bold 18px Arial";
    ctx.fillText(player.kills, 115, 514);
    ctx.fillStyle = "#9e9e9e";
    ctx.font = "11px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Press E or ESC to close", 300, 534);
}

function drawShopUI() {
    ctx.fillStyle = "rgba(0,0,0,0.93)"; ctx.fillRect(70, 50, 460, 510);
    ctx.strokeStyle = "#3498db"; ctx.lineWidth = 2; ctx.strokeRect(70, 50, 460, 510);
    ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.font = "bold 20px Arial";
    ctx.fillText("SHOP", 300, 80);

    drawButton(95, 88, 130, 30, "SELL", shopTab === "sell" ? "#1565c0" : "#444");
    drawButton(235, 88, 130, 30, "UPGRADES", shopTab === "upgrade" ? "#6a1b9a" : "#444");
    drawButton(375, 88, 130, 30, "POTIONS", shopTab === "potions" ? "#b71c1c" : "#444");

    ctx.fillStyle = "#ffd54f"; ctx.font = "bold 15px Arial";
    ctx.fillText("$" + player.money + "   Arrows: " + player.bowAmmo, 300, 145);

    if (shopTab === "sell") {
        ctx.fillStyle = "#a5d6a7"; ctx.font = "bold 13px Arial";
        ctx.fillText("── Sell Resources ──", 300, 165);
        drawButton(155, 173, 290, 38, "SELL WOOD (" + player.wood + "x $5)");
        drawButton(155, 221, 290, 38, "SELL LEAVES (" + player.leaves + "x $2)");
        drawButton(155, 269, 290, 38, "SELL GEL (" + player.gel + "x $10)");
        drawButton(155, 317, 290, 38, "SELL STONE (" + player.stone + "x $3)");
        drawButton(155, 365, 290, 38, "SELL CRYSTALS (" + player.crystals + "x $50)");
    } else if (shopTab === "upgrade") {
        ctx.fillStyle = "#ce93d8"; ctx.font = "bold 13px Arial";
        ctx.fillText("── Weapons & Upgrades ──", 300, 165);
        const bowLabel = player.bowOwned ? "BOW OWNED ✓" : "BUY BOW ($300)";
        drawButton(155, 173, 290, 38, bowLabel, player.bowOwned ? "#2e7d32" : "#6a1b9a");
        drawButton(155, 221, 290, 38, "CRAFT ARROWS (5 Wood → 15 Arrows)", "#5d4037");
        const axeNames = ["Upgrade Axe Lv1 ($200)","Upgrade Axe Lv2 ($400)","Upgrade Axe Lv3 ($700)","AXE MAXED ✓"];
        drawButton(155, 269, 290, 38, axeNames[player.axeLevel], player.axeLevel >= 3 ? "#2e7d32" : "#e65100");
        const hpLabel = player.hpUpgrades >= 5 ? "MAX HP MAXED ✓" : "Max HP +30 ($250) [" + player.hpUpgrades + "/5]";
        drawButton(155, 317, 290, 38, hpLabel, player.hpUpgrades >= 5 ? "#2e7d32" : "#c62828");
        const spdLabel = player.speedUpgrades >= 5 ? "SPEED MAXED ✓" : "Speed +20 ($200) [" + player.speedUpgrades + "/5]";
        drawButton(155, 365, 290, 38, spdLabel, player.speedUpgrades >= 5 ? "#2e7d32" : "#0277bd");
    } else if (shopTab === "potions") {
        ctx.fillStyle = "#ef9a9a"; ctx.font = "bold 13px Arial";
        ctx.fillText("── Consumables ──", 300, 165);
        drawButton(155, 173, 290, 38, "HEALTH POTION ($50)  +25 HP", "#c62828");
        drawButton(155, 221, 290, 38, "MEGA POTION ($120)  +60 HP", "#b71c1c");
        drawButton(155, 269, 290, 38, "SPEED BOOST ($100)  20 seconds", "#1565c0");
    }

    drawButton(340, 520, 160, 30, "CLOSE", "#c62828");
}

// ─── 9. MAIN GAME LOOP ───────────────────────────────────────────────────────
function animate(currentTime) {
    const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
    lastTime = currentTime;

    if (gameState === "GAME") {
        if (!showShop && !showQuestGiver && !showInventory) {
            let mx =
                (keys["KeyD"] || keys["ArrowRight"] ? 1 : 0) -
                (keys["KeyA"] || keys["ArrowLeft"] ? 1 : 0);
            let my =
                (keys["KeyS"] || keys["ArrowDown"] ? 1 : 0) -
                (keys["KeyW"] || keys["ArrowUp"] ? 1 : 0);

            if ((mx !== 0 || my !== 0) && !player.isSwinging) {
                let moveDist = player.baseSpeed * dt;
                let nX = camera.x + mx * moveDist,
                    nY = camera.y + my * moveDist;
                if (!checkCollision(nX, camera.y)) camera.x = nX;
                if (!checkCollision(camera.x, nY)) camera.y = nY;
                player.isMoving = true;
                player.direction =
                    mx > 0 ? "right" : mx < 0 ? "left" : my > 0 ? "down" : "up";
            } else {
                player.isMoving = false;
            }

            if (player.isSwinging) {
                player.swingTimer -= dt * 30;
                if (player.swingTimer <= 0) player.isSwinging = false;
            }
            if (player.invuln > 0) player.invuln -= dt;
            if (pendingTeleport) { applyTeleport(pendingTeleport); pendingTeleport = null; }
            if (notifTimer > 0) notifTimer -= dt;
            if (speedBoostTimer > 0) {
                speedBoostTimer -= dt;
                if (speedBoostTimer <= 0) {
                    player.baseSpeed -= 80;
                    speedBoostTimer = 0;
                }
            }
            // Mob cap respawn: keep exactly MOB_CAP enemies alive
            if (mobs.length < MOB_CAP) {
                mobRespawnTimer -= dt;
                if (mobRespawnTimer <= 0) {
                    mobRespawnTimer = 5; // respawn every 5s
                    const angle = Math.random() * Math.PI * 2;
                    const dist = 400 + Math.random() * 200;
                    const rx = camera.x + Math.cos(angle) * dist;
                    const ry = camera.y + Math.sin(angle) * dist;
                    if (Math.random() < 0.4) spawnSlime(rx, ry);
                    else spawnGoblin(rx, ry);
                }
            } else {
                mobRespawnTimer = 5;
            }

            worldTime = (worldTime + dt / 300) % 1;

            particles = particles.filter((p) => {
                p.wx += p.vx * dt;
                p.wy += p.vy * dt;
                p.vy += 80 * dt;
                p.life -= dt * 2.0;
                return p.life > 0;
            });

            arrows = arrows.filter((a) => {
                a.wx += a.vx * dt;
                a.wy += a.vy * dt;
                a.life -= dt;
                for (let i = mobs.length - 1; i >= 0; i--) {
                    const m = mobs[i];
                    if (Math.hypot(a.wx - m.x, a.wy - m.y) < 28) {
                        m.hp -= a.damage; m.shake = 10;
                        spawnParticles(m.x, m.y - 20, m.type === "goblin" ? "#4caf50" : "#4dd0e1", 4);
                        if (m.hp <= 0) {
                            if (m.type === "goblin") {
                                let sAmt = 2 + Math.floor(Math.random() * 3);
                                player.stone += sAmt; player.totalStone += sAmt;
                                spawnParticles(m.x, m.y, "#4caf50", 10);
                                gainXP(35);
                            } else {
                                player.gel++; player.totalGel++;
                                spawnParticles(m.x, m.y, "#4dd0e1", 8);
                                gainXP(20);
                            }
                            player.kills++;
                            mobs.splice(i, 1);
                            QUESTS.forEach(q => { if (!completedQuests.includes(q.id) && q.check(player) && notifTimer <= 0) showNotif(q.name, "#ce93d8", 4); });
                        }
                        return false;
                    }
                }
                return a.life > 0;
            });

            mobs.forEach((m) => {
                let isNight = worldTime > 0.25 && worldTime < 0.75;
                let chaseRange =
                    m.type === "goblin" ? 350 : isNight ? 320 : 250;
                let chaseSpeed = m.type === "goblin" ? 170 : 120;
                let wanderSpeed = m.type === "goblin" ? 55 : 40;
                let distToPlayer = Math.hypot(camera.x - m.x, camera.y - m.y);
                m.state = distToPlayer < chaseRange ? "CHASE" : "WANDER";
                let speed =
                    (m.state === "CHASE" ? chaseSpeed : wanderSpeed) * dt;
                let tx = m.state === "CHASE" ? camera.x : m.targetX;
                let ty = m.state === "CHASE" ? camera.y : m.targetY;
                if (Math.hypot(tx - m.x, ty - m.y) > 5) {
                    let angle = Math.atan2(ty - m.y, tx - m.x);
                    m.x += Math.cos(angle) * speed;
                    m.y += Math.sin(angle) * speed;
                    m.dir =
                        Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))
                            ? Math.cos(angle) > 0
                                ? "right"
                                : "left"
                            : Math.sin(angle) > 0
                              ? "down"
                              : "up";
                } else if (m.state === "WANDER") {
                    m.targetX = m.x + (Math.random() - 0.5) * 200;
                    m.targetY = m.y + (Math.random() - 0.5) * 200;
                }
                let dmg = m.type === "goblin" ? 15 : 10;
                if (distToPlayer < 40 && player.invuln <= 0) {
                    player.hp -= dmg;
                    player.invuln = 1.0;
                    if (player.hp <= 0) {
                        camera.x = 0;
                        camera.y = 0;
                        player.hp = player.maxHp;
                    }
                }
            });

            // Sync position to multiplayer server every 3 frames
            if (isOnline && currentRoomId && gameFrame % 3 === 0) {
                socket.emit("game:event", {
                    roomId: currentRoomId,
                    payload: {
                        x: camera.x,
                        y: camera.y,
                        dir: player.direction,
                        moving: player.isMoving,
                        swinging: player.isSwinging,
                        hp: player.hp,
                        name: playerName,
                        wood: player.wood,
                        money: player.money,
                        stone: player.stone,
                        crystals: player.crystals,
                        leaves: player.leaves,
                        gel: player.gel,
                    },
                });
            }
        }

        // ── DRAW WORLD ──────────────────────────────────────────────────────
        ctx.clearRect(0, 0, 600, 600);
        ctx.save();
        ctx.translate(-camera.x + 300, -camera.y + 300);

        if (grassPattern) {
            ctx.fillStyle = grassPattern;
            ctx.fillRect(camera.x - 2500, camera.y - 2500, 5000, 5000);
        }
        ctx.drawImage(
            images.shop,
            shopBounds.x,
            shopBounds.y,
            shopBounds.w,
            shopBounds.h,
        );
        drawQuestGiver(questGiverPos.x, questGiverPos.y);

        let drawList = [];
        trees.forEach((t) => {
            if (t.wood <= 0) {
                t.respawn += dt;
                if (t.respawn > 20) {
                    t.wood = 5;
                    t.respawn = 0;
                    t.shake = 0;
                }
            }
            if (t.shake > 0) t.shake -= dt * 40;
            drawList.push({ ...t, type: t.wood > 0 ? "tree" : "stump" });
        });
        bushes.forEach((b) => {
            if (b.health <= 0) {
                b.respawn += dt;
                if (b.respawn > 12) {
                    b.health = 3;
                    b.respawn = 0;
                    b.shake = 0;
                }
            }
            if (b.shake > 0) b.shake -= dt * 40;
            drawList.push({ ...b, type: "bush" });
        });
        rocks.forEach((r) => {
            if (r.hp <= 0) {
                r.respawn += dt;
                if (r.respawn > 60) {
                    r.hp = r.maxHp;
                    r.respawn = 0;
                    r.shake = 0;
                }
            }
            if (r.shake > 0) r.shake -= dt * 40;
            drawList.push({ ...r, type: "rock" });
        });
        crystalNodes.forEach((c) => {
            if (c.hp <= 0) {
                c.respawn += dt;
                if (c.respawn > 180) {
                    c.hp = c.maxHp;
                    c.respawn = 0;
                    c.shake = 0;
                }
            }
            if (c.shake > 0) c.shake -= dt * 40;
            drawList.push({ ...c, type: "crystal_node" });
        });
        mobs.forEach((m) => {
            if (m.shake > 0) m.shake -= dt * 40;
            drawList.push({ ...m, type: m.type === "goblin" ? "goblin" : "slime_mob" });
        });
        for (let id in remotePlayers)
            drawList.push({ ...remotePlayers[id], type: "other", _id: id });
        drawList.push({ x: camera.x, y: camera.y, type: "player" });
        drawList.sort((a, b) => a.y - b.y);

        drawList.forEach((obj) => {
            let sX = obj.shake > 0 ? Math.sin(gameFrame * 0.8) * 4 : 0;
            if (obj.type === "tree") {
                ctx.drawImage(
                    images.tree,
                    obj.x - 80 + sX,
                    obj.y - 160,
                    160,
                    180,
                );
            } else if (obj.type === "stump") {
                ctx.drawImage(images.stump, obj.x - 40, obj.y - 40, 80, 80);
            } else if (obj.type === "bush") {
                let fX = obj.health <= 0 ? images.bush.width / 2 : 0;
                ctx.drawImage(
                    images.bush,
                    fX,
                    0,
                    images.bush.width / 2,
                    images.bush.height,
                    obj.x - 40 + sX,
                    obj.y - 40,
                    80,
                    80,
                );
            } else if (obj.type === "rock") {
                drawRock(obj.x, obj.y, obj.hp / obj.maxHp, obj.shake);
            } else if (obj.type === "crystal_node") {
                drawCrystalNode(obj.x, obj.y, obj.hp / obj.maxHp, obj.shake);
            } else if (obj.type === "slime_mob") {
                let gW = images.slime.width / 3,
                    gH = images.slime.height / 4;
                let f = Math.floor(gameFrame / 10) % 3;
                ctx.drawImage(
                    images.slime,
                    f * gW,
                    animations[obj.dir] * gH,
                    gW,
                    gH,
                    obj.x - 32 + sX,
                    obj.y - 32,
                    64,
                    64,
                );
                if (obj.hp < obj.maxHp) {
                    ctx.fillStyle = "#333";
                    ctx.fillRect(obj.x - 20, obj.y - 40, 40, 5);
                    ctx.fillStyle = "#e53935";
                    ctx.fillRect(
                        obj.x - 20,
                        obj.y - 40,
                        (obj.hp / obj.maxHp) * 40,
                        5,
                    );
                }
            } else if (obj.type === "goblin") {
                if (images.goblin && images.goblin.complete) {
                    const gW = 32, gH = 32;
                    const fr = Math.floor(gameFrame / 10) % 3;
                    const dirIdx = animations[obj.dir || "down"];
                    ctx.drawImage(images.goblin, fr * gW, dirIdx * gH, gW, gH, obj.x - 32 + sX, obj.y - 32, 64, 64);
                }
                if (obj.hp < obj.maxHp) {
                    ctx.fillStyle = "#333";
                    ctx.fillRect(obj.x - 20, obj.y - 44, 40, 5);
                    ctx.fillStyle = "#e53935";
                    ctx.fillRect(obj.x - 20, obj.y - 44, (obj.hp / obj.maxHp) * 40, 5);
                }
            } else if (obj.type === "player" || obj.type === "other") {
                let grid = images.sprite.width / 4;
                let isM = obj.type === "player" ? player.isMoving : obj.moving;
                let d =
                    obj.type === "player"
                        ? player.direction
                        : obj.dir || "down";
                let f = isM ? Math.floor(gameFrame / 10) % 4 : 0;
                if (
                    obj.type === "player" &&
                    player.invuln > 0 &&
                    gameFrame % 4 < 2
                )
                    ctx.globalAlpha = 0.3;
                ctx.drawImage(
                    images.sprite,
                    f * grid,
                    animations[d] * grid,
                    grid,
                    grid,
                    obj.x - 32,
                    obj.y - 32,
                    64,
                    64,
                );
                ctx.globalAlpha = 1.0;
                // Axe swing
                if (
                    (obj.type === "player" && player.isSwinging) ||
                    (obj.type === "other" && obj.swinging)
                ) {
                    let prog =
                        obj.type === "player"
                            ? 1 - player.swingTimer / 10
                            : 0.5;
                    ctx.save();
                    ctx.translate(obj.x, obj.y);
                    ctx.rotate(-2.0 + prog * 2.8);
                    ctx.drawImage(images.axe, 10, -45, 40, 40);
                    ctx.restore();
                }
                // Name tag for other players
                if (obj.type === "other") {
                    let tag = obj.name || "Player";
                    ctx.font = "bold 11px Arial";
                    ctx.textAlign = "center";
                    let tw = ctx.measureText(tag).width;
                    ctx.fillStyle = "rgba(0,0,0,0.6)";
                    ctx.fillRect(obj.x - tw / 2 - 4, obj.y - 50, tw + 8, 15);
                    ctx.fillStyle = "#ffffff";
                    ctx.fillText(tag, obj.x, obj.y - 39);
                }
            }
        });

        // Draw particles in world space
        particles.forEach((p) => {
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillStyle = p.color;
            ctx.fillRect(p.wx - p.size / 2, p.wy - p.size / 2, p.size, p.size);
        });
        ctx.globalAlpha = 1;

        // Draw arrows in world space
        arrows.forEach((a) => {
            ctx.save();
            const angle = Math.atan2(a.vy, a.vx);
            ctx.translate(a.wx, a.wy);
            ctx.rotate(angle);
            ctx.fillStyle = "#8d6e63";
            ctx.fillRect(-12, -2, 22, 4);
            ctx.fillStyle = "#ffc107";
            ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(4, -4); ctx.lineTo(4, 4); ctx.closePath(); ctx.fill();
            ctx.fillStyle = "#fff8e1";
            ctx.fillRect(-14, -3, 5, 2); ctx.fillRect(-14, 1, 5, 2);
            ctx.restore();
        });

        ctx.restore();

        // Day/night overlay
        let nightProgress = Math.sin(worldTime * Math.PI * 2);
        let nightAlpha = Math.max(0, nightProgress * 0.65);
        if (nightAlpha > 0) {
            ctx.fillStyle = `rgba(5, 10, 60, ${nightAlpha})`;
            ctx.fillRect(0, 0, 600, 600);
        }

        // ── HUD ─────────────────────────────────────────────────────────────
        // HP bar
        ctx.fillStyle = "#111";
        ctx.fillRect(20, 20, 200, 18);
        ctx.fillStyle = player.hp > 50 ? "#e53935" : "#ff7043";
        ctx.fillRect(20, 20, (player.hp / player.maxHp) * 200, 18);
        ctx.strokeStyle = "white";
        ctx.lineWidth = 1;
        ctx.strokeRect(20, 20, 200, 18);
        ctx.fillStyle = "white";
        ctx.font = "11px Arial";
        ctx.textAlign = "center";
        ctx.fillText("HP: " + player.hp + " / " + player.maxHp, 120, 33);

        // Money bar
        ctx.fillStyle = "rgba(0,0,0,0.65)";
        ctx.fillRect(20, 42, 200, 18);
        ctx.font = "bold 12px Arial";
        ctx.textAlign = "left";
        ctx.fillStyle = "#ffd54f";
        ctx.fillText("$" + player.money, 26, 55);
        ctx.fillStyle = "#9e9e9e";
        ctx.font = "10px Arial";
        ctx.fillText("  |  E = Inventory", 62, 55);

        // XP bar
        ctx.fillStyle = "#111";
        ctx.fillRect(20, 63, 200, 10);
        ctx.fillStyle = "#7c4dff";
        ctx.fillRect(20, 63, (player.xp / player.xpToNext) * 200, 10);
        ctx.strokeStyle = "#444";
        ctx.lineWidth = 1;
        ctx.strokeRect(20, 63, 200, 10);
        ctx.fillStyle = "#ce93d8";
        ctx.font = "9px Arial";
        ctx.textAlign = "left";
        ctx.fillText(
            "LV " +
                player.level +
                "   XP " +
                player.xp +
                " / " +
                player.xpToNext,
            22,
            71,
        );

        // Speed boost indicator
        if (speedBoostTimer > 0) {
            ctx.fillStyle = "#00bcd4";
            ctx.font = "bold 11px Arial";
            ctx.textAlign = "left";
            ctx.fillText(
                "SPEED BOOST " + Math.ceil(speedBoostTimer) + "s",
                22,
                86,
            );
        }

        // Day/Night time indicator
        let isNightHUD = worldTime > 0.25 && worldTime < 0.75;
        ctx.fillStyle = isNightHUD ? "#90caf9" : "#ffd54f";
        ctx.font = "11px Arial";
        ctx.textAlign = "right";
        ctx.fillText(isNightHUD ? "Night" : "Day", 590, 145);

        // Minimap
        ctx.fillStyle = "rgba(0,0,0,0.75)";
        ctx.fillRect(470, 10, 120, 120);
        ctx.strokeStyle = "#444";
        ctx.lineWidth = 1;
        ctx.strokeRect(470, 10, 120, 120);
        trees.forEach((t) => {
            if (t.wood > 0) {
                ctx.fillStyle = "#5d4037";
                ctx.fillRect(470 + 60 + t.x / 40, 10 + 60 + t.y / 40, 2, 2);
            }
        });
        rocks.forEach((r) => {
            if (r.hp > 0) {
                ctx.fillStyle = "#9e9e9e";
                ctx.fillRect(470 + 60 + r.x / 40, 10 + 60 + r.y / 40, 2, 2);
            }
        });
        crystalNodes.forEach((c) => {
            if (c.hp > 0) {
                ctx.fillStyle = "#00e5ff";
                ctx.fillRect(470 + 60 + c.x / 40, 10 + 60 + c.y / 40, 2, 2);
            }
        });
        mobs.forEach((m) => {
            ctx.fillStyle = m.type === "goblin" ? "#4caf50" : "#ef5350";
            ctx.fillRect(470 + 60 + m.x / 40, 10 + 60 + m.y / 40, 3, 3);
        });
        ctx.fillStyle = "#ce93d8";
        ctx.fillRect(
            470 + 60 + questGiverPos.x / 40,
            10 + 60 + questGiverPos.y / 40,
            4,
            4,
        );
        ctx.fillStyle = "lime";
        ctx.fillRect(470 + 60 + camera.x / 40, 10 + 60 + camera.y / 40, 5, 5);

        // Proximity hints
        ctx.textAlign = "center";
        ctx.font = "13px Arial";
        let nearShop =
            Math.hypot(
                camera.x - (shopBounds.x + 125),
                camera.y - (shopBounds.y + 75),
            ) < 180;
        let nearNPC =
            Math.hypot(camera.x - questGiverPos.x, camera.y - questGiverPos.y) <
            150;
        if (nearShop || nearNPC) {
            ctx.fillStyle = "rgba(0,0,0,0.7)";
            ctx.fillRect(150, 480, 300, 24);
            if (nearNPC) {
                ctx.fillStyle = "#ce93d8";
                ctx.fillText("Press E to talk to Quest Giver", 300, 497);
            } else {
                ctx.fillStyle = "white";
                ctx.fillText("Press E to open Shop", 300, 497);
            }
        }

        // Notification banner (quest complete or server announce)
        if (notifText && notifTimer > 0) {
            let alpha = Math.min(1, notifTimer);
            ctx.globalAlpha = alpha;
            let isAnnounce = notifText.startsWith("📢");
            ctx.fillStyle = isAnnounce
                ? "rgba(15,60,100,0.92)"
                : "rgba(123,31,162,0.9)";
            ctx.fillRect(80, 160, 440, 54);
            ctx.strokeStyle = isAnnounce ? "#38bdf8" : "#ce93d8";
            ctx.lineWidth = 2;
            ctx.strokeRect(80, 160, 440, 54);
            ctx.fillStyle = "white";
            ctx.font = "bold 14px Arial";
            ctx.textAlign = "center";
            ctx.fillText(notifText, 300, 184);
            if (!isAnnounce) {
                ctx.fillStyle = "#ffd54f";
                ctx.font = "12px Arial";
                ctx.fillText(
                    "Talk to the Quest Giver to claim your reward!",
                    300,
                    203,
                );
            }
            ctx.globalAlpha = 1;
        }

        // UI panels
        if (showShop) drawShopUI();
        if (showQuestGiver) drawQuestUI();
        if (showInventory) drawInventory();

        // Hotbar (5 slots, centred)
        const hbSlots = 5;
        const hbSize = 50, hbGap = 4;
        const hbTotalW = hbSlots * hbSize + (hbSlots - 1) * hbGap;
        const hbX0 = Math.round((canvas.width - hbTotalW) / 2);
        const hbY = 530;
        for (let i = 0; i < hbSlots; i++) {
            const sx = hbX0 + i * (hbSize + hbGap);
            ctx.fillStyle = selectedSlot === i ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.6)";
            ctx.fillRect(sx, hbY, hbSize, hbSize);
            ctx.strokeStyle = selectedSlot === i ? "#ffd54f" : "#666";
            ctx.lineWidth = 2;
            ctx.strokeRect(sx, hbY, hbSize, hbSize);
            // slot number label
            ctx.fillStyle = selectedSlot === i ? "#ffd54f" : "#aaa";
            ctx.font = "9px Arial"; ctx.textAlign = "left";
            ctx.fillText(i + 1, sx + 3, hbY + 11);
            const cx = sx + 10, cy = hbY + 10;
            const itm = inventory[i];
            if (!itm) continue;
            ctx.textAlign = "center";
            if (itm.id === "axe") {
                ctx.drawImage(images.axe, cx, cy, 30, 30);
                if (player.axeLevel > 0) {
                    ctx.fillStyle = "#ffd54f"; ctx.font = "bold 10px Arial";
                    ctx.fillText("Lv" + player.axeLevel, sx + hbSize / 2, hbY + hbSize - 3);
                }
            }
            if (itm.id === "log") {
                ctx.drawImage(images.log, cx, cy, 30, 30);
                ctx.fillStyle = "white"; ctx.font = "11px Arial";
                ctx.fillText(player.wood, sx + hbSize / 2, hbY + hbSize - 3);
            }
            if (itm.id === "leaves") {
                ctx.drawImage(images.leaves, cx, cy, 30, 30);
                ctx.fillStyle = "white"; ctx.font = "11px Arial";
                ctx.fillText(player.leaves, sx + hbSize / 2, hbY + hbSize - 3);
            }
            if (itm.id === "slime_gel") {
                ctx.drawImage(images.gel, cx, cy, 30, 30);
                ctx.fillStyle = "white"; ctx.font = "11px Arial";
                ctx.fillText(player.gel, sx + hbSize / 2, hbY + hbSize - 3);
            }
            if (itm.id === "bow") {
                // Draw a little bow icon
                ctx.save();
                ctx.translate(sx + hbSize / 2, hbY + hbSize / 2);
                ctx.strokeStyle = "#a1887f"; ctx.lineWidth = 2.5;
                ctx.beginPath(); ctx.arc(0, 0, 12, -Math.PI * 0.65, Math.PI * 0.65); ctx.stroke();
                ctx.strokeStyle = "#e0c99a"; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(10, 0); ctx.stroke();
                ctx.restore();
                ctx.fillStyle = player.bowAmmo > 0 ? "#ffc107" : "#ef5350";
                ctx.font = "10px Arial"; ctx.textAlign = "center";
                ctx.fillText("×" + player.bowAmmo, sx + hbSize / 2, hbY + hbSize - 3);
            }
        }
    }

    gameFrame++;
    requestAnimationFrame(animate);
}

// ─── 10. INPUT ───────────────────────────────────────────────────────────────
window.addEventListener("keydown", (e) => {
    if (gameState === "CREATE") {
        if (e.key === "Enter" && typingName.trim()) {
            let worlds = JSON.parse(localStorage.getItem("rpg_worlds") || "[]");
            worlds.push({ name: typingName.trim(), seed: Date.now() });
            localStorage.setItem("rpg_worlds", JSON.stringify(worlds));
            initWorld(Date.now());
            gameState = "GAME";
            animate(performance.now());
            if (pendingTeleport) { applyTeleport(pendingTeleport); pendingTeleport = null; }
        } else if (e.key === "Backspace") {
            typingName = typingName.slice(0, -1);
        } else if (e.key.length === 1) {
            typingName += e.key;
        }
        return;
    }

    if (gameState !== "GAME") return;

    if (e.code === "Escape") {
        showShop = false;
        showQuestGiver = false;
        showInventory = false;
        return;
    }

    if (e.code === "KeyE") {
        if (showShop || showQuestGiver || showInventory) {
            showShop = false;
            showQuestGiver = false;
            showInventory = false;
        } else if (
            Math.hypot(camera.x - questGiverPos.x, camera.y - questGiverPos.y) <
            150
        ) {
            showQuestGiver = true;
            questPage = 0;
        } else if (
            Math.hypot(
                camera.x - (shopBounds.x + 125),
                camera.y - (shopBounds.y + 75),
            ) < 180
        ) {
            showShop = true;
        } else {
            showInventory = true;
        }
        return;
    }

    if (["1", "2", "3", "4", "5"].includes(e.key)) {
        selectedSlot = parseInt(e.key) - 1;
        return;
    }

    keys[e.code] = true;

    if (
        e.code === "Space" &&
        !player.isSwinging &&
        !showShop &&
        !showQuestGiver &&
        !showInventory
    ) {
        if (inventory[selectedSlot].id === "axe") {
            player.isSwinging = true;
            player.swingTimer = 10;
            const swingRange = 110 + player.axeLevel * 20;
            trees.forEach((t) => {
                if (
                    t.wood > 0 &&
                    Math.hypot(camera.x - t.x, camera.y - t.y) < swingRange
                ) {
                    t.wood--;
                    t.shake = 10;
                    spawnParticles(t.x, t.y - 60, "#8d6e63", 6);
                    if (t.wood <= 0) {
                        player.wood += 5;
                        player.totalWood += 5;
                        gainXP(3);
                    }
                }
            });
            bushes.forEach((b) => {
                if (
                    b.health > 0 &&
                    Math.hypot(camera.x - b.x, camera.y - b.y) < swingRange - 30
                ) {
                    b.health--;
                    b.shake = 10;
                    spawnParticles(b.x, b.y - 30, "#66bb6a", 5);
                    if (b.health <= 0) {
                        player.leaves += 3;
                        player.totalLeaves += 3;
                        gainXP(2);
                    }
                }
            });
            const axeRange = 100 + player.axeLevel * 20;
            const axeDmg  = 1  + player.axeLevel;
            mobs.forEach((m, idx) => {
                if (Math.hypot(camera.x - m.x, camera.y - m.y) < axeRange) {
                    m.hp -= axeDmg;
                    m.shake = 10;
                    if (m.hp <= 0) {
                        if (m.type === "goblin") {
                            let stoneAmt = 2 + Math.floor(Math.random() * 3);
                            player.stone += stoneAmt;
                            player.totalStone += stoneAmt;
                            spawnParticles(m.x, m.y, "#4caf50", 10);
                            gainXP(35);
                        } else {
                            player.gel++;
                            player.totalGel++;
                            spawnParticles(m.x, m.y, "#4dd0e1", 8);
                            gainXP(20);
                        }
                        player.kills++;
                        mobs.splice(idx, 1);
                    } else {
                        let hitColor =
                            m.type === "goblin" ? "#4caf50" : "#4dd0e1";
                        spawnParticles(m.x, m.y - 20, hitColor, 4);
                    }
                }
            });
            rocks.forEach((r) => {
                if (
                    r.hp > 0 &&
                    Math.hypot(camera.x - r.x, camera.y - r.y) < swingRange
                ) {
                    r.hp--;
                    r.shake = 10;
                    spawnParticles(r.x, r.y, "#9e9e9e", 6);
                    if (r.hp <= 0) {
                        let amt = 2 + Math.floor(Math.random() * 4);
                        player.stone += amt;
                        player.totalStone += amt;
                        gainXP(2);
                        if (Math.random() < 0.18) {
                            player.crystals++;
                            player.totalCrystals++;
                        }
                    }
                }
            });
            crystalNodes.forEach((c) => {
                if (
                    c.hp > 0 &&
                    Math.hypot(camera.x - c.x, camera.y - c.y) < swingRange
                ) {
                    c.hp--;
                    c.shake = 10;
                    spawnParticles(c.x, c.y - 20, "#00e5ff", 7);
                    if (c.hp <= 0) {
                        let amt = 1 + Math.floor(Math.random() * 2);
                        player.crystals += amt;
                        player.totalCrystals += amt;
                        gainXP(10);
                    }
                }
            });
            // Check for newly completable quests
            QUESTS.forEach((q) => {
                if (
                    !completedQuests.includes(q.id) &&
                    q.check(player) &&
                    notifTimer <= 0
                ) {
                    showNotif(q.name, "#ce93d8", 4);
                }
            });
        }
        if (inventory[selectedSlot].id === "bow") {
            if (player.bowAmmo > 0) {
                player.bowAmmo--;
                const spd = 480 + player.axeLevel * 40;
                const dirs = { down: [0,1], up: [0,-1], left: [-1,0], right: [1,0] };
                const dv = dirs[player.direction];
                const dmg = 2 + player.axeLevel;
                arrows.push({ wx: camera.x, wy: camera.y, vx: dv[0] * spd, vy: dv[1] * spd, life: 1.5, damage: dmg });
            } else {
                showNotif("No arrows! Craft more at the shop.", "#ff8a65", 3);
            }
        }
    }
});

window.addEventListener("keyup", (e) => {
    keys[e.code] = false;
});

canvas.addEventListener("mousedown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left,
        my = e.clientY - rect.top;

    if (showQuestGiver) {
        const vis = QUESTS.slice(questPage * 4, questPage * 4 + 4);
        vis.forEach((q, i) => {
            let yBase = 120 + i * 105;
            if (
                !completedQuests.includes(q.id) &&
                q.check(player) &&
                mx > 380 &&
                mx < 510 &&
                my > yBase + 55 &&
                my < yBase + 85
            ) {
                q.reward(player);
                completedQuests.push(q.id);
                notifText = null;
                notifTimer = 0;
            }
        });
        if (questPage > 0 && mx > 75 && mx < 175 && my > 490 && my < 522)
            questPage--;
        if (
            (questPage + 1) * 4 < QUESTS.length &&
            mx > 425 &&
            mx < 525 &&
            my > 490 &&
            my < 522
        )
            questPage++;
        if (mx > 220 && mx < 340 && my > 490 && my < 522)
            showQuestGiver = false;
        return;
    }

    if (showShop) {
        // Tab buttons
        if (my > 88 && my < 118) {
            if (mx > 95 && mx < 225)  shopTab = "sell";
            if (mx > 235 && mx < 365) shopTab = "upgrade";
            if (mx > 375 && mx < 505) shopTab = "potions";
        }
        // Close button
        if (mx > 340 && mx < 500 && my > 520 && my < 550) { showShop = false; return; }

        if (shopTab === "sell" && mx > 155 && mx < 445) {
            if (my > 173 && my < 211) { player.money += player.wood     * 5;  player.wood     = 0; }
            if (my > 221 && my < 259) { player.money += player.leaves   * 2;  player.leaves   = 0; }
            if (my > 269 && my < 307) { player.money += player.gel      * 10; player.gel      = 0; }
            if (my > 317 && my < 355) { player.money += player.stone    * 3;  player.stone    = 0; }
            if (my > 365 && my < 403) { player.money += player.crystals * 50; player.crystals = 0; }
        }

        if (shopTab === "upgrade" && mx > 155 && mx < 445) {
            // Buy bow
            if (my > 173 && my < 211) {
                if (player.bowOwned) { showNotif("You already own the bow!", "#ce93d8", 2); }
                else if (player.money >= 300) {
                    player.money -= 300; player.bowOwned = true;
                    inventory[4] = { id: "bow" };
                    showNotif("Bow purchased! Press 5 to equip. Buy arrows!", "#ce93d8", 4);
                } else showNotif("Need $300 for the bow.", "#ef9a9a", 2);
            }
            // Craft arrows
            if (my > 221 && my < 259) {
                if (player.wood >= 5) {
                    player.wood -= 5; player.bowAmmo += 15;
                    showNotif("Crafted 15 arrows! (-5 Wood)", "#ffc107", 3);
                } else showNotif("Need 5 Wood to craft arrows.", "#ef9a9a", 2);
            }
            // Axe upgrade
            if (my > 269 && my < 307) {
                const costs = [200, 400, 700];
                if (player.axeLevel >= 3) { showNotif("Axe is already maxed!", "#ffd54f", 2); }
                else if (player.money >= costs[player.axeLevel]) {
                    player.money -= costs[player.axeLevel]; player.axeLevel++;
                    showNotif("Axe upgraded to level " + player.axeLevel + "! Longer range + more damage.", "#ffd54f", 4);
                } else showNotif("Not enough money.", "#ef9a9a", 2);
            }
            // HP upgrade
            if (my > 317 && my < 355) {
                if (player.hpUpgrades >= 5) { showNotif("Max HP is already maxed!", "#ef5350", 2); }
                else if (player.money >= 250) {
                    player.money -= 250; player.maxHp += 30; player.hp = Math.min(player.hp + 30, player.maxHp); player.hpUpgrades++;
                    showNotif("Max HP increased by 30!", "#ef5350", 3);
                } else showNotif("Need $250.", "#ef9a9a", 2);
            }
            // Speed upgrade
            if (my > 365 && my < 403) {
                if (player.speedUpgrades >= 5) { showNotif("Speed is already maxed!", "#4fc3f7", 2); }
                else if (player.money >= 200) {
                    player.money -= 200; player.baseSpeed += 20; player.speedUpgrades++;
                    showNotif("Movement speed increased!", "#4fc3f7", 3);
                } else showNotif("Need $200.", "#ef9a9a", 2);
            }
        }

        if (shopTab === "potions" && mx > 155 && mx < 445) {
            // Health Potion
            if (my > 173 && my < 211) {
                if (player.money >= 50) { player.money -= 50; player.hp = Math.min(player.hp + 25, player.maxHp); showNotif("+25 HP!", "#ef5350", 2); }
                else showNotif("Need $50.", "#ef9a9a", 2);
            }
            // Mega Potion
            if (my > 221 && my < 259) {
                if (player.money >= 120) { player.money -= 120; player.hp = Math.min(player.hp + 60, player.maxHp); showNotif("+60 HP!", "#e53935", 2); }
                else showNotif("Need $120.", "#ef9a9a", 2);
            }
            // Speed Boost
            if (my > 269 && my < 307) {
                if (speedBoostTimer > 0) { showNotif("Speed boost already active!", "#4fc3f7", 2); }
                else if (player.money >= 100) { player.money -= 100; speedBoostTimer = 20; player.baseSpeed += 80; showNotif("Speed Boost active for 20s!", "#4fc3f7", 3); }
                else showNotif("Need $100.", "#ef9a9a", 2);
            }
        }
        return;
    }

    if (showInventory) {
        showInventory = false;
        return;
    }

    // ── MENU NAVIGATION ─────────────────────────────────────────────────────
    if (gameState === "MENU") {
        if (mx > 150 && mx < 450) {
            if (my > 200 && my < 250) {
                typingName = "";
                gameState = "CREATE";
            }
            if (my > 270 && my < 320) gameState = "LOAD_LIST";
            if (my > 340 && my < 390) gameState = "MULTI_LIST";
        }
    } else if (gameState === "CREATE") {
        if (mx > 150 && mx < 450 && my > 500 && my < 540) gameState = "MENU";
    } else if (gameState === "LOAD_LIST") {
        let worlds = JSON.parse(localStorage.getItem("rpg_worlds") || "[]");
        worlds.forEach((w, i) => {
            if (
                mx > 150 &&
                mx < 350 &&
                my > 100 + i * 60 &&
                my < 150 + i * 60
            ) {
                initWorld(w.seed);
                gameState = "GAME";
                animate(performance.now());
                if (pendingTeleport) { applyTeleport(pendingTeleport); pendingTeleport = null; }
            }
            if (
                mx > 360 &&
                mx < 450 &&
                my > 100 + i * 60 &&
                my < 150 + i * 60
            ) {
                worlds.splice(i, 1);
                localStorage.setItem("rpg_worlds", JSON.stringify(worlds));
            }
        });
        if (mx > 150 && mx < 450 && my > 520) gameState = "MENU";
    } else if (gameState === "MULTI_LIST") {
        let servers = JSON.parse(localStorage.getItem("rpg_servers") || "[]");
        servers.forEach((s, i) => {
            if (
                mx > 150 &&
                mx < 350 &&
                my > 100 + i * 60 &&
                my < 150 + i * 60
            ) {
                let n = prompt("Enter your player name:", playerName);
                if (n && n.trim()) playerName = n.trim();
                socket.emit("room:join", { roomId: s, playerName: playerName });
                initWorld(12345);
                gameState = "GAME";
                animate(performance.now());
                if (pendingTeleport) { applyTeleport(pendingTeleport); pendingTeleport = null; }
            }
            if (
                mx > 360 &&
                mx < 450 &&
                my > 100 + i * 60 &&
                my < 150 + i * 60
            ) {
                servers.splice(i, 1);
                localStorage.setItem("rpg_servers", JSON.stringify(servers));
            }
        });
        if (mx > 150 && mx < 450 && my > 400 && my < 450) {
            let n = prompt("Enter server room name:");
            if (n && n.trim()) {
                servers.push(n.trim());
                localStorage.setItem("rpg_servers", JSON.stringify(servers));
            }
        }
        if (mx > 150 && mx < 450 && my > 520) gameState = "MENU";
    }
});

// ─── 11. ASSET LOADING & MENU LOOP ───────────────────────────────────────────
for (let k in assetPaths) {
    images[k] = new Image();
    images[k].src = assetPaths[k];
    images[k].onload = () => {
        if (k === "grass")
            grassPattern = ctx.createPattern(images.grass, "repeat");
        if (++assetsLoaded === Object.keys(assetPaths).length) {
            images.goblin = generateGoblinSheet();
            startMenuLoop();
        }
    };
    images[k].onerror = () => {
        if (++assetsLoaded === Object.keys(assetPaths).length) startMenuLoop();
    };
}

function startMenuLoop() {
    function loop() {
        if (gameState === "GAME") return;
        ctx.clearRect(0, 0, 600, 600);
        if (images.background && images.background.complete)
            ctx.drawImage(images.background, 0, 0, 600, 600);
        if (gameState === "MENU") {
            drawButton(150, 200, 300, 50, "NEW WORLD");
            drawButton(150, 270, 300, 50, "LOAD WORLD");
            drawButton(150, 340, 300, 50, "MULTIPLAYER");
        } else if (gameState === "CREATE") {
            ctx.fillStyle = "white";
            ctx.textAlign = "center";
            ctx.font = "bold 20px Arial";
            ctx.fillText("WORLD NAME: " + typingName + "_", 300, 300);
            drawButton(150, 500, 300, 40, "BACK", "gray");
        } else if (gameState === "LOAD_LIST") {
            let worlds = JSON.parse(localStorage.getItem("rpg_worlds") || "[]");
            if (worlds.length === 0) {
                ctx.fillStyle = "#888";
                ctx.font = "16px Arial";
                ctx.textAlign = "center";
                ctx.fillText("No saved worlds yet.", 300, 200);
            }
            worlds.forEach((w, i) => {
                drawButton(150, 100 + i * 60, 200, 50, w.name);
                drawButton(360, 100 + i * 60, 90, 50, "DELETE", "red");
            });
            drawButton(150, 520, 300, 40, "BACK", "gray");
        } else if (gameState === "MULTI_LIST") {
            let servers = JSON.parse(
                localStorage.getItem("rpg_servers") || "[]",
            );
            if (servers.length === 0) {
                ctx.fillStyle = "#888";
                ctx.font = "16px Arial";
                ctx.textAlign = "center";
                ctx.fillText("No servers saved. Create one below.", 300, 200);
            }
            servers.forEach((s, i) => {
                drawButton(150, 100 + i * 60, 200, 50, s);
                drawButton(360, 100 + i * 60, 90, 50, "DELETE", "red");
            });
            drawButton(150, 400, 300, 50, "+ CREATE SERVER", "#27ae60");
            drawButton(150, 520, 300, 40, "BACK", "gray");
        }
        requestAnimationFrame(loop);
    }
    loop();
}
