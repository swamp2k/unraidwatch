import { useState, useEffect, useRef } from 'react';
import { API_BASE } from '../lib/api';

export interface SSEData {
  stats?: { cpu_pct: number; ram_pct: number; ram_used_gb: number; ram_total_gb: number; uptime_s: number; temp_avg: number };
  docker?: Array<{ id: string; name: string; status: string; cpu_pct: number; mem_mb: number }>;
  vms?: Array<{ id: string; name: string; status: string; cpu_pct: number; mem_gb: number }>;
  array?: { status: string; capacity_used_tb: number; capacity_total_tb: number; disks: unknown[]; cache: unknown[] };
  shares?: Array<{ name: string; used_gb: number; total_gb: number; pct: number }>;
  ups?: { model: string; status: string; battery_pct: number; runtime_min: number; load_pct: number };
}

export function useSSE(): SSEData {
  const [data, setData] = useState<SSEData>({});
  const esRef = useRef<EventSource | null>(null);

  function connect() {
    if (esRef.current) esRef.current.close();
    const es = new EventSource(`${API_BASE}/api/sse`, { withCredentials: true });
    esRef.current = es;

    const handle = (event: string) => es.addEventListener(event, (e: MessageEvent) => {
      setData(d => ({ ...d, [event]: JSON.parse(e.data as string) }));
    });

    handle('stats');
    handle('docker');
    handle('vms');
    handle('array');
    handle('shares');
    handle('ups');

    es.onerror = () => {
      es.close();
      esRef.current = null;
      setTimeout(connect, 5000);
    };
  }

  useEffect(() => {
    connect();
    return () => esRef.current?.close();
  }, []);

  return data;
}
