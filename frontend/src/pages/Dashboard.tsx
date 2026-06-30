import { useState, useEffect, useRef, useMemo } from 'react';
import { TopBar } from '../components/layout/TopBar';
import { useSSE } from '../hooks/useSSE';
import { api } from '../lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { Settings2, Check } from 'lucide-react';
import { type WidgetConfig, WIDGET_REGISTRY, DEFAULT_LAYOUT, mergeWithRegistry } from '../lib/widgetRegistry';
import { SortableWidget } from '../components/widgets/SortableWidget';
import { StatsCards } from '../components/widgets/StatsCards';
import { CpuRamChart } from '../components/widgets/CpuRamChart';
import { NetworkChart } from '../components/widgets/NetworkChart';
import { DockerOverview } from '../components/widgets/DockerOverview';
import { UpsStatus } from '../components/widgets/UpsStatus';
import { DockerMonitorStatus } from '../components/widgets/DockerMonitorStatus';
import { LogMonitorStatus } from '../components/widgets/LogMonitorStatus';
import { ArrayStatus } from '../components/widgets/ArrayStatus';
import { SharesOverview } from '../components/widgets/SharesOverview';
import { RecentAlerts } from '../components/widgets/RecentAlerts';

interface ChartPoint { ts: number; time: string; cpu: number; ram: number; temp: number }
interface NetPoint   { ts: number; time: string; rx: number; tx: number }

function WidgetRenderer({ id, sse, history, netHistory }: {
  id: string;
  sse: ReturnType<typeof useSSE>;
  history: ChartPoint[];
  netHistory: NetPoint[];
}) {
  switch (id) {
    case 'stats-cards':           return <StatsCards stats={sse.stats} />;
    case 'cpu-ram-chart':         return <CpuRamChart history={history} />;
    case 'network-chart':         return <NetworkChart liveHistory={netHistory} />;
    case 'docker-overview':       return <DockerOverview containers={sse.docker} />;
    case 'ups-status':            return <UpsStatus ups={sse.ups} />;
    case 'docker-monitor-status': return <DockerMonitorStatus />;
    case 'log-monitor-status':    return <LogMonitorStatus />;
    case 'array-status':          return <ArrayStatus array={sse.array} />;
    case 'shares-overview':       return <SharesOverview shares={sse.shares} />;
    case 'recent-alerts':         return <RecentAlerts />;
    default:                      return null;
  }
}

interface ServerStatus {
  availability_enabled: number;
  offline_since: number | null;
  last_online_at: number | null;
}

export function Dashboard() {
  const qc = useQueryClient();
  const sse = useSSE();
  const [history, setHistory] = useState<ChartPoint[]>([]);
  const [netHistory, setNetHistory] = useState<NetPoint[]>([]);
  const historyRef = useRef(history);
  historyRef.current = history;
  const [editMode, setEditMode] = useState(false);

  const { data: serverStatus } = useQuery<ServerStatus | null>({
    queryKey: ['server-config'],
    queryFn: () => api.get('/api/server'),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!sse.stats) return;
    const ts = Math.floor(Date.now() / 1000);
    const time = new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setHistory(h => [...h.slice(-359), { ts, time, cpu: sse.stats!.cpu_pct, ram: sse.stats!.ram_pct, temp: sse.stats!.temp_avg }]);
    setNetHistory(h => [...h.slice(-359), { ts, time, rx: sse.stats!.net_rx_kbps ?? 0, tx: sse.stats!.net_tx_kbps ?? 0 }]);
  }, [sse.stats]);

  const { data: savedLayout } = useQuery<WidgetConfig[]>({
    queryKey: ['dashboard-layout'],
    queryFn: () => api.get('/api/monitors/dashboard-layout'),
  });

  const mergedLayout = useMemo(() => mergeWithRegistry(savedLayout), [savedLayout]);
  const [localLayout, setLocalLayout] = useState<WidgetConfig[]>(DEFAULT_LAYOUT);

  // Sync from server on first load
  useEffect(() => {
    if (savedLayout !== undefined) {
      setLocalLayout(mergeWithRegistry(savedLayout));
    }
  }, [savedLayout]);

  const saveLayout = useMutation({
    mutationFn: (layout: WidgetConfig[]) => api.put('/api/monitors/dashboard-layout', layout),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dashboard-layout'] });
      setEditMode(false);
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setLocalLayout(prev => {
      const oldIndex = prev.findIndex(w => w.id === active.id);
      const newIndex = prev.findIndex(w => w.id === over.id);
      return arrayMove(prev, oldIndex, newIndex).map((w, i) => ({ ...w, order: i }));
    });
  }

  function handleToggleVisible(id: string) {
    setLocalLayout(prev => prev.map(w => w.id === id ? { ...w, visible: !w.visible } : w));
  }

  function cancelEdit() {
    setLocalLayout(mergedLayout);
    setEditMode(false);
  }

  const sortedLayout = [...localLayout].sort((a, b) => a.order - b.order);

  // In non-edit mode show only visible widgets; in edit mode show all so user can toggle them
  const displayWidgets = editMode
    ? sortedLayout
    : sortedLayout.filter(w => w.visible);

  return (
    <>
      <TopBar title="Dashboard" />
      <div className="page">
        {serverStatus?.availability_enabled && serverStatus.offline_since && (
          <div style={{
            background: 'var(--danger)',
            color: '#fff',
            borderRadius: 8,
            padding: '10px 16px',
            marginBottom: 16,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <span style={{ fontWeight: 600 }}>Server offline</span>
            <span style={{ opacity: 0.85 }}>
              — unreachable since {new Date(serverStatus.offline_since * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}

        {/* Edit mode controls */}
        <div className="flex justify-between items-center mb-4">
          <div />
          {!editMode ? (
            <button
              className="btn-ghost"
              style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
              onClick={() => setEditMode(true)}
            >
              <Settings2 size={14} /> Customize
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }} onClick={cancelEdit}>
                Cancel
              </button>
              <button
                className="btn-primary"
                style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
                onClick={() => saveLayout.mutate(localLayout)}
                disabled={saveLayout.isPending}
              >
                <Check size={14} /> {saveLayout.isPending ? 'Saving…' : 'Save layout'}
              </button>
            </div>
          )}
        </div>

        {editMode && (
          <div className="card mb-4" style={{ background: 'var(--bg)', fontSize: 13, color: 'var(--text-muted)' }}>
            Drag widgets to reorder. Toggle the eye icon to show/hide. Click "Save layout" when done.
          </div>
        )}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sortedLayout.map(w => w.id)} strategy={verticalListSortingStrategy}>
            <div className="dashboard-grid">
              {displayWidgets.map(w => (
                <SortableWidget
                  key={w.id}
                  config={w}
                  editMode={editMode}
                  onToggleVisible={handleToggleVisible}
                >
                  {(editMode && !w.visible) ? (
                    <div
                      className="card"
                      style={{
                        opacity: 0.4,
                        gridColumn: WIDGET_REGISTRY[w.id]?.defaultWidth === 'full' ? '1 / -1' : undefined,
                      }}
                    >
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>
                        {WIDGET_REGISTRY[w.id]?.label} (hidden)
                      </div>
                    </div>
                  ) : (
                    <WidgetRenderer id={w.id} sse={sse} history={history} netHistory={netHistory} />
                  )}
                </SortableWidget>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </>
  );
}
