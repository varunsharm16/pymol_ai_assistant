import React from 'react';
import { useStore } from '../store';


const TopBar: React.FC = () => {
  const project = useStore(s => s.projects.find(p => p.id === s.currentProjectId));
  const setRight = useStore(s => s.setRightPanel);

  return (
    <div className="app-drag px-3 pt-6 select-none">
      {/* Title row */}
      <div className="flex items-center">
        <div className="text-xl font-semibold tracking-tight truncate">
          {project?.name ?? 'New Project'}
        </div>

        <div className="flex-1" />

        {/* Right side: user + plan button → opens Profile sidebar */}
        <div className="app-no-drag flex items-center gap-3">
          <button
            type="button"
            onClick={() => setRight('profile')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#171717] hover:bg-[#2A2A2A] text-neutral-200 text-sm"
            title="Open Profile"
          >
            <span>Varun S.</span>
                        <span className="rounded-full border border-brand text-brand px-2 py-0.5 text-[12px]">PRO</span>
          </button>
        </div>
      </div>

      {/* green underline */}
      <div className="h-[3px] bg-brand/90 mt-2 rounded-full" />
    </div>
  );
};

export default TopBar;