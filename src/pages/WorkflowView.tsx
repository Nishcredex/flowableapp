// ============================================================
//  WorkflowView.tsx
//  Shows live BPMN diagram from Flowable + running instance list
//
//  Flowable calls:
//    GET /repository/process-definitions?key=... → fetch all versions
//    GET /repository/deployments/{id}/resourcedata/{filename} → PNG image
//    getAllProcessInstances() → show running audits as overlay
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  Loader2Icon,
  AlertCircleIcon,
  RefreshCwIcon,
  ZoomInIcon,
  ZoomOutIcon,
  MaximizeIcon,
  ExternalLinkIcon,
  ActivityIcon,
  CheckCircle2Icon,
  ClockIcon,
  ChevronDownIcon,
} from 'lucide-react';
import {
  getAllProcessInstances,
  ProcessInstance,
} from './services/flowableApi';

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────

// const FLOWABLE_BASE   = 'http://localhost:3000/flowable-api';
const CREDENTIALS     = btoa('admin:test');
const AUTH_HEADER     = `Basic ${CREDENTIALS}`;

// const FLOWABLE_UI_URL = 'http://localhost:8080/flowable-ui/modeler';
const PROCESS_KEY     = 'auditManagementWorkflow';
const PAGE_SIZE       = 5; // audits shown per page

const FLOWABLE_BASE   = (import.meta.env.VITE_API_URL || 'http://localhost:3000') + '/flowable-api';
const FLOWABLE_UI_URL = 'https://flowable-ui-production.up.railway.app/flowable-ui/modeler';
// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface ProcessDef {
  id:                  string;
  key:                 string;
  name:                string;
  version:             number;
  deploymentId:        string;
  diagramResourceName: string;
  diagramResource:     string;
}

interface RunningAudit {
  id:          string;
  name:        string;
  project:     string;
  startTime:   string;
  ended:       boolean;
  suspended:   boolean;
  workflowKey: string;
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return iso; }
}

function getStatusColor(inst: RunningAudit): string {
  if (inst.ended)     return 'bg-green-100 text-green-700';
  if (inst.suspended) return 'bg-gray-100 text-gray-500';
  return 'bg-blue-100 text-blue-700';
}

function getStatusLabel(inst: RunningAudit): string {
  if (inst.ended)     return 'Completed';
  if (inst.suspended) return 'Suspended';
  return 'In Progress';
}

// ─────────────────────────────────────────────────────────────
// BPMN STEPS — static fallback when no live PNG available
// ─────────────────────────────────────────────────────────────

const PROCESS_STEPS = [
  { key: 'start',   label: 'Start',                type: 'event',   color: 'bg-green-500 text-white border-green-600' },
  { key: 'step1',   label: 'Complete Audit Step',  type: 'task',    color: 'bg-blue-500 text-white border-blue-600' },
  { key: 'gateway', label: 'Task Approved?',       type: 'gateway', color: 'bg-amber-400 text-white border-amber-500' },
  { key: 'step2',   label: 'Review & Approve',     type: 'task',    color: 'bg-blue-500 text-white border-blue-600' },
  { key: 'step3',   label: 'Final Approval',       type: 'task',    color: 'bg-blue-500 text-white border-blue-600' },
  { key: 'end',     label: 'End',                  type: 'event',   color: 'bg-red-500 text-white border-red-600' },
];

