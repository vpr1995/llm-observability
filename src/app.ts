import express, { Express } from 'express';
import http from 'http';

import { config } from './config';
import { getLogger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { requestIdMiddleware } from './middleware/requestId';
import { sessionCorrelationMiddleware } from './middleware/sessionCorrelation';
import { redactionMiddleware } from './middleware/redaction';
import { LlmClient, llmClient } from './pipeline/llmClient';
import { healthRouter } from './routes/health';
import { createFeedbackRouter } from './routes/feedback';
import { createQueryRouter } from './routes/query';

const logger = getLogger({ service: config.serviceName });

export const createApp = (client: LlmClient = llmClient): Express => {
  const app = express();

  app.use(requestIdMiddleware);
  app.use(sessionCorrelationMiddleware);
  app.use(redactionMiddleware(config.privacy));

  app.use(healthRouter);
  app.use(createQueryRouter(client));
  app.use(createFeedbackRouter());

  app.use(errorHandler);

  return app;
};

export interface StartServerOptions {
  client?: LlmClient;
  onShutdown?: () => Promise<void>;
  registerSignalHandlers?: boolean;
}

export const startServer = (options: StartServerOptions = {}): http.Server => {
  const app = createApp(options.client ?? llmClient);

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'LLM observability server started');
  });

  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info({ signal }, 'Shutdown signal received');

    server.close(async (closeError) => {
      if (closeError) {
        logger.error({ err: closeError }, 'Error while closing HTTP server');
      }

      if (options.onShutdown) {
        await options.onShutdown();
      }

      logger.info('Graceful shutdown completed');
      process.exit(closeError ? 1 : 0);
    });

    setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing process exit');
      process.exit(1);
    }, 10_000).unref();
  };

  const shouldRegisterSignals = options.registerSignalHandlers ?? true;

  if (shouldRegisterSignals) {
    process.once('SIGTERM', () => {
      void shutdown('SIGTERM');
    });

    process.once('SIGINT', () => {
      void shutdown('SIGINT');
    });
  }

  return server;
};
