import React from 'react';
import { useStore } from '../store';
import { getPdbInfo, fetchStructureData, readStructureFile } from '../lib/bridge';
import { globalViewerRef } from '../App';
import { Search, Upload, Loader2, CheckCircle, XCircle, Atom } from 'lucide-react';

type Tab = 'fetch' | 'import';

const MoleculePanel: React.FC = () => {
  const [tab, setTab] = React.useState<Tab>('fetch');
  const currentMolecule = useStore((s) => s.projectMolecules[s.currentProjectId] || {});
  const setCurrentProjectMolecule = useStore((s) => s.setCurrentProjectMolecule);
  const setCurrentProjectStructure = useStore((s) => s.setCurrentProjectStructure);
  const setCurrentProjectViewerState = useStore((s) => s.setCurrentProjectViewerState);
  const viewerReady = useStore((s) => s.viewerReady);
  const addLog = useStore((s) => s.addLog);
  const updateLog = useStore((s) => s.updateLog);

  // PDB fetch state
  const [pdbId, setPdbId] = React.useState('');
  const [pdbInfo, setPdbInfo] = React.useState<any>(null);
  const [pdbLoading, setPdbLoading] = React.useState(false);
  const [pdbStatus, setPdbStatus] = React.useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [pdbMsg, setPdbMsg] = React.useState('');

  // Import state
  const [importStatus, setImportStatus] = React.useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [importMsg, setImportMsg] = React.useState('');

  const handlePreview = async () => {
    if (!pdbId.trim()) return;
    setPdbLoading(true);
    setPdbInfo(null);
    setPdbStatus('idle');
    setPdbMsg('');
    const info = await getPdbInfo(pdbId.trim());
    setPdbLoading(false);
    if (info.ok) {
      setPdbInfo(info);
    } else {
      setPdbInfo(null);
      setPdbStatus('error');
      setPdbMsg(info.error || 'Not found');
    }
  };

  const handleFetch = async () => {
    if (!pdbId.trim()) return;
    const normalizedId = pdbId.trim().toUpperCase();
    let info = pdbInfo && pdbInfo.pdb_id === normalizedId ? pdbInfo : null;
    if (!info) {
      setPdbLoading(true);
      setPdbMsg('');
      const lookup = await getPdbInfo(normalizedId);
      setPdbLoading(false);
      if (!lookup.ok) {
        setPdbInfo(null);
        setPdbStatus('error');
        setPdbMsg(lookup.error || 'PDB not found');
        addLog({
          prompt: `Fetch PDB: ${normalizedId}`,
          status: 'error',
          message: lookup.error || 'PDB not found.',
        });
        return;
      }
      info = lookup;
      setPdbInfo(lookup);
    }

    setPdbStatus('loading');
    setPdbMsg('');
    const logId = addLog({
      prompt: `Fetch PDB: ${normalizedId}`,
      status: 'pending',
      message: 'Downloading structure data…',
    });

    const res = await fetchStructureData(normalizedId, (progress) => {
      updateLog(logId, { status: 'pending', message: progress.message });
    });

    if (res.ok && res.data) {
      try {
        const viewer = globalViewerRef.current;
        if (!viewer || !viewerReady) {
          throw new Error('Viewer is still starting. Wait a moment and try loading the structure again.');
        }
        await viewer.loadStructure(res.data, res.format || 'pdb', { objectName: normalizedId });
        const snapshot = await viewer.getSceneSnapshot();
        setCurrentProjectViewerState({
          backgroundColor: snapshot.backgroundColor,
          cameraSnapshot: snapshot.cameraSnapshot,
          operations: [],
        });
        setPdbStatus('loaded');
        setPdbMsg(`Loaded ${normalizedId}`);
        setCurrentProjectMolecule({
          pdbId: normalizedId,
          name: info?.title || normalizedId,
        });
        setCurrentProjectStructure({
          data: res.data,
          format: res.format || 'pdb',
          objectName: normalizedId,
        });
        updateLog(logId, { status: 'success', message: 'Structure loaded.' });
      } catch (error: any) {
        setPdbStatus('error');
        setPdbMsg(error?.message || 'Failed to load structure');
        updateLog(logId, {
          status: 'error',
          message: error?.message || 'Viewer failed to load structure.',
        });
      }
    } else {
      setPdbStatus('error');
      setPdbMsg(res.error || 'Failed to fetch');
      updateLog(logId, { status: 'error', message: res.error || 'Failed to fetch structure.' });
    }
  };

  const handleImport = async () => {
    if (!window.api?.showOpenDialog) {
      setImportMsg('File dialog unavailable');
      return;
    }
    const result = await window.api.showOpenDialog({
      title: 'Import Molecule File',
      filters: [
        { name: 'Molecule Files', extensions: ['pdb', 'cif', 'mol2', 'sdf', 'xyz'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    if (!result || result.canceled || !result.filePaths?.length) return;

    const filePath = result.filePaths[0];
    setImportStatus('loading');
    setImportMsg('');
    const name = filePath.split(/[\\/]/).pop() || filePath;
    const logId = addLog({ prompt: `Import: ${name}`, status: 'pending', message: 'Reading file…' });

    const res = await readStructureFile(filePath, (progress) => {
      updateLog(logId, { status: 'pending', message: progress.message });
    });

    if (res.ok && res.data) {
      try {
        const viewer = globalViewerRef.current;
        if (!viewer || !viewerReady) {
          throw new Error('Viewer is still starting. Wait a moment and try importing again.');
        }
        await viewer.loadStructure(res.data, res.format || 'pdb', { objectName: name });
        const snapshot = await viewer.getSceneSnapshot();
        setCurrentProjectViewerState({
          backgroundColor: snapshot.backgroundColor,
          cameraSnapshot: snapshot.cameraSnapshot,
          operations: [],
        });
        setImportStatus('loaded');
        setImportMsg(`Loaded ${name}`);
        setCurrentProjectMolecule({ filePath, name });
        setCurrentProjectStructure({
          data: res.data,
          format: res.format || 'pdb',
          objectName: name,
        });
        updateLog(logId, { status: 'success', message: 'Structure loaded.' });
      } catch (error: any) {
        setImportStatus('error');
        setImportMsg(error?.message || 'Import failed');
        updateLog(logId, {
          status: 'error',
          message: error?.message || 'Viewer failed to load structure.',
        });
      }
    } else {
      setImportStatus('error');
      setImportMsg(res.error || 'Import failed');
      updateLog(logId, { status: 'error', message: res.error || 'Import failed.' });
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#2A2A2A]">
      <div className="px-4 py-3 text-sm uppercase tracking-wide text-neutral-300 bg-neutral-900">
        Molecules
      </div>

      {/* Current molecule badge */}
      {(currentMolecule.pdbId || currentMolecule.name) && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-xl bg-brand/10 border border-brand/30 flex items-center gap-2">
          <Atom className="w-4 h-4 text-brand" />
          <span className="text-sm text-brand truncate">
            {currentMolecule.pdbId || currentMolecule.name}
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 px-4 mt-3">
        <button
          onClick={() => setTab('fetch')}
          className={`flex-1 h-9 rounded-full text-sm font-medium ${
            tab === 'fetch' ? 'bg-brand text-black' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
          }`}
        >
          Fetch PDB
        </button>
        <button
          onClick={() => setTab('import')}
          className={`flex-1 h-9 rounded-full text-sm font-medium ${
            tab === 'import' ? 'bg-brand text-black' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
          }`}
        >
          Import File
        </button>
      </div>

      <div className="p-4 flex-1 overflow-auto space-y-3">
        {tab === 'fetch' && (
          <>
            <div className="flex gap-2">
              <input
                value={pdbId}
                onChange={(e) => setPdbId(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handlePreview()}
                placeholder="PDB ID (e.g. 1CRN)"
                maxLength={4}
                className="flex-1 h-10 px-3 rounded-xl bg-neutral-900 outline-none text-sm uppercase"
              />
              <button
                onClick={handlePreview}
                disabled={!pdbId.trim() || pdbLoading}
                className="h-10 px-4 rounded-full bg-neutral-700 hover:bg-neutral-600 text-sm disabled:opacity-40"
              >
                {pdbLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
            </div>

            {/* Metadata preview */}
            {pdbInfo && (
              <div className="rounded-xl bg-neutral-900 p-3 text-sm space-y-1">
                <div className="font-medium text-neutral-100">{pdbInfo.title}</div>
                {pdbInfo.method && (
                  <div className="text-neutral-400">Method: {pdbInfo.method}</div>
                )}
                {pdbInfo.resolution != null && (
                  <div className="text-neutral-400">Resolution: {pdbInfo.resolution} Å</div>
                )}
              </div>
            )}

            <button
              onClick={handleFetch}
              disabled={!pdbId.trim() || pdbStatus === 'loading' || !viewerReady}
              className="w-full h-10 rounded-full bg-brand hover:bg-brandHover text-black font-medium text-sm disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {pdbStatus === 'loading' ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Loading…</>
              ) : (
                'Load Structure'
              )}
            </button>

            {!viewerReady && (
              <div className="text-xs text-neutral-400">
                Viewer is starting up. Load will enable once Mol* is ready.
              </div>
            )}

            {pdbMsg && (
              <div className={`flex items-center gap-2 text-sm ${pdbStatus === 'loaded' ? 'text-emerald-400' : pdbStatus === 'error' ? 'text-red-400' : 'text-neutral-400'}`}>
                {pdbStatus === 'loaded' && <CheckCircle className="w-4 h-4" />}
                {pdbStatus === 'error' && <XCircle className="w-4 h-4" />}
                {pdbMsg}
              </div>
            )}
          </>
        )}

        {tab === 'import' && (
          <>
            <button
              onClick={handleImport}
              disabled={importStatus === 'loading' || !viewerReady}
              className="w-full h-24 rounded-xl border-2 border-dashed border-neutral-600 hover:border-brand flex flex-col items-center justify-center gap-2 text-sm text-neutral-400 hover:text-neutral-200 transition"
            >
              <Upload className="w-6 h-6" />
              <span>Choose a molecule file</span>
              <span className="text-xs text-neutral-500">.pdb .cif .mol2 .sdf .xyz</span>
            </button>

            {!viewerReady && (
              <div className="text-xs text-neutral-400">
                Viewer is starting up. Import will enable once Mol* is ready.
              </div>
            )}

            {importMsg && (
              <div className={`flex items-center gap-2 text-sm ${importStatus === 'loaded' ? 'text-emerald-400' : importStatus === 'error' ? 'text-red-400' : 'text-neutral-400'}`}>
                {importStatus === 'loaded' && <CheckCircle className="w-4 h-4" />}
                {importStatus === 'error' && <XCircle className="w-4 h-4" />}
                {importMsg}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MoleculePanel;
