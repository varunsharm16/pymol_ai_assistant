import React from 'react';
import { HealthCheck } from '../store';
import { checkHealth, validateApiKey } from '../lib/bridge';
import { CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react';

function makeChecks(): HealthCheck[] {
  return [
    { label: 'Backend server reachable', status: 'idle', message: '', fix: 'The NexMol backend should start automatically. Try reopening the app.' },
    { label: 'API key valid', status: 'idle', message: '', fix: 'Go to Settings and enter a valid OpenAI API key.' },
  ];
}

const HealthCheckPanel: React.FC = () => {
  const [checks, setChecks] = React.useState<HealthCheck[]>(makeChecks());
  const [running, setRunning] = React.useState(false);

  const update = (idx: number, patch: Partial<HealthCheck>) => {
    setChecks((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  const runChecks = async () => {
    setRunning(true);
    const fresh = makeChecks();
    setChecks(fresh.map((c) => ({ ...c, status: 'pending' })));

    // 1) Backend
    update(0, { status: 'pending', message: 'Checking…' });
    const health = await checkHealth();
    if (health.ok) {
      update(0, { status: 'pass', message: `v${health.version}` });
    } else {
      update(0, { status: 'fail', message: health.error || 'Unreachable' });
    }

    // 2) API Key
    update(1, { status: 'pending', message: 'Validating…' });
    const keyRes = await validateApiKey();
    update(1, {
      status: keyRes.ok ? 'pass' : 'fail',
      message: keyRes.ok ? 'Valid' : keyRes.error || 'Not configured',
    });

    setRunning(false);
  };

  const icon = (status: HealthCheck['status']) => {
    if (status === 'pass') return <CheckCircle className="w-4 h-4 text-emerald-400" />;
    if (status === 'fail') return <XCircle className="w-4 h-4 text-red-400" />;
    if (status === 'pending') return <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />;
    return <div className="w-4 h-4 rounded-full border border-neutral-600" />;
  };

  return (
    <div className="h-full flex flex-col bg-[#2A2A2A]">
      <div className="px-4 py-3 text-sm uppercase tracking-wide text-neutral-300 bg-neutral-900">
        System Check
      </div>

      <div className="p-4 space-y-3 overflow-auto flex-1">
        {checks.map((c, i) => (
          <div key={i} className="rounded-xl bg-neutral-900 p-3">
            <div className="flex items-center gap-2">
              {icon(c.status)}
              <span className="text-sm font-medium">{c.label}</span>
            </div>
            {c.message && (
              <div className={`text-xs mt-1 ml-6 ${c.status === 'fail' ? 'text-red-400' : 'text-neutral-400'}`}>
                {c.message}
              </div>
            )}
            {c.status === 'fail' && c.fix && (
              <div className="text-xs mt-1 ml-6 text-yellow-500/80">
                💡 {c.fix}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="p-4">
        <button
          onClick={runChecks}
          disabled={running}
          className="w-full h-10 rounded-full bg-brand hover:bg-brandHover text-black font-medium flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {running ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Running…
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" /> Run System Check
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default HealthCheckPanel;
