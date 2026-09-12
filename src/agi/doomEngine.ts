/**
 * Real-time 2.5D Raycasting DOOM Engine for Peter the Fly
 *
 * Runs a 320x200 DOOM E1M1-inspired raycaster where:
 * 1. The scene is rendered to an HTML5 canvas.
 * 2. The 5 retina sectors are read directly from the rendered pixels (using doom.ts sectorBrightness).
 * 3. Optical stimulation is sent to the FlyWire connectome (LIF simulation).
 * 4. The descending motor arms choose the action (FORWARD, TURN_LEFT, TURN_RIGHT, SHOOT).
 * 5. The action controls the character on screen in real time.
 */

import {
  grayFromRgba,
  sectorBrightness,
  NUM_SECTORS,
  type DoomAction,
} from "../brain/doom";

export interface Enemy {
  id: number;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  state: "idle" | "walk" | "pain" | "dead";
  animTick: number;
  type: "imp" | "soldier";
}

export interface Item {
  x: number;
  y: number;
  type: "health" | "ammo" | "armor";
  collected: boolean;
}

export interface DoomGameState {
  player: {
    x: number;
    y: number;
    dir: number; // radians
    health: number;
    armor: number;
    ammo: number;
    kills: number;
    score: number;
  };
  map: number[][];
  enemies: Enemy[];
  items: Item[];
  muzzleFlash: number; // frames remaining
  damageFlash: number; // frames remaining
  pickupFlash: number; // frames remaining
  weaponFrame: "idle" | "fire" | "recoil";
  lastAction: DoomAction | "READY";
  lastReward: number;
  cumulativeReward: number;
  stepCount: number;
}

export const MAP_WIDTH = 16;
export const MAP_HEIGHT = 16;

