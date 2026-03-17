import React from 'react';
import { useStore, HealthCheck } from '../store';
import { checkHealth, validateApiKey } from '../lib/bridge';
import { CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react';

function makeChecks(): HealthCheck[] {
  return [
    { label: 'Bridge server reachable', status: 'idle', message: '', fix: 'Run the installer script or start the bridge manually.' },
    { label: 'PyMOL plugin connected', status: 'idle', message: '', fix: 'Open PyMOL and type "ai" in the command line.' },
    { label: 'API key valid', status: 'idle', message: '', fix: 'Go to Settings and enter a valid OpenAI API key.' },
    { label: 'Node.js ≥ 18', status: 'idle', message: '', fix: 'Install Node.js 18+ from https://nodejs.org' },
    { label: 'Python ≥ 3.8', status: 'idle', message: '', fix: 'Install Python 3.8+ from https://python.org' },
  ];
}

function semverGte(version: string, minMajor: number, minMinor: number = 0): boolean {
  const parts = version.split('.').map(Number);
  if (parts[0] > minMajor) return true;
  if (parts[0] === minMajor && (parts[1] ?? 0) >= minMinor) return true;
  return false;
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

    // 1) Bridge
    update(0, { status: 'pending', message: 'Checking…' });
    const health = await checkHealth();
    if (health.ok) {
      update(0, { status: 'pass', message: `v${health.version}` });
      // 2) Plugin (from health response)
      update(1, {
        status: health.pluginConnected ? 'pass' : 'fail',
        message: health.pluginConnected ? 'Connected' : 'Not connected',
      });
    } else {
      update(0, { status: 'fail', message: health.error || 'Unreachable' });
      update(1, { status: 'fail', message: 'Cannot check — bridge is down' });
    }

    // 3) API Key
    update(2, { status: 'pending', message: 'Validating…' });
    const keyRes = await validateApiKey();
    update(2, {
      status: keyRes.ok ? 'pass' : 'fail',
      message: keyRes.ok ? 'Valid' : keyRes.error || 'Not configured',
    });

    // 4) Node.js
    update(3, { status: 'pending', message: 'Checking…' });
    try {
      const nodeVer = await window.api?.getNodeVersion?.() || '';
      const ok = nodeVer && semverGte(nodeVer, 18);
      update(3, {
        status: ok ? 'pass' : 'fail',
        message: nodeVer ? `v${nodeVer}` : 'Not found',
      });
    } catch {
      update(3, { status: 'fail', message: 'Check failed' });
    }

    // 5) Python
    update(4, { status: 'pending', message: 'Checking…' });
    try {
      const pyVer = await window.api?.getPythonVersion?.() || '';
      const ok = pyVer && pyVer !== 'not found' && semverGte(pyVer, 3, 8);
      update(4, {
        status: ok ? 'pass' : 'fail',
        message: pyVer && pyVer !== 'not found' ? `v${pyVer}` : 'Not found',
      });
    } catch {
      update(4, { status: 'fail', message: 'Check failed' });
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
