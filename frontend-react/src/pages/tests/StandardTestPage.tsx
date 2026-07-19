import { Navigate, useParams } from 'react-router-dom';
import { getMovementById } from './testConfigs';
import MovementTestRecorder from './MovementTestRecorder';

/**
 * Fallback for movements that do not yet have a dedicated page
 * (flexion, extension, IR, ER). Abduction/adduction use their own routes.
 */
export default function StandardTestPage() {
  const { testId } = useParams();
  if (testId === 'abduction') {
    return <Navigate to="/test/abduction" replace />;
  }
  if (testId === 'adduction') {
    return <Navigate to="/test/adduction" replace />;
  }
  if (!getMovementById(testId)) {
    return <Navigate to="/tests" replace />;
  }
  return <MovementTestRecorder />;
}