function StaticBpmnDiagram() {
  return (
    <div className="flex items-center gap-0 overflow-x-auto py-4 px-2">
      {PROCESS_STEPS.map((step, idx) => (
        <React.Fragment key={step.key}>
          <div className="flex flex-col items-center gap-2 flex-shrink-0">
            {step.type === 'event' ? (
              <div className={`w-14 h-14 rounded-full flex items-center justify-center border-4 ${step.color} shadow-md`}>
                <span className="text-xs font-bold">{step.label.slice(0, 1)}</span>
              </div>
            ) : step.type === 'gateway' ? (
              <div className={`w-14 h-14 flex items-center justify-center border-4 ${step.color} shadow-md`}
                style={{ transform: 'rotate(45deg)' }}>
                <span className="text-xs font-bold" style={{ transform: 'rotate(-45deg)' }}>?</span>
              </div>
            ) : (
              <div className={`w-36 h-16 rounded-lg flex items-center justify-center border-2 ${step.color} shadow-md px-2`}>
                <span className="text-xs font-medium text-center leading-tight">{step.label}</span>
              </div>
            )}
            <span className={`text-xs text-gray-500 max-w-[9rem] text-center leading-tight ${step.type !== 'task' ? 'hidden' : ''}`}>
              {step.label}
            </span>
          </div>
          {idx < PROCESS_STEPS.length - 1 && (
            <div className="flex items-center flex-shrink-0 mx-1">
              <div className="h-0.5 w-8 bg-gray-400" />
              <div className="border-t-4 border-b-4 border-l-8 border-t-transparent border-b-transparent border-l-gray-400" />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// WORKFLOW SELECTOR DROPDOWN
// ─────────────────────────────────────────────────────────────

interface WorkflowSelectorProps {
  defs:      ProcessDef[];
  selected:  string;          // currently selected key
  loading:   boolean;
  onChange:  (key: string) => void;
}

function WorkflowSelector({ defs, selected, loading, onChange }: WorkflowSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = defs.find((d) => d.key === selected);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 min-w-[220px]"
      >
        {loading && defs.length === 0 ? (
          <><Loader2Icon className="w-4 h-4 animate-spin text-gray-400" /><span className="text-gray-400">Loading workflows…</span></>
        ) : (
          <>
            <span className="flex-1 text-left font-medium truncate">
              {current ? (current.name || current.key) : 'Select workflow…'}
            </span>
            {current && (
              <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono flex-shrink-0">
                v{current.version}
              </span>
            )}
            <ChevronDownIcon className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
          </>
        )}
      </button>

      {open && defs.length > 0 && (
        <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg w-72 overflow-hidden">
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Deployed Workflows ({defs.length})
            </p>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {defs.map((def) => (
              <button
                key={def.key}
                onClick={() => { onChange(def.key); setOpen(false); }}
                className={`w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0 ${
                  def.key === selected ? 'bg-blue-50' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-800 truncate pr-2">
                    {def.name || def.key}
                  </p>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-mono flex-shrink-0 ${
                    def.key === selected
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    v{def.version}
                  </span>
                </div>
                <p className="text-xs text-gray-400 font-mono mt-0.5">{def.key}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

export function WorkflowView() {
  const navigate = useNavigate();

  // All deployed audit workflow definitions
  const [allDefs,      setAllDefs]      = useState<ProcessDef[]>([]);
  const [defsLoading,  setDefsLoading]  = useState(true);

  // Currently selected workflow key
  const [selectedKey,  setSelectedKey]  = useState('');

  // Diagram + instances for the selected workflow
  const [processDef,   setProcessDef]   = useState<ProcessDef | null>(null);
  const [diagramUrl,   setDiagramUrl]   = useState<string | null>(null);
  const [instances,    setInstances]    = useState<RunningAudit[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [zoom,         setZoom]         = useState(1);
  const [page,         setPage]         = useState(1);

  const blobUrlRef = useRef<string | null>(null);

  // ── Step 1: On mount, fetch all deployed workflow definitions ──
  useEffect(() => {
    const fetchAllDefs = async () => {
      setDefsLoading(true);
      try {
        const allRaw: ProcessDef[] = [];
        let start = 0;
        const pageSize = 50;

        while (true) {
          const res = await fetch(
            `${FLOWABLE_BASE}/repository/process-definitions?size=${pageSize}&start=${start}`,
            { headers: { Authorization: AUTH_HEADER, 'Content-Type': 'application/json' } }
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();

          const page: ProcessDef[] = data.data ?? [];
          allRaw.push(...page);

          const total: number = data.total ?? allRaw.length;
          if (allRaw.length >= total || page.length === 0) break;
          start += pageSize;
        }

        // Deduplicate to latest version per key — show ALL workflows, no filtering
        const latestByKey: Record<string, ProcessDef> = {};
        for (const def of allRaw) {
          if (!latestByKey[def.key] || def.version > latestByKey[def.key].version) {
            latestByKey[def.key] = def;
          }
        }

        const auditDefs = Object.values(latestByKey).sort((a, b) =>
          (a.name || a.key).localeCompare(b.name || b.key)
        );
        setAllDefs(auditDefs);
        if (auditDefs.length > 0) setSelectedKey(auditDefs[0].key);
      } catch (err) {
        setAllDefs([]);
      } finally {
        setDefsLoading(false);
      }
    };
    fetchAllDefs();
  }, []);

  // ── Step 2: When selectedKey changes, fetch its diagram + instances ──
  const fetchWorkflow = useCallback(async (key: string) => {
    if (!key) return;

    setLoading(true);
    setError('');
    setDiagramUrl(null);
    setProcessDef(null);

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    try {
      // Fetch all versions of this specific key, pick highest version
      const defRes = await fetch(
        `${FLOWABLE_BASE}/repository/process-definitions?key=${encodeURIComponent(key)}&size=50`,
        { headers: { Authorization: AUTH_HEADER, 'Content-Type': 'application/json' } }
      );

      if (defRes.ok) {
        const defData = await defRes.json();
        const defs: ProcessDef[] = defData.data ?? [];
        const def = defs.length
          ? defs.reduce((best, cur) => cur.version > best.version ? cur : best)
          : null;

        setProcessDef(def);

        // Fetch PNG diagram
        if (def?.diagramResource) {
          const relativePath = def.diagramResource
            .replace(/^https?:\/\/[^/]+\/flowable-ui\/process-api/, '');
          const resourceDataPath = relativePath.replace('/resources/', '/resourcedata/');
          const imgUrl = `${FLOWABLE_BASE}${resourceDataPath}`;

          try {
            const imgRes = await fetch(imgUrl, {
              headers: { Authorization: AUTH_HEADER },
              cache: 'no-store',
            });
            if (imgRes.ok) {
              const blob = await imgRes.blob();
              const blobUrl = URL.createObjectURL(blob);
              blobUrlRef.current = blobUrl;
              setDiagramUrl(blobUrl);
            }
          } catch { /* fall back to static diagram */ }
        }
      }

      // Fetch running instances — filter to only this workflow key
      const rawInstances = await getAllProcessInstances();
      const enriched: RunningAudit[] = rawInstances
        .filter((inst: ProcessInstance) => {
          // processDefinitionId looks like "auditManagementWorkflow:3:abc123"
          const defKey = (inst.processDefinitionId || '').split(':')[0];
          return defKey === key;
        })
        .map((inst: ProcessInstance) => {
          const inlineVars = Array.isArray(inst.variables) ? inst.variables as any[] : [];
          const get = (k: string) => {
            const v = inlineVars.find((x: any) => x.name === k);
            return v ? String(v.value) : '';
          };
          return {
            id:          inst.id,
            name:        get('auditName') || inst.name || 'Unnamed Audit',
            project:     get('projectName') || '—',
            startTime:   inst.startTime,
            ended:       inst.ended,
            suspended:   inst.suspended,
            workflowKey: key,
          };
        });

      setInstances(enriched);
      setPage(1);

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load workflow. Make sure Flowable is running on port 8080.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Trigger fetch whenever selected key changes
  useEffect(() => {
    if (selectedKey) fetchWorkflow(selectedKey);
  }, [selectedKey, fetchWorkflow]);

  // Revoke blob URL on unmount only
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────

  return (
    <div className="p-8">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2 transition-colors">
            <ArrowLeftIcon className="w-4 h-4" />
            Back to Dashboard
          </button>
          <h1 className="text-2xl font-semibold text-gray-900">Workflow View</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Select a deployed workflow to view its BPMN diagram and running instances
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* ── Dynamic workflow selector ── */}
          <WorkflowSelector
            defs={allDefs}
            selected={selectedKey}
            loading={defsLoading}
            onChange={(key) => setSelectedKey(key)}
          />

          <button
            onClick={() => fetchWorkflow(selectedKey)}
            disabled={loading || !selectedKey}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
            <RefreshCwIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <a
            href={FLOWABLE_UI_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            <ExternalLinkIcon className="w-4 h-4" />
            Open in Modeler
          </a>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="flex items-start gap-3 mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircleIcon className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700">Failed to load workflow</p>
            <p className="text-sm text-red-600 mt-0.5">{error}</p>
            <button onClick={() => fetchWorkflow(selectedKey)} className="mt-2 text-sm text-red-700 underline">
              Try again
            </button>
          </div>
        </div>
      )}

      {/* ── No workflows deployed ── */}
      {!defsLoading && allDefs.length === 0 && (
        <div className="mb-6 p-5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
          <AlertCircleIcon className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">No workflows deployed yet</p>
            <p className="text-sm text-amber-700 mt-0.5">
              Design and deploy a BPMN process in Flowable Modeler. Once deployed it will
              automatically appear in the dropdown above.
            </p>
            <a
              href={FLOWABLE_UI_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-2 text-sm text-amber-800 font-medium hover:underline">
              Open Flowable Modeler <ExternalLinkIcon className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">

        {/* ── LEFT / CENTRE: BPMN Diagram (2/3 width) ── */}
        <div className="col-span-2 space-y-5">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

            {/* Toolbar */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-2">
                <ActivityIcon className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-700">BPMN Process Diagram</span>
                {selectedKey && (
                  <span className="text-xs font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                    {selectedKey}
                  </span>
                )}
                {processDef && (
                  <span className="text-xs text-gray-400">· v{processDef.version}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))}
                  className="p-1.5 text-gray-500 hover:bg-gray-200 rounded transition-colors">
                  <ZoomOutIcon className="w-4 h-4" />
                </button>
                <span className="text-xs text-gray-500 w-12 text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
                  className="p-1.5 text-gray-500 hover:bg-gray-200 rounded transition-colors">
                  <ZoomInIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setZoom(1)}
                  className="p-1.5 text-gray-500 hover:bg-gray-200 rounded transition-colors">
                  <MaximizeIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Diagram area */}
            <div className="overflow-auto bg-[#f8fafc] min-h-[360px] flex items-center justify-center p-6">
              {loading ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2Icon className="w-8 h-8 text-blue-500 animate-spin" />
                  <p className="text-sm text-gray-500">Loading BPMN diagram…</p>
                </div>
              ) : !selectedKey ? (
                <div className="text-center text-gray-400">
                  <ActivityIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Select a workflow from the dropdown above</p>
                </div>
              ) : diagramUrl ? (
                <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', transition: 'transform 0.2s' }}>
                  <img
                    src={diagramUrl}
                    alt="BPMN Process Diagram"
                    className="max-w-none"
                    style={{ imageRendering: 'crisp-edges' }}
                    onError={() => setDiagramUrl(null)}
                  />
                </div>
              ) : (
                <div className="w-full">
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-center gap-2">
                    <AlertCircleIcon className="w-4 h-4 flex-shrink-0" />
                    {processDef
                      ? 'Diagram image not available. Showing process structure instead. Open Flowable Modeler for the full BPMN view.'
                      : `Process "${selectedKey}" not yet deployed. Build it in Flowable Modeler and deploy it.`
                    }
                  </div>
                  <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', transition: 'transform 0.2s' }}>
                    <StaticBpmnDiagram />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Process definition info card */}
          {processDef && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Process Definition</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">Name</span>
                  <p className="font-medium text-gray-900 mt-0.5">{processDef.name || selectedKey}</p>
                </div>
                <div>
                  <span className="text-gray-500">Key</span>
                  <p className="font-mono text-xs text-blue-600 mt-0.5">{processDef.key}</p>
                </div>
                <div>
                  <span className="text-gray-500">Version</span>
                  <p className="font-medium text-gray-900 mt-0.5">{processDef.version}</p>
                </div>
                <div>
                  <span className="text-gray-500">Deployment ID</span>
                  <p className="font-mono text-xs text-gray-600 mt-0.5">{processDef.deploymentId}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-500">Definition ID</span>
                  <p className="font-mono text-xs text-gray-600 mt-0.5 break-all">{processDef.id}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Running Instances (1/3 width) ── */}
        <div className="space-y-5">

          {/* Summary counters */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-1">
              {selectedKey ? `Instances · ${selectedKey}` : 'Process Instances'}
            </h3>
            <p className="text-xs text-gray-400 mb-4">Only instances for the selected workflow</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-700">
                  {instances.filter((i) => !i.ended && !i.suspended).length}
                </p>
                <p className="text-xs text-blue-600 mt-0.5">Running</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-green-700">
                  {instances.filter((i) => i.ended).length}
                </p>
                <p className="text-xs text-green-600 mt-0.5">Completed</p>
              </div>
            </div>
          </div>

          {/* Instance list — paginated */}
          {(() => {
            const totalPages = Math.max(1, Math.ceil(instances.length / PAGE_SIZE));
            const safePage   = Math.min(page, totalPages);
            const pageItems  = instances.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

            return (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-800">Active Audits</h3>
                  {!loading && instances.length > 0 && (
                    <span className="text-xs text-gray-400">{instances.length} total</span>
                  )}
                </div>

                {loading && (
                  <div className="p-6 space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="space-y-1.5">
                        <div className="h-4 bg-gray-100 rounded w-3/4 animate-pulse" />
                        <div className="h-3 bg-gray-100 rounded w-1/2 animate-pulse" />
                      </div>
                    ))}
                  </div>
                )}

                {!loading && instances.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 gap-2 text-center px-5">
                    <ActivityIcon className="w-8 h-8 text-gray-300" />
                    <p className="text-sm text-gray-500">
                      {selectedKey ? `No instances for "${selectedKey}"` : 'Select a workflow'}
                    </p>
                    {selectedKey && (
                      <button
                        onClick={() => navigate('/audits/create')}
                        className="text-xs text-blue-600 hover:underline">
                        Create an audit →
                      </button>
                    )}
                  </div>
                )}

                {!loading && pageItems.map((inst, idx) => (
                  <div
                    key={inst.id}
                    className={`px-5 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors ${
                      idx < pageItems.length - 1 ? 'border-b border-gray-100' : ''
                    }`}
                    onClick={() => {
                      localStorage.setItem('currentProcessInstanceId', inst.id);
                      localStorage.setItem('currentAuditName',         inst.name);
                      localStorage.setItem('currentProjectName',        inst.project);
                      navigate('/audits/manufacturing-unit-1/checklist');
                    }}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-gray-800 truncate pr-2">{inst.name}</p>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${getStatusColor(inst)}`}>
                        {getStatusLabel(inst)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">{inst.project}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Started {formatDate(inst.startTime)}</p>
                  </div>
                ))}

                {!loading && instances.length > PAGE_SIZE && (
                  <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={safePage === 1}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                      ← Prev
                    </button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                        <button
                          key={p}
                          onClick={() => setPage(p)}
                          className={`w-7 h-7 text-xs rounded-md font-medium transition-colors ${
                            p === safePage ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
                          }`}>
                          {p}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safePage === totalPages}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                      Next →
                    </button>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Modeler link */}
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-5">
            <h3 className="text-sm font-semibold text-blue-800 mb-2">Build in Modeler</h3>
            <p className="text-xs text-blue-700 mb-3 leading-relaxed">
              Design and deploy any BPMN process in Flowable Modeler. Once deployed, it will
              automatically appear in the workflow dropdown above — no code changes needed.
            </p>
            <a
              href={FLOWABLE_UI_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-blue-700 font-medium hover:underline">
              Open Flowable Modeler
              <ExternalLinkIcon className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
