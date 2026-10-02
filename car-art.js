'use strict';

/* ─────────────────────────────────────────────────────────────────────────
   CAR ART — silhouettes, wheels and bolt-on part geometry.

   Everything here is DATA + low-level part drawing. renderer.js owns the
   scene and the layer order; game.js owns the customization CATALOG (which
   part is buyable) and delegates the actual pixels to the drawers below.

   PROPORTION MODEL (all cars share one vertical convention, in a 100x50
   local box, origin top-left, car facing +x):
     y=47  ground        — the tire contact patch, never moves
     y=41  rocker        — bottom of the side skirt / body sill
     y=26  beltline      — bottom of the glass, top of the doors
     y=16  roof          — ~32 units tall over 100 long (ratio ~3.1)

   Keeping ground at a FIXED 47 across every car and every tire size is
   what keeps the stance planted when a player swaps to 13-inch slicks: the
   wheel centre is derived as (ground - tireRadius), so a bigger tire grows
   UP into the arch instead of sinking through the road.

   PATH FORMAT — a flat list of segments, first entry is the start point:
     [x, y]           straight line to
     [cx, cy, x, y]   quadratic curve through control (cx,cy) to (x,y)
   Quadratics everywhere (rather than polygons) is what separates this from
   the old 9-point blob art: the reference cars read as smooth, curved
   bodywork, and only the creases (shoulder, rocker, arch lips) are sharp.
   ───────────────────────────────────────────────────────────────────────── */

