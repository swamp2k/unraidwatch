export type WidgetId =
  | 'stats-cards'
  | 'cpu-ram-chart'
  | 'docker-overview'
  | 'ups-status'
  | 'docker-monitor-status'
  | 'log-monitor-status'
  | 'array-status'
  | 'shares-overview'
  | 'recent-alerts';

export interface WidgetMeta {
  id: WidgetId;
  label: string;
  description: string;
  defaultWidth: 'full' | 'half';
}

export interface WidgetConfig {
  id: WidgetId;
  visible: boolean;
  order: number;
}

export const WIDGET_REGISTRY: Record<WidgetId, WidgetMeta> = {
  'stats-cards':           { id: 'stats-cards',           label: 'Stats Cards',           description: 'CPU, RAM, Temp, Uptime',          defaultWidth: 'full' },
  'cpu-ram-chart':         { id: 'cpu-ram-chart',         label: 'CPU / RAM Chart',       description: 'Real-time area chart',             defaultWidth: 'full' },
  'docker-overview':       { id: 'docker-overview',       label: 'Docker Overview',       description: 'Running / stopped containers',     defaultWidth: 'half' },
  'ups-status':            { id: 'ups-status',            label: 'UPS Status',            description: 'UPS battery, runtime, load',       defaultWidth: 'half' },
  'docker-monitor-status': { id: 'docker-monitor-status', label: 'Docker Monitor',        description: 'Watched container states',         defaultWidth: 'half' },
  'log-monitor-status':    { id: 'log-monitor-status',    label: 'Log Monitor',           description: 'Recent log monitor events',        defaultWidth: 'half' },
  'array-status':          { id: 'array-status',          label: 'Array Status',          description: 'Disk array health & capacity',     defaultWidth: 'half' },
  'shares-overview':       { id: 'shares-overview',       label: 'Shares Overview',       description: 'Share usage summary',              defaultWidth: 'half' },
  'recent-alerts':         { id: 'recent-alerts',         label: 'Recent Alerts',         description: 'Last 5 alert firings',             defaultWidth: 'half' },
};

export const DEFAULT_LAYOUT: WidgetConfig[] = (Object.values(WIDGET_REGISTRY) as WidgetMeta[]).map((w, i) => ({
  id: w.id,
  visible: true,
  order: i,
}));

export function mergeWithRegistry(saved: WidgetConfig[] | undefined): WidgetConfig[] {
  if (!saved || saved.length === 0) return DEFAULT_LAYOUT;
  const existingIds = new Set(saved.map(w => w.id));
  const missing = DEFAULT_LAYOUT.filter(w => !existingIds.has(w.id))
    .map((w, i) => ({ ...w, order: saved.length + i }));
  return [...saved, ...missing];
}
