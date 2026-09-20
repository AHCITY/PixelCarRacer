'use strict';

class RaceParticles {
    constructor(ctx) {
        if (!ctx) throw new Error('RaceParticles needs a CanvasRenderingContext2D.');
        this.ctx = ctx;
        this.particles = [];
        this.gearBurst = 0;
        this.boostOrigin = null;
        this.gearOrigin = null;
        this.time = 0;
    }

    static clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
    static random(min, max) { return min + Math.random() * (max - min); }
    static smoothstep(min, max, value) {
        const t = RaceParticles.clamp((value - min) / (max - min), 0, 1);
        return t * t * (3 - 2 * t);
    }

    _spawn(type, x, y, options = {}) {
        const random = RaceParticles.random;
        const defaultLife = type === 'boostFlame' ? random(.16, .28) : random(.5, .85);
        this.particles.push({
            type, x, y, vx: options.vx ?? 0, vy: options.vy ?? 0,
            life: options.life ?? defaultLife, maxLife: options.life ?? defaultLife,
            size: options.size ?? 10, seed: Math.random()
        });
    }

    emitTireSmoke(rearWheelX, rearWheelY, burnout = false) {
        const rate = burnout ? 24 : 14;
        if (Math.random() > rate / 120) return;
        const force = burnout ? 1.05 : .72;
        const baseSize = RaceParticles.random(8, 13);
        this._spawn('smoke', rearWheelX + RaceParticles.random(-2, 4), rearWheelY + RaceParticles.random(-4, 4), {
            vx: RaceParticles.random(-160, -100) * force,
            vy: RaceParticles.random(-12, 8),
            life: RaceParticles.random(.5, .85),
            size: baseSize
        });
    }

    triggerGearFlame(exhaustX, exhaustY) {
        this.gearBurst = 0.7;
        this.gearOrigin = { x: exhaustX, y: exhaustY };
    }

    startBoost(exhaustX, exhaustY) { this.boostOrigin = { x: exhaustX, y: exhaustY }; }
    stopBoost() { this.boostOrigin = null; }

    emitWaterSpray(rearWheelX, rearWheelY) {
        for (let i = 0; i < 2; i++) {
            const angle = RaceParticles.random(-2.85, -1.1), speed = RaceParticles.random(35, 105);
            this._spawn('spray', rearWheelX + RaceParticles.random(-6, 6), rearWheelY + RaceParticles.random(-4, 4), {
                vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                life: RaceParticles.random(.3, .6), size: RaceParticles.random(2, 4)
            });
        }
    }

    update(dt) {
        dt = Math.min(.033, Math.max(0, dt));
        this.time += dt;

        if (this.boostOrigin && Math.random() < dt * 42) {
            this._spawn('boostFlame', this.boostOrigin.x, this.boostOrigin.y, {
                vx: RaceParticles.random(-28, -10), vy: RaceParticles.random(-7, 7), size: RaceParticles.random(12, 18)
            });
        }
        if (this.gearBurst > 0 && this.gearOrigin) {
            if (Math.random() < dt * (20 + 18 * this.gearBurst)) {
                this._spawn('gearFlame', this.gearOrigin.x + RaceParticles.random(-2, 3), this.gearOrigin.y + RaceParticles.random(-4, 4), {
                    vx: RaceParticles.random(-110, -65), vy: RaceParticles.random(-15, 15),
                    life: RaceParticles.random(.22, .38), size: RaceParticles.random(7, 11)
                });
                if (Math.random() < .48) this._spawn('gearSmoke', this.gearOrigin.x - 7, this.gearOrigin.y + RaceParticles.random(-3, 4), {
                    vx: RaceParticles.random(-85, -50), vy: RaceParticles.random(-10, 7),
                    life: RaceParticles.random(.3, .55), size: RaceParticles.random(4, 8)
                });
            }
            this.gearBurst = Math.max(0, this.gearBurst - dt);
        }

        // O(1) Swap-and-Pop for performance [[14]]
        for (let index = this.particles.length - 1; index >= 0; index--) {
            const p = this.particles[index];
            p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
            if (p.type === 'smoke') { p.vx *= 1 - .12 * dt; p.vy += (p.seed - .5) * 8 * dt; p.size += 8 * dt; }
            if (p.type === 'spray') { p.vy += 180 * dt; p.vx -= 17 * dt; p.size *= .992; }
            if (p.type === 'boostFlame') { p.size *= .965; p.vy += (p.seed - .5) * 28 * dt; }
            if (p.type === 'gearFlame') { p.vx *= 1 - .35 * dt; p.vy += (p.seed - .5) * 24 * dt; p.size *= .978; }
            if (p.type === 'gearSmoke') { p.vx *= 1 - .16 * dt; p.vy -= 5 * dt; p.size += 7 * dt; }
            
            if (p.life <= 0) {
                this.particles[index] = this.particles[this.particles.length - 1];
                this.particles.pop();
                continue;
            }
        }
    }

