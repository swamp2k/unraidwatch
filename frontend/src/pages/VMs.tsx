import { TopBar } from '../components/layout/TopBar';
import { useSSE } from '../hooks/useSSE';
import { api } from '../lib/api';
import { Play, Square } from 'lucide-react';
import { useState } from 'react';

export function VMs() {
  const sse = useSSE();
  const [actioning, setActioning] = useState<string | null>(null);

  async function action(id: string, act: 'start' | 'stop') {
    setActioning(`${id}-${act}`);
    try { await api.post(`/api/unraid/vms/${id}/${act}`); } finally { setActioning(null); }
  }

  const vms = sse.vms ?? [];

  return (
    <>
      <TopBar title="Virtual Machines" />
      <div className="page">
        <div className="card">
          {vms.length === 0 ? (
            <div className="empty-state"><h3>No VMs</h3><p>No virtual machines configured.</p></div>
          ) : (
            <table className="table">
              <thead><tr><th>Name</th><th>Status</th><th>Memory</th><th>Actions</th></tr></thead>
              <tbody>
                {vms.map(vm => (
                  <tr key={vm.id}>
                    <td>{vm.name}</td>
                    <td><span className={`badge badge-${vm.status === 'running' ? 'running' : 'stopped'}`}>{vm.status}</span></td>
                    <td>{vm.mem_gb} GB</td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn-ghost" style={{ padding: '4px 8px' }} onClick={() => void action(vm.id, 'start')} disabled={actioning !== null}><Play size={14} /></button>
                        <button className="btn-ghost" style={{ padding: '4px 8px' }} onClick={() => void action(vm.id, 'stop')} disabled={actioning !== null}><Square size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
