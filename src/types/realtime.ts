export type SessionStatus = "DISCONNECTED" | "CONNECTING" | "CONNECTED";

export interface FunctionArgs {
  [key: string]: unknown;
}

export interface FunctionResult {
  [key: string]: unknown;
}

export interface Arguments {
  [key: string]: unknown;
}

export interface Content {
  type: string;
  text?: string;
  transcript?: string;
  name?: string;
  arguments?: Arguments;
  [key: string]: unknown;
}

export interface TranscriptItem {
  itemId: string;
  type: "MESSAGE" | "BREADCRUMB";
  role?: "user" | "assistant";
  title?: string;
  data?: Record<string, unknown>;
  expanded: boolean;
  timestamp: string;
  createdAtMs: number;
  status: "IN_PROGRESS" | "DONE";
  isHidden: boolean;
}

export interface LoggedEvent {
  id: number;
  direction: "client" | "server";
  expanded: boolean;
  timestamp: string;
  eventName: string;
  eventData: Record<string, unknown>;
}
