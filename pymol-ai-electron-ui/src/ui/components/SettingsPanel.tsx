import React from 'react';
import { useStore } from '../store';
import { getAppVersion, saveApiKey, validateApiKey } from '../lib/bridge';
import { Eye, EyeOff, CheckCircle, XCircle, Loader2 } from 'lucide-react';

const SettingsPanel: React.FC = () => {
  const setApiKeyConfigured = useStore((s) => s.setApiKeyConfigured);
  const [key, setKey] = React.useState('');
  const [show, setShow] = React.useState(false);
  const [status, setStatus] = React.useState<'idle' | 'validating' | 'valid' | 'invalid' | 'saving' | 'saved' | 'error'>('idle');
  const [msg, setMsg] = React.useState('');
  const [version, setVersion] = React.useState('0.2.1-alpha');

  React.useEffect(() => {
    getAppVersion().then(setVersion);
  }, []);

  const handleValidate = async () => {
    if (!key.trim()) return;
    setStatus('validating');
    setMsg('');
    const res = await validateApiKey(key.trim());
    if (res.ok) {
      setStatus('valid');
      setMsg(res.message || 'Key is valid');
    } else {
      setStatus('invalid');
      setMsg(res.error || 'Invalid key');
    }
  };

  const handleSave = async () => {
    if (!key.trim()) return;
    setStatus('saving');
    const res = await saveApiKey(key.trim());
    if (res.ok) {
      setStatus('saved');
      setMsg('API key saved successfully');
      setApiKeyConfigured(true);
    } else {
      setStatus('error');
      setMsg(res.error || 'Failed to save');
    }
  };

  const statusColor =
    status === 'valid' || status === 'saved'
      ? 'text-emerald-400'
      : status === 'invalid' || status === 'error'
        ? 'text-red-400'
        : 'text-neutral-400';

  return (
    <div className="h-full flex flex-col bg-[#2A2A2A]">
      <div className="px-4 py-3 text-sm uppercase tracking-wide text-neutral-300 bg-neutral-900">
        Settings
      </div>

      <div className="p-4 space-y-4 overflow-auto flex-1">
        {/* API Key */}
        <div>
          <label className="block text-sm text-neutral-300 mb-2">
            OpenAI API Key
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <input
                type={show ? 'text' : 'password'}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="sk-..."
                className="w-full h-10 px-3 pr-10 rounded-xl bg-neutral-900 outline-none text-sm"
              />
              <button
                onClick={() => setShow(!show)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-200"
                title={show ? 'Hide' : 'Show'}
              >
                {show ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <div className="flex gap-2 mt-3">
            <button
              onClick={handleValidate}
              disabled={!key.trim() || status === 'validating'}
              className="px-4 h-9 rounded-full bg-neutral-700 hover:bg-neutral-600 text-sm disabled:opacity-40"
            >
              {status === 'validating' ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Validating…
                </span>
              ) : (
                'Validate'
              )}
            </button>
            <button
              onClick={handleSave}
              disabled={!key.trim() || status === 'saving'}
              className="px-4 h-9 rounded-full bg-brand hover:bg-brandHover text-black text-sm font-medium disabled:opacity-40"
            >
              {status === 'saving' ? 'Saving…' : 'Save Key'}
            </button>
          </div>

          {/* Status feedback */}
          {msg && (
            <div className={`mt-3 flex items-center gap-2 text-sm ${statusColor}`}>
              {(status === 'valid' || status === 'saved') && (
                <CheckCircle className="w-4 h-4" />
              )}
              {(status === 'invalid' || status === 'error') && (
                <XCircle className="w-4 h-4" />
              )}
              {msg}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="text-xs text-neutral-500 leading-relaxed">
          Your API key is stored locally in <code>~/.pymol/config.json</code> with
          restricted permissions. It is never sent anywhere except OpenAI's API.
        </div>

        {/* Version / attribution */}
        <div className="pt-4 border-t border-neutral-700 space-y-1">
          <div className="text-xs text-neutral-500">
            NexMol <span className="text-neutral-300">v{version}</span>
          </div>
          <div className="text-xs text-neutral-500">
            Created by <span className="text-neutral-300">Varun Sharma</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
