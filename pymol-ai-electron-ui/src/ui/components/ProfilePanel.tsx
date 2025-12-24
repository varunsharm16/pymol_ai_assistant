// src/ui/components/ProfilePanel.tsx
import React from 'react';

const SectionTitle: React.FC<{children: React.ReactNode}> = ({ children }) => (
  <div className="px-4 py-3 text-sm uppercase tracking-wide text-neutral-300 bg-neutral-900">
    {children}
  </div>
);

const Badge: React.FC<{label: string}> = ({ label }) => (
  <span
    className="inline-flex items-center rounded-full border border-brand text-brand px-2 py-1.5 text-xs leading-none"
    title={label}
  >
    {label}
  </span>
);

/** Progress bar used in the cards */
const Bar: React.FC<{leftLabel: string; rightLabel: string; pct: number}> = ({
  leftLabel, rightLabel, pct,
}) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between text-[13px] text-neutral-200">
      <span>{leftLabel}</span>
      <span>{rightLabel}</span>
    </div>
    <div className="w-full h-10 rounded-3xl bg-[#2A2A2A] px-3 py-3">
      <div className="h-full w-full rounded-xl bg-neutral-800/30 p-1">
        <div
          className="h-full rounded-lg bg-brand transition-[width] duration-300"
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  </div>
);

const Card: React.FC<{title: string; children: React.ReactNode}> = ({ title, children }) => (
  <div className="rounded-3xl bg-[#171717] border border-neutral-800 shadow-inner p-4 space-y-3">
    <div className="text-xs md:text-sm uppercase tracking-wide text-neutral-300">{title}</div>
    {children}
  </div>
);

const ProfilePanel: React.FC = () => {
  // Stub data for now — wire these from store when ready
  const userName = 'Varun Sharma';
  const planBadge = 'PRO';
  const cycleStart = 'August 16, 2025';
  const cycleEnd   = 'September 15, 2025';
  const cyclePct   = 0;          // % of current cycle elapsed
  const used       = 0;          // used prompts
  const limit      = 1000;       // plan limit
  const usagePct   = (used / limit) * 100;

  return (
    <div className="h-full flex flex-col bg-[#2A2A2A]">
      <SectionTitle>Profile</SectionTitle>
      
      <div className="p-4 space-y-6 text-neutral-100">
        {/* USER */}
        <div className="space-y-1">
          <div className="text-xs md:text-sm uppercase tracking-wide text-neutral-300">User</div>
          <div className="text-base md:text-md font-medium">{userName}</div>
        </div>

        {/* PLAN */}
        <div className="space-y-1">
          <div className="text-xs md:text-sm uppercase tracking-wide text-neutral-300">Plan</div>
          <Badge label={planBadge} />
        </div>

        {/* BILLING CYCLE (card / overlay style) */}
        <Card title="Billing Cycle">
          <Bar leftLabel={cycleStart} rightLabel={cycleEnd} pct={cyclePct} />
          <div className="text-[13px] text-neutral-300">{Math.round(cyclePct)}% of current cycle elapsed</div>
        </Card>

        {/* PROMPT USAGE (card / overlay style) */}
        <Card title="Prompt Usage">
          <Bar leftLabel={`${used} used`} rightLabel={`${limit.toLocaleString()} limit`} pct={usagePct} />
          <div className="text-[13px] text-neutral-300">{(limit - used).toLocaleString()} prompts remaining this cycle</div>
        </Card>

        {/* Billing CTA */}
        <button
          className="rounded-3xl bg-neutral-900 hover:bg-[#2A2A2A] transition px-3 py-2 text-[13px] app-no-drag"
        >
          Manage Billing
        </button>
      </div>
    </div>
  );
};

export default ProfilePanel;