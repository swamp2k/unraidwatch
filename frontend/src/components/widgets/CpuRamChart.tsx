import { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface ChartPoint { time: string; cpu: number; ram: number; temp?: number }

interface Props {
  history: ChartPoint[];
}

const WINDOWS = [
  { label: '2m',  points: 24 },
  { label: '5m',  points: 60 },
  { label: '15m', points: 180 },
  { label: '30m', points: 360 },
] as const;

type Window = typeof WINDOWS[number]['label'];

export function CpuRamChart({ history }: Props) {
  const [window, setWindow] = useState<Window>('5m');

  const points = WINDOWS.find(w => w.label === window)!.points;
  const slice = history.slice(-points);

  // X-axis: show a label only every ~6 points to avoid crowding
  const tickInterval = Math.max(1, Math.floor(points / 6));

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <span style={{ fontWeight: 600, fontSize: 14 }}>CPU &amp; RAM</span>
        <div className="flex gap-1">
          {WINDOWS.map(w => (
            <button
              key={w.label}
              onClick={() => setWindow(w.label)}
              className={window === w.label ? 'btn-primary' : 'btn-ghost'}
              style={{ padding: '3px 10px', fontSize: 11 }}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {slice.length < 2 ? (
        <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Collecting data…
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={slice} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
            <defs>
              <linearGradient id="gCpu" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gRam" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
              interval={tickInterval}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
              unit="%"
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              formatter={(v: number) => `${v}%`}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Area type="monotone" dataKey="cpu" name="CPU" stroke="#6366f1" fill="url(#gCpu)" strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="ram" name="RAM" stroke="#22c55e" fill="url(#gRam)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
