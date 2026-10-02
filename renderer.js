'use strict';

// Helper to get a consistent road Y. It accounts for the on-screen control
// strip (bottomReserve, measured from the live DOM) so the player's car —
// lane offset 65 + body height ~50px — can NEVER end up underneath the
// GAS/BRAKE/SHIFT buttons, on any screen size or aspect ratio. A floor of
// 0.32H keeps the road from swallowing the whole sky on very short stages.
function getRoadY(H, isMobile, bottomReserve) {
    const reserve = bottomReserve || 0;
    const byControls = H - reserve - 126;
    return Math.max(H * 0.32, Math.min(H - 140, byControls, H * (isMobile ? 0.60 : 0.72)));
}

// Car silhouettes, wheel construction and bolt-on part geometry all live in
// car-art.js (loaded before this file). The layer order below is the whole
// look: silhouette -> decals -> arch cut-outs -> glass -> trim -> panel
// detail -> lamps -> bolt-ons -> wheels -> arch lips.
const CarArt = window.CarArt || { artFor: () => null };
const artFor = CarArt.artFor;

// A wheel fills the arch it sits in: dark well, tire, then a painted fender
// lip stroked back over the top of the tire on top of the arch edge.
function archWellPath(ctx, wx, wy, r, base) {
    ctx.beginPath();
    ctx.moveTo(wx - r, base);
    ctx.arc(wx, wy, r, Math.PI, Math.PI * 2);
    ctx.lineTo(wx + r, base);
    ctx.closePath();
}

function drawModernWheel(ctx, x, y, tire, rim, car) {
    const brand = car.customization?.tireBrand?.brand || null;
    ctx.save(); ctx.translate(x, y); ctx.rotate(car.wheelRotation);
    CarArt.drawTire(ctx, tire, rim, brand);
    const style = car.customization?.rim;
    // Rim draws receive the car so a RIM PAINT selection ('accent' rides
    // secondaryColor; explicit finishes pass their hex) can override the
    // style's own default finish.
    if (style?.draw) style.draw(ctx, rim, car);
    else CarArt.drawRimFace(ctx, rim, (style && style.id) || 'stock', car);
    ctx.restore();
}

