import React from 'react';
import { useStore } from '../store';
import { saveApiKey, validateApiKey } from '../lib/bridge';
import { Key, CheckCircle, XCircle, Loader2 } from 'lucide-react';

type Props = { open: boolean; onClose: () => void };

const ApiKeyModal: React.FC<Props> = ({ open, onClose }) => {
  const setApiKeyConfigured = useStore((s) => s.setApiKeyConfigured);
  const setShowApiKeyModal = useStore((s) => s.setShowApiKeyModal);
  const [key, setKey] = React.useState('');
  const [status, setStatus] = React.useState<'idle' | 'validating' | 'saving' | 'done' | 'error'>('idle');
  const [msg, setMsg] = React.useState('');

  if (!open) return null;

  const handleSave = async () => {
    if (!key.trim()) return;

    setStatus('validating');
    setMsg('Validating key…');
    const valRes = await validateApiKey(key.trim());
    if (!valRes.ok) {
      setStatus('error');
      setMsg(valRes.error || 'Key validation failed');
      return;
    }

    setStatus('saving');
    setMsg('Saving…');
    const saveRes = await saveApiKey(key.trim());
    if (saveRes.ok) {
      setStatus('done');
      setMsg('API key saved! You\'re all set.');
      setApiKeyConfigured(true);
      setTimeout(() => {
        setShowApiKeyModal(false);
        onClose();
      }, 1200);
    } else {
      setStatus('error');
      setMsg(saveRes.error || 'Failed to save');
    }
  };

  const handleSkip = () => {
    setShowApiKeyModal(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleSkip} />

      {/* Modal */}
      <div className="relative w-[420px] rounded-2xl bg-[#1A1A1A] border border-neutral-700 shadow-2xl p-6">
        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-full bg-brand/20 flex items-center justify-center">
            <Key className="w-7 h-7 text-brand" />
          </div>
        </div>

        <h2 className="text-xl font-semibold text-center mb-2">Welcome to PyMOL AI Assistant</h2>
        <p className="text-sm text-neutral-400 text-center mb-6">
          Enter your OpenAI API key to enable AI-powered commands.
          <br />
          Your key is stored locally and never shared.
        </p>

        {/* Input */}
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          placeholder="sk-..."
          className="w-full h-11 px-4 rounded-xl bg-neutral-900 border border-neutral-700 outline-none text-sm mb-4 focus:border-brand transition"
          autoFocus
        />

        {/* Status */}
        {msg && (
          <div className={`flex items-center gap-2 text-sm mb-4 ${status === 'done' ? 'text-emerald-400' : status === 'error' ? 'text-red-400' : 'text-neutral-400'}`}>
            {status === 'validating' || status === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {status === 'done' ? <CheckCircle className="w-4 h-4" /> : null}
            {status === 'error' ? <XCircle className="w-4 h-4" /> : null}
            {msg}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleSkip}
            className="flex-1 h-10 rounded-full bg-neutral-800 hover:bg-neutral-700 text-sm"
          >
            Skip for now
          </button>
          <button
            onClick={handleSave}
            disabled={!key.trim() || status === 'validating' || status === 'saving'}
            className="flex-1 h-10 rounded-full bg-brand hover:bg-brandHover text-black font-medium text-sm disabled:opacity-40"
          >
            {status === 'validating' ? 'Validating…' : status === 'saving' ? 'Saving…' : 'Save & Continue'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ApiKeyModal;
