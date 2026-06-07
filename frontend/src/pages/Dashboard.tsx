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
import { DockerOverview } from '../components/widgets/DockerOverview';
import { UpsStatus } from '../components/widgets/UpsStatus';
import { DockerMonitorStatus } from '../components/widgets/DockerMonitorStatus';
import { LogMonitorStatus } from '../components/widgets/LogMonitorStatus';
import { ArrayStatus } from '../components/widgets/ArrayStatus';
import { SharesOverview } from '../components/widgets/SharesOverview';
import { RecentAlerts } from '../components/widgets/RecentAlerts';

interface ChartPoint { time: string; cpu: number; ram: number }

function WidgetRenderer({ id, sse, history }: {
  id: string;
  sse: ReturnType<typeof useSSE>;
  history: ChartPoint[];
}) {
  switch (id) {
    case 'stats-cards':           return <StatsCards stats={sse.stats} />;
    case 'cpu-ram-chart':         return <CpuRamChart history={history} />;
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

export function Dashboard() {
  const qc = useQueryClient();
  const sse = useSSE();
  const [history, setHistory] = useState<ChartPoint[]>([]);
  const historyRef = useRef(history);
  historyRef.current = history;
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    if (!sse.stats) return;
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setHistory(h => [...h.slice(-29), { time: now, cpu: sse.stats!.cpu_pct, ram: sse.stats!.ram_pct }]);
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
                    <WidgetRenderer id={w.id} sse={sse} history={history} />
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
