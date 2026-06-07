import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface ChartPoint { time: string; cpu: number; ram: number }

interface Props {
  history: ChartPoint[];
}

export function CpuRamChart({ history }: Props) {
  return (
    <div className="card">
      <div style={{ fontWeight: 600, marginBottom: 12 }}>CPU &amp; RAM (last 30s)</div>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={history}>
          <defs>
            <linearGradient id="cpu" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="ram" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} unit="%" />
          <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }} />
          <Area type="monotone" dataKey="cpu" name="CPU" stroke="#6366f1" fill="url(#cpu)" strokeWidth={2} dot={false} />
          <Area type="monotone" dataKey="ram" name="RAM" stroke="#22c55e" fill="url(#ram)" strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
