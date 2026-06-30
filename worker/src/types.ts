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
  availability_enabled: number;
  offline_since: number | null;
  last_online_at: number | null;
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

export interface DockerMonitor {
  id: string;
  user_id: string;
  container_id: string;
  container_name: string;
  enabled: number;
  notify_email: number;
  notify_record: number;
  notify_action: number;
  action_type: 'start' | 'stop' | 'restart' | null;
  check_interval_s: number;
  cooldown_s: number;
  last_checked_at: number | null;
  last_fired_at: number | null;
  last_status: string | null;
  created_at: number;
}

export interface LogMonitor {
  id: string;
  user_id: string;
  name: string;
  enabled: number;
  source_type: 'syslog' | 'docker';
  source_id: string | null;
  source_label: string | null;
  keywords: string;
  notify_email: number;
  notify_record: number;
  notify_action: number;
  action_container_id: string | null;
  action_type: 'start' | 'stop' | 'restart' | null;
  cursor: string | null;
  check_interval_s: number;
  cooldown_s: number;
  last_checked_at: number | null;
  last_fired_at: number | null;
  created_at: number;
}

export interface MonitorEvent {
  id: string;
  user_id: string;
  monitor_type: 'docker' | 'log' | 'server_availability';
  monitor_id: string;
  monitor_name: string;
  detail: string;
  actions_taken: string;
  fired_at: number;
}

export interface UserRow {
  id: string;
  email: string;
  url: string;
  api_key: string;
  email_alerts: number;
  push_alerts: number;
  alert_min_severity: string;
}