// 0: empty, 1: stone wall, 2: tech panel, 3: metal pillar, 4: brick wall, 5: exit gate
export const DEFAULT_DOOM_MAP: number[][] = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 2, 0, 2, 0, 1, 0, 4, 4, 0, 4, 4, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 4, 0, 0, 1],
  [1, 0, 2, 0, 2, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 1, 0, 4, 0, 0, 0, 4, 0, 0, 1],
  [1, 1, 0, 1, 1, 1, 1, 0, 4, 4, 0, 4, 4, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 3, 0, 3, 0, 0, 0, 0, 0, 3, 0, 3, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 2, 2, 2, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 3, 0, 3, 0, 2, 0, 2, 0, 3, 0, 3, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 2, 0, 2, 0, 0, 0, 0, 0, 0, 1],
  [1, 4, 4, 0, 4, 4, 2, 0, 2, 4, 4, 0, 4, 4, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

export function createInitialDoomState(): DoomGameState {
  return {
    player: {
      x: 3.5,
      y: 3.5,
      dir: 0, // facing east
      health: 100,
      armor: 50,
      ammo: 50,
      kills: 0,
      score: 0,
    },
    map: DEFAULT_DOOM_MAP.map((row) => [...row]),
    enemies: [
      { id: 1, x: 7.5, y: 3.5, health: 40, maxHealth: 40, state: "idle", animTick: 0, type: "imp" },
      { id: 2, x: 11.5, y: 3.5, health: 40, maxHealth: 40, state: "idle", animTick: 0, type: "imp" },
      { id: 3, x: 3.5, y: 9.5, health: 30, maxHealth: 30, state: "idle", animTick: 0, type: "soldier" },
      { id: 4, x: 11.5, y: 10.5, health: 40, maxHealth: 40, state: "idle", animTick: 0, type: "imp" },
      { id: 5, x: 7.5, y: 13.5, health: 50, maxHealth: 50, state: "idle", animTick: 0, type: "imp" },
    ],
    items: [
      { x: 5.5, y: 1.5, type: "ammo", collected: false },
      { x: 9.5, y: 1.5, type: "health", collected: false },
      { x: 13.5, y: 3.5, type: "armor", collected: false },
      { x: 1.5, y: 7.5, type: "health", collected: false },
      { x: 7.5, y: 7.5, type: "ammo", collected: false },
      { x: 13.5, y: 9.5, type: "ammo", collected: false },
    ],
    muzzleFlash: 0,
    damageFlash: 0,
    pickupFlash: 0,
    weaponFrame: "idle",
    lastAction: "READY",
    lastReward: 0,
    cumulativeReward: 0,
    stepCount: 0,
  };
}

const FOV = Math.PI / 3; // 60 degrees
const MOVE_SPEED = 0.45;
const TURN_SPEED = 0.22;

/**
 * Execute a single motor action and advance game simulation
 */
export function stepDoomGame(
  state: DoomGameState,
  action: DoomAction
): { reward: number; event: string } {
  let reward = 0;
  let event = "";
  const p = state.player;
  state.lastAction = action;
  state.stepCount++;

  // Clear or decrement animation frames
  if (state.muzzleFlash > 0) state.muzzleFlash--;
  if (state.damageFlash > 0) state.damageFlash--;
  if (state.pickupFlash > 0) state.pickupFlash--;
  state.weaponFrame = state.muzzleFlash > 0 ? "fire" : "idle";

  // 1. Motor Action
  switch (action) {
    case "FORWARD": {
      const nx = p.x + Math.cos(p.dir) * MOVE_SPEED;
      const ny = p.y + Math.sin(p.dir) * MOVE_SPEED;
      // Collision with walls
      if (state.map[Math.floor(ny)]?.[Math.floor(nx)] === 0) {
        p.x = nx;
        p.y = ny;
        reward += 0.2; // Exploration encouragement
        event = "Advancing";
      } else {
        reward -= 0.1; // Wall bump penalty
        event = "Wall collision";
      }
      break;
    }
    case "TURN_LEFT": {
      p.dir -= TURN_SPEED;
      if (p.dir < 0) p.dir += Math.PI * 2;
      reward += 0.05;
      event = "Scanning left";
      break;
    }
    case "TURN_RIGHT": {
      p.dir += TURN_SPEED;
      if (p.dir >= Math.PI * 2) p.dir -= Math.PI * 2;
      reward += 0.05;
      event = "Scanning right";
      break;
    }
    case "SHOOT": {
      state.muzzleFlash = 2;
      state.weaponFrame = "fire";

      if (p.ammo > 0) {
        p.ammo--;
        event = "Fired Shotgun";

        // Check for target in crosshair (front cone)
        let hitEnemy: Enemy | null = null;
        let closestDist = 7.0; // max range

        for (const e of state.enemies) {
          if (e.state === "dead") continue;
          const dx = e.x - p.x;
          const dy = e.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > closestDist) continue;

          // Angle to enemy
          let angleTo = Math.atan2(dy, dx) - p.dir;
          while (angleTo < -Math.PI) angleTo += Math.PI * 2;
          while (angleTo > Math.PI) angleTo -= Math.PI * 2;

          // Inside weapon spread (+- 0.25 rad)
          if (Math.abs(angleTo) < 0.25) {
            closestDist = dist;
            hitEnemy = e;
          }
        }

        if (hitEnemy) {
          const dmg = 25 + Math.floor(Math.random() * 20);
          hitEnemy.health -= dmg;
          hitEnemy.state = hitEnemy.health <= 0 ? "dead" : "pain";
          hitEnemy.animTick = 3;

          if (hitEnemy.state === "dead") {
            p.kills++;
            p.score += 100;
            reward += 3.0; // Big kill reward
            event = `Enemy exterminated! (+3.0)`;
          } else {
            reward += 1.2; // Hit enemy reward
            event = `Direct hit on target! (+1.2)`;
          }
        } else {
          reward -= 0.1; // Missed shot small penalty
        }
      } else {
        event = "Click! Out of ammo";
        reward -= 0.2;
      }
      break;
    }
  }

  // 2. Pick up items
  for (const item of state.items) {
    if (item.collected) continue;
    const dist = Math.hypot(p.x - item.x, p.y - item.y);
    if (dist < 0.6) {
      item.collected = true;
      state.pickupFlash = 2;
      if (item.type === "health") {
        p.health = Math.min(100, p.health + 25);
        reward += 1.0;
        event = "Picked up Stimpack (+25 HP)";
      } else if (item.type === "ammo") {
        p.ammo = Math.min(100, p.ammo + 20);
        reward += 1.0;
        event = "Picked up Shells (+20 Ammo)";
      } else if (item.type === "armor") {
        p.armor = Math.min(100, p.armor + 25);
        reward += 1.0;
        event = "Picked up Armor (+25 Armor)";
      }
    }
  }

  // 3. Enemy AI and Attacks
  for (const e of state.enemies) {
    if (e.state === "dead") continue;
    if (e.animTick > 0) e.animTick--;
    if (e.animTick === 0 && e.state === "pain") e.state = "walk";

    const dist = Math.hypot(p.x - e.x, p.y - e.y);

    // Enemy spots player if within range
    if (dist < 8.0) {
      e.state = "walk";
      // Move slightly toward player
      const dx = (p.x - e.x) / dist;
      const dy = (p.y - e.y) / dist;
      const ex = e.x + dx * 0.12;
      const ey = e.y + dy * 0.12;
      if (state.map[Math.floor(ey)]?.[Math.floor(ex)] === 0) {
        e.x = ex;
        e.y = ey;
      }

      // Close attack
      if (dist < 1.4 && Math.random() < 0.3) {
        state.damageFlash = 3;
        const dmg = 8 + Math.floor(Math.random() * 8);
        if (p.armor > 0) {
          p.armor = Math.max(0, p.armor - dmg);
        } else {
          p.health = Math.max(0, p.health - dmg);
        }
        reward -= 1.0; // Damage negative reward
        event = `Damaged by Demon! (-1.0)`;
      }
    }
  }

  state.lastReward = reward;
  state.cumulativeReward += reward;
  return { reward, event };
}

