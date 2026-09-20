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