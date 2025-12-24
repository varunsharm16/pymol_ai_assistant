import React from 'react';
import { X, Check } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

const Feature: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li className="flex items-start gap-2 text-neutral-300">
    <Check className="w-4 h-4 mt-0.5 text-brand" strokeWidth={2.25} />
    <span>{children}</span>
  </li>
);

const PlanCard: React.FC<{
  title: string;
  price: string;
  badge?: string;
  cta: string;
  onClick: () => void;
  highlighted?: boolean;
  children: React.ReactNode;
}> = ({ title, price, badge, cta, onClick, highlighted, children }) => (
  <div className={`rounded-2xl border ${highlighted ? 'border-brand' : 'border-neutral-700'} bg-[#1C1C1C] p-6 shadow-xl`}>
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-lg font-semibold text-neutral-100">{title}</h3>
      {badge && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-brand/20 text-brand border border-brand/40">
          {badge}
        </span>
      )}
    </div>
    <div className="text-2xl font-semibold text-neutral-100 mb-6">
      {price}<span className="text-sm text-neutral-400 font-normal"> / month</span>
    </div>
    <ul className="space-y-2 mb-6">{children}</ul>
    <button
      onClick={onClick}
      className="w-full h-11 rounded-full bg-brand hover:bg-brandHover text-black font-medium transition"
    >
      {cta}
    </button>
  </div>
);

const UpgradeModal: React.FC<Props> = ({ open, onClose }) => {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);

    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* 90% viewport panel */}
      <div className="relative w-[90vw] h-[90vh] rounded-2xl bg-[#151515] border border-neutral-700 shadow-2xl overflow-hidden app-no-drag isolate">
        {/* Header */}
        <div className="app-no-drag flex items-center justify-between px-6 py-4 border-b border-neutral-800 relative z-10">
          <div>
            <h2 className="text-xl font-semibold text-neutral-100">Choose your plan</h2>
            <p className="text-neutral-400 text-sm">Upgrade for more actions, faster responses, and advanced tools.</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-brand hover:bg-brandHover text-black flex items-center justify-center pointer-events-auto relative z-20"
          >
            <X className="w-4 h-4" strokeWidth={2.25} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="h-[calc(90vh-64px)] overflow-auto p-6 md:p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            <PlanCard title="FREE" price="$0.00" cta="Change Plan" onClick={onClose}>
              <Feature>Priority execution queue</Feature>
              <Feature>500 prompts a week</Feature>
              <Feature>Project notes export (.md/.pdf/.docx)</Feature>
              <Feature>Snapshot helper & presets</Feature>
            </PlanCard>

            <PlanCard title="PRO" price="$8.00" badge="Popular" cta="Next Billing on [Date]" onClick={onClose} highlighted={true}>
              <Feature>Everything in Pro</Feature>
              <Feature>1000 prompts a week</Feature>
              <Feature>Advanced prompting toolbox</Feature>
              <Feature>Priority support</Feature>
            </PlanCard>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpgradeModal;

