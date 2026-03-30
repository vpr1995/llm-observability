import { trace } from '@opentelemetry/api';
import pino, { Bindings, Logger, LoggerOptions } from 'pino';

import { config } from '../config';

const pinoLevelToSeverityNumber = (level: number): number => {
  if (level >= 60) {
    return 21;
  }

  if (level >= 50) {
    return 17;
  }

  if (level >= 40) {
    return 13;
  }

  if (level >= 30) {
    return 9;
  }

  if (level >= 20) {
    return 5;
  }

  return 1;
};

const loggerOptions: LoggerOptions = {
  level: config.logLevel,
  base: undefined,
  timestamp: pino.stdTimeFunctions.epochTime,
  mixin(_context, level) {
    const activeSpan = trace.getActiveSpan();
    const spanContext = activeSpan?.spanContext();

    return {
      trace_id: spanContext?.traceId,
      span_id: spanContext?.spanId,
      severity_number: pinoLevelToSeverityNumber(level),
    };
  },
};

const lokiTarget: pino.TransportTargetOptions = {
  target: 'pino-loki',
  options: {
    host: config.lokiUrl,
    batching: true,
    interval: 2,
    labels: { job: config.serviceName },
  },
};

const prettyTarget: pino.TransportTargetOptions = {
  target: 'pino-pretty',
  options: {
    colorize: true,
    translateTime: 'SYS:standard',
    ignore: 'pid,hostname',
  },
};

const transport =
  config.nodeEnv === 'development'
    ? pino.transport({ targets: [prettyTarget, lokiTarget] })
    : pino.transport(lokiTarget);

export const logger: Logger = pino(loggerOptions, transport);

export const getLogger = (bindings?: Bindings): Logger => {
  if (!bindings) {
    return logger;
  }

  return logger.child(bindings);
};
