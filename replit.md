# RPG Game

A top-down pixel art RPG game built with vanilla JavaScript and Canvas, with real-time multiplayer support via Socket.IO.

## Architecture

- **server.js** — Node.js HTTP server serving static files + Socket.IO for multiplayer sync
- **scripts.js** — All game logic (2000+ lines): rendering, input, AI, world gen, UI panels
- **index.html** — Canvas container, loads socket.io CDN + scripts.js
- **images/** — Sprite assets (player, slime, tree, rock, shop, etc.)

## Tech Stack

- Node.js + Socket.IO (`socket.io ^4.7.2`)
- HTML5 Canvas (no external game frameworks)
- Runs on port 5000

## Game Features

### World & Exploration
- Procedurally generated world (seeded) with trees, bushes, rocks, crystal nodes
- Grass tile pattern background, minimap in top-right corner
- Day/Night cycle (5 min real-time cycle) — night darkens the screen with a blue overlay and makes slimes more aggressive

### Player
- WASD / Arrow keys to move, Space to swing axe
- HP bar, Money display, XP/Level bar in HUD
- Level up system: gain XP from gathering/kills, level up for +10 Max HP +5 Speed
- Invulnerability frames after taking damage
- Die and respawn at origin

### Resources
- **Wood** — chop trees (5 hits each, respawn 20s)
- **Leaves** — harvest bushes (3 hits, respawn 12s)
- **Stone** — mine rocks (8 hits, respawn 60s), chance to drop crystal
- **Crystals** — mine crystal nodes (15 hits, respawn 180s), rare drop from rocks
- **Slime Gel** — kill slimes

### Enemies
- **Slimes** — chase player at 250 range, 120 speed, 3 HP, drop gel (+20 XP)
- **Goblins** — chase player at 350 range, 170 speed, 5 HP, deal 15 dmg, drop stone (+35 XP). Rarer than slimes. HP bars shown when damaged.
- Particle effects on hit and kill
- Enemy dots shown on minimap (red = slime, green = goblin)

### Shop (near bottom-right of world)
Three-tab shop UI (SELL / UPGRADES / POTIONS):
- **SELL tab:** Wood ($5), Leaves ($2), Gel ($10), Stone ($3), Crystals ($50)
- **UPGRADES tab:** Buy Bow ($300), Craft Arrows (5 Wood → 15), Axe Upgrade Lv1-3 ($200/$400/$700), Max HP +30 ($250 ×5), Speed +20 ($200 ×5)
- **POTIONS tab:** Health Potion ($50, +25 HP), Mega Potion ($120, +60 HP), Speed Boost ($100, 20s)

### Quests
- 16 quests from the Quest Giver NPC (top-center of world)
- Rewards: money, max HP boosts, speed increases

### Multiplayer
- Join rooms via Socket.IO, see other players with name tags
- Position/animation synced every 3 frames

## Controls
- **WASD / Arrows** — Move
- **Space** — Swing axe (chop, mine, attack)
- **E** — Interact (Shop/Quest Giver nearby) or open Inventory
- **ESC** — Close any UI panel
- **1-5** — Select hotbar slot (slot 5 = bow when purchased)
- **Space (bow)** — Fire arrow in facing direction (uses ammo)
