import React from 'react';
import { Activity, KeyRound, MessageSquareText } from 'lucide-react';

type Props = {
  open: boolean;
  onComplete: () => void;
};

const STEPS = [
  {
    title: 'Welcome to NexMol',
    body:
      'NexMol is your AI-powered molecular visualization assistant. Load a structure via the Molecules panel, then use natural language to control the 3D viewer.',
    icon: MessageSquareText,
  },
  {
    title: 'Check Status First',
    body:
      'Before starting work, open Status and run the system check. Make sure the backend is reachable and your API key is valid.',
    icon: Activity,
  },
  {
    title: 'Prompting Tips',
    body:
      'Use short single-action prompts like "show ligand as sticks", "color chain A red", or "set background to white". Quick Actions show the phrasing the deterministic parser understands best.',
    icon: KeyRound,
  },
];

const OnboardingModal: React.FC<Props> = ({ open, onComplete }) => {
  const [step, setStep] = React.useState(0);

  React.useEffect(() => {
    if (!open) {
      setStep(0);
    }
  }, [open]);

  if (!open) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const last = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-lg rounded-3xl border border-neutral-700 bg-[#171717] p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/15 text-brand">
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-neutral-500">
              Getting Started
            </div>
            <div className="text-xl font-semibold text-neutral-100">{current.title}</div>
          </div>
        </div>

        <div className="mt-5 text-sm leading-6 text-neutral-300">{current.body}</div>

        <div className="mt-6 flex gap-2">
          {STEPS.map((_, index) => (
            <div
              key={index}
              className={`h-1.5 flex-1 rounded-full ${
                index <= step ? 'bg-brand' : 'bg-neutral-800'
              }`}
            />
          ))}
        </div>

        <div className="mt-6 flex justify-between gap-3">
          <button
            type="button"
            onClick={() => (step === 0 ? onComplete() : setStep((value) => value - 1))}
            className="h-10 rounded-full bg-neutral-800 px-4 text-sm text-neutral-200 hover:bg-neutral-700"
          >
            {step === 0 ? 'Skip' : 'Back'}
          </button>
          <button
            type="button"
            onClick={() => (last ? onComplete() : setStep((value) => value + 1))}
            className="h-10 rounded-full bg-brand px-4 text-sm font-medium text-black hover:bg-brandHover"
          >
            {last ? 'Open Status' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingModal;
