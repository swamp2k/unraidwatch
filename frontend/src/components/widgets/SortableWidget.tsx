import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Eye, EyeOff } from 'lucide-react';
import type { WidgetConfig } from '../../lib/widgetRegistry';
import { WIDGET_REGISTRY } from '../../lib/widgetRegistry';

interface Props {
  config: WidgetConfig;
  editMode: boolean;
  onToggleVisible: (id: string) => void;
  children: React.ReactNode;
}

export function SortableWidget({ config, editMode, onToggleVisible, children }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: config.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    gridColumn: WIDGET_REGISTRY[config.id]?.defaultWidth === 'full' ? '1 / -1' : undefined,
  };

  const meta = WIDGET_REGISTRY[config.id];

  return (
    <div ref={setNodeRef} style={style} className={editMode ? 'widget-edit-wrapper' : ''}>
      {editMode && (
        <div className="widget-edit-bar">
          <button className="widget-drag-handle" {...attributes} {...listeners} type="button" aria-label="Drag to reorder">
            <GripVertical size={14} />
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>{meta?.label}</span>
          <button
            type="button"
            className="btn-ghost"
            style={{ padding: '2px 6px', fontSize: 12 }}
            onClick={() => onToggleVisible(config.id)}
            title={config.visible ? 'Hide widget' : 'Show widget'}
          >
            {config.visible ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>
        </div>
      )}
      {children}
    </div>
  );
}
