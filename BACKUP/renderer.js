'use strict';

// Helper to get consistent road Y that pushes up on mobile to avoid UI overlap
function getRoadY(H, isMobile) {
    return Math.min(H - 140, H * (isMobile ? 0.60 : 0.72));
}

// A deliberately small, pixel-friendly side-profile library. These are original
// silhouettes, not generic body-type rectangles; each profile also owns the
// attachment coordinates used by visual customization and particles.
const CAR_ART = {
    civic_ek: { p:[[1,37],[3,26],[16,22],[25,10],[59,8],[74,13],[85,23],[98,26],[100,37]], glass:[[27,21],[31,12],[57,11],[70,15],[78,21]], wheels:[[22,36],[82,36]], rear:3, front:96, spoiler:[5,20] },
    s14: { p:[[0,37],[3,27],[15,24],[31,12],[61,10],[75,15],[86,24],[99,27],[101,37]], glass:[[31,22],[36,13],[59,12],[71,16],[80,22]], wheels:[[22,36],[82,36]], rear:2, front:97, spoiler:[5,22] },
    mustang_sn95: { p:[[1,37],[4,26],[20,23],[35,12],[68,11],[78,16],[86,24],[103,27],[105,37]], glass:[[37,22],[41,14],[65,14],[74,18],[80,22]], wheels:[[23,36],[85,36]], rear:3, front:101, spoiler:[6,21] },
    r34: { p:[[0,37],[3,25],[18,22],[29,10],[67,10],[80,17],[88,24],[100,27],[102,37]], glass:[[30,21],[34,12],[64,12],[76,18],[82,21]], wheels:[[22,36],[83,36]], rear:2, front:98, spoiler:[4,20] },
    supra_a80: { p:[[0,37],[4,28],[17,24],[35,14],[57,11],[72,14],[86,23],[99,27],[101,37]], glass:[[34,22],[42,15],[57,14],[69,18],[76,22]], wheels:[[22,36],[82,36]], rear:2, front:97, spoiler:[4,20] },
    viper_acr: { p:[[0,37],[4,27],[20,23],[38,13],[60,12],[72,16],[83,24],[101,27],[103,37]], glass:[[39,21],[45,15],[60,15],[69,19],[76,22]], wheels:[[23,36],[84,36]], rear:2, front:99, spoiler:[4,19] },
    huracan: { p:[[0,37],[5,29],[18,24],[35,15],[56,12],[76,15],[89,24],[100,28],[102,37]], glass:[[34,22],[42,16],[57,14],[72,18],[80,22]], wheels:[[22,36],[84,36]], rear:2, front:98, spoiler:[4,20] },
    funny_car: { p:[[-12,37],[-8,26],[15,23],[22,11],[43,11],[49,23],[106,23],[122,28],[122,37]], glass:[[26,21],[28,14],[39,14],[43,21]], wheels:[[10,36],[100,36]], rear:-10, front:120, spoiler:[-14,18] },
};
function artFor(car) { return CAR_ART[car.art] || CAR_ART.civic_ek; }
function traceProfile(ctx, art) { ctx.beginPath(); ctx.moveTo(art.p[0][0], art.p[0][1]); for (let i = 1; i < art.p.length; i++) ctx.lineTo(art.p[i][0], art.p[i][1]); ctx.closePath(); }
function drawPolygon(ctx, points) { ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]); for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]); ctx.closePath(); ctx.fill(); }
function drawModernWheel(ctx, x, y, tire, rim, car) {
    ctx.fillStyle = '#080a0c'; ctx.beginPath(); ctx.arc(x, y, tire, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#30343a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, tire - .7, 0, Math.PI * 2); ctx.stroke();
    ctx.save(); ctx.translate(x, y); ctx.rotate(car.wheelRotation);
    const style = car.customization?.rim;
    if (style?.draw) style.draw(ctx, rim); else { ctx.fillStyle = '#7a7a7a'; ctx.beginPath(); ctx.arc(0, 0, rim, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
}
function renderModernCar(ctx, car, c, s, glass) {
    const art = artFor(car), tireDef = car.customization?.tire;
    const rearTire = tireDef?.radius || (car.upgrades.slicks ? 13 : 11);
    const frontTire = car.type === 'dragster' ? 6 : rearTire;
    const rimFactor = tireDef?.rimRadius || .55;
    car._artAnchors = {
        rearWheel: { x: art.wheels[0][0], y: art.wheels[0][1], r: rearTire }, frontWheel: { x: art.wheels[1][0], y: art.wheels[1][1], r: frontTire },
        exhaust: { x: art.rear, y: 29 }, spoiler: { x: art.spoiler[0], y: art.spoiler[1] }, kit: { x: art.rear + 4, y: 37, w: art.front - art.rear - 8 },
        livery: { x: Math.max(4, art.rear + 6), y: 21, w: Math.max(36, art.front - art.rear - 12), h: 15 }
    };
    const shadow = ctx.createRadialGradient((art.rear + art.front) / 2, 42, 8, (art.rear + art.front) / 2, 42, (art.front - art.rear) * .62);
    shadow.addColorStop(0, 'rgba(0,0,0,.55)'); shadow.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = shadow; ctx.fillRect(art.rear - 15, 34, art.front - art.rear + 30, 17);
    traceProfile(ctx, art); const paint = ctx.createLinearGradient(0, 8, 0, 39); paint.addColorStop(0, '#ffffff'); paint.addColorStop(.07, c); paint.addColorStop(.7, c); paint.addColorStop(1, '#171a1e'); ctx.fillStyle = paint; ctx.fill();
    ctx.strokeStyle = '#11151a'; ctx.lineWidth = 1.25; traceProfile(ctx, art); ctx.stroke();
    ctx.fillStyle = glass; drawPolygon(ctx, art.glass); ctx.strokeStyle = 'rgba(210,235,255,.36)'; ctx.lineWidth = .7; ctx.beginPath(); ctx.moveTo(art.glass[0][0], art.glass[0][1]); for (let i = 1; i < art.glass.length; i++) ctx.lineTo(art.glass[i][0], art.glass[i][1]); ctx.stroke();
    ctx.save(); traceProfile(ctx, art); ctx.clip(); if (car.customization?.livery?.draw) car.customization.livery.draw(ctx, car); ctx.restore();
    // Detail layer deliberately follows decals, preserving lamps, panel gaps and glass readability.
    const rear = art.rear, front = art.front; ctx.strokeStyle = 'rgba(8,12,16,.62)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo((rear + front) * .48, 23); ctx.lineTo((rear + front) * .48, 35); ctx.moveTo((rear + front) * .63, 23); ctx.lineTo((rear + front) * .63, 34); ctx.stroke();
    ctx.fillStyle = '#efefc6'; ctx.fillRect(front - 5, 26, 4, 3); ctx.fillStyle = '#c52a2a'; ctx.fillRect(rear + 1, 26, 4, 4); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(front - 18, 24, 10, 1);
    if (car.upgrades.engine > 2 && (car.art === 'mustang_sn95' || car.art === 'supra_a80')) { ctx.fillStyle = '#a7b0b8'; ctx.fillRect(front - 29, 17, 15, 4); ctx.fillStyle = '#20252b'; ctx.fillRect(front - 26, 15, 3, 3); ctx.fillRect(front - 19, 15, 3, 3); }
    if (car.customization?.bodyKit?.draw) car.customization.bodyKit.draw(ctx, car);
    if (car.customization?.spoiler?.draw) car.customization.spoiler.draw(ctx, car);
    if (car.customization?.exhaust?.draw) car.customization.exhaust.draw(ctx, car);
    drawModernWheel(ctx, art.wheels[0][0], art.wheels[0][1], rearTire, rearTire * rimFactor, car);
    drawModernWheel(ctx, art.wheels[1][0], art.wheels[1][1], frontTire, frontTire * rimFactor, car);
    // Painted upper arches restore a foreground fender edge after the wheels are drawn.
    ctx.strokeStyle = c; ctx.lineWidth = 2; for (const [wx, wy] of art.wheels) { ctx.beginPath(); ctx.arc(wx, wy, 9, Math.PI, Math.PI * 2); ctx.stroke(); }
    if (car.upgrades.parachute && car.speed < 10 && car.type !== 'hatch') { ctx.fillStyle = '#aeb5bb'; ctx.beginPath(); ctx.arc(rear - 7, 26, 5, 0, Math.PI * 2); ctx.fill(); }
}

const Renderer = {
    drawGarageBg(ctx, W, H, menuState, previewCar, playerCar) {
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 1;
        for (let i = H * 0.55; i < H; i += 18) {
            ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(W, i); ctx.stroke();
        }
        for (let i = 0; i < W; i += 90) {
            ctx.beginPath(); ctx.moveTo(i + (i - W / 2) * 0.5, H); ctx.lineTo(i, H * 0.55); ctx.stroke();
        }
        let carToDraw = null;
        if (menuState === 'DEALER') carToDraw = previewCar;
        else if (playerCar) carToDraw = playerCar;
        
        if (carToDraw) {
            const grad = ctx.createRadialGradient(W / 2, H * 0.6, 10, W / 2, H * 0.6, 280);
            grad.addColorStop(0, 'rgba(255,255,255,0.12)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W, H);
            ctx.save();
            ctx.translate(W / 2 - 140, H * 0.5 - 40);
            ctx.scale(2.8, 2.8);
            this.drawCar(ctx, carToDraw, 0, 0);
            ctx.restore();
        }
    },

    drawRaceScene(ctx, W, H, playerCar, opponentCar, effects, screenShake, raceDistance, METERS_TO_PX, raceState, lights, _isMobile) {
        ctx.save();
        if (screenShake > 0.1) {
            ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
        }

        const roadY = getRoadY(H, _isMobile);
        // A restrained close-follow camera: it keeps the player near the left third
        // while enlarging the race scene without losing the start lights or HUD.
        const cameraZoom = _isMobile ? 1.24 : 1.35;
        const followOffset = Math.min(W * 0.34, 220);
        const camX = Math.max(0, playerCar.x * METERS_TO_PX - followOffset);
        const focusX = followOffset + 40, focusY = roadY + 58;
        ctx.save();
        ctx.translate(focusX, focusY); ctx.scale(cameraZoom, cameraZoom); ctx.translate(-focusX, -focusY);
        game.drawBackground(ctx, W, H, camX); // Delegated to game for background state
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, roadY, W, H - roadY);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, roadY - 2, W, 2);

        ctx.fillStyle = '#333';
        const lineOffset = -(camX % 110);
        for (let i = -110; i < W + 110; i += 110) {
            ctx.fillRect(i + lineOffset, roadY + 75, 65, 4);
        }

        ctx.fillStyle = '#444';
        ctx.font = '9px "Press Start 2P"';
        ctx.textAlign = 'left';
        for (let m = 100; m <= 400; m += 100) {
            const mx = (m * METERS_TO_PX) - camX;
            if (mx > -60 && mx < W + 60) ctx.fillText(m + 'm', mx, roadY + 152);
        }

        this.drawFinishLine(ctx, camX, roadY, W, raceDistance, METERS_TO_PX);
        this.drawStartLights(ctx, camX, roadY, W, lights);

        const pX = (playerCar.x * METERS_TO_PX) - camX + 40;
        const oX = (opponentCar.x * METERS_TO_PX) - camX + 40;

        const playerLaneY = roadY + 65;
        const oppLaneY = roadY + 20;

        if (effects) effects.draw();

        this.drawCar(ctx, opponentCar, oX, oppLaneY, 0.95);
        this.drawCar(ctx, playerCar, pX, playerLaneY, 1.1);

        ctx.restore();
        this.drawDashboard(ctx, W, H, playerCar, raceState);
        this.drawProgressBar(ctx, W, H, playerCar, opponentCar, raceDistance);
        
        ctx.restore();
    },

    drawFinishLine(ctx, camX, roadY, W, raceDistance, METERS_TO_PX) {
        const fx = (raceDistance * METERS_TO_PX) - camX;
        if (fx < -150 || fx > W + 150) return;

        const roadH = 160;
        const laneTop = roadY;
        const squareSize = 14;
        const cols = 3;

        for (let row = 0; row < Math.ceil(roadH / squareSize); row++) {
            for (let col = 0; col < cols; col++) {
                const on = ((row + col) % 2) === 0;
                ctx.fillStyle = on ? '#ffffff' : '#000000';
                ctx.fillRect(fx + col * squareSize, laneTop + row * squareSize, squareSize, squareSize);
            }
        }

        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(fx - 16, roadY - 140, 14, roadH + 140);
        ctx.fillStyle = '#5a5a5a';
        ctx.fillRect(fx - 14, roadY - 140, 4, roadH + 140);
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(fx - 6, roadY - 140, 4, roadH + 140);

        const rightPostX = fx + cols * squareSize + 2;
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(rightPostX, roadY - 140, 14, roadH + 140);
        ctx.fillStyle = '#5a5a5a';
        ctx.fillRect(rightPostX + 2, roadY - 140, 4, roadH + 140);
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(rightPostX + 10, roadY - 140, 4, roadH + 140);

        const beamY = roadY - 140;
        const beamH = 24;
        const beamW = cols * squareSize + 32;
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(fx - 16, beamY, beamW, beamH);

        ctx.strokeStyle = '#0a0a0a';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < beamW; i += 14) {
            ctx.beginPath();
            ctx.moveTo(fx - 16 + i, beamY + 2);
            ctx.lineTo(fx - 16 + i + 14, beamY + beamH - 2);
            ctx.stroke();
        }
        ctx.fillStyle = '#000';
        ctx.fillRect(fx - 16, beamY + beamH - 3, beamW, 3);

        const bannerW = cols * squareSize;
        const bannerH = 28;
        const bannerY = beamY + beamH + 4;

        ctx.fillStyle = '#c62828';
        ctx.fillRect(fx - 4, bannerY, bannerW + 8, bannerH);

        ctx.strokeStyle = '#ffeb3b';
        ctx.lineWidth = 2;
        ctx.strokeRect(fx - 4, bannerY, bannerW + 8, bannerH);

        ctx.fillStyle = '#ffeb3b';
        ctx.font = '9px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('FINISH', fx + bannerW / 2, bannerY + bannerH / 2 + 1);
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';

        const flagSize = 16;
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                ctx.fillStyle = ((r + c) % 2) === 0 ? '#fff' : '#000';
                ctx.fillRect(fx - 14 + c * (flagSize / 3), roadY - 168 + r * (flagSize / 3), flagSize / 3, flagSize / 3);
            }
        }
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                ctx.fillStyle = ((r + c) % 2) === 0 ? '#fff' : '#000';
                ctx.fillRect(rightPostX + 2 + c * (flagSize / 3), roadY - 168 + r * (flagSize / 3), flagSize / 3, flagSize / 3);
            }
        }
    },

    drawStartLights(ctx, camX, roadY, W, lights) {
        const treeX = -camX + 160;
        if (treeX < -80 || treeX > W + 80) return;

        const poleW = 22;
        const poleTop = roadY - 160;
        const poleBot = roadY - 5;
        const poleH = poleBot - poleTop;

        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(treeX - 4, poleBot, poleW + 8, 6);
        ctx.fillStyle = '#111';
        ctx.fillRect(treeX - 6, poleBot + 4, poleW + 12, 3);

        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(treeX, poleTop, poleW, poleH);
        ctx.fillStyle = '#4a4a4a';
        ctx.fillRect(treeX + 2, poleTop, 4, poleH);
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(treeX + poleW - 4, poleTop, 4, poleH);

        const topBulbsY = poleTop + 12;
        for (let i = 0; i < 2; i++) {
            const bx = treeX + poleW / 2 - 8 + i * 16;
            ctx.fillStyle = '#0a0a0a';
            ctx.beginPath();
            ctx.arc(bx, topBulbsY, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#c8c8c8';
            ctx.beginPath();
            ctx.arc(bx, topBulbsY, 3.5, 0, Math.PI * 2);
            ctx.fill();
        }

        const mainY = poleTop + 40;
        const bulbSpacing = 26;
        const bulbR = 10;

        for (let i = 0; i < 4; i++) {
            const by = mainY + i * bulbSpacing;
            const bx = treeX + poleW / 2;

            ctx.fillStyle = '#0a0a0a';
            ctx.beginPath();
            ctx.arc(bx, by, bulbR + 2, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#151515';
            ctx.beginPath();
            ctx.arc(bx, by, bulbR, 0, Math.PI * 2);
            ctx.fill();

            const isGreen = i === 3;
            const isLit = lights > i;

            if (isLit) {
                const color = isGreen ? '#4caf50' : '#fbc02d';
                const glowGrad = ctx.createRadialGradient(bx, by, 2, bx, by, bulbR * 2.5);
                glowGrad.addColorStop(0, color);
                glowGrad.addColorStop(0.4, color + '80');
                glowGrad.addColorStop(1, color + '00');
                ctx.fillStyle = glowGrad;
                ctx.fillRect(bx - bulbR * 2.5, by - bulbR * 2.5, bulbR * 5, bulbR * 5);
                ctx.fillStyle = isGreen ? '#66ff88' : '#ffe066';
                ctx.beginPath();
                ctx.arc(bx, by, bulbR - 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,0.6)';
                ctx.beginPath();
                ctx.arc(bx - 3, by - 3, 2, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillStyle = isGreen ? '#0d2a10' : '#2a1a00';
                ctx.beginPath();
                ctx.arc(bx, by, bulbR - 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,0.08)';
                ctx.beginPath();
                ctx.arc(bx - 3, by - 3, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.strokeStyle = '#2a2a2a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(treeX - 2, poleTop + 20);
        ctx.lineTo(treeX - 8, poleTop + 8);
        ctx.moveTo(treeX + poleW + 2, poleTop + 20);
        ctx.lineTo(treeX + poleW + 8, poleTop + 8);
        ctx.stroke();
    },

    drawDashboard(ctx, W, H, p, raceState) {
        const r = Math.min(58, Math.max(38, W * 0.07));
        const cx = W / 2;
        const cy = H - r - 26;

        ctx.beginPath();
        ctx.arc(cx, cy, r + 6, Math.PI * 0.75, Math.PI * 2.25);
        ctx.lineWidth = 12;
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.stroke();

        for (let i = 0; i <= 10; i++) {
            const a0 = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
            const a1 = Math.PI * 0.75 + ((i + 1) / 10) * Math.PI * 1.5;
            const isRed = i >= 8;
            const rpmThreshold = (i / 10) * p.redline;
            const isLit = p.rpm >= rpmThreshold;
            ctx.beginPath();
            ctx.arc(cx, cy, r + 6, a0 + 0.02, a1 - 0.02);
            ctx.lineWidth = 10;
            ctx.strokeStyle = isLit ? (isRed ? '#ff1744' : '#fff') : (isRed ? '#3a0a0a' : '#222');
            ctx.stroke();
        }

        const rpmPct = Math.min(1, p.rpm / p.redline);
        const needleAng = Math.PI * 0.75 + rpmPct * Math.PI * 1.5;
        ctx.strokeStyle = '#ff1744';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(needleAng) * (r - 6), cy + Math.sin(needleAng) * (r - 6));
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#333';
        ctx.fill();
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = Math.round(r * 0.32) + 'px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const mph = Math.floor(p.speed * MPS_TO_MPH);
        ctx.fillText(mph, cx, cy + r * 0.42);
        ctx.font = Math.round(r * 0.14) + 'px "Press Start 2P"';
        ctx.fillStyle = '#888';
        ctx.fillText('MPH', cx, cy + r * 0.72);

        ctx.font = Math.round(r * 0.5) + 'px "Press Start 2P"';
        const gearText = p.gear === 0 ? 'N' : String(p.gear);
        ctx.fillStyle = p.rpm > p.redline * 0.9 ? '#ff1744' : '#ffeb3b';
        ctx.fillText(gearText, cx, cy - r * 0.42);

        if (p.gear > 0 && p.rpm > p.redline * 0.88) {
            const blink = Math.sin(performance.now() / 60) > 0;
            if (blink) {
                ctx.beginPath();
                ctx.arc(cx, cy - r - 18, 8, 0, Math.PI * 2);
                ctx.fillStyle = '#ff1744';
                ctx.shadowColor = '#ff1744';
                ctx.shadowBlur = 18;
                ctx.fill();
                ctx.shadowBlur = 0;
            }
            if (p.rpm > p.redline * 0.96) {
                game.screenShake = Math.max(game.screenShake, 4 + Math.random() * 3);
            } else {
                game.screenShake = Math.max(game.screenShake, 1.5 + Math.random());
            }
        }

        if (raceState === 'STAGING') {
            ctx.fillStyle = '#ffeb3b';
            ctx.font = '16px "Press Start 2P"';
            ctx.textAlign = 'center';
            ctx.fillText('REV THE ENGINE', W / 2, H * 0.23);
            ctx.font = '10px "Press Start 2P"';
            ctx.fillStyle = '#888';
            ctx.fillText('W OR GAS', W / 2, H * 0.23 + 21);
        } else if (raceState === 'COUNTDOWN') {
            ctx.fillStyle = '#4fc3f7';
            ctx.font = '12px "Press Start 2P"';
            ctx.textAlign = 'center';
            ctx.fillText('GET READY', W / 2, H * 0.23);
            ctx.fillStyle = '#888';
            ctx.font = '9px "Press Start 2P"';
            ctx.fillText('SHIFT UP FOR FIRST GEAR', W / 2, H * 0.23 + 19);
        }
    },

    drawProgressBar(ctx, W, H, p, o, raceDistance) {
        const barW = Math.min(W * 0.6, 420), barH = 8;
        const bx = (W - barW) / 2, by = 22;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(bx - 2, by - 2, barW + 4, barH + 4);
        ctx.fillStyle = '#222';
        ctx.fillRect(bx, by, barW, barH);
        const pPct = Math.min(1, p.x / raceDistance);
        ctx.fillStyle = '#4fc3f7';
        ctx.fillRect(bx, by, barW * pPct, barH / 2);
        const oPct = Math.min(1, o.x / raceDistance);
        ctx.fillStyle = '#ff7043';
        ctx.fillRect(bx, by + barH / 2, barW * oPct, barH / 2);
        ctx.font = '7px "Press Start 2P"';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#4fc3f7';
        ctx.fillText('YOU', bx, by - 6);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#ff7043';
        ctx.fillText('OPP', bx + barW, by - 6);
        ctx.fillStyle = '#fff';
        ctx.fillRect(bx + barW - 2, by - 4, 4, barH + 8);
    },

    drawCar(ctx, car, x, y, scale = 1) {
        ctx.save();
        ctx.translate(x, y + car.squat);
        ctx.scale(scale, scale);

        const shadowGrad = ctx.createRadialGradient(48, 42, 10, 48, 42, 60);
        shadowGrad.addColorStop(0, 'rgba(0,0,0,0.5)');
        shadowGrad.addColorStop(0.6, 'rgba(0,0,0,0.2)');
        shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = shadowGrad;
        ctx.beginPath();
        ctx.ellipse(48, 42, 58, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        const c = car.color;
        const s = car.secondaryColor;
        const glass = car.customization?.tint?.color || '#1a2332';
        const dark = '#0a0a0a';
        const rim = car.upgrades.slicks ? '#e8c400' : '#7a7a7a';

        renderModernCar(ctx, car, c, s, glass);
        ctx.restore();
        return;

        if (car.type === 'hatch') {
            ctx.fillStyle = c;
            ctx.fillRect(2, 22, 96, 16);
            ctx.beginPath();
            ctx.moveTo(14, 22); ctx.lineTo(22, 8); ctx.lineTo(78, 8); ctx.lineTo(86, 22);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = glass;
            ctx.beginPath();
            ctx.moveTo(20, 21); ctx.lineTo(25, 10); ctx.lineTo(75, 10); ctx.lineTo(81, 21);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = c;
            ctx.fillRect(48, 10, 4, 11);
            ctx.fillStyle = s;
            ctx.fillRect(4, 12, 5, 10);
            ctx.fillRect(-2, 10, 14, 3);
            ctx.strokeStyle = s;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(44, 22); ctx.lineTo(44, 37);
            ctx.moveTo(62, 22); ctx.lineTo(62, 35);
            ctx.stroke();
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(2, 36, 96, 3);
            ctx.fillStyle = '#fff7b0';
            ctx.fillRect(94, 24, 4, 4);
            ctx.fillStyle = '#ffb000';
            ctx.fillRect(94, 30, 3, 3);
            ctx.fillStyle = '#c62828';
            ctx.fillRect(2, 24, 4, 5);
        }
        else if (car.type === 'sedan') {
            ctx.fillStyle = c;
            ctx.fillRect(0, 22, 100, 16);
            ctx.beginPath();
            ctx.moveTo(16, 22); ctx.lineTo(30, 8); ctx.lineTo(72, 8); ctx.lineTo(88, 22);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = glass;
            ctx.beginPath();
            ctx.moveTo(22, 21); ctx.lineTo(32, 10); ctx.lineTo(70, 10); ctx.lineTo(82, 21);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = c;
            ctx.fillRect(48, 10, 4, 11);
            ctx.strokeStyle = s;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(44, 22); ctx.lineTo(44, 37);
            ctx.moveTo(60, 22); ctx.lineTo(60, 37);
            ctx.stroke();
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(0, 36, 100, 3);
            ctx.fillStyle = '#fff7b0';
            ctx.fillRect(96, 26, 4, 4);
            ctx.fillStyle = '#c62828';
            ctx.fillRect(0, 26, 4, 5);
            if (car.upgrades.aero) {
                ctx.fillStyle = dark;
                ctx.fillRect(2, 16, 5, 10);
                ctx.fillRect(-4, 14, 16, 3);
            }
        }
        else if (car.type === 'muscle') {
            ctx.fillStyle = c;
            ctx.fillRect(2, 22, 102, 16);
            ctx.beginPath();
            ctx.moveTo(26, 22); ctx.lineTo(38, 8); ctx.lineTo(76, 8); ctx.lineTo(84, 22);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = glass;
            ctx.beginPath();
            ctx.moveTo(32, 21); ctx.lineTo(40, 10); ctx.lineTo(74, 10); ctx.lineTo(80, 21);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = c;
            ctx.fillRect(54, 10, 4, 11);
            ctx.fillStyle = s;
            ctx.fillRect(2, 28, 102, 4);
            ctx.strokeStyle = s;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(50, 22); ctx.lineTo(50, 36);
            ctx.stroke();
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(2, 36, 102, 3);
            ctx.fillStyle = '#fff7b0';
            ctx.fillRect(100, 24, 4, 4);
            ctx.fillStyle = '#c62828';
            ctx.fillRect(2, 24, 4, 6);
            if (car.upgrades.engine > 2) {
                ctx.fillStyle = '#b0b0b0';
                ctx.fillRect(74, 15, 18, 7);
                ctx.fillStyle = '#909090';
                ctx.fillRect(77, 11, 4, 5);
                ctx.fillRect(85, 11, 4, 5);
                ctx.fillStyle = '#222';
                ctx.fillRect(78, 18, 10, 3);
            }
        }
        else if (car.type === 'super') {
            ctx.fillStyle = c;
            ctx.beginPath();
            ctx.moveTo(0, 38); ctx.lineTo(0, 22); ctx.lineTo(22, 14);
            ctx.lineTo(50, 10); ctx.lineTo(74, 12); ctx.lineTo(98, 22);
            ctx.lineTo(100, 26); ctx.lineTo(100, 38);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = glass;
            ctx.beginPath();
            ctx.moveTo(30, 15); ctx.lineTo(52, 12); ctx.lineTo(68, 22); ctx.lineTo(26, 22);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = c;
            ctx.fillRect(48, 14, 3, 9);
            ctx.fillStyle = dark;
            ctx.fillRect(24, 24, 10, 3);
            ctx.fillRect(26, 29, 10, 3);
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(0, 37, 100, 2);
            ctx.fillStyle = '#fff7b0';
            ctx.beginPath();
            ctx.moveTo(94, 22); ctx.lineTo(99, 24); ctx.lineTo(99, 28); ctx.lineTo(92, 26);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#c62828';
            ctx.fillRect(0, 24, 5, 4);
            ctx.fillStyle = s;
            ctx.fillRect(0, 12, 4, 12);
            ctx.fillRect(-6, 10, 16, 3);
        }
        else if (car.type === 'dragster') {
            ctx.fillStyle = c;
            ctx.fillRect(-10, 24, 130, 14);
            ctx.beginPath();
            ctx.moveTo(105, 24); ctx.lineTo(122, 28); ctx.lineTo(122, 38); ctx.lineTo(105, 38);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = s;
            ctx.beginPath();
            ctx.moveTo(20, 24); ctx.lineTo(24, 12); ctx.lineTo(42, 12); ctx.lineTo(48, 24);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = glass;
            ctx.fillRect(27, 14, 12, 8);
            ctx.fillStyle = '#4a4a4a';
            ctx.fillRect(50, 22, 40, 4);
            ctx.fillStyle = '#666';
            for (let i = 0; i < 4; i++) {
                ctx.fillRect(54 + i * 8, 18, 3, 6);
            }
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(-10, 36, 130, 2);
            ctx.fillStyle = '#ddd';
            ctx.beginPath();
            ctx.moveTo(-10, 24); ctx.lineTo(-24, 2); ctx.lineTo(-6, 2); ctx.lineTo(0, 24);
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#666';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-18, 12); ctx.lineTo(-2, 12);
            ctx.moveTo(-14, 6); ctx.lineTo(-2, 6);
            ctx.stroke();
            ctx.fillStyle = '#c62828';
            ctx.fillRect(-10, 26, 4, 5);
        }

        if (car.customization && car.customization.livery && car.customization.livery.draw) {
            ctx.save(); car.customization.livery.draw(ctx, car); ctx.restore();
        }
        if (car.customization && car.customization.bodyKit && car.customization.bodyKit.draw) {
            ctx.save(); car.customization.bodyKit.draw(ctx, car); ctx.restore();
        }
        if (car.customization && car.customization.spoiler && car.customization.spoiler.draw) {
            ctx.save(); car.customization.spoiler.draw(ctx, car); ctx.restore();
        }
        if (car.customization && car.customization.exhaust && car.customization.exhaust.draw) {
            ctx.save(); car.customization.exhaust.draw(ctx, car); ctx.restore();
        }

        let rTire = car.upgrades.slicks ? 13 : 11;
        let fTire = car.type === 'dragster' ? 6 : (car.upgrades.slicks ? 12 : 10);
        let rimStyle = null;
        if (car.customization && car.customization.tire) {
            rTire = car.customization.tire.radius;
            fTire = car.type === 'dragster' ? 6 : car.customization.tire.radius;
        }
        if (car.customization && car.customization.rim) {
            rimStyle = car.customization.rim;
        }

        const wheelY_R = 36;
        const wheelY_F = 38;
        const wheelX_R = car.type === 'dragster' ? 10 : 22;
        const wheelX_F = car.type === 'dragster' ? 100 : 82;

        const drawWheel = (wx, wy, tr, rimRadius) => {
            ctx.fillStyle = '#0a0a0a';
            ctx.beginPath(); ctx.arc(wx, wy, tr, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#1a1a1a';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(wx, wy, tr - 0.5, 0, Math.PI * 2); ctx.stroke();

            ctx.save();
            ctx.translate(wx, wy);
            ctx.rotate(car.wheelRotation);

            if (rimStyle && rimStyle.draw) {
                rimStyle.draw(ctx, rimRadius);
            } else {
                ctx.fillStyle = rim;
                ctx.beginPath(); ctx.arc(0, 0, rimRadius, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#2a2a2a';
                ctx.beginPath(); ctx.arc(0, 0, rimRadius * 0.55, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#888';
                ctx.beginPath(); ctx.arc(0, 0, rimRadius * 0.25, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#1a1a1a';
                ctx.lineWidth = 1.5;
                for (let i = 0; i < 5; i++) {
                    const a = (i / 5) * Math.PI * 2;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * rimRadius * 0.3, Math.sin(a) * rimRadius * 0.3);
                    ctx.lineTo(Math.cos(a) * rimRadius * 0.9, Math.sin(a) * rimRadius * 0.9);
                    ctx.stroke();
                }
            }
            ctx.restore();
        };

        drawWheel(wheelX_R, wheelY_R, rTire, rTire * 0.55);
        drawWheel(wheelX_F, wheelY_F, fTire, fTire * 0.55);

        if (car.upgrades.parachute && car.speed < 10 && car.type !== 'hatch') {
            ctx.fillStyle = '#b0b0b0';
            ctx.beginPath();
            ctx.arc(-8, 26, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#666';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-8, 26); ctx.lineTo(-2, 28);
            ctx.stroke();
        }

        ctx.restore();
    }
};
