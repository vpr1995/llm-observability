import './observabilty/instrumentation';

import { startServer } from './app';
import { shutdownTelemetry } from './observabilty/instrumentation';

startServer({
  onShutdown: shutdownTelemetry,
});
