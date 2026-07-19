import { Navigate, useParams } from 'react-router-dom';
import { getMovementById } from './testConfigs';
import MovementTest from './AbductionAdduction';

/**
 * Legacy wrapper: all configured movements use the shared MovementTest recorder.
 * Unknown ids redirect to test selection.
 */
export default function StandardTestPage() {
  const { testId } = useParams();
  if (!getMovementById(testId)) {
    return <Navigate to="/tests" replace />;
  }
  return <MovementTest />;
}