(function () {
    const TAU = Math.PI * 2;

    /* ─── path helpers ─── */

    function tracePath(ctx, segs, close) {
        ctx.beginPath();
        ctx.moveTo(segs[0][0], segs[0][1]);
        for (let i = 1; i < segs.length; i++) {
            const s = segs[i];
            if (s.length === 2) ctx.lineTo(s[0], s[1]);
            else ctx.quadraticCurveTo(s[0], s[1], s[2], s[3]);
        }
        if (close !== false) ctx.closePath();
    }
    function traceLine(ctx, segs) {
        ctx.beginPath();
        ctx.moveTo(segs[0][0], segs[0][1]);
        for (let i = 1; i < segs.length; i++) {
            const s = segs[i];
            if (s.length === 2) ctx.lineTo(s[0], s[1]);
            else ctx.quadraticCurveTo(s[0], s[1], s[2], s[3]);
        }
    }
    // Fills an open path, then strokes it — one path, one rasterisation.
    function poly(ctx, segs, fill, stroke, lw) {
        tracePath(ctx, segs);
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
    }

    /* ─── the silhouettes ─── */

    const CAR_ART = {
        // Honda Civic hatchback — short hood, tall greenhouse, upright tail.
        civic_ek: {
            p: [
                [2, 41], [0.5, 36, 1, 31], [2, 27.5, 4, 26.6], [12, 26.2], [16, 25.8],
                [22, 14.2, 30, 13.6], [42, 13.4, 52, 14.4], [58, 16.5, 64, 24.8],
                [74, 24.6, 88, 24.8], [95, 25.2, 98, 28.6], [100.4, 31, 99.6, 36],
                [98.6, 39.6, 95, 41],
            ],
            glass: [[64, 24.8], [55, 17, 52.6, 15.8], [42, 14.4, 31.5, 14.9], [24, 18.4, 19.5, 27]],
            windscreen: [[64, 24.6], [55.5, 16.4, 53.6, 15.9]],
            wheels: [[24, 35], [78, 35]],
            belt: 26.4, deck: [5, 26.2, 14], pillar: 44,
            head: { x: 88, y: 24.6, w: 8, h: 3.4 }, tail: { x: 2.6, y: 26.6, w: 5, h: 3.6 },
        },
        // Nissan Silvia S14 — the reference shape: long flat hood, short deck,
        // fast C-pillar, slammed rocker, big arches filled by the rims.
        s14: {
            p: [
                [1, 41], [0.3, 36.5, 1, 32.5], [1.8, 29.2, 4.5, 28.4], [15, 28.2], [19, 27.8],
                [25.5, 19.5, 33.5, 16.9], [41, 16.0, 48.5, 16.3], [55, 18.2, 64, 25.4],
                [74, 25.1, 88, 25.3], [93, 25.6, 96.6, 28], [99.4, 30.2, 99, 35.4],
                [98.6, 38.6, 94.5, 41],
            ],
            glass: [[64, 25.4], [56, 18.6, 50.5, 17.2], [42, 16.3, 34, 16.9], [27.5, 21, 24, 27.6]],
            windscreen: [[64, 25.4], [55.6, 17.8, 53.2, 17.4]],
            wheels: [[23, 35], [77, 35]],
            belt: 27.1, deck: [5, 28.2, 14], pillar: 44,
            head: { x: 88.5, y: 24.8, w: 8, h: 3 }, tail: { x: 1.8, y: 27, w: 5.4, h: 3.6 },
        },
        // Ford Mustang SN95 — long hood, fastback roof, muscular haunches.
        mustang_sn95: {
            p: [
                [1, 41], [0.4, 35.5, 1.6, 31], [3, 28, 7, 27.2], [16, 26.6], [22, 26.2],
                [27, 18.5, 36, 15.6], [48, 14.6, 58, 15.4], [63, 17.5, 70, 24.6],
                [82, 24.2, 92, 24.4], [97, 24.8, 100, 28], [102.4, 31, 101.4, 36],
                [100, 39.6, 96, 41],
            ],
            glass: [[70, 24.8], [61, 17.6, 56.5, 16.4], [46, 15, 37, 16.2], [30, 20.4, 26.5, 28]],
            windscreen: [[70, 24.6], [61.5, 17.2, 59.6, 16.8]],
            wheels: [[23, 35], [79, 35]],
            belt: 27, deck: [6, 26.8, 12], pillar: 47,
            head: { x: 92, y: 24.2, w: 8.5, h: 3.4 }, tail: { x: 1.6, y: 26.4, w: 5.6, h: 3.8 },
        },
        // R34 GT-R — boxy: near-vertical tail, flat roof, long flat hood.
        r34: {
            p: [
                [1, 41], [0.3, 34, 1.2, 28.6], [3, 26.4, 8, 26], [17, 25.6], [23, 25.2],
                [27, 15.4, 34, 14.2], [48, 13.6, 57, 14.2], [61, 15.4, 68, 24.2],
                [80, 23.8, 92, 24], [97, 24.6, 100, 28.4], [102, 31.6, 101, 36.4],
                [99.8, 39.8, 96, 41],
            ],
            glass: [[68, 24.4], [59, 16, 55, 15.2], [45, 14.2, 35, 14.6], [29, 17.6, 25.5, 26.8]],
            windscreen: [[68, 24.2], [60, 16.4, 58.2, 16]],
            wheels: [[22, 35], [78, 35]],
            belt: 26.4, deck: [7, 25.8, 12], pillar: 45,
            head: { x: 91.5, y: 23.6, w: 8, h: 3.2 }, tail: { x: 1.4, y: 25.4, w: 5.4, h: 4.2 },
        },
        // Toyota Supra A80 — very low, cab rearward, double-bubble roof.
        supra_a80: {
            p: [
                [1, 41], [0.4, 35.8, 1.4, 30.6], [3.4, 27.2, 8, 26.4], [17, 25.8], [23, 25.4],
                [29, 17.6, 38, 15], [50, 14.2, 60, 15], [66, 17.6, 73, 24.2],
                [84, 23.6, 94, 24], [98, 24.8, 101, 28.6], [103, 32, 102, 36.6],
                [100.6, 39.8, 96.5, 41],
            ],
            glass: [[73, 24.4], [63.5, 16.6, 58.5, 15.4], [46, 14.4, 37, 15.4], [31, 19.8, 27.5, 27.4]],
            windscreen: [[73, 24.2], [64.6, 16.4, 62.4, 16]],
            wheels: [[21, 35], [80, 35]],
            belt: 26.8, deck: [7, 26, 12], pillar: 47,
            head: { x: 93.5, y: 23.8, w: 8, h: 3 }, tail: { x: 1.6, y: 26, w: 5.6, h: 3.6 },
        },
        // Dodge Viper ACR — extreme wedge, tiny cabin set far back, long hood.
        viper_acr: {
            p: [
                [1, 41], [0.4, 36, 1.6, 32], [4, 28.6, 10, 28], [20, 27.6], [27, 27.2],
                [33, 20, 42, 17.4], [55, 16.2, 63, 16.8], [68, 19.4, 74, 25],
                [86, 24.4, 95, 24.8], [99, 25.4, 102, 29], [104, 32.4, 103, 36.6],
                [101.6, 39.8, 97, 41],
            ],
            glass: [[74, 25.2], [65, 18.6, 60.5, 17.4], [50, 16.4, 41, 18], [35, 22.4, 31, 29.4]],
            windscreen: [[74, 25], [66.4, 18.2, 64.2, 17.6]],
            wheels: [[20, 35], [82, 35]],
            belt: 28, deck: [9, 27.8, 13], pillar: 51,
            head: { x: 94.5, y: 24.6, w: 7.5, h: 2.8 }, tail: { x: 2, y: 28.2, w: 6, h: 3.4 },
        },
        // Lamborghini Huracan — angular wedge, cab forward, hard shoulder crease.
        huracan: {
            p: [
                [1, 41], [0.5, 35, 2, 30], [5, 26.6, 11, 26], [19, 25.6], [25, 25.2],
                [31, 18.4, 40, 16.4], [52, 15.2, 61, 16], [67, 18.6, 73, 24.6],
                [84, 24.2, 93, 24.6], [98, 25.2, 101, 29.4], [103, 33, 102, 36.8],
                [100.6, 39.8, 96.5, 41],
            ],
            glass: [[73, 24.8], [64, 17.8, 59, 16.6], [48, 15.4, 39, 16.8], [32, 20.8, 28.5, 27.6]],
            windscreen: [[73, 24.6], [65.2, 17.6, 63, 17.2]],
            wheels: [[21, 35], [79, 35]],
            belt: 27.4, deck: [10, 26, 12], pillar: 48,
            head: { x: 92.5, y: 24.4, w: 8.5, h: 2.6 }, tail: { x: 2, y: 26.2, w: 6, h: 3.4 },
        },
        // Funny car — long wheelbase, tiny cabin hard forward, slab flanks.
        funny_car: {
            p: [
                [-8, 41], [-11, 34.5, -10, 27.5], [-6, 24.6, 2, 23.2], [12, 22.4], [18, 22],
                [21, 11.5, 27, 9.6], [35, 8.8, 44, 10.2], [49, 12.8, 54, 21.6],
                [68, 21.2, 92, 22.2], [104, 23, 111, 26.4], [116, 29, 117, 35],
                [115.4, 38.8, 111, 41],
            ],
            glass: [[48, 21.8], [43, 13.8, 39.6, 11.8], [30, 10.4, 24.6, 11.4], [19.6, 14, 17.6, 22.2]],
            windscreen: [[48.4, 22], [44, 13.2, 42.4, 12.4]],
            wheels: [[16, 35], [97, 41]],
            belt: 22.6, deck: [-6, 23.4, 14], pillar: 30,
            head: { x: 104, y: 24.4, w: 9, h: 3 }, tail: { x: -8, y: 24, w: 6, h: 4 },
        },
    };

    const GROUND = 47, ROCKER = 41.5;

    /* Proportion targets, measured off the reference silhouettes rather than
       eyeballed. A car whose wheel is much more than half its own height
       reads as a toy no matter how good the sheet metal is — the reference
       Silvia is 0.49 wheel-to-height and 0.285 height-to-length. */
    const TARGET_H_L = 0.29;   // height / length
    const TARGET_WHEEL = 0.25; // wheel RADIUS / height

    function segMinY(segs) {
        let m = Infinity;
        for (const s of segs) for (let i = 1; i < s.length; i += 2) if (s[i] < m) m = s[i];
        return m;
    }
    function squashY(segs, k) {
        for (const s of segs) for (let i = 1; i < s.length; i += 2) s[i] = ROCKER + (s[i] - ROCKER) * k;
    }

    // Fills in the values every car shares so renderer.js can rely on them.
    function normalizeArt(a) {
        const front = a.p[a.p.length - 1][2] !== undefined ? a.p[a.p.length - 1][2] : a.p[a.p.length - 1][0];
        const len = front - a.p[0][0];

        // Squash every vertical so height/length lands on the reference ratio.
        // The sills stay put; the roof comes down. Authored coordinates below
        // are then free to be "roughly right" and still come out correct.
        const k = (TARGET_H_L * len) / (GROUND - segMinY(a.p));
        squashY(a.p, k);
        if (a.glass) squashY(a.glass, k);
        if (a.windscreen) squashY(a.windscreen, k);

        a.ground = GROUND;
        a.rocker = ROCKER;
        a.rear = a.p[0][0];
        a.front = front;
        a.topY = segMinY(a.p);
        a.height = GROUND - a.topY;
        // Tire radii follow the car so a scaling silhouette scales its wheels.
        a.tireR = Math.max(5, a.height * TARGET_WHEEL);
        // 1.12 keeps a thin shadow gap above the tread - enough to read as an
        // opening, not so much that the well becomes a dark crescent.
        a.arch = a.arch || Math.max(6, a.tireR * 1.12);

        if (a.belt) a.belt = ROCKER + (a.belt - ROCKER) * k;
        if (a.deck) { a.deck[1] = ROCKER + (a.deck[1] - ROCKER) * k; }
        if (a.head) { a.head.y = ROCKER + (a.head.y - ROCKER) * k; }
        if (a.tail) { a.tail.y = ROCKER + (a.tail.y - ROCKER) * k; }
        a.belt = a.belt || a.rocker - (a.height * 0.62);
        a.deck = a.deck || [a.rear + 5, a.belt - 1, 14];
        a.pillar = a.pillar || (a.wheels[0][0] + a.wheels[1][0]) / 2;
        // Lamps are authored as generous boxes so they sit predictably on
        // each nose/tail; they are shrunk here because at 3x garage scale a
        // full-size box reads as a white brick bolted to the bumper. They are
        // also clipped to the body path at draw time, so a curved tail can
        // never leave one poking out into the background.
        if (a.head) { a.head.w *= 0.62; a.head.h *= 0.7; a.head.x += 1.5; }
        if (a.tail) { a.tail.w *= 0.62; a.tail.h *= 0.72; a.tail.x += 3; }
        return a;
    }
    for (const k in CAR_ART) normalizeArt(CAR_ART[k]);

    function artFor(car) { return CAR_ART[car && car.art] || CAR_ART.civic_ek; }

    /* ─── rim styles ───
       Geometry only; the finish comes from rimPaintColor() in game.js so a
       RIM PAINT selection (accent / gold / bronze / …) still overrides it. */
    const RIM_STYLES = {
        stock: { paint: '#8a929b', spokes: 4, w0: 0.21, w1: 0.13, lip: 0.10 },
        five_spoke: { paint: '#d6dae0', spokes: 5, w0: 0.25, w1: 0.15, lip: 0.13 },
        mesh: { paint: '#9aa3ad', spokes: 12, w0: 0.085, w1: 0.05, mesh: true, lip: 0.09 },
        deep_dish: { paint: '#c9ced6', spokes: 6, w0: 0.17, w1: 0.11, dish: true, lip: 0.30 },
        blade: { paint: '#c7ced6', spokes: 5, w0: 0.31, w1: 0.19, blade: true, lip: 0.11 },
        star: { paint: '#e5e7eb', spokes: 5, w0: 0.34, w1: 0.06, star: true, lip: 0.12 },
        watanabe: { paint: '#b9c0c8', spokes: 6, w0: 0.23, w1: 0.09, lip: 0.17 },
        bbs: { paint: '#dfe3e8', spokes: 10, w0: 0.075, w1: 0.042, mesh: true, lip: 0.27 },
    };

    const CALIPER_COLORS = ['#c8342b', '#e0a11b', '#2f6fd0', '#e8e8e8', '#8e44ad'];

    function rimPaintColorSafe(car, fallback) {
        return (typeof rimPaintColor === 'function') ? rimPaintColor(car, fallback) : fallback;
    }
    function caliperColor(car) {
        const i = Math.abs((car && car.x ? Math.round(car.x) : 0) + (car ? car.name.length : 0)) % CALIPER_COLORS.length;
        return CALIPER_COLORS[i];
    }

    // One tapered spoke, drawn along +x then rotated by the caller.
    function spoke(ctx, r0, r1, w0, w1, fill) {
        ctx.beginPath();
        ctx.moveTo(r0, -w0); ctx.lineTo(r1, -w1); ctx.lineTo(r1, w1); ctx.lineTo(r0, w0);
        ctx.closePath();
        ctx.fillStyle = fill; ctx.fill();
    }

    /* The rim face, drawn in wheel-local space (origin = hub, already rotated
       by wheelRotation by the caller). Layered back-to-front: barrel void,
       brake disc + caliper showing THROUGH the spoke gaps, spokes, outer
       lip, then the centre cap and lug nuts. Seeing the caliper through the
       spokes is what stops a wheel reading as a flat coloured disc. */
    function drawRimFace(ctx, r, styleId, car) {
        const def = RIM_STYLES[styleId] || RIM_STYLES.stock;
        const paint = rimPaintColorSafe(car, def.paint);
        const dish = !!def.dish;

        // Barrel void — the wheel is a dish, so its inside is dark.
        ctx.fillStyle = '#0a0c0f';
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();

        // Brake disc + caliper, behind the spokes.
        ctx.fillStyle = '#2f343a';
        ctx.beginPath(); ctx.arc(0, 0, r * 0.74, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(190,200,212,.16)'; ctx.lineWidth = Math.max(0.5, r * 0.07);
        ctx.beginPath(); ctx.arc(0, 0, r * 0.63, 0, TAU); ctx.stroke();
        ctx.fillStyle = caliperColor(car);
        ctx.beginPath(); ctx.arc(0, 0, r * 0.76, Math.PI * 1.05, Math.PI * 1.55); ctx.arc(0, 0, r * 0.52, Math.PI * 1.55, Math.PI * 1.05, true); ctx.closePath(); ctx.fill();

        // Spoke face sits on a slightly darker base so the gaps read as gaps.
        const r0 = r * 0.20, r1 = r * 0.90;
        const w0 = r * def.w0, w1 = r * def.w1;
        const n = def.spokes;
        for (let i = 0; i < n; i++) {
            ctx.save(); ctx.rotate(i * TAU / n);
            spoke(ctx, r0, r1, w0, w1, paint);
            if (def.mesh) {
                // Lattice: a second, offset ring of thinner spokes crossing
                // the first in the outer half — the classic mesh face.
                ctx.save(); ctx.rotate(Math.PI / n);
                spoke(ctx, r * 0.44, r1, w0 * 0.62, w1 * 0.62, paint);
                ctx.restore();
            }
            // Bevel: a bright edge down one side of each spoke.
            ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = Math.max(0.4, r * 0.035);
            ctx.beginPath(); ctx.moveTo(r0, -w0 * 0.82); ctx.lineTo(r1, -w1 * 0.82); ctx.stroke();
            ctx.strokeStyle = 'rgba(0,0,0,.34)';
            ctx.beginPath(); ctx.moveTo(r0, w0 * 0.82); ctx.lineTo(r1, w1 * 0.82); ctx.stroke();
            ctx.restore();
        }
        if (def.star) {
            // Star faces taper hard to a point at the hub — overlay a dark
            // wedge so the spokes don't merge into a solid centre.
            ctx.fillStyle = '#0a0c0f';
            for (let i = 0; i < n; i++) {
                ctx.save(); ctx.rotate(i * TAU / n + Math.PI / n);
                ctx.beginPath(); ctx.moveTo(r0, 0); ctx.lineTo(r1 * 0.98, 0); ctx.lineTo(r1 * 0.98, r1 * 0.05); ctx.closePath(); ctx.fill();
                ctx.restore();
            }
        }

        // Outer lip: the polished rim edge. Deep dishes get a wide band.
        const lipIn = r * (1 - def.lip);
        ctx.strokeStyle = paint; ctx.lineWidth = Math.max(0.6, r * def.lip * 0.62);
        ctx.beginPath(); ctx.arc(0, 0, r - ctx.lineWidth / 2, 0, TAU); ctx.stroke();
        if (dish || def.lip > 0.2) {
            ctx.fillStyle = 'rgba(255,255,255,.13)';
            ctx.beginPath(); ctx.arc(0, 0, r - 0.2, 0, TAU); ctx.arc(0, 0, lipIn, TAU, 0, true); ctx.closePath(); ctx.fill();
        }
        ctx.strokeStyle = 'rgba(255,255,255,.30)'; ctx.lineWidth = Math.max(0.4, r * 0.05);
        ctx.beginPath(); ctx.arc(0, 0, r - 0.3, Math.PI * 1.05, Math.PI * 1.85); ctx.stroke();

        // Hub cap + lug nuts.
        ctx.fillStyle = dish ? '#101216' : paint;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.19, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.20)';
        ctx.beginPath(); ctx.arc(0, 0, r * 0.19, Math.PI * 1.1, Math.PI * 1.8); ctx.fill();
        ctx.fillStyle = '#0d0f12';
        for (let i = 0; i < 5; i++) {
            const a = i * TAU / 5 + 0.3;
            ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.30, Math.sin(a) * r * 0.30, Math.max(0.4, r * 0.055), 0, TAU); ctx.fill();
        }
    }

    /* ─── tires ───
       The reference tires carry raised white sidewall lettering (Goodyear,
       Yokohama, Falken, Bridgestone). At race scale those letters are sub-
       pixel, so we draw a dashed lettering BAND; in the garage preview,
       where the wheel is ~3x bigger, we draw the real curved text. */
    function drawTire(ctx, R, rim, brand) {
        const g = ctx.createRadialGradient(0, 0, rim * 0.9, 0, 0, R);
        g.addColorStop(0, '#22262b');
        g.addColorStop(0.62, '#14171b');
        g.addColorStop(0.9, '#0c0e11');
        g.addColorStop(1, '#07080a');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();

        // Shoulder blocks — the tread edge visible from the side.
        ctx.strokeStyle = 'rgba(255,255,255,.055)'; ctx.lineWidth = Math.max(0.5, R * 0.05);
        for (let i = 0; i < 22; i++) {
            const a = i * TAU / 22;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * R * 0.90, Math.sin(a) * R * 0.90);
            ctx.lineTo(Math.cos(a) * R * 0.985, Math.sin(a) * R * 0.985);
            ctx.stroke();
        }

        const band = (rim + R) / 2;
        // Lettering detail is chosen by how big the wheel actually lands on
        // screen, not by art units: drawTire runs inside a scaled context, so
        // the CTM is the only honest measure of legibility. Below ~14 screen
        // px the brand is sub-pixel anyway and only the raised band reads.
        let px = 0;
        try { const m = ctx.getTransform(); px = Math.hypot(m.a, m.b) * R; } catch (e) { px = 0; }
        if (px > 22 && brand) {
            // Garage scale: real curved lettering. Cars are drawn side-on, so
            // only the NEAR sidewall is visible - lettering the far one too
            // stacks two brands on the same ring and reads as a spiral.
            // Cap height is a fraction of the SIDEWALL, not the radius: a font
            // sized off the radius outgrows the band it has to sit in.
            const fs = Math.max(0.5, (R - rim) * 0.85);
            ctx.font = 'bold ' + fs.toFixed(2) + 'px "Press Start 2P", monospace';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(238,238,232,.9)';
            const n = brand.length;
            const step = Math.min(fs * 0.86 / band, 1.9 / n);   // never wrap past ~110 deg
            for (let i = 0; i < n; i++) {
                ctx.save();
                ctx.rotate((i - (n - 1) / 2) * step);
                ctx.translate(0, -band);
                ctx.fillText(brand[i], 0, 0);
                ctx.restore();
            }
        } else if (px > 11) {
            ctx.strokeStyle = 'rgba(226,226,220,.20)';
            ctx.lineWidth = Math.max(0.5, R * 0.04);
            ctx.setLineDash([Math.max(0.8, R * 0.09), Math.max(0.7, R * 0.07)]);
            ctx.beginPath(); ctx.arc(0, 0, band, 0, TAU); ctx.stroke();
            ctx.setLineDash([]);
        }

        // Bead seat: a bright ring where the tire meets the rim.
        ctx.strokeStyle = 'rgba(255,255,255,.10)'; ctx.lineWidth = Math.max(0.4, R * 0.035);
        ctx.beginPath(); ctx.arc(0, 0, rim * 1.04, 0, TAU); ctx.stroke();
    }

    /* ─── bolt-on parts ───
       Each draws in car space using the anchors renderer.js publishes on
       car._artAnchors, so a part follows whatever silhouette it is fitted to. */

    function drawSpoilerPart(ctx, car, kind) {
        const a = artAnchor(car, 'spoiler');
        const paint = car.secondaryColor || '#22262b';
        const x = a.x, y = a.y, w = a.w;
        if (kind === 'lip') {
            ctx.fillStyle = paint; ctx.fillRect(x, y - 1, w, 1.8);
            ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(x, y - 1, w, 0.6);
        } else if (kind === 'ducktail') {
            ctx.fillStyle = paint;
            ctx.beginPath();
            ctx.moveTo(x, y + 1.5); ctx.lineTo(x + w, y + 0.8);
            ctx.lineTo(x + w - 2, y - 4.2); ctx.lineTo(x + 1.4, y - 3.4);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,.28)';
            ctx.fillRect(x + 1.4, y - 4.2, w - 3.4, 0.8);
        } else if (kind === 'pedestal') {
            // Swan-neck pedestal wing: two uprights carrying a flat blade
            // that clears the deck so it reads against the sky, not the paint.
            const by = y - 5.5;
            ctx.fillStyle = '#191c20';
            ctx.fillRect(x + w * 0.20, by, 2.2, 5.5);
            ctx.fillRect(x + w * 0.68, by, 2.2, 5.5);
            ctx.fillStyle = paint;
            ctx.beginPath();
            ctx.moveTo(x - 1.5, by); ctx.lineTo(x + w + 1.5, by - 1);
            ctx.lineTo(x + w + 1.5, by + 3.8); ctx.lineTo(x - 1.5, by + 4.8);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,.32)';
            ctx.fillRect(x - 1.5, by, w + 3, 0.9);
            ctx.fillStyle = '#191c20';
            ctx.fillRect(x - 3, by - 1.2, 1.9, 6);
            ctx.fillRect(x + w + 1.1, by - 1.4, 1.9, 6);
        } else {
            // GT / race wing: flat plane on two uprights with endplates.
            const gt = kind === 'gt';
            // Blade sized to the decklid it sits on, and kept low: a wing
            // that reaches roof height reads as a roof rack, not a spoiler.
            const pw = w * (gt ? 1.12 : 1.0);
            const drop = gt ? 6 : 4.5;
            const by = y - drop;
            ctx.fillStyle = '#1b1e22';
            ctx.fillRect(x + pw * 0.24, by, 2.2, drop);
            ctx.fillRect(x + pw * 0.70, by, 2.2, drop);
            ctx.fillStyle = gt ? '#101215' : paint;
            ctx.beginPath();
            ctx.moveTo(x - 1, by); ctx.lineTo(x + pw + 1, by - 1.3);
            ctx.lineTo(x + pw + 1, by + 3.4); ctx.lineTo(x - 1, by + 4.7);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,.34)';
            ctx.fillRect(x - 1, by, pw + 2, 1);
            ctx.fillStyle = gt ? '#191c20' : paint;
            ctx.fillRect(x - 2.6, by - 1.8, 2.1, 7);
            ctx.fillRect(x + pw + 0.5, by - 2, 2.1, 7);
        }
    }

    function drawBodyKitPart(ctx, car, kind) {
        const kit = artAnchor(car, 'kit'), rear = artAnchor(car, 'rearWheel'), front = artAnchor(car, 'frontWheel');
        const y = kit.y;
        if (kind === 'stock') return;

        if (kind === 'lip') {
            // Duck-lip splitter + a thin side skirt.
            ctx.fillStyle = '#15181c';
            ctx.beginPath();
            ctx.moveTo(kit.frontX - 1, y + 0.6); ctx.lineTo(kit.frontX + 6, y + 0.6);
            ctx.lineTo(kit.frontX + 6, y - 1.8); ctx.lineTo(kit.frontX - 1, y - 1);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = car.color;
            ctx.fillRect(kit.skirtX, y - 1, kit.skirtW, 2);
            ctx.fillStyle = 'rgba(255,255,255,.24)';
            ctx.fillRect(kit.skirtX, y - 1, kit.skirtW, 0.6);
        } else if (kind === 'wide') {
            // Over-fender flares + deep skirts.
            for (const w of [rear, front]) {
                ctx.strokeStyle = car.color; ctx.lineWidth = 3.4;
                ctx.beginPath(); ctx.arc(w.x, w.y + 2, w.r + 3.6, Math.PI * 1.04, Math.PI * 1.96); ctx.stroke();
                ctx.strokeStyle = 'rgba(255,255,255,.20)'; ctx.lineWidth = 0.8;
                ctx.beginPath(); ctx.arc(w.x, w.y + 2, w.r + 5.2, Math.PI * 1.08, Math.PI * 1.62); ctx.stroke();
            }
            ctx.fillStyle = '#0f1216';
            ctx.beginPath();
            ctx.moveTo(kit.skirtX - 1, y + 0.8); ctx.lineTo(kit.skirtX + kit.skirtW + 1, y + 0.8);
            ctx.lineTo(kit.skirtX + kit.skirtW, y - 2.6); ctx.lineTo(kit.skirtX, y - 2.6);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,.2)';
            ctx.fillRect(kit.skirtX, y - 2.6, kit.skirtW, 0.7);
            ctx.fillStyle = '#0f1216';
            ctx.beginPath();
            ctx.moveTo(kit.frontX - 2, y + 0.6); ctx.lineTo(kit.frontX + 6, y + 0.6);
            ctx.lineTo(kit.frontX + 6, y - 2.4); ctx.lineTo(kit.frontX - 2, y - 1.6);
            ctx.closePath(); ctx.fill();
        } else {
            // Track kit: deep splitter, dive planes, skirts, rear diffuser.
            ctx.fillStyle = '#0d1013';
            ctx.beginPath();
            ctx.moveTo(kit.frontX - 3, y + 1); ctx.lineTo(kit.frontX + 7, y + 1);
            ctx.lineTo(kit.frontX + 7, y - 3.4); ctx.lineTo(kit.frontX - 3, y - 2.2);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,.18)';
            ctx.fillRect(kit.frontX - 3, y - 2.2, 10, 0.7);
            ctx.fillStyle = '#1c2026';                       // dive planes
            for (let i = 0; i < 2; i++) {
                const cy2 = y - 9 - i * 5.5;
                ctx.beginPath();
                ctx.moveTo(kit.frontX - 12, cy2); ctx.lineTo(kit.frontX - 4, cy2 + 1.4);
                ctx.lineTo(kit.frontX - 4, cy2 + 3); ctx.lineTo(kit.frontX - 12, cy2 + 1.7);
                ctx.closePath(); ctx.fill();
            }
            ctx.fillStyle = '#0d1013';
            ctx.beginPath();
            ctx.moveTo(kit.skirtX - 1, y + 1); ctx.lineTo(kit.skirtX + kit.skirtW + 1, y + 1);
            ctx.lineTo(kit.skirtX + kit.skirtW, y - 3.4); ctx.lineTo(kit.skirtX, y - 3.4);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,.2)';
            ctx.fillRect(kit.skirtX, y - 3.4, kit.skirtW, 0.7);
            ctx.fillStyle = '#0d1013';
            ctx.beginPath();
            ctx.moveTo(kit.rearX - 1, y - 2.6); ctx.lineTo(kit.rearX + 10, y - 2.6);
            ctx.lineTo(kit.rearX + 9, y + 1); ctx.lineTo(kit.rearX, y + 1);
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 0.6;
            for (let i = 0; i < 4; i++) {                   // diffuser strakes
                const dx = kit.rearX + 1.6 + i * 2.1;
                ctx.beginPath(); ctx.moveTo(dx, y + 0.9); ctx.lineTo(dx, y - 2.2); ctx.stroke();
            }
        }
    }

    function drawExhaustPart(ctx, car, kind) {
        const a = artAnchor(car, 'exhaust');
        const metal = '#b9c2cb', dark = '#3b424a';
        const tip = (x, y) => {
            ctx.fillStyle = metal; ctx.fillRect(x, y, 3.4, 2.4);
            ctx.fillStyle = dark; ctx.fillRect(x, y, 3.4, 0.7);
            ctx.fillStyle = '#0a0c0e'; ctx.fillRect(x + 2.4, y + 0.4, 1, 1.6);
        };
        if (kind === 'side') {
            ctx.fillStyle = metal;
            ctx.fillRect(a.x, a.y - 6, 22, 2.2);
            ctx.fillStyle = dark; ctx.fillRect(a.x, a.y - 6, 22, 0.7);
            ctx.fillStyle = '#0a0c0e'; ctx.fillRect(a.x + 21, a.y - 5.6, 1.4, 1.6);
        } else if (kind === 'dual') {
            tip(a.x - 1, a.y - 0.4); tip(a.x - 1, a.y + 3.2);
        } else if (kind === 'quad') {
            tip(a.x - 0.6, a.y - 4.2); tip(a.x - 0.6, a.y + 2.4);
            tip(a.x + 3.4, a.y - 4.2); tip(a.x + 3.4, a.y + 2.4);
        } else {
            tip(a.x, a.y + 0.6);
        }
    }

    window.CarArt = {
        CAR_ART, artFor, tracePath, traceLine, poly,
        drawRimFace, drawTire, RIM_STYLES,
        drawSpoilerPart, drawBodyKitPart, drawExhaustPart,
        GROUND, ROCKER,
    };
})();