function renderModernCar(ctx, car, c, s, glass) {
    const art = artFor(car);
    if (!art) return;
    const tireDef = car.customization?.tire;
    // Tire size follows the silhouette, so a wheel can never be more than
    // about half the car's own height — the ratio that decides whether a
    // silhouette reads as a car or as a toy.
    const rearTire = Math.max(4, art.tireR * (tireDef?.scale ?? (car.upgrades.slicks ? 1.08 : 1)));
    const frontTire = car.type === 'dragster' ? rearTire * 0.5 : rearTire;
    const rimFactor = tireDef?.rimRadius || .68;
    // The wheel centre is derived from the shared ground line so a bigger
    // tire grows UP into the arch instead of sinking through the road.
    const wy = art.ground - rearTire, wyF = art.ground - frontTire;
    const midX = (art.rear + art.front) / 2;

    car._artAnchors = {
        rearWheel: { x: art.wheels[0][0], y: wy, r: rearTire },
        frontWheel: { x: art.wheels[1][0], y: wyF, r: frontTire },
        exhaust: { x: art.rear + 1.5, y: art.rocker - 4 },
        spoiler: { x: art.deck[0], y: art.deck[1], w: art.deck[2] },
        kit: {
            x: art.rear + 3, y: art.rocker, w: art.front - art.rear - 6,
            rearX: art.rear + 1, frontX: art.front - 5,
            skirtX: art.wheels[0][0] + art.arch + 2, skirtW: (art.wheels[1][0] - art.arch - 2) - (art.wheels[0][0] + art.arch + 2),
        },
        livery: { x: Math.max(4, art.rear + 6), y: art.belt, w: Math.max(36, art.front - art.rear - 12), h: art.rocker - art.belt },
    };

    /* 1 ── contact shadow */
    const shadow = ctx.createRadialGradient(midX, art.ground - 1, 6, midX, art.ground - 1, (art.front - art.rear) * .58);
    shadow.addColorStop(0, 'rgba(0,0,0,.6)'); shadow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadow; ctx.fillRect(art.rear - 16, art.ground - 10, art.front - art.rear + 32, 16);

    /* 2 ── body: base paint over a vertical value ramp (sky bounce on the
       roof, body colour through the flanks, shadow in the sills) */
    const paint = ctx.createLinearGradient(0, art.topY, 0, art.rocker);
    paint.addColorStop(0, '#ffffff'); paint.addColorStop(.06, c);
    paint.addColorStop(.84, c); paint.addColorStop(.95, '#565e67'); paint.addColorStop(1, '#3d444c');
    CarArt.tracePath(ctx, art.p);
    ctx.fillStyle = paint; ctx.fill();

    /* 3 ── decals, clipped to the body so they wrap over the arches */
    ctx.save(); CarArt.tracePath(ctx, art.p); ctx.clip();
    if (car.customization?.livery?.draw) car.customization.livery.draw(ctx, car);
    ctx.restore();

    /* 4 ── rocker shadow + shoulder highlight: the two value breaks that make
       flat side-profile art read as curved metal */
    ctx.save(); CarArt.tracePath(ctx, art.p); ctx.clip();
    ctx.fillStyle = 'rgba(0,0,0,.17)';
    ctx.fillRect(art.rear - 4, art.rocker - 3.2, art.front - art.rear + 8, 4.2);
    ctx.fillStyle = 'rgba(255,255,255,.13)';
    ctx.fillRect(art.rear - 4, art.belt + 1.2, art.front - art.rear + 8, 1.2);
    ctx.fillStyle = 'rgba(255,255,255,.07)';
    ctx.fillRect(art.rear - 4, art.belt + 5.5, art.front - art.rear + 8, 2.4);
    // Flank character line, broken at the arches so it follows the body.
    ctx.strokeStyle = 'rgba(10,14,19,.30)'; ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.moveTo(art.rear + 8, art.belt + 3.4);
    ctx.lineTo(art.wheels[0][0] - art.arch - 1, art.belt + 3.1);
    ctx.moveTo(art.wheels[0][0] + art.arch + 1, art.belt + 3.1);
    ctx.lineTo(art.wheels[1][0] - art.arch - 1, art.belt + 3.4);
    ctx.moveTo(art.wheels[1][0] + art.arch + 1, art.belt + 3.4);
    ctx.lineTo(art.front - 8, art.belt + 3.7);
    ctx.stroke();
    ctx.restore();

    /* 5 ── wheel arch cut-outs. Drawn AFTER the decals so a stripe cannot
       paint into the well, and only as far as the rocker so no dark crescent
       escapes below the car. Kept a dark grey rather than pure black: a
       black hole that size swallows the whole lower body. */
    ctx.save(); CarArt.tracePath(ctx, art.p); ctx.clip();
    for (const [wx, wyy] of [[art.wheels[0][0], wy], [art.wheels[1][0], wyF]]) {
        const well = ctx.createLinearGradient(0, wyy - art.arch, 0, art.rocker);
        well.addColorStop(0, '#1b2026'); well.addColorStop(1, '#0a0d10');
        archWellPath(ctx, wx, wyy, art.arch, art.rocker + 0.5);
        ctx.fillStyle = well; ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 0.7; ctx.stroke();
    }
    ctx.restore();

    /* 6 ── glass */
    ctx.fillStyle = glass;
    CarArt.tracePath(ctx, art.glass); ctx.fill();
    // Windscreen sliver ahead of the A-pillar, then the pillar bars painted
    // back over the glass — how the reference greenhouse actually reads.
    if (art.windscreen) {
        CarArt.tracePath(ctx, art.windscreen);
        ctx.fillStyle = 'rgba(6,10,16,.55)'; ctx.fill();
    }
    ctx.strokeStyle = 'rgba(214,238,255,.17)'; ctx.lineWidth = .6;
    CarArt.tracePath(ctx, art.glass); ctx.stroke();
    ctx.save(); CarArt.tracePath(ctx, art.glass); ctx.clip();   // B-pillar stays
    ctx.fillStyle = c;                                          // inside the glass
    const pillarTop = Math.min(...art.glass.map(s => s[1]));
    ctx.fillRect(art.pillar - 0.45, pillarTop, 1.1, art.belt - pillarTop);
    ctx.restore();
    // Chrome window trim along the beltline.
    ctx.strokeStyle = 'rgba(226,236,246,.32)'; ctx.lineWidth = .55;
    ctx.beginPath(); ctx.moveTo(art.glass[0][0] - 1, art.belt - 0.4); ctx.lineTo(art.glass[art.glass.length - 1][2] || art.glass[art.glass.length - 1][0], art.belt - 0.2); ctx.stroke();

    /* 7 ── outline */
    CarArt.tracePath(ctx, art.p);
    ctx.strokeStyle = '#0d1116'; ctx.lineWidth = 1.1; ctx.stroke();

    /* 8 ── panel detail: door seams, handle, mirror, fuel cap */
    const seamA = art.wheels[0][0] + art.arch + 3, seamB = art.wheels[1][0] - art.arch - 3;
    ctx.strokeStyle = 'rgba(10,14,19,.55)'; ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(seamA, art.belt + 0.6); ctx.lineTo(seamA - 0.8, art.rocker - 1);
    ctx.moveTo(seamB, art.belt + 0.6); ctx.lineTo(seamB + 0.8, art.rocker - 1);
    ctx.stroke();
    ctx.fillStyle = 'rgba(20,25,32,.9)';
    ctx.fillRect(seamB - 6, art.belt + 2.4, 4, 1.4);
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.fillRect(seamB - 6, art.belt + 2.4, 4, 0.5);
    // Door mirror, on the A-pillar base.
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(art.wheels[1][0] - art.arch - 1, art.belt - 1.2);
    ctx.lineTo(art.wheels[1][0] - art.arch + 2.4, art.belt - 2.2);
    ctx.lineTo(art.wheels[1][0] - art.arch + 2.4, art.belt - 0.2);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.beginPath(); ctx.arc(art.wheels[0][0] - 4, art.belt - 1.6, 1.1, 0, Math.PI * 2); ctx.fill();

    /* 9 ── lamps, clipped to the body so a curved nose or tail can never
       leave a lamp floating in the background */
    ctx.save(); CarArt.tracePath(ctx, art.p); ctx.clip();
    if (art.head) {
        ctx.fillStyle = '#cfd0c0';
        ctx.fillRect(art.head.x, art.head.y, art.head.w, art.head.h);
        ctx.fillStyle = 'rgba(255,255,255,.38)';
        ctx.fillRect(art.head.x, art.head.y, art.head.w, 0.7);
        ctx.strokeStyle = 'rgba(20,24,30,.7)'; ctx.lineWidth = 0.5;
        ctx.strokeRect(art.head.x, art.head.y, art.head.w, art.head.h);
        // Inner dark edge: a lamp lens is a recess, not a sticker.
        ctx.fillStyle = 'rgba(40,44,50,.5)';
        ctx.fillRect(art.head.x + art.head.w - 1.3, art.head.y, 1.3, art.head.h);
    }
    if (art.tail) {
        ctx.fillStyle = '#8e2018';
        ctx.fillRect(art.tail.x, art.tail.y, art.tail.w, art.tail.h);
        ctx.fillStyle = 'rgba(255,110,80,.30)';
        ctx.fillRect(art.tail.x, art.tail.y, art.tail.w, 0.6);
    }
    // Bumper seam + lower valance at both ends.
    ctx.strokeStyle = 'rgba(12,16,22,.30)'; ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(art.front - 7.5, art.belt - 1.5); ctx.lineTo(art.front - 6, art.rocker - 2);
    ctx.moveTo(art.rear + 6, art.belt - 1.5); ctx.lineTo(art.rear + 4.5, art.rocker - 2);
    ctx.stroke();
    ctx.restore();

    /* 10 ── bolt-ons */
    if (car.upgrades.engine > 2 && (car.art === 'mustang_sn95' || car.art === 'supra_a80')) {
        ctx.fillStyle = '#a7b0b8'; ctx.fillRect(art.front - 29, art.belt - 8, 15, 4);
        ctx.fillStyle = '#20252b'; ctx.fillRect(art.front - 26, art.belt - 10, 3, 3); ctx.fillRect(art.front - 19, art.belt - 10, 3, 3);
    }
    if (car.customization?.bodyKit?.draw) car.customization.bodyKit.draw(ctx, car);
    if (car.customization?.spoiler?.draw) car.customization.spoiler.draw(ctx, car);
    if (car.customization?.exhaust?.draw) car.customization.exhaust.draw(ctx, car);

    /* 11 ── wheels */
    drawModernWheel(ctx, art.wheels[0][0], wy, rearTire, rearTire * rimFactor, car);
    drawModernWheel(ctx, art.wheels[1][0], wyF, frontTire, frontTire * rimFactor, car);

    /* 12 ── painted fender lips restore the arch edge in front of the tires.
       Straddling the arch radius (not sitting inside it) is what makes the
       lip read as rolled sheet metal rather than a ring painted on the tire. */
    for (const [wx, wyy] of [[art.wheels[0][0], wy], [art.wheels[1][0], wyF]]) {
        ctx.strokeStyle = c; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(wx, wyy, art.arch - 0.8, Math.PI, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 0.55;
        ctx.beginPath(); ctx.arc(wx, wyy, art.arch - 1.9, Math.PI * 1.08, Math.PI * 1.62); ctx.stroke();
    }

    if (car.upgrades.parachute && car.speed < 10 && car.type !== 'hatch') {
        ctx.fillStyle = '#aeb5bb'; ctx.beginPath(); ctx.arc(art.rear - 6, art.belt, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#6d757c'; ctx.lineWidth = 0.6; ctx.stroke();
    }
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
        // Screen shake is applied by the CALLER (game.js draw()), which
        // already translates by game.screenShake before calling us. It used
        // to be applied here as well, so every frame shook by double the
        // intended amplitude with two independent random offsets. Only the
        // caller's transform is authoritative now; `screenShake` is kept in
        // the signature (other callers / future per-layer effects) but must
        // NOT be applied again here.

        // Reserve measured from the real control buttons (game keeps it fresh
        // on resize / race start) — the layout stays responsive, not fixed.
        const controlReserve = (typeof game !== 'undefined' && game._controlReserve) || 0;
        const roadY = getRoadY(H, _isMobile, controlReserve);
        // A restrained close-follow camera: it keeps the player near the left third
        // while enlarging the race scene without losing the start lights or HUD.
        const cameraZoom = _isMobile ? 1.24 : 1.35;
        const followOffset = Math.min(W * 0.34, 220);
        const camX = Math.max(0, playerCar.x * METERS_TO_PX - followOffset);

        const pX = (playerCar.x * METERS_TO_PX) - camX + 40;
        const oX = (opponentCar.x * METERS_TO_PX) - camX + 40;

        const playerLaneY = roadY + 65;
        const oppLaneY = roadY + 20;

        // The zoom anchors on the PLAYER'S CAR, not a fixed screen point.
        // While following, camX tracks the car so pX never moves and this is
        // identical to the old focus — but at the start line camX clamps to 0
        // and the car sits at the screen's left edge; anchoring the zoom on a
        // far-away focus point used to multiply that distance and push the
        // car's rear half off-screen. Anchoring on the car keeps it fully
        // visible in every mode, at every speed.
        const focusX = pX + 52 * 1.1 * 0.5, focusY = roadY + 58;
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

        const gantryTop = Math.max(roadY - 140, 2);
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(fx - 16, gantryTop, 14, roadY - gantryTop + roadH);
        ctx.fillStyle = '#5a5a5a';
        ctx.fillRect(fx - 14, gantryTop, 4, roadY - gantryTop + roadH);
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(fx - 6, gantryTop, 4, roadY - gantryTop + roadH);

        const rightPostX = fx + cols * squareSize + 2;
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(rightPostX, gantryTop, 14, roadY - gantryTop + roadH);
        ctx.fillStyle = '#5a5a5a';
        ctx.fillRect(rightPostX + 2, gantryTop, 4, roadY - gantryTop + roadH);
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(rightPostX + 10, gantryTop, 4, roadY - gantryTop + roadH);

        const beamY = gantryTop;
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
        // On short stages the tree must stay on-screen (never clipped).
        const poleTop = Math.max(roadY - 160, 6);
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
        // Paint-accented HUD: each lane takes its driver's paint (lifted to a
        // readable tone when the paint is near-black). Ghost lane is cyan.
        const pCol = (typeof game !== 'undefined' && game._hudColor) ? game._hudColor(p.color, '#4fc3f7') : '#4fc3f7';
        const isGhost = !!(o && o.isGhost);
        const oCol = isGhost ? '#4dd0e1'
            : (typeof game !== 'undefined' && game._hudColor) ? game._hudColor(o.color, '#ff7043') : '#ff7043';
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(bx - 2, by - 2, barW + 4, barH + 4);
        ctx.fillStyle = '#222';
        ctx.fillRect(bx, by, barW, barH);
        const pPct = Math.min(1, p.x / raceDistance);
        ctx.fillStyle = pCol;
        ctx.fillRect(bx, by, barW * pPct, barH / 2);
        const oPct = Math.min(1, o.x / raceDistance);
        ctx.fillStyle = oCol;
        ctx.fillRect(bx + barW - barW * oPct, by + barH / 2, barW * oPct, barH / 2);
        ctx.font = '7px "Press Start 2P"';
        ctx.textAlign = 'left';
        ctx.fillStyle = pCol;
        ctx.fillText('YOU', bx, by - 6);
        ctx.textAlign = 'right';
        ctx.fillStyle = oCol;
        ctx.fillText(isGhost ? 'GHOST' : 'OPP', bx + barW, by - 6);
        ctx.fillStyle = '#fff';
        ctx.fillRect(bx + barW - 2, by - 4, 4, barH + 8);
    },

    // Nitrous purge flame — a flickering violet→cyan→white burn riding the
    // exhaust tip while the bottle sprays. Pure canvas, additive-blended;
    // length breathes with speed and a two-sine flicker so it never reads
    // as a static sticker. Matches the NOS button's violet identity.
    drawNosFlame(ctx, car) {
        const now = performance.now();
        const art = (typeof artFor === 'function') ? artFor(car) : null;
        const ex = (car._artAnchors && car._artAnchors.exhaust) ||
                   (art ? { x: art.rear, y: 29 } : { x: 2, y: 29 });
        const flick = 0.72 + 0.28 * Math.sin(now / 27 + ex.x);
        const flick2 = 0.6 + 0.4 * Math.sin(now / 61 + 1.7);
        const jitter = (Math.sin(now / 43 + ex.y * 3) + Math.sin(now / 17)) * 0.8;
        const speedKick = 0.75 + 0.45 * Math.min(1, (car.speed || 0) / 30);
        const len = (24 + 15 * flick * flick2) * speedKick;
        const h = 3.2 + 1.9 * flick;

        ctx.save();
        ctx.translate(ex.x - 1, ex.y + jitter * 0.4);
        ctx.globalCompositeOperation = 'lighter';
        const tongue = (color, scale, alpha, tip) => {
            ctx.globalAlpha = alpha;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(1, 0);
            ctx.quadraticCurveTo(-len * 0.35, -h * scale, -len, jitter * scale * 0.5 + tip);
            ctx.quadraticCurveTo(-len * 0.33, h * scale, 1, 0);
            ctx.fill();
        };
        tongue('#7e57c2', 1, 0.55, 0);          // violet sheath (NOS identity)
        tongue('#4dd0e1', 0.64, 0.62, 0);       // cyan mid-burn
        tongue('#e8f7ff', 0.32, 0.85, -0.6);    // white-hot core
        ctx.globalAlpha = 0.5 * flick;          // hot tip glint
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-2, -1, 3, 2);
        // Soft bloom where the flame leaves the pipe.
        ctx.globalAlpha = 0.28 * flick;
        ctx.fillStyle = '#b388ff';
        ctx.beginPath();
        ctx.ellipse(-len * 0.12, 0, len * 0.22, h * 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    },

    drawCar(ctx, car, x, y, scale = 1) {
        ctx.save();
        ctx.translate(x, y + car.squat);
        ctx.scale(scale, scale);

        // Contact shadow sits on the shared ground line (y=47 in car space),
        // not on the old hard-coded 42 — the cars are planted lower now.
        const shadowGrad = ctx.createRadialGradient(48, 46, 10, 48, 46, 60);
        shadowGrad.addColorStop(0, 'rgba(0,0,0,0.5)');
        shadowGrad.addColorStop(0.6, 'rgba(0,0,0,0.2)');
        shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = shadowGrad;
        ctx.beginPath();
        ctx.ellipse(48, 46, 58, 7, 0, 0, Math.PI * 2);
        ctx.fill();

        const c = car.color;
        const s = car.secondaryColor;
        const glass = car.customization?.tint?.color || '#1a2332';
        // (`dark` and `rim` used to be declared here for the legacy
        // silhouette drawing that sat after an unconditional `return`.
        // That block is gone; these were its only consumers.)

        if (car.isGhost) {
            // A spectral replay — dimmed directly ON the car (no aura box,
            // no outline) so it reads as "not really there" next to the
            // solid player car without shouting for attention.
            ctx.globalAlpha = 0.34;
            renderModernCar(ctx, car, c, s, glass);
        } else {
            renderModernCar(ctx, car, c, s, glass);
        }
        // Nitrous purge flame rides the exhaust while the bottle ACTUALLY
        // sprays (drawn here, not in the shared particle system, so gear
        // backfires stay orange and the spray reads as its own thing).
        if (car.nosSpraying) this.drawNosFlame(ctx, car);
        ctx.restore();
        return;
    }
};
