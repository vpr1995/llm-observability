import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { AggregationType, InstrumentType, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  COST_BUCKETS,
  DURATION_BUCKETS,
  FEEDBACK_RATING_BUCKETS,
  METRIC_NAMES,
  RETRIEVAL_DOCUMENT_COUNT_BUCKETS,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
  TOKEN_USAGE_BUCKETS,
} from './semantic-conventions';

import { config } from '../config';

const traceExporter = new OTLPTraceExporter({
  url: `${config.otelExporterEndpoint}/v1/traces`,
});

const metricExporter = new OTLPMetricExporter({
  url: `${config.otelExporterEndpoint}/v1/metrics`,
});

const periodicMetricReader = new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: 10000,
});

const prometheusMetricReader = new PrometheusExporter({
  host: config.prometheusMetricsHost,
  port: config.prometheusMetricsPort,
  endpoint: config.prometheusMetricsPath,
  preventServerStart: config.nodeEnv === 'test',
}, (error) => {
  if (error) {
    console.error('Failed to start Prometheus metrics exporter', error);
  }
});

export const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [SEMRESATTRS_SERVICE_NAME]: config.serviceName,
    [SEMRESATTRS_SERVICE_VERSION]: config.serviceVersion,
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: config.deploymentEnvironment,
  }),
  traceExporter,
  metricReaders: [periodicMetricReader, prometheusMetricReader],
  views: [
    {
      instrumentName: METRIC_NAMES.GEN_AI_CLIENT_TOKEN_USAGE,
      instrumentType: InstrumentType.HISTOGRAM,
      aggregation: {
        type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
        options: { boundaries: TOKEN_USAGE_BUCKETS },
      },
    },
    {
      instrumentName: METRIC_NAMES.GEN_AI_CLIENT_OPERATION_DURATION,
      instrumentType: InstrumentType.HISTOGRAM,
      aggregation: {
        type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
        options: { boundaries: DURATION_BUCKETS },
      },
    },
    {
      instrumentName: METRIC_NAMES.RAG_RETRIEVAL_DURATION,
      instrumentType: InstrumentType.HISTOGRAM,
      aggregation: {
        type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
        options: { boundaries: DURATION_BUCKETS },
      },
    },
    {
      instrumentName: METRIC_NAMES.RAG_PROMPT_LENGTH,
      instrumentType: InstrumentType.HISTOGRAM,
      aggregation: {
        type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
        options: { boundaries: TOKEN_USAGE_BUCKETS },
      },
    },
    {
      instrumentName: METRIC_NAMES.RAG_RETRIEVAL_DOCUMENT_COUNT,
      instrumentType: InstrumentType.HISTOGRAM,
      aggregation: {
        type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
        options: { boundaries: RETRIEVAL_DOCUMENT_COUNT_BUCKETS },
      },
    },
    {
      instrumentName: METRIC_NAMES.GEN_AI_REQUEST_COST_USD,
      instrumentType: InstrumentType.HISTOGRAM,
      aggregation: {
        type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
        options: { boundaries: COST_BUCKETS },
      },
    },
    {
      instrumentName: METRIC_NAMES.GEN_AI_FEEDBACK_RATING,
      instrumentType: InstrumentType.HISTOGRAM,
      aggregation: {
        type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
        options: { boundaries: FEEDBACK_RATING_BUCKETS },
      },
    },
    {
      instrumentName: METRIC_NAMES.GEN_AI_POSTPROCESS_DURATION,
      instrumentType: InstrumentType.HISTOGRAM,
      aggregation: {
        type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
        options: { boundaries: DURATION_BUCKETS },
      },
    },
    {
      instrumentName: METRIC_NAMES.GEN_AI_POSTPROCESS_OUTPUT_LENGTH,
      instrumentType: InstrumentType.HISTOGRAM,
      aggregation: {
        type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
        options: { boundaries: TOKEN_USAGE_BUCKETS },
      },
    },
  ],
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingRequestHook: (request: { url?: string }) => request.url?.startsWith('/health') ?? false,
      },
    }),
  ],
});

let started = false;
let shutdownPromise: Promise<void> | null = null;
let startupError: string | undefined;
let shutdownInitiated = false;

export const startTelemetry = async (): Promise<void> => {
  if (started) {
    return;
  }

  try {
    await sdk.start();
    started = true;
    startupError = undefined;
  } catch (error) {
    startupError = error instanceof Error ? error.message : 'Unknown telemetry startup error';
    throw error;
  }
};

export const shutdownTelemetry = async (): Promise<void> => {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  shutdownInitiated = true;

  shutdownPromise = sdk
    .shutdown()
    .then(() => undefined)
    .catch((error) => {
      console.error('Error while shutting down telemetry SDK', error);
    });

  return shutdownPromise;
};

export const getTelemetryStatus = () => ({
  started,
  shutdownInitiated,
  startupError,
});

if (config.nodeEnv !== 'test') {
  void startTelemetry().catch((error) => {
    console.error('Failed to start telemetry SDK', error);
  });

  const signalHandler = (): void => {
    void shutdownTelemetry();
  };

  process.once('SIGTERM', signalHandler);
  process.once('SIGINT', signalHandler);
}