/**
 * Render complete 2.5D DOOM frame to canvas (320x200 standard)
 */
export function renderDoomScene(
  ctx: CanvasRenderingContext2D,
  state: DoomGameState,
  width = 320,
  height = 200
) {
  const p = state.player;

  // 1. Ceiling & Floor with deep retro DOOM gradients
  const floorY = height / 2;

  // Ceiling
  const ceilGrad = ctx.createLinearGradient(0, 0, 0, floorY);
  ceilGrad.addColorStop(0, "#120907");
  ceilGrad.addColorStop(1, "#281914");
  ctx.fillStyle = ceilGrad;
  ctx.fillRect(0, 0, width, floorY);

  // Floor
  const floorGrad = ctx.createLinearGradient(0, floorY, 0, height);
  floorGrad.addColorStop(0, "#2c1c14");
  floorGrad.addColorStop(1, "#120a06");
  ctx.fillStyle = floorGrad;
  ctx.fillRect(0, floorY, width, height - floorY);

  // 2. High-performance Grid DDA Raycaster (Wolf3D / DOOM standard)
  const zBuffer = new Float64Array(width);
  const colWidth = 2;
  const numCols = Math.floor(width / colWidth);

  for (let c = 0; c < numCols; c++) {
    const x = c * colWidth;
    const rayAngle = p.dir - FOV / 2 + (x / width) * FOV;
    const rayDirX = Math.cos(rayAngle);
    const rayDirY = Math.sin(rayAngle);

    let mapX = Math.floor(p.x);
    let mapY = Math.floor(p.y);

    const deltaDistX = Math.abs(1 / (rayDirX || 0.00001));
    const deltaDistY = Math.abs(1 / (rayDirY || 0.00001));

    let stepX = 0;
    let stepY = 0;
    let sideDistX = 0;
    let sideDistY = 0;

    if (rayDirX < 0) {
      stepX = -1;
      sideDistX = (p.x - mapX) * deltaDistX;
    } else {
      stepX = 1;
      sideDistX = (mapX + 1.0 - p.x) * deltaDistX;
    }

    if (rayDirY < 0) {
      stepY = -1;
      sideDistY = (p.y - mapY) * deltaDistY;
    } else {
      stepY = 1;
      sideDistY = (mapY + 1.0 - p.y) * deltaDistY;
    }

    let hit = 0;
    let side = 0; // 0: vertical, 1: horizontal

    while (hit === 0) {
      if (sideDistX < sideDistY) {
        sideDistX += deltaDistX;
        mapX += stepX;
        side = 0;
      } else {
        sideDistY += deltaDistY;
        mapY += stepY;
        side = 1;
      }

      if (mapX < 0 || mapX >= MAP_WIDTH || mapY < 0 || mapY >= MAP_HEIGHT) {
        break;
      }

      hit = state.map[mapY][mapX];
    }

    let perpWallDist = 0;
    if (side === 0) {
      perpWallDist = (mapX - p.x + (1 - stepX) / 2) / (rayDirX || 0.00001);
    } else {
      perpWallDist = (mapY - p.y + (1 - stepY) / 2) / (rayDirY || 0.00001);
    }
    if (perpWallDist <= 0.05) perpWallDist = 0.05;

    for (let k = 0; k < colWidth; k++) {
      if (x + k < width) zBuffer[x + k] = perpWallDist;
    }

    const wallHeight = Math.min(height * 2, (height / perpWallDist) * 1.05);
    const wallTop = (height - wallHeight) / 2;

    let baseColor = [180, 80, 45];
    if (hit === 2) baseColor = [80, 140, 160];
    else if (hit === 3) baseColor = [130, 130, 140];
    else if (hit === 4) baseColor = [160, 60, 30];
    else if (hit === 5) baseColor = [220, 180, 60];

    const fog = Math.max(0.12, Math.min(1.0, 1.0 - perpWallDist / 14.0));
    const sideMul = side === 1 ? 0.75 : 1.0;
    const r = Math.floor(baseColor[0] * fog * sideMul);
    const g = Math.floor(baseColor[1] * fog * sideMul);
    const b = Math.floor(baseColor[2] * fog * sideMul);

    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(x, wallTop, colWidth, wallHeight);

    if (perpWallDist < 7.0) {
      ctx.fillStyle = `rgba(0,0,0,${0.35 * fog})`;
      ctx.fillRect(x, wallTop + wallHeight * 0.33, colWidth, 1);
      ctx.fillRect(x, wallTop + wallHeight * 0.66, colWidth, 1);
    }
  }

  // 3. Render Sprites (Enemies & Items) sorted by distance
  interface SpriteToDraw {
    x: number;
    y: number;
    dist: number;
    kind: "enemy" | "item";
    ref: Enemy | Item;
  }

  const sprites: SpriteToDraw[] = [];
  for (const e of state.enemies) {
    sprites.push({ x: e.x, y: e.y, dist: Math.hypot(p.x - e.x, p.y - e.y), kind: "enemy", ref: e });
  }
  for (const item of state.items) {
    if (!item.collected) {
      sprites.push({ x: item.x, y: item.y, dist: Math.hypot(p.x - item.x, p.y - item.y), kind: "item", ref: item });
    }
  }

  sprites.sort((a, b) => b.dist - a.dist);

  for (const spr of sprites) {
    if (spr.dist < 0.3 || spr.dist > 14.0) continue;

    const dx = spr.x - p.x;
    const dy = spr.y - p.y;
    let sprAngle = Math.atan2(dy, dx) - p.dir;
    while (sprAngle < -Math.PI) sprAngle += Math.PI * 2;
    while (sprAngle > Math.PI) sprAngle -= Math.PI * 2;

    // Sprite screen x
    const sprScreenX = (width / 2) + Math.tan(sprAngle) * (width / 2 / Math.tan(FOV / 2));
    const sprHeight = Math.min(height * 1.8, (height / spr.dist) * 0.9);
    const sprWidth = sprHeight * 0.8;
    const sprTop = (height - sprHeight) / 2;

    if (spr.kind === "enemy") {
      const e = spr.ref as Enemy;
      const isDead = e.state === "dead";
      const isPain = e.state === "pain";

      // Draw enemy body
      const startX = Math.floor(sprScreenX - sprWidth / 2);
      const endX = Math.floor(sprScreenX + sprWidth / 2);

      for (let sx = startX; sx < endX; sx++) {
        if (sx >= 0 && sx < width && spr.dist < zBuffer[sx]) {
          const colFrac = (sx - startX) / sprWidth;

          if (isDead) {
            // Pool of demon gore on the floor
            const goreY = height / 2 + sprHeight * 0.3;
            ctx.fillStyle = "#881111";
            ctx.fillRect(sx, goreY, 1, sprHeight * 0.2);
          } else {
            // Imp / Soldier Demon Silhouette with glowing eyes
            const fog = Math.max(0.2, 1.0 - spr.dist / 12.0);
            ctx.fillStyle = isPain ? "#ff6666" : `rgb(${Math.floor(160 * fog)}, ${Math.floor(70 * fog)}, ${Math.floor(40 * fog)})`;
            ctx.fillRect(sx, sprTop, 1, sprHeight);

            // Horns / head
            if (colFrac > 0.25 && colFrac < 0.75) {
              ctx.fillStyle = `rgb(${Math.floor(110 * fog)}, ${Math.floor(40 * fog)}, ${Math.floor(25 * fog)})`;
              ctx.fillRect(sx, sprTop - sprHeight * 0.15, 1, sprHeight * 0.2);
            }

            // Glowing Demon Eyes
            if ((colFrac > 0.32 && colFrac < 0.42) || (colFrac > 0.58 && colFrac < 0.68)) {
              ctx.fillStyle = isPain ? "#ffffff" : "#ffff33";
              ctx.fillRect(sx, sprTop + sprHeight * 0.18, 1, Math.max(2, sprHeight * 0.08));
            }
          }
        }
      }
    } else {
      // Items (Ammo / Health)
      const item = spr.ref as Item;
      const startX = Math.floor(sprScreenX - sprWidth * 0.3);
      const endX = Math.floor(sprScreenX + sprWidth * 0.3);
      const itemY = height / 2 + sprHeight * 0.15;

      for (let sx = startX; sx < endX; sx++) {
        if (sx >= 0 && sx < width && spr.dist < zBuffer[sx]) {
          if (item.type === "health") {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(sx, itemY, 1, sprHeight * 0.35);
            ctx.fillStyle = "#dd2222";
            ctx.fillRect(sx, itemY + sprHeight * 0.12, 1, sprHeight * 0.1);
          } else if (item.type === "ammo") {
            ctx.fillStyle = "#cc9933";
            ctx.fillRect(sx, itemY, 1, sprHeight * 0.35);
          } else {
            ctx.fillStyle = "#3399dd";
            ctx.fillRect(sx, itemY, 1, sprHeight * 0.35);
          }
        }
      }
    }
  }

  // 4. Weapon & Muzzle Flash (DOOM Shotgun)
  const gunWidth = 64;
  const gunHeight = 56;
  const gunX = Math.floor(width / 2 - gunWidth / 2);
  let gunY = height - gunHeight;

  if (state.weaponFrame === "fire") {
    gunY -= 6; // recoil
    // Muzzle Flash sparks
    ctx.fillStyle = "#ffffaa";
    ctx.beginPath();
    ctx.arc(width / 2, gunY - 10, 24, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ff8800";
    ctx.beginPath();
    ctx.arc(width / 2, gunY - 10, 14, 0, Math.PI * 2);
    ctx.fill();
  }

  // Gun barrel & grip
  ctx.fillStyle = "#262626";
  ctx.fillRect(gunX + 16, gunY, 32, gunHeight);
  ctx.fillStyle = "#404040";
  ctx.fillRect(gunX + 22, gunY - 8, 20, 16);
  ctx.fillStyle = "#141414";
  ctx.fillRect(gunX + 26, gunY - 12, 12, 6);

  // 5. Crosshair
  ctx.strokeStyle = state.lastReward > 0 ? "#55ff55" : "rgba(255,255,255,0.4)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, 8, 0, Math.PI * 2);
  ctx.moveTo(width / 2 - 12, height / 2);
  ctx.lineTo(width / 2 + 12, height / 2);
  ctx.moveTo(width / 2, height / 2 - 12);
  ctx.lineTo(width / 2, height / 2 + 12);
  ctx.stroke();

  // 6. Full-screen screen flashes
  if (state.damageFlash > 0) {
    ctx.fillStyle = `rgba(255, 0, 0, ${0.18 * state.damageFlash})`;
    ctx.fillRect(0, 0, width, height);
  } else if (state.pickupFlash > 0) {
    ctx.fillStyle = `rgba(255, 215, 0, ${0.15 * state.pickupFlash})`;
    ctx.fillRect(0, 0, width, height);
  }

  // 7. DOOM Classic Status Bar HUD (bottom 28px)
  const hudH = 24;
  const hudY = height - hudH;
  ctx.fillStyle = "#181410";
  ctx.fillRect(0, hudY, width, hudH);
  ctx.strokeStyle = "#4a3928";
  ctx.lineWidth = 1;
  ctx.strokeRect(0, hudY, width, hudH);

  // HUD Text font
  ctx.font = "bold 9px monospace";
  ctx.textBaseline = "middle";

  // AMMO
  ctx.fillStyle = "#eeddc0";
  ctx.fillText(`AMMO ${p.ammo}`, 8, hudY + hudH / 2);

  // HEALTH
  ctx.fillStyle = p.health > 25 ? "#eeddc0" : "#ff4444";
  ctx.fillText(`HEALTH ${p.health}%`, 80, hudY + hudH / 2);

  // Marine Status Face
  const faceX = 160;
  ctx.fillStyle = "#c2936a";
  ctx.fillRect(faceX - 7, hudY + 4, 14, 16);
  // Eyes
  ctx.fillStyle = "#000";
  ctx.fillRect(faceX - 4, hudY + 8, 2, 3);
  ctx.fillRect(faceX + 2, hudY + 8, 2, 3);
  // Fly antenna on marine face
  ctx.strokeStyle = "#3b2c1f";
  ctx.beginPath();
  ctx.moveTo(faceX - 4, hudY + 4);
  ctx.lineTo(faceX - 7, hudY);
  ctx.moveTo(faceX + 4, hudY + 4);
  ctx.lineTo(faceX + 7, hudY);
  ctx.stroke();

  // ARMOR
  ctx.fillStyle = "#eeddc0";
  ctx.fillText(`ARMOR ${p.armor}%`, 188, hudY + hudH / 2);

  // KILLS
  ctx.fillStyle = "#d4ad71";
  ctx.fillText(`KILLS ${p.kills}`, 260, hudY + hudH / 2);
}

/**
 * Fast zero-lag calculation of the 5 retina sectors directly from the world state
 * and raycasting geometry without blocking GPU canvas readback.
 */
export function getRetinaSectorsFast(state: DoomGameState): Float64Array {
  const p = state.player;
  const sectors = new Float64Array(NUM_SECTORS);
  const sectorOffsets = [-0.42, -0.21, 0, 0.21, 0.42];

  for (let s = 0; s < NUM_SECTORS; s++) {
    const angle = p.dir + sectorOffsets[s];
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    let dist = 0.2;
    while (dist < 10.0) {
      dist += 0.25;
      const mx = Math.floor(p.x + cos * dist);
      const my = Math.floor(p.y + sin * dist);
      if (mx >= 0 && mx < MAP_WIDTH && my >= 0 && my < MAP_HEIGHT) {
        if (state.map[my][mx] > 0) break;
      }
    }

    let lum = Math.max(0.1, Math.min(0.95, 1.0 - dist / 9.0));

    for (const e of state.enemies) {
      if (e.state === "dead") continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const eDist = Math.hypot(dx, dy);
      if (eDist < 7.0) {
        let eAngle = Math.atan2(dy, dx) - p.dir;
        while (eAngle < -Math.PI) eAngle += Math.PI * 2;
        while (eAngle > Math.PI) eAngle -= Math.PI * 2;

        if (Math.abs(eAngle - sectorOffsets[s]) < 0.15) {
          lum = Math.min(1.0, lum + 0.35 * (1.0 - eDist / 7.0));
        }
      }
    }

    sectors[s] = lum;
  }

  return sectors;
}

export type VisualContext = "OPEN" | "OBSTACLE_AHEAD" | "TARGET_AHEAD" | "LEFT_BLOCKED" | "RIGHT_BLOCKED";

export function getVisualContext(state: DoomGameState): VisualContext {
  const p = state.player;

  // 1. Check for live target directly ahead in weapon cone
  for (const e of state.enemies) {
    if (e.state === "dead") continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 6.5) {
      let angleTo = Math.atan2(dy, dx) - p.dir;
      while (angleTo < -Math.PI) angleTo += Math.PI * 2;
      while (angleTo > Math.PI) angleTo -= Math.PI * 2;

      if (Math.abs(angleTo) < 0.28) {
        return "TARGET_AHEAD";
      }
    }
  }

  // 2. Check for wall directly in front
  const frontX = p.x + Math.cos(p.dir) * 1.15;
  const frontY = p.y + Math.sin(p.dir) * 1.15;
  if (state.map[Math.floor(frontY)]?.[Math.floor(frontX)] > 0) {
    return "OBSTACLE_AHEAD";
  }

  // 3. Check left vs right proximity
  const leftX = p.x + Math.cos(p.dir - 0.5) * 1.0;
  const leftY = p.y + Math.sin(p.dir - 0.5) * 1.0;
  if (state.map[Math.floor(leftY)]?.[Math.floor(leftX)] > 0) {
    return "LEFT_BLOCKED";
  }

  const rightX = p.x + Math.cos(p.dir + 0.5) * 1.0;
  const rightY = p.y + Math.sin(p.dir + 0.5) * 1.0;
  if (state.map[Math.floor(rightY)]?.[Math.floor(rightX)] > 0) {
    return "RIGHT_BLOCKED";
  }

  return "OPEN";
}

/**
 * Extract 5 retina sectors directly from rendered canvas pixels
 * Exactly implements the FlyWire FAFB v783 optical pipeline.
 */
export function readRetinaFromCanvas(
  canvas: HTMLCanvasElement,
  width = 320,
  height = 200
): Float64Array {
  const ctx = canvas.getContext("2d");
  if (!ctx) return new Float64Array(NUM_SECTORS).fill(0.3);

  try {
    const imgData = ctx.getImageData(0, 0, width, height);
    const gray = grayFromRgba(new Uint8Array(imgData.data.buffer), width, height);
    return sectorBrightness(gray, width, height);
  } catch {
    return new Float64Array(NUM_SECTORS).fill(0.3);
  }
}
