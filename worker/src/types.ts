export interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
  ENVIRONMENT: string;
  APP_URL: string;
  ENCRYPTION_KEY: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
  SMTP_HOST: string;
  SMTP_PORT: string;
  SMTP_USER: string;
  SMTP_PASS: string;
}

export interface User {
  id: string;
  email: string;
  role: 'admin' | 'user';
}

export interface SessionData {
  user_id: string;
  created_at: number;
}

export interface ServerConfig {
  id: string;
  user_id: string;
  label: string;
  url: string;
  api_key: string;
  verified_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface AIConfig {
  id: string;
  user_id: string;
  provider: 'claude' | 'gemini' | 'openai';
  api_key: string;
  default_model: string;
}

export interface AIAnalysis {
  severity: 'ok' | 'warning' | 'critical';
  summary: string;
  findings: Array<{
    issue: string;
    cause: string;
    fix: string;
  }>;
}

export interface AlertRule {
  id: string;
  user_id: string;
  name: string;
  metric: string;
  operator: 'gt' | 'lt' | 'eq' | 'contains';
  threshold: string;
  enabled: number;
  created_at: number;
}

export interface PushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}