    draw() { this.particles.forEach(p => this._drawParticle(p)); }

    _drawParticle(p) {
        const ctx = this.ctx, age = 1 - p.life / p.maxLife;
        const alpha = RaceParticles.smoothstep(0, .1, age) * (1 - RaceParticles.smoothstep(.5, 1, age));
        const s = p.size;
        ctx.save();

        if (p.type === 'smoke') {
            const lobes = [[-.55,.12,.55],[-.28,-.25,.65],[.06,-.33,.68],[.38,-.11,.60],[.52,.22,.48],[0,.22,.72]];
            ctx.globalAlpha = .38 * alpha; ctx.fillStyle = '#d0d8e0';
            for (const [x, y, scale] of lobes) { ctx.beginPath(); ctx.arc(p.x + x * s, p.y + y * s, s * scale, 0, Math.PI * 2); ctx.fill(); }
            ctx.globalAlpha = .44 * alpha; ctx.fillStyle = '#f0f4f8';
            for (const [x, y, scale] of lobes.slice(1)) { ctx.beginPath(); ctx.arc(p.x + x * s * .9, p.y + y * s * .9 - 2, s * scale * .78, 0, Math.PI * 2); ctx.fill(); }
            ctx.globalAlpha = .08 * alpha; ctx.fillStyle = '#8a9aaa'; ctx.beginPath(); ctx.ellipse(p.x, p.y + s * .38, s * .68, s * .16, 0, 0, Math.PI * 2); ctx.fill();
        } else if (p.type === 'spray') {
            ctx.globalAlpha = alpha; ctx.fillStyle = '#dff7ff'; ctx.shadowColor = '#7dd3fc'; ctx.shadowBlur = 4;
            ctx.beginPath(); ctx.ellipse(p.x, p.y, s * .2, s * .48, 0, 0, Math.PI * 2); ctx.fill();
        } else if (p.type === 'gearSmoke') {
            const gradient = ctx.createRadialGradient(p.x - s * .12, p.y - s * .18, 1, p.x, p.y, s);
            gradient.addColorStop(0, 'rgba(255,220,150,.55)'); gradient.addColorStop(.4, 'rgba(140,85,50,.30)'); gradient.addColorStop(1, 'rgba(60,40,35,0)');
            ctx.globalAlpha = .6 * alpha; ctx.fillStyle = gradient; ctx.beginPath(); ctx.ellipse(p.x, p.y, s * 1.2, s * .5, 0, 0, Math.PI * 2); ctx.fill();
        } else { this._drawFlame(p, alpha); }
        ctx.restore();
    }

    _drawFlame(p, alpha) {
        const ctx = this.ctx, gear = p.type === 'gearFlame';
        const length = p.size * (gear ? 1.3 + p.seed * .35 : 1.7 + p.seed * .65), height = p.size * (gear ? .25 + p.seed * .09 : .30 + p.seed * .11);
        ctx.translate(p.x, p.y);
        const tongue = (color, scale) => { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(4, 0); ctx.quadraticCurveTo(-length * .30, -height * scale, -length, 0); ctx.quadraticCurveTo(-length * .28, height * scale, 4, 0); ctx.fill(); };
        ctx.globalAlpha = .72 * alpha; tongue(gear ? '#9f1239' : '#ef4444', 1);
        ctx.globalAlpha = .85 * alpha; tongue('#fb923c', .65);
        ctx.globalAlpha = alpha; tongue('#fde047', .35);
        ctx.globalAlpha = .78 * alpha; tongue('#e0f2fe', .15);
    }
}