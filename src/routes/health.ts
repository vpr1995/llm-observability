import { Router } from 'express';

import { config } from '../config';
import { getTelemetryStatus } from '../observabilty/instrumentation';

const startedAt = Date.now();

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: config.serviceVersion,
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    telemetry: getTelemetryStatus(),
  });
});
