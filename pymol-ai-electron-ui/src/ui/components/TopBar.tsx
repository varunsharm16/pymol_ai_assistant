import React from 'react';
import { useStore } from '../store';

const TopBar: React.FC = () => {
  const project = useStore((s) =>
    s.projects.find((p) => p.id === s.currentProjectId)
  );

  return (
    <div className="app-drag px-3 pt-6 select-none">
      {/* Title row */}
      <div className="flex items-center">
        <div className="text-xl font-semibold tracking-tight truncate">
          {project?.name ?? 'New Project'}
        </div>

        <div className="flex-1" />

        {/* Version badge */}
        <div className="app-no-drag flex items-center gap-3">
          <span className="text-xs text-neutral-500 rounded-full border border-neutral-700 px-2.5 py-1">
            v0.1.0-alpha
          </span>
        </div>
      </div>

      {/* Green underline */}
      <div className="h-[3px] bg-brand/90 mt-2 rounded-full" />
    </div>
  );
};

export default TopBar;