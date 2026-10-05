import { API_CONFIG } from '../../config';
import { APP_CONFIG } from '../../config';
import type { UnsubscribeFn } from '../types';

export interface StreamChatOptions {
  query: string;
  category?: string;
  topK?: number;
  onToken: (token: string) => void;
  onDone: () => void;
  onError?: (err: unknown) => void;
}

export function streamChatQuery(options: StreamChatOptions): UnsubscribeFn {
  const controller = new AbortController();
  const topK = options.topK ?? APP_CONFIG.defaultRagTopK;
  const body = { query: options.query, category: options.category, top_k: topK };
  runStream(controller, body, options);
  return () => controller.abort();
}

function runStream(
  controller: AbortController,
  body: { query: string; category?: string; top_k: number },
  options: StreamChatOptions,
): void {
  const onToken = options.onToken;
  const onDone = options.onDone;
  const onError = options.onError;
  const url = API_CONFIG.baseUrl + API_CONFIG.endpoints.chatStream;
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
    .then((response) => {
      if (!response.ok) throw new Error("Streaming failed: " + response.statusText);
      return readStream(response, onToken, onDone);
    })
    .catch((err) => {
      if (err.name !== "AbortError" && onError) onError(err);
    });
}

async function readStream(
  response: Response,
  onToken: (token: string) => void,
  onDone: () => void,
): Promise<void> {
  const reader = response.body && response.body.getReader();
  if (!reader) throw new Error("No readable stream available");
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() || "";
    handleStreamLines(parts, onToken, onDone);
  }
  onDone();
}

function handleStreamLines(
  parts: string[],
  onToken: (token: string) => void,
  onDone: () => void,
): void {
  for (let i = 0; i < parts.length; i++) {
    const trimmed = parts[i].trim();
    if (trimmed.startsWith("data: ")) {
      const dataStr = trimmed.slice(6).trim();
      if (dataStr === "[DONE]") {
        onDone();
        return;
      }
      try {
        const parsed = JSON.parse(dataStr);
        if (parsed.token) {
          onToken(parsed.token);
        }
      } catch {
        onToken(dataStr);
      }
    }
  }
}

