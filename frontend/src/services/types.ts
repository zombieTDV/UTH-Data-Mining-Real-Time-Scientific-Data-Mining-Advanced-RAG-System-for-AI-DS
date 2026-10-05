export type ServiceResult<T> = {
  data: T;
  status: number;
  ok: boolean;
};

export interface StreamEvent {
  type: string;
  payload?: unknown;
}

export interface StreamHandlers<T> {
  onData: (data: T) => void;
  onError?: (err: unknown) => void;
}

export interface UnsubscribeFn {
  (): void;
}
