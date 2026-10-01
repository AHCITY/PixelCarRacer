'use strict';

/* ─── Physics Constants ─── */
const WHEEL_RADIUS = 0.33;
const DRIVETRAIN_EFFICIENCY = 0.90;
const AIR_DENSITY = 1.225;
const G = 9.81;
const MPS_TO_MPH = 2.23694; // Renamed from MPH_PER_MS for accuracy
const FIXED_DT = 1 / 120;
const MAX_SUBSTEPS = 5;
const AUTO_SHIFT_ENABLED = false;

/* ─── Shift Windows ─── */
const SHIFT_PERFECT_LOW  = 0.88;
const SHIFT_PERFECT_HIGH = 0.98;
const SHIFT_GOOD_LOW     = 0.75;

/* ─── Shift Bonuses ─── */
const BONUS_PERFECT = 0.10;
const BONUS_GOOD    = 0.03;
const BONUS_EARLY   = -0.12;
const BONUS_LATE    = 0.00;
const BONUS_TIME_PERFECT = 0.6;
const BONUS_TIME_GOOD    = 0.3;
const BONUS_TIME_EARLY   = 0.7;

/* ─── Engine Thresholds ─── */
const LUG_RPM_LOW  = 600;
const LUG_RPM_HIGH = 1600;
const IDLE_RPM     = 1000;
const ENGINE_BRAKE_MAX = 3500;

/* ─── Multiplayer ─── */
const MP_WIN_PRIZE          = 300;  // normal multiplayer win
const MP_LOSS_PRIZE         = 50;   // normal multiplayer loss (consolation)
const MP_FALSE_START_BONUS  = 75;   // small reward when the OTHER player jumps the light
const MP_START_LEAD_MS      = 300;  // buffer between "host decides to start" and the synchronized instant
const MP_INPUT_HZ           = 20;   // how often held-input state is re-sent as a heartbeat
const MP_SYNC_MS            = 300;  // how often an authoritative position snapshot is sent
const MP_OUTCOME_TIMEOUT_MS = 1500; // how long to wait for the peer's race-result report before falling back to local data
const MP_STAGING_FALLBACK_MS = 20000; // host auto-starts the countdown if the opponent never revs at the line
const MP_DISCONNECT_GRACE_MS = 2500;  // WebRTC 'disconnected' can be transient — wait before declaring the peer lost

/* ─── Multiplayer Tournament (best-of-3 series) ─── */
const MP_TOURNEY_HEAT_WIN     = 150; // per-heat payout for winning a tournament heat
const MP_TOURNEY_HEAT_LOSS    = 50;  // per-heat consolation for losing a tournament heat
const MP_TOURNEY_BONUS        = 600; // champion bonus for taking the series (first to 2 heat wins)
const MP_TOURNEY_RUNNER_BONUS = 100; // runner-up bonus for losing the series
