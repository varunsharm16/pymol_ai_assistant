import React from 'react';
import { HealthCheck } from '../store';
import { checkHealth, validateApiKey, isPackagedApp } from '../lib/bridge';
import { CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react';

function makeChecks(packaged: boolean): HealthCheck[] {
  const checks: HealthCheck[] = [
    { label: 'Backend server reachable', status: 'idle', message: '', fix: packaged ? 'The NexMol backend should start automatically. Try reopening the app.' : 'The NexMol backend should start automatically. Try restarting the app.' },
    { label: 'API key valid', status: 'idle', message: '', fix: 'Go to Settings and enter a valid OpenAI API key.' },
    { label: 'Node.js ≥ 18', status: 'idle', message: '', fix: 'Install Node.js 18+ from https://nodejs.org' },
  ];
  if (!packaged) {
    checks.push({ label: 'Python ≥ 3.8', status: 'idle', message: '', fix: 'Install Python 3.8+ from https://python.org' });
  }
  return checks;
}

function semverGte(version: string, minMajor: number, minMinor: number = 0): boolean {
  const parts = version.split('.').map(Number);
  if (parts[0] > minMajor) return true;
  if (parts[0] === minMajor && (parts[1] ?? 0) >= minMinor) return true;
  return false;
}

const HealthCheckPanel: React.FC = () => {
  const [packaged, setPackaged] = React.useState(false);
  const [checks, setChecks] = React.useState<HealthCheck[]>(makeChecks(false));
  const [running, setRunning] = React.useState(false);

  React.useEffect(() => {
    isPackagedApp().then((value) => {
      setPackaged(value);
      setChecks(makeChecks(value));
    });
  }, []);

  const update = (idx: number, patch: Partial<HealthCheck>) => {
    setChecks((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  const runChecks = async () => {
    setRunning(true);
    const fresh = makeChecks(packaged);
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

    // 3) Node.js
    update(2, { status: 'pending', message: 'Checking…' });
    try {
      const nodeVer = await window.api?.getNodeVersion?.() || '';
      const ok = nodeVer && semverGte(nodeVer, 18);
      update(2, {
        status: ok ? 'pass' : 'fail',
        message: nodeVer ? `v${nodeVer}` : 'Not found',
      });
    } catch {
      update(2, { status: 'fail', message: 'Check failed' });
    }

    if (!packaged) {
      // 4) Python
      update(3, { status: 'pending', message: 'Checking…' });
      try {
        const pyVer = await window.api?.getPythonVersion?.() || '';
        const ok = pyVer && pyVer !== 'not found' && semverGte(pyVer, 3, 8);
        update(3, {
          status: ok ? 'pass' : 'fail',
          message: pyVer && pyVer !== 'not found' ? `v${pyVer}` : 'Not found',
        });
      } catch {
        update(3, { status: 'fail', message: 'Check failed' });
      }
    }

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
