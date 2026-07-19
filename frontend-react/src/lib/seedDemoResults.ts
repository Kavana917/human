import { supabase } from '../supabaseClient';
import { ARM_MOVEMENTS } from '../pages/tests/testConfigs';

/** Per-movement healthy-ish bands (aligned with ML / glenohumeral ranges). */
const MOVEMENT_BANDS: Record<
  string,
  {
    romStart: number;
    romEnd: number;
    speedStart: number;
    speedEnd: number;
    sdStart: number;
    sdEnd: number;
    refMax: number;
    phaseTargets: number[];
  }
> = {
  'Arm - Abduction': {
    romStart: 95,
    romEnd: 155,
    speedStart: 55,
    speedEnd: 115,
    sdStart: 4.8,
    sdEnd: 1.6,
    refMax: 175,
    phaseTargets: [45, 90, 135, 150],
  },
  'Arm - Adduction': {
    romStart: 22,
    romEnd: 48,
    speedStart: 45,
    speedEnd: 95,
    sdStart: 3.8,
    sdEnd: 1.2,
    refMax: 52,
    phaseTargets: [33, 48],
  },
  'Arm - Flexion': {
    romStart: 55,
    romEnd: 85,
    speedStart: 50,
    speedEnd: 105,
    sdStart: 4.2,
    sdEnd: 1.4,
    refMax: 90,
    phaseTargets: [45, 85],
  },
  'Arm - Extension': {
    romStart: 20,
    romEnd: 48,
    speedStart: 40,
    speedEnd: 90,
    sdStart: 3.2,
    sdEnd: 0.9,
    refMax: 52,
    phaseTargets: [15, 25, 35, 45],
  },
  'Arm - Internal Rotation': {
    romStart: 42,
    romEnd: 78,
    speedStart: 35,
    speedEnd: 85,
    sdStart: 3.6,
    sdEnd: 1.2,
    refMax: 90,
    phaseTargets: [25, 45, 60, 75],
  },
  'Arm - External Rotation': {
    romStart: 38,
    romEnd: 75,
    speedStart: 35,
    speedEnd: 85,
    sdStart: 3.6,
    sdEnd: 1.2,
    refMax: 85,
    phaseTargets: [25, 40, 55, 70],
  },
};

const SIDES = ['left', 'right'] as const;
const SESSIONS = [
  { daysAgo: 28, progress: 0.0 },
  { daysAgo: 18, progress: 0.35 },
  { daysAgo: 9, progress: 0.75 },
  { daysAgo: 1, progress: 1.0 },
];

const RESEED_FLAG = 'stryde_demo_reseed_v3';

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function jitter(n: number, amp: number) {
  return n + (Math.random() * 2 - 1) * amp;
}

function buildRecord(
  userId: string,
  testType: string,
  side: 'left' | 'right',
  daysAgo: number,
  progress: number
) {
  const band = MOVEMENT_BANDS[testType];
  const baseRom = Math.max(5, jitter(lerp(band.romStart, band.romEnd, progress), 3));
  const baseSd = Math.max(0.5, jitter(lerp(band.sdStart, band.sdEnd, progress), 0.25));
  const basePeak = Math.max(15, jitter(lerp(band.speedStart, band.speedEnd, progress), 4));
  const attemptPeaks = [
    Math.round(Math.max(15, basePeak + jitter(-7, 3)) * 10) / 10,
    Math.round(Math.max(15, basePeak + jitter(0, 5)) * 10) / 10,
    Math.round(Math.max(15, basePeak + jitter(4, 4)) * 10) / 10,
  ];
  const bestPeak = Math.round(Math.max(...attemptPeaks) * 10) / 10;
  const avgPeak =
    Math.round((attemptPeaks.reduce((s, v) => s + v, 0) / attemptPeaks.length) * 10) / 10;

  const created = new Date(Date.now() - daysAgo * 86400000).toISOString();
  const times = Array.from({ length: 50 }, (_, i) => Math.round(i * 0.1 * 100) / 100);
  const rolls = times.map((_, i) =>
    Math.round(baseRom * (1 - Math.abs((i - 25) / 25)) * 100) / 100
  );
  const pitches = times.map(() => Math.round((Math.random() * 10 - 5) * 100) / 100);

  const phases = band.phaseTargets;
  const results: Record<string, object> = {};
  phases.forEach((target, i) => {
    results[String(i)] = {
      target_angle: target,
      std_deviation: Math.round(baseSd * (1 + i * 0.05) * 100) / 100,
      range: Math.round((4 + i) * 10) / 10,
      mean_angle: Math.round((target - 0.5) * 10) / 10,
      sample_count: 100,
    };
  });

  return {
    user_id: userId,
    test_type: testType,
    side,
    created_at: created,
    rom_data: {
      status: 'ok',
      times,
      rolls,
      maxIdx: 25,
      maxTime: times[25],
      maxRoll: Math.round(baseRom * 10) / 10,
      baseline: 0,
      baselineSet: true,
      referenceRanges: {
        shoulderLevel: Math.round(band.refMax * 0.55),
        fullAbduction: Math.round(band.refMax * 0.9),
        maximum: band.refMax,
      },
    },
    stability_data: {
      status: 'ok',
      times,
      pitches,
      rolls,
      currentPhase: phases.length - 1,
      targetAngle: phases[phases.length - 1],
      currentAngle: phases[phases.length - 1] - 0.5,
      zoneStatus: 'holding',
      progress: 1.0,
      progressType: 'hold',
      inTargetZone: true,
      testComplete: true,
      romMaxAngle: Math.round(baseRom * 10) / 10,
      romAvailable: true,
      results,
    },
    speed_data: {
      status: 'ok',
      speedPhase: 'complete',
      speedProgress: 1.0,
      speedAttempt: 3,
      speedAttemptTotal: 3,
      speedAttemptPeaks: attemptPeaks,
      speedCurrentRampPeak: 0.0,
      peakAngularVelocity: bestPeak,
      bestPeakAngularVelocity: bestPeak,
      avgPeakAngularVelocity: avgPeak,
      speedPeakAngularVelocity: bestPeak,
      speedTestComplete: true,
      speedUserMaxAngle: Math.round(baseRom * 10) / 10,
      romMaxAngle: Math.round(baseRom * 10) / 10,
      romAvailable: true,
      times,
      rolls,
      currentAngle: 5.0,
    },
  };
}

/**
 * Wipe all test_results for the user and insert fresh demo sessions
 * for all 6 ML-aligned movements (both sides, 4 sessions each).
 * Runs at most once per browser (localStorage flag) unless force=true.
 */
export async function reseedAllDemoResults(force = false): Promise<{ inserted: number } | null> {
  if (!force && localStorage.getItem(RESEED_FLAG) === 'done') {
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');

  const { error: delErr } = await supabase.from('test_results').delete().eq('user_id', user.id);
  if (delErr) throw delErr;

  const rows = [];
  for (const m of ARM_MOVEMENTS) {
    for (const side of SIDES) {
      for (const s of SESSIONS) {
        rows.push(buildRecord(user.id, m.testType, side, s.daysAgo, s.progress));
      }
    }
  }

  const { error: insErr } = await supabase.from('test_results').insert(rows);
  if (insErr) throw insErr;

  localStorage.setItem(RESEED_FLAG, 'done');
  return { inserted: rows.length };
}
