import type { LucideIcon } from 'lucide-react';
import { Activity, Compass, RotateCcw, RotateCw, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import abductionVideo from '../../assets/abduction.mp4';
import flexionVideo from '../../assets/flexion.mp4';
import internalVideo from '../../assets/internalexternal.mp4';

/** ML model movement_id — must match backend/ml_models/<id>/ and kinematics_model. */
export type MlMovementId =
  | 'abduction'
  | 'adduction'
  | 'flexion'
  | 'extension'
  | 'internal_rotation'
  | 'external_rotation';

export interface RomAnnotation {
  value: number;
  label: string;
  color: string;
}

export interface ArmMovementConfig {
  /** URL segment: /test/<id> */
  id: string;
  /** Short UI title */
  title: string;
  /** Card description on test selection */
  desc: string;
  /** Stored in Supabase test_results.test_type */
  testType: string;
  /** Passed to kinematics_model.predict_expected */
  mlMovementId: MlMovementId;
  videoSrc: string;
  icon: LucideIcon;
  /** Primary IMU angle for this motion */
  hardwareAngle: 'roll' | 'pitch' | 'yaw';
  romInstructions: string[];
  expectedRanges: string;
  /** ROM chart Y max */
  romYMax: number;
  /** Horizontal reference lines on ROM chart */
  romAnnotations: RomAnnotation[];
  /** Fallback stability hold targets when no ROM yet */
  stabilityFallbackTargets: number[];
  speedInstructions: string[];
  speedTips: string;
  stabilityInstructions: string[];
}

export const ARM_MOVEMENTS: ArmMovementConfig[] = [
  {
    id: 'abduction',
    title: 'Abduction',
    desc: 'Raise the arm out to the side, away from the body (coronal plane).',
    testType: 'Arm - Abduction',
    mlMovementId: 'abduction',
    videoSrc: abductionVideo,
    icon: Activity,
    hardwareAngle: 'roll',
    romInstructions: [
      'Stand upright with the arm relaxed at your side (starting position).',
      'Click "Start Recording" to calibrate the baseline.',
      'Slowly raise the arm out to the side as high as comfortable.',
      'Hold briefly at your maximum, then lower the arm.',
      'Click "Stop Recording" when complete.',
    ],
    expectedRanges: 'Shoulder level (~90°) | Full abduction (~150–175° GH)',
    romYMax: 200,
    romAnnotations: [
      { value: 90, label: 'Shoulder Level (90°)', color: 'rgba(34, 197, 94, 0.8)' },
      { value: 150, label: 'Full Abduction (150°)', color: 'rgba(59, 130, 246, 0.8)' },
      { value: 180, label: 'Maximum (180°)', color: 'rgba(239, 68, 68, 0.8)' },
    ],
    stabilityFallbackTargets: [45, 90, 135, 150],
    speedInstructions: [
      'Click "Start Recording" to begin.',
      'During the 3-second countdown, keep your arm down at your side.',
      'You will do 3 max-effort ramps: raise your arm out to the side as fast as possible, then return down.',
      'Rest briefly between attempts with the arm down.',
    ],
    speedTips: 'Peak °/s is measured during the raise. Complete ROM first so speed uses your max angle.',
    stabilityInstructions: [
      'Complete the ROM test first so targets match your range.',
      'Start with the arm down; click Start Recording.',
      'Move to each prompted angle and hold steady (5 s countdown + 5 s hold).',
      'Targets are typically near 45°, 90°, 135°, and your max.',
    ],
  },
  {
    id: 'adduction',
    title: 'Adduction',
    desc: 'From arm-down neutral, raise the arm out to the side (same IMU sense as abduction; smaller ROM band).',
    testType: 'Arm - Adduction',
    mlMovementId: 'adduction',
    videoSrc: abductionVideo,
    icon: ArrowDownLeft,
    hardwareAngle: 'roll',
    romInstructions: [
      'Stand upright with both arms relaxed down at your sides.',
      'Click "Start Recording" — this arm-down pose is 0° (neutral baseline).',
      'Slowly raise the testing arm out to the side (away from the body).',
      'Aim for at least ~50° of relative rise from baseline, then lower back down.',
      'Click "Stop Recording" when complete.',
    ],
    expectedRanges: 'Target relative ROM ≥ ~50° from arm-down (IMU: ~−90° at side → ~0° at shoulder level)',
    romYMax: 110,
    romAnnotations: [
      { value: 25, label: 'Partial (25°)', color: 'rgba(34, 197, 94, 0.8)' },
      { value: 50, label: 'Target (50°)', color: 'rgba(59, 130, 246, 0.8)' },
      { value: 90, label: 'Shoulder level (~90°)', color: 'rgba(239, 68, 68, 0.8)' },
    ],
    stabilityFallbackTargets: [33, 50],
    speedInstructions: [
      'Click "Start Recording" to begin.',
      'During the 3-second countdown, keep your arm down at your side (0° baseline).',
      'You will do 3 max-effort ramps: raise the arm out to the side as fast as possible, then return down.',
      'Rest briefly with the arm down between attempts.',
    ],
    speedTips: 'Peak °/s is measured on the raise from arm-down. Aim for a clear rise past ~50° relative.',
    stabilityInstructions: [
      'Complete the ROM test first — your max angle becomes the second hold target.',
      'Start with the arm down; click Start Recording.',
      'Hold 1: raise to about 30–35° and stay steady (5 s countdown + 5 s hold).',
      'Hold 2: raise to your ROM max from part 1 and hold the same way.',
    ],
  },
  {
    id: 'flexion',
    title: 'Flexion',
    desc: 'Raise the arm forward and upward in front of the body (sagittal plane).',
    testType: 'Arm - Flexion',
    mlMovementId: 'flexion',
    videoSrc: flexionVideo,
    icon: ArrowUpRight,
    hardwareAngle: 'roll',
    romInstructions: [
      'Stand upright with the arm relaxed at your side (starting position).',
      'Click "Start Recording" — this arm-down pose is 0° (neutral baseline).',
      'Slowly raise the arm forward and up as far as comfortable (toward shoulder level).',
      'Hold briefly at your maximum, then lower the arm.',
      'Click "Stop Recording" when complete.',
    ],
    expectedRanges: 'GH flexion band ~65–90° relative from arm-down (shoulder level ≈ ~90°)',
    romYMax: 110,
    romAnnotations: [
      { value: 45, label: 'Mid (45°)', color: 'rgba(34, 197, 94, 0.8)' },
      { value: 70, label: 'Typical (70°)', color: 'rgba(59, 130, 246, 0.8)' },
      { value: 90, label: 'Shoulder / cap (90°)', color: 'rgba(239, 68, 68, 0.8)' },
    ],
    stabilityFallbackTargets: [45, 90],
    speedInstructions: [
      'Click "Start Recording" to begin.',
      'During the 3-second countdown, keep your arm down at your side.',
      'You will do 3 max-effort ramps: raise the arm forward as fast as possible, then return down.',
      'Rest briefly with the arm down between attempts.',
    ],
    speedTips: 'Peak °/s is measured on the forward raise. Complete ROM first so speed uses your max angle.',
    stabilityInstructions: [
      'Complete the ROM test first — your max angle becomes the second hold target.',
      'Start with the arm down; click Start Recording.',
      'Hold 1: raise forward to about 45° and stay steady (5 s countdown + 5 s hold).',
      'Hold 2: raise to your ROM max (often near shoulder level) and hold the same way.',
    ],
  },
  {
    id: 'extension',
    title: 'Extension',
    desc: 'Move the arm backward behind the body (sagittal plane).',
    testType: 'Arm - Extension',
    mlMovementId: 'extension',
    videoSrc: flexionVideo,
    icon: Compass,
    hardwareAngle: 'roll',
    romInstructions: [
      'Stand upright with the arm relaxed at your side (starting position).',
      'Click "Start Recording" — this arm-down pose is 0° (neutral baseline).',
      'Slowly move the arm backward behind you as far as comfortable.',
      'Hold briefly at your maximum, then return to your side.',
      'Click "Stop Recording" when complete.',
    ],
    expectedRanges: 'Typical GH extension ~25–50° relative from arm-down (positive °)',
    romYMax: 70,
    romAnnotations: [
      { value: 15, label: 'Light (15°)', color: 'rgba(34, 197, 94, 0.8)' },
      { value: 35, label: 'Typical (35°)', color: 'rgba(59, 130, 246, 0.8)' },
      { value: 50, label: 'Full (50°)', color: 'rgba(239, 68, 68, 0.8)' },
    ],
    stabilityFallbackTargets: [50],
    speedInstructions: [
      'Click "Start Recording" to begin.',
      'During the 3-second countdown, keep your arm down at your side.',
      'You will do 3 max-effort ramps: move the arm back as fast as possible, then return down.',
      'Rest briefly with the arm down between attempts.',
    ],
    speedTips: 'Peak °/s is measured on the backward move. Complete ROM first so speed uses your max angle.',
    stabilityInstructions: [
      'Complete the ROM test first — your max angle is the only hold target.',
      'Start with the arm down; click Start Recording.',
      'Move back to your ROM max and hold steady (5 s countdown + 5 s hold).',
      'Only one stability position: your ROM max. No intermediate angles.',
    ],
  },
  {
    id: 'internal-rotation',
    title: 'Internal Rotation',
    desc: 'Rotate the upper arm inward so the forearm turns toward the body.',
    testType: 'Arm - Internal Rotation',
    mlMovementId: 'internal_rotation',
    videoSrc: internalVideo,
    icon: RotateCw,
    hardwareAngle: 'yaw',
    romInstructions: [
      'Keep the upper arm at your side with the elbow bent ~90° (forearm forward).',
      'Click "Start Recording" to calibrate the baseline.',
      'Rotate the forearm inward toward the belly as far as comfortable.',
      'Hold briefly at your maximum, then return.',
      'Click "Stop Recording" when complete.',
    ],
    expectedRanges: 'Typical internal rotation ~50–85° (glenohumeral)',
    romYMax: 100,
    romAnnotations: [
      { value: 30, label: 'Light (30°)', color: 'rgba(34, 197, 94, 0.8)' },
      { value: 55, label: 'Typical (55°)', color: 'rgba(59, 130, 246, 0.8)' },
      { value: 85, label: 'Full (85°)', color: 'rgba(239, 68, 68, 0.8)' },
    ],
    stabilityFallbackTargets: [25, 45, 60, 75],
    speedInstructions: [
      'Click "Start Recording", wait for countdown, then perform 3 max-effort inward rotations.',
    ],
    speedTips: 'Recording for this movement will be fully wired in a later pass.',
    stabilityInstructions: [
      'Complete ROM first, then hold at prompted internal-rotation angles.',
    ],
  },
  {
    id: 'external-rotation',
    title: 'External Rotation',
    desc: 'Rotate the upper arm outward so the forearm turns away from the body.',
    testType: 'Arm - External Rotation',
    mlMovementId: 'external_rotation',
    videoSrc: internalVideo,
    icon: RotateCcw,
    hardwareAngle: 'yaw',
    romInstructions: [
      'Keep the upper arm at your side with the elbow bent ~90° (forearm forward).',
      'Click "Start Recording" to calibrate the baseline.',
      'Rotate the forearm outward away from the body as far as comfortable.',
      'Hold briefly at your maximum, then return.',
      'Click "Stop Recording" when complete.',
    ],
    expectedRanges: 'Typical external rotation ~45–80° (glenohumeral)',
    romYMax: 100,
    romAnnotations: [
      { value: 25, label: 'Light (25°)', color: 'rgba(34, 197, 94, 0.8)' },
      { value: 50, label: 'Typical (50°)', color: 'rgba(59, 130, 246, 0.8)' },
      { value: 80, label: 'Full (80°)', color: 'rgba(239, 68, 68, 0.8)' },
    ],
    stabilityFallbackTargets: [25, 40, 55, 70],
    speedInstructions: [
      'Click "Start Recording", wait for countdown, then perform 3 max-effort outward rotations.',
    ],
    speedTips: 'Recording for this movement will be fully wired in a later pass.',
    stabilityInstructions: [
      'Complete ROM first, then hold at prompted external-rotation angles.',
    ],
  },
];

export const TEST_LAYOUT_CONFIGS: Record<string, ArmMovementConfig> = Object.fromEntries(
  ARM_MOVEMENTS.map((m) => [m.id, m])
);

/** Analysis / dashboard dropdown options (value = stored test_type). */
export const TEST_TYPE_OPTIONS = ARM_MOVEMENTS.map((m) => ({
  value: m.testType,
  label: m.testType,
  mlMovementId: m.mlMovementId,
}));

export function getMovementById(testId: string | undefined): ArmMovementConfig | null {
  if (!testId) return null;
  return TEST_LAYOUT_CONFIGS[testId] ?? null;
}

export function getMovementByTestType(testType: string): ArmMovementConfig | null {
  return ARM_MOVEMENTS.find((m) => m.testType === testType) ?? null;
}

/** Legacy combined labels → current canonical test_type (for old DB rows). */
export const LEGACY_TEST_TYPE_MAP: Record<string, string> = {
  AbductionAdduction: 'Arm - Abduction',
  'Arm - Abduction & Adduction': 'Arm - Abduction',
  'Arm - Flexion & Extension': 'Arm - Flexion',
  'Arm - Horizontal Abduction & Adduction': 'Arm - Abduction',
};

/** Display / filter label for any stored test_type (legacy or current). */
export function displayTestType(testType: string | null | undefined): string {
  if (!testType) return 'Unknown test';
  return LEGACY_TEST_TYPE_MAP[testType] ?? testType;
}
