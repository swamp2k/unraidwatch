export function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatTemp(c: number): string {
  return `${c}°C`;
}

export function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

export function progressColor(pct: number): string {
  if (pct >= 90) return 'danger';
  if (pct >= 75) return 'warn';
  return '';
}

export function formatKbps(kbps: number): string {
  if (kbps <= 0) return '—';
  if (kbps >= 1_000_000) return `${(kbps / 1_000_000).toFixed(1)} GB/s`;
  if (kbps >= 1_000) return `${(kbps / 1_000).toFixed(1)} MB/s`;
  return `${kbps} KB/s`;
}
