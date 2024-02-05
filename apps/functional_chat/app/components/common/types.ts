// TODO: tried to move it into fireworks/lib/types, had a build of build errros.
export interface Completion {
  text: string;
  numTokens: number;
}

export interface ChatMessageContentImageURL {
  url: string;
}

export interface ChatMessageContent {
  type: string;
  text?: string;
  image_url?: ChatMessageContentImageURL;
}

export interface FunctionCall {
  name: string;
  arguments: string;
}

export interface ToolCall {
  id: string;
  type: string;
  function: FunctionCall;
}

export interface ChatMessage {
  id: string;
  role: string;
  content: string | ChatMessageContent[];
  toolCallId?: string;
  toolCalls?: ToolCall[];
  metadata?: {
    firstTokenTime?: number;
    totalTokens?: number;
    averageTokenTime?: number;
    perplexity?: any;
    used?: boolean;
    hide?: boolean;
  };
}

export interface DeltaMessage {
  role: string;
  content?: string;
}

export interface ChatCompletionResponseStreamChoice {
  index: number;
  delta: DeltaMessage;
  finish_reason?: string;
  logprobs?: LogProbs;
}

export interface ChatCompletionStreamResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatCompletionResponseStreamChoice[];
}

export interface LogProbs {
  tokens: string[];
}

export interface Choice {
  text: string;
  index: number;
  finish_reason: string;
  logprobs?: LogProbs;
}

export interface CompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Choice[];
}

interface Card {
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
}

export interface PaymentMethod {
  id: string;
  card: Card;
}
