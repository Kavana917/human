import abductionVideo from '../../assets/abduction.mp4';
import flexionVideo from '../../assets/flexion.mp4';
import internalVideo from '../../assets/internalexternal.mp4';
export interface TestLayoutConfig {
  title: string;
  videoSrc: string;
}

export const TEST_LAYOUT_CONFIGS: Record<string, TestLayoutConfig> = {
  'abduction-adduction': {
    title: 'Abduction & Adduction',
    videoSrc: abductionVideo,
  },
  'flexion-extension': {
    title: 'Flexion & Extension',
    videoSrc: flexionVideo,
  },
  'internal-rotation': {
    title: 'Internal Rotation',
    videoSrc: internalVideo,
  },
  'external-rotation': {
    title: 'External Rotation',
    videoSrc: internalVideo,
  },
  'horizontal-abduction-adduction': {
    title: 'Horizontal Abduction & Adduction',
    videoSrc: abductionVideo,
  },
};
