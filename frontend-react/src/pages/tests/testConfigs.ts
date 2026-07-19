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
  /** Primary IMU angle for this motion (recording axis wiring comes later) */
  hardwareAngle: 'roll' | 'pitch' | 'yaw';
  romInstructions: string[];
  expectedRanges: string;
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
  },
  {
    id: 'adduction',
    title: 'Adduction',
    desc: 'Bring the arm back in toward the body from the side (coronal plane).',
    testType: 'Arm - Adduction',
    mlMovementId: 'adduction',
    videoSrc: abductionVideo,
    icon: ArrowDownLeft,
    hardwareAngle: 'roll',
    romInstructions: [
      'Start with the arm raised slightly out to the side.',
      'Click "Start Recording" to calibrate the baseline.',
      'Slowly bring the arm in toward the body as far as comfortable.',
      'Hold briefly at your maximum adduction, then return.',
      'Click "Stop Recording" when complete.',
    ],
    expectedRanges: 'Typical adduction ~30–50° (glenohumeral)',
  },
  {
    id: 'flexion',
    title: 'Flexion',
    desc: 'Raise the arm forward and upward in front of the body (sagittal plane).',
    testType: 'Arm - Flexion',
    mlMovementId: 'flexion',
    videoSrc: flexionVideo,
    icon: ArrowUpRight,
    hardwareAngle: 'pitch',
    romInstructions: [
      'Stand upright with the arm relaxed at your side.',
      'Click "Start Recording" to calibrate the baseline.',
      'Slowly raise the arm forward and up as far as comfortable.',
      'Hold briefly at your maximum, then lower the arm.',
      'Click "Stop Recording" when complete.',
    ],
    expectedRanges: 'Model / GH flexion band ~65–90° (not full overhead clinical ROM)',
  },
  {
    id: 'extension',
    title: 'Extension',
    desc: 'Move the arm backward behind the body (sagittal plane).',
    testType: 'Arm - Extension',
    mlMovementId: 'extension',
    videoSrc: flexionVideo,
    icon: Compass,
    hardwareAngle: 'pitch',
    romInstructions: [
      'Stand upright with the arm relaxed at your side.',
      'Click "Start Recording" to calibrate the baseline.',
      'Slowly move the arm backward behind you as far as comfortable.',
      'Hold briefly at your maximum, then return.',
      'Click "Stop Recording" when complete.',
    ],
    expectedRanges: 'Typical extension ~25–50° (glenohumeral)',
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
