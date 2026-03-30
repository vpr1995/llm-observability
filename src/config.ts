import dotenv from 'dotenv';

dotenv.config();

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const required = ['OTEL_EXPORTER_OTLP_ENDPOINT'];

const llmUseMock = (process.env.LLM_USE_MOCK ?? 'true').toLowerCase() === 'true';
const llmProvider = process.env.LLM_PROVIDER ?? 'openai';

if (llmProvider === 'openai' && !llmUseMock) {
  required.push('OPENAI_API_KEY');
}

const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseNumber(process.env.PORT, 3000),
  prometheusMetricsHost: process.env.PROMETHEUS_METRICS_HOST ?? '0.0.0.0',
  prometheusMetricsPort: parseNumber(process.env.PROMETHEUS_METRICS_PORT, 9464),
  prometheusMetricsPath: process.env.PROMETHEUS_METRICS_PATH ?? '/metrics',
  serviceName: process.env.SERVICE_NAME ?? 'llm-service',
  serviceVersion: process.env.SERVICE_VERSION ?? '1.0.0',
  deploymentEnvironment: process.env.DEPLOYMENT_ENVIRONMENT ?? 'dev',

  otelExporterEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318',

  llmProvider,
  llmModel: process.env.LLM_MODEL ?? 'gpt-4',
  llmTimeoutMs: parseNumber(process.env.LLM_TIMEOUT_MS, 30000),
  llmMaxRetries: parseNumber(process.env.LLM_MAX_RETRIES, 3),
  llmPricing: {
    inputUsdPerMillionTokens: parseNumber(process.env.LLM_INPUT_PRICE_PER_MTOKEN_USD, 30),
    outputUsdPerMillionTokens: parseNumber(process.env.LLM_OUTPUT_PRICE_PER_MTOKEN_USD, 60),
  },
  llmUseMock,
  openaiApiKey: process.env.OPENAI_API_KEY,

  privacy: {
    redactIncomingContent: (process.env.PRIVACY_REDACT_INCOMING_CONTENT ?? 'false').toLowerCase() === 'true',
    redactOutgoingContent: (process.env.PRIVACY_REDACT_OUTGOING_CONTENT ?? 'false').toLowerCase() === 'true',
  },

  logLevel: process.env.LOG_LEVEL ?? 'info',
  lokiUrl: process.env.LOKI_URL ?? 'http://localhost:3100',
};

export type AppConfig = typeof config;
