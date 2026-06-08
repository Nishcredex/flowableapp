// ============================================================
//  AuditChecklist.tsx — with task status shown on active step
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2Icon,
  CircleIcon,
  ClockIcon,
  ChevronRightIcon,
  Loader2Icon,
  AlertCircleIcon,
  RefreshCwIcon,
  ArrowLeftIcon,
  PlayIcon,
  UserIcon,
  CalendarIcon,
  FolderIcon,
  BanIcon,
  PauseCircleIcon,
  AlertTriangleIcon,
  XCircleIcon,
} from 'lucide-react';
import {
  getProcessVariables,
  getTasksByProcessInstance,
  FlowableTask,
  ProcessVariable,
  getVariableValue,
} from './services/flowableApi';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

type StepStatus = 'Completed' | 'In Progress' | 'Pending';
type TaskStatus = 'Open' | 'In Progress' | 'Blocked' | 'On Hold' | 'Invalid' | 'Needs Review' | 'Completed';

interface ChecklistStep {
  index:      number;
  name:       string;
  status:     StepStatus;
  taskId:     string | null;
  assignee:   string | null;
  dueDate:    string | null;
  taskStatus: TaskStatus | null;  // ← persisted task-level status from MyTasks
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return iso; }
}

// ─────────────────────────────────────────────────────────────
// TASK STATUS BADGE — shown on the active (In Progress) step
// ─────────────────────────────────────────────────────────────

