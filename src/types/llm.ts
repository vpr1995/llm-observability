export interface RetrievedDocument {
  id: string;
  content: string;
  score: number;
  source: string;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmResponse {
  id: string;
  model: string;
  finishReasons: string[];
  content: string;
  usage: LlmUsage;
  startedAt?: number;
  completedAt?: number;
  estimatedCostUsd?: number;
}

export type SimulatedLlmError = 'timeout' | 'rate_limit' | 'provider';

export interface LLMGenerateOptions {
  prompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  simulateError?: SimulatedLlmError;
}