function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const cfg: Record<TaskStatus, { cls: string; icon: React.ReactNode }> = {
    'Open':         { cls: 'bg-orange-100 text-orange-700',  icon: <CircleIcon className="w-3 h-3" /> },
    'In Progress':  { cls: 'bg-blue-100 text-blue-700',      icon: <ClockIcon className="w-3 h-3" /> },
    'Needs Review': { cls: 'bg-purple-100 text-purple-700',  icon: <AlertTriangleIcon className="w-3 h-3" /> },
    'On Hold':      { cls: 'bg-yellow-100 text-yellow-700',  icon: <PauseCircleIcon className="w-3 h-3" /> },
    'Blocked':      { cls: 'bg-red-100 text-red-700',        icon: <BanIcon className="w-3 h-3" /> },
    'Invalid':      { cls: 'bg-gray-100 text-gray-500',      icon: <XCircleIcon className="w-3 h-3" /> },
    'Completed':    { cls: 'bg-green-100 text-green-700',    icon: <CheckCircle2Icon className="w-3 h-3" /> },
  };
  const c = cfg[status] ?? cfg['Open'];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.cls}`}>
      {c.icon} {status}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// STEP STATUS BADGE (Completed / In Progress / Pending)
// ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: StepStatus }) {
  const map: Record<StepStatus, { icon: React.ReactNode; cls: string }> = {
    Completed:     { icon: <CheckCircle2Icon className="w-3.5 h-3.5" />, cls: 'bg-green-100 text-green-700' },
    'In Progress': { icon: <ClockIcon className="w-3.5 h-3.5" />,        cls: 'bg-blue-100 text-blue-700'  },
    Pending:       { icon: <CircleIcon className="w-3.5 h-3.5" />,       cls: 'bg-gray-100 text-gray-500'  },
  };
  const { icon, cls } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {icon} {status}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// STEP ROW
// ─────────────────────────────────────────────────────────────

interface StepRowProps {
  step:    ChecklistStep;
  onStart: (step: ChecklistStep) => void;
}

function StepRow({ step, onStart }: StepRowProps) {
  const isCompleted  = step.status === 'Completed';
  const isInProgress = step.status === 'In Progress';

  // Highlight row if task is blocked or on hold
  const isBlocked = step.taskStatus === 'Blocked';
  const isOnHold  = step.taskStatus === 'On Hold';
  const needsReview = step.taskStatus === 'Needs Review';

  const rowBg = isCompleted
    ? 'bg-green-50/60 border-green-200'
    : isBlocked
      ? 'bg-red-50 border-red-300 shadow-sm'
      : isOnHold
        ? 'bg-yellow-50 border-yellow-300 shadow-sm'
        : needsReview
          ? 'bg-purple-50 border-purple-200 shadow-sm'
          : isInProgress
            ? 'bg-blue-50/60 border-blue-200 shadow-sm'
            : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm';

  return (
    <div className={`flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 ${rowBg}`}>

      {/* Step number circle */}
      <div
        className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold
          ${isCompleted
            ? 'bg-green-500 text-white'
            : isBlocked
              ? 'bg-red-500 text-white'
              : isOnHold
                ? 'bg-yellow-500 text-white'
                : isInProgress
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-500'
          }`}>
        {isCompleted
          ? <CheckCircle2Icon className="w-5 h-5" />
          : isBlocked
            ? <BanIcon className="w-4 h-4" />
            : isOnHold
              ? <PauseCircleIcon className="w-4 h-4" />
              : step.index + 1
        }
      </div>

      {/* Step name + meta */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${isCompleted ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
          {step.name}
        </p>

        {isInProgress && step.assignee && (
          <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1">
            <UserIcon className="w-3 h-3" />
            Assigned to {step.assignee}
            {step.dueDate && (
              <> · <CalendarIcon className="w-3 h-3 ml-1" /> Due {formatDate(step.dueDate)}</>
            )}
          </p>
        )}

        {/* Show task status message if attention needed */}
        {isInProgress && step.taskStatus === 'Blocked' && (
          <p className="text-xs text-red-600 mt-1 font-medium">
            ⚠ This task is blocked — action required before proceeding.
          </p>
        )}
        {isInProgress && step.taskStatus === 'On Hold' && (
          <p className="text-xs text-yellow-700 mt-1 font-medium">
            ⏸ This task is on hold.
          </p>
        )}
        {isInProgress && step.taskStatus === 'Needs Review' && (
          <p className="text-xs text-purple-700 mt-1 font-medium">
            🔍 Awaiting review before this step can proceed.
          </p>
        )}
        {isInProgress && step.taskStatus === 'Invalid' && (
          <p className="text-xs text-gray-600 mt-1 font-medium">
            ✕ This task has been marked invalid.
          </p>
        )}

        {isInProgress && step.taskId && (
          <p className="text-xs text-gray-400 mt-0.5">Task ID: {step.taskId}</p>
        )}
      </div>

      {/* Task status badge (only for In Progress step) */}
      {isInProgress && step.taskStatus && step.taskStatus !== 'Open' && (
        <TaskStatusBadge status={step.taskStatus} />
      )}

      {/* Step status badge */}
      <StatusBadge status={step.status} />

      {/* Action button */}
      {!isCompleted && (
        <button
          onClick={() => onStart(step)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
            ${isInProgress
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}>
          {isInProgress
            ? <><CheckCircle2Icon className="w-3.5 h-3.5" /> Complete</>
            : <><PlayIcon className="w-3.5 h-3.5" /> Start</>
          }
        </button>
      )}

      {isCompleted && (
        <ChevronRightIcon className="w-4 h-4 text-gray-300 flex-shrink-0" />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

export function AuditChecklist() {
  const navigate = useNavigate();

  const processInstanceId = localStorage.getItem('currentProcessInstanceId') || '';
  const auditName         = localStorage.getItem('currentAuditName')         || 'Audit';
  const projectName       = localStorage.getItem('currentProjectName')       || '—';
  const auditorName       = localStorage.getItem('currentAuditorName')       || '—';

  const [steps,      setSteps]      = useState<ChecklistStep[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [lastFetch,  setLastFetch]  = useState<Date | null>(null);

  const buildSteps = useCallback(
    (vars: ProcessVariable[], tasks: FlowableTask[]): ChecklistStep[] => {
      let stepNames: string[] = [];

      const localStepsRaw = localStorage.getItem('currentChecklistSteps');
      if (localStepsRaw) {
        try {
          const parsed = JSON.parse(localStepsRaw);
          if (Array.isArray(parsed) && parsed.length > 0) stepNames = parsed;
        } catch { /* try Flowable next */ }
      }

      if (stepNames.length === 0) {
        const checklistStepsRaw = getVariableValue(vars, 'checklistSteps');
        if (checklistStepsRaw) {
          try {
            const parsed = JSON.parse(checklistStepsRaw);
            if (Array.isArray(parsed) && parsed.length > 0) stepNames = parsed;
          } catch { /* no steps available */ }
        }
      }

      if (stepNames.length === 0) return [];

      // Read persisted taskStatus from process variable
      const savedTaskStatus = getVariableValue(vars, 'taskStatus') as TaskStatus | '';

      const activeTasks = tasks;

      return stepNames.map((name, index) => {
        const totalCompleted = Math.max(0, stepNames.length - activeTasks.length);

        let status: StepStatus = 'Pending';
        if (index < totalCompleted) {
          status = 'Completed';
        } else if (index === totalCompleted && activeTasks.length > 0) {
          status = 'In Progress';
        }

        const taskForStep = status === 'In Progress' ? activeTasks[0] : null;

        return {
          index,
          name,
          status,
          taskId:     taskForStep?.id       || null,
          assignee:   taskForStep?.assignee || null,
          dueDate:    taskForStep?.dueDate  || null,
          // Only attach taskStatus to the In Progress step
          taskStatus: status === 'In Progress' && savedTaskStatus
            ? (savedTaskStatus as TaskStatus)
            : null,
        };
      });
    },
    []
  );

  const fetchChecklist = useCallback(async () => {
    if (!processInstanceId) {
      setError('No process instance found. Please create or open an audit first.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const [vars, tasks] = await Promise.all([
        getProcessVariables(processInstanceId),
        getTasksByProcessInstance(processInstanceId),
      ]);
      setSteps(buildSteps(vars, tasks));
      setLastFetch(new Date());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load checklist from Flowable.'
      );
    } finally {
      setLoading(false);
    }
  }, [processInstanceId, buildSteps]);

  useEffect(() => { fetchChecklist(); }, [fetchChecklist]);

  const handleStart = (step: ChecklistStep) => {
    localStorage.setItem('currentStepIndex', String(step.index));
    localStorage.setItem('currentStepName',  step.name);
    localStorage.setItem('currentTaskId',    step.taskId || '');
    navigate('/audits/manufacturing-unit-1/checklist/step-1');
  };

  const completedCount = steps.filter((s) => s.status === 'Completed').length;
  const totalCount     = steps.length || 1;
  const progressPct    = Math.round((completedCount / totalCount) * 100);

  // Attention banner: any step that is blocked/on-hold/needs-review
  const alertSteps = steps.filter(
    s => s.taskStatus && ['Blocked', 'On Hold', 'Needs Review', 'Invalid'].includes(s.taskStatus)
  );

  return (
    <div className="p-8 max-w-3xl mx-auto">

      <button
        onClick={() => navigate('/audits')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors">
        <ArrowLeftIcon className="w-4 h-4" />
        Back to Audits
      </button>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{auditName}</h1>
          <div className="flex items-center gap-4 mt-1.5 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <FolderIcon className="w-4 h-4" /> {projectName}
            </span>
            <span className="flex items-center gap-1">
              <UserIcon className="w-4 h-4" /> {auditorName}
            </span>
            {processInstanceId && (
              <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">
                {processInstanceId.slice(0, 8)}…
              </span>
            )}
          </div>
        </div>

        <button
          onClick={fetchChecklist}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
          <RefreshCwIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* ── Attention banner for blocked/on-hold steps ── */}
      {alertSteps.length > 0 && (
        <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <AlertTriangleIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-700">Attention Required</p>
            <p className="text-sm text-red-600 mt-0.5">
              {alertSteps.map(s => `"${s.name}" is ${s.taskStatus}`).join(', ')}. Please resolve before this audit can proceed.
            </p>
          </div>
        </div>
      )}

      {/* ── Progress bar ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Overall Progress</span>
          <span className="text-sm font-semibold text-blue-600">{progressPct}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2.5">
          <div
            className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }} />
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-gray-500">
            {completedCount} of {totalCount} steps completed
          </span>
          {lastFetch && (
            <span className="text-xs text-gray-400">
              Last updated {lastFetch.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircleIcon className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700">Failed to load checklist</p>
            <p className="text-sm text-red-600 mt-0.5">{error}</p>
            <button onClick={fetchChecklist} className="mt-2 text-sm text-red-700 underline hover:no-underline">
              Try again
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2Icon className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-sm text-gray-500">Loading checklist from Flowable…</p>
        </div>
      )}

      {!loading && steps.length > 0 && (
        <div className="space-y-3">
          {steps.map((step) => (
            <StepRow key={step.index} step={step} onStart={handleStart} />
          ))}
        </div>
      )}

      {!loading && steps.length > 0 && completedCount === totalCount && (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
          <CheckCircle2Icon className="w-6 h-6 text-green-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-700">Audit Complete!</p>
            <p className="text-sm text-green-600">All checklist steps have been completed and approved.</p>
          </div>
        </div>
      )}

      {!loading && !processInstanceId && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <AlertCircleIcon className="w-10 h-10 text-amber-500" />
          <p className="text-sm font-medium text-gray-700">No audit selected</p>
          <p className="text-xs text-gray-500">Please go back to Audits and open one, or create a new audit.</p>
          <button
            onClick={() => navigate('/audits')}
            className="mt-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
            Go to Audits
          </button>
        </div>
      )}
    </div>
  );
}