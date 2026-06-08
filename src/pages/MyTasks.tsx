// ============================================================
//  MyTasks.tsx
//  Updated with Flowable integration + Jira-style multi-status
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../pages/AuthContext';
import {
  SearchIcon,
  FilterIcon,
  ClipboardListIcon,
  ListIcon,
  FileTextIcon,
  CalendarIcon,
  UserIcon,
  BuildingIcon,
  DownloadIcon,
  ChevronDownIcon,
  MessageSquareIcon,
  Loader2Icon,
  AlertCircleIcon,
  RefreshCwIcon,
  CheckCircle2Icon,
  CircleIcon,
  PlayCircleIcon,
  PauseCircleIcon,
  XCircleIcon,
  AlertTriangleIcon,
  BanIcon,
} from 'lucide-react';
import {
  getTasksByAssignee,
  getProcessVariables,
  completeTask,
  saveProcessVariable,
  FlowableTask,
  ProcessVariable,
  getVariableValue,
} from './services/flowableApi';

// ─────────────────────────────────────────────────────────────
// STATUS DEFINITIONS — Jira-style
// ─────────────────────────────────────────────────────────────

type TaskStatus =
  | 'Open'
  | 'In Progress'
  | 'Blocked'
  | 'On Hold'
  | 'Invalid'
  | 'Needs Review'
  | 'Completed';

interface StatusConfig {
  label:      TaskStatus;
  color:      string;   // badge bg + text
  dotColor:   string;   // dot color
  icon:       React.ReactNode;
  menuClass:  string;   // hover bg in dropdown
}

const STATUS_CONFIG: StatusConfig[] = [
  {
    label:     'Open',
    color:     'bg-orange-100 text-orange-700',
    dotColor:  'bg-orange-500',
    icon:      <CircleIcon className="w-3.5 h-3.5" />,
    menuClass: 'hover:bg-orange-50 text-orange-700',
  },
  {
    label:     'In Progress',
    color:     'bg-blue-100 text-blue-700',
    dotColor:  'bg-blue-500',
    icon:      <PlayCircleIcon className="w-3.5 h-3.5" />,
    menuClass: 'hover:bg-blue-50 text-blue-700',
  },
  {
    label:     'Needs Review',
    color:     'bg-purple-100 text-purple-700',
    dotColor:  'bg-purple-500',
    icon:      <AlertCircleIcon className="w-3.5 h-3.5" />,
    menuClass: 'hover:bg-purple-50 text-purple-700',
  },
  {
    label:     'On Hold',
    color:     'bg-yellow-100 text-yellow-700',
    dotColor:  'bg-yellow-500',
    icon:      <PauseCircleIcon className="w-3.5 h-3.5" />,
    menuClass: 'hover:bg-yellow-50 text-yellow-700',
  },
  {
    label:     'Blocked',
    color:     'bg-red-100 text-red-700',
    dotColor:  'bg-red-500',
    icon:      <BanIcon className="w-3.5 h-3.5" />,
    menuClass: 'hover:bg-red-50 text-red-700',
  },
  {
    label:     'Invalid',
    color:     'bg-gray-100 text-gray-500',
    dotColor:  'bg-gray-400',
    icon:      <XCircleIcon className="w-3.5 h-3.5" />,
    menuClass: 'hover:bg-gray-100 text-gray-600',
  },
  {
    label:     'Completed',
    color:     'bg-green-100 text-green-700',
    dotColor:  'bg-green-500',
    icon:      <CheckCircle2Icon className="w-3.5 h-3.5" />,
    menuClass: 'hover:bg-green-50 text-green-700',
  },
];

function getStatusConfig(status: string): StatusConfig {
  return STATUS_CONFIG.find((s) => s.label === status) ?? STATUS_CONFIG[0];
}

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface EnrichedTask {
  task:         FlowableTask;
  auditName:    string;
  projectName:  string;
  stepName:     string;
  evidenceFile: string;
  comments:     string;
  priority:     string;
  daysLeft:     string;
  status:       TaskStatus;
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

function getDaysLeft(iso: string | null): string {
  if (!iso) return '';
  const diff = Math.ceil(
    (new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  if (diff < 0)   return `${Math.abs(diff)} day${Math.abs(diff) !== 1 ? 's' : ''} overdue`;
  if (diff === 0) return 'Due today';
  return `${diff} day${diff !== 1 ? 's' : ''} left`;
}

function dueDateColor(iso: string | null): string {
  if (!iso) return 'text-gray-600';
  const diff = Math.ceil(
    (new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  if (diff < 0)  return 'text-red-600 font-medium';
  if (diff <= 2) return 'text-red-600 font-medium';
  if (diff <= 5) return 'text-amber-600 font-medium';
  return 'text-gray-900 font-medium';
}

function priorityFromNumber(p: number): string {
  if (p >= 75) return 'High';
  if (p >= 50) return 'Medium';
  return 'Low';
}

function priorityBadgeClass(priority: string): string {
  if (priority === 'High')   return 'bg-red-100 text-red-700';
  if (priority === 'Medium') return 'bg-amber-100 text-amber-700';
  return 'bg-green-100 text-green-700';
}

// Enrich a single Flowable task with process variables
async function enrichTask(task: FlowableTask): Promise<EnrichedTask> {
  let vars: ProcessVariable[] = [];
  try {
    vars = await getProcessVariables(task.processInstanceId);
  } catch { /* skip if unavailable */ }

  const priorityVar = getVariableValue(vars, 'priority');

  // task.dueDate is null if not set directly on the Flowable task.
  // Fall back to the process-level dueDate variable set during CreateAudit.
  const effectiveDueDate = task.dueDate || getVariableValue(vars, 'dueDate') || null;

  // Read persisted status from process variable, default to 'Open'
  const savedStatus = getVariableValue(vars, 'taskStatus') as TaskStatus | null;

  return {
    task: { ...task, dueDate: effectiveDueDate },
    auditName:    getVariableValue(vars, 'auditName')    || task.processDefinitionId || 'Audit',
    projectName:  getVariableValue(vars, 'projectName')  || '—',
    stepName:     getVariableValue(vars, 'stepName')     || task.name || '—',
    evidenceFile: getVariableValue(vars, 'evidenceFile') || '',
    comments:     getVariableValue(vars, 'comments')     || '',
    priority:     priorityVar || priorityFromNumber(task.priority || 0),
    daysLeft:     getDaysLeft(effectiveDueDate),
    status:       savedStatus || 'Open',
  };
}

// ─────────────────────────────────────────────────────────────
// STATUS BADGE — standalone pill used in the card header
// ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: TaskStatus }) {
  const cfg = getStatusConfig(status);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotColor}`} />
      {status}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// STATUS DROPDOWN — Jira-style picker
// ─────────────────────────────────────────────────────────────

interface StatusDropdownProps {
  current:   TaskStatus;
  onChange:  (s: TaskStatus) => void;
  loading:   boolean;
}

function StatusDropdown({ current, onChange, loading }: StatusDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cfg = getStatusConfig(current);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium disabled:opacity-50"
      >
        {loading
          ? <Loader2Icon className="w-3.5 h-3.5 animate-spin text-gray-500" />
          : <span className={`inline-flex items-center gap-1 ${cfg.color.split(' ')[1]}`}>{cfg.icon}</span>
        }
        Update Status
        <ChevronDownIcon className="w-4 h-4 text-gray-500" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-xl z-[9999] py-1 overflow-hidden">
          <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Change Status
          </p>
          {STATUS_CONFIG.map((s) => (
            <button
              key={s.label}
              onClick={() => { onChange(s.label); setOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium transition-colors ${s.menuClass} ${current === s.label ? 'opacity-50 cursor-default' : ''}`}
              disabled={current === s.label}
            >
              {s.icon}
              {s.label}
              {current === s.label && (
                <span className="ml-auto text-[10px] font-normal text-gray-400">current</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TASK CARD
// ─────────────────────────────────────────────────────────────

interface TaskCardProps {
  enriched:         EnrichedTask;
  onViewTask:       (t: EnrichedTask) => void;
  onCompleteTask:   (t: EnrichedTask) => void;
  onStatusChange:   (t: EnrichedTask, s: TaskStatus) => void;
  completing:       boolean;
  statusUpdating:   boolean;
}

function TaskCard({
  enriched,
  onViewTask,
  onCompleteTask,
  onStatusChange,
  completing,
  statusUpdating,
}: TaskCardProps) {
  const { task, auditName, projectName, stepName, evidenceFile, comments, priority, daysLeft, status } = enriched;

  return (
    <div className="bg-white p-6 border-b border-gray-200 last:border-b-0">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">

          {/* Title + status badge */}
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <h3 className="text-lg font-semibold text-blue-600">{task.name}</h3>
            <StatusBadge status={status} />
          </div>

          {/* Priority badge */}
          <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium mb-4 ${priorityBadgeClass(priority)}`}>
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            {priority} Priority
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 mb-4">
            <div className="flex items-center gap-2 text-sm">
              <ClipboardListIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="text-gray-600">Audit</span>
              <span className="text-gray-900 font-medium truncate">{auditName}</span>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <UserIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="text-gray-600">Assigned To</span>
              <span className="text-gray-900 font-medium">{task.assignee || '—'}</span>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <ListIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="text-gray-600">Audit Step</span>
              <span className="text-gray-900 font-medium truncate">{stepName}</span>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <FileTextIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="text-gray-600">Task Form</span>
              <span className="text-gray-900 font-medium">managerReviewForm</span>
            </div>

            {comments && (
              <div className="text-sm text-gray-700 col-span-2 bg-gray-50 rounded-lg p-2">
                {comments}
              </div>
            )}

            <div className="flex items-center gap-2 text-sm">
              <CalendarIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="text-gray-600">Due Date</span>
              <span className={dueDateColor(task.dueDate)}>
                {formatDate(task.dueDate)}
                {daysLeft && <> ({daysLeft})</>}
              </span>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <BuildingIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="text-gray-600">Project</span>
              <span className="text-gray-900 font-medium truncate">{projectName}</span>
            </div>

            {/* Flowable task ID */}
            <div className="col-span-2 text-xs text-gray-400 font-mono">
              Task ID: {task.id}
            </div>
          </div>

          {/* Evidence attachment */}
          {evidenceFile && (
            <div>
              <div className="text-sm font-medium text-gray-700 mb-2">Attachments</div>
              <div className="border border-gray-200 rounded-lg p-3 inline-flex items-center gap-3">
                <div className="w-8 h-8 bg-red-100 rounded flex items-center justify-center">
                  <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">{evidenceFile}</div>
                  <div className="text-xs text-gray-500">Evidence file</div>
                </div>
                <button className="ml-4 p-1 text-gray-600 hover:bg-gray-100 rounded transition-colors">
                  <DownloadIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => onViewTask(enriched)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
          View Task
        </button>

        {/* Jira-style status dropdown */}
        <StatusDropdown
          current={status}
          loading={statusUpdating}
          onChange={(newStatus) => onStatusChange(enriched, newStatus)}
        />

        <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium">
          <MessageSquareIcon className="w-4 h-4" />
          Add Comment
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

export function MyTasks() {
  const navigate = useNavigate();

  // const currentUser = localStorage.getItem('currentAuditorName') || 'admin';
 const { user }    = useAuth();
  const currentUser = user?.id || 'admin';
  const [activeTab,       setActiveTab]       = useState<'my' | 'group' | 'completed'>('my');
  const [searchQuery,     setSearchQuery]     = useState('');
  const [statusFilter,    setStatusFilter]    = useState<TaskStatus | 'All'>('All');
  const [tasks,           setTasks]           = useState<EnrichedTask[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState('');
  const [completingId,    setCompletingId]    = useState<string | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);

  // ── Fetch tasks from Flowable ──────────────────────────────
  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rawTasks = await getTasksByAssignee(currentUser, user?.name);
      const enriched = await Promise.all(rawTasks.map(enrichTask));
      setTasks(enriched);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load tasks from Flowable. Make sure it is running on port 8080.'
      );
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // ── View Task ──────────────────────────────────────────────
  const handleViewTask = (enriched: EnrichedTask) => {
    localStorage.setItem('currentTaskId',            enriched.task.id);
    localStorage.setItem('currentProcessInstanceId', enriched.task.processInstanceId);
    localStorage.setItem('currentAuditName',         enriched.auditName);
    navigate(`/tasks/${enriched.task.id}`);
  };

  // ── Complete task in Flowable ──────────────────────────────
  const handleCompleteTask = async (enriched: EnrichedTask) => {
    if (!window.confirm(`Mark "${enriched.task.name}" as completed?`)) return;
    setCompletingId(enriched.task.id);
    try {
      await completeTask(enriched.task.id, {
        approvalDecision: 'Approved',
        managerComments:  'Approved via My Tasks',
      });
      setTasks((prev) => prev.filter((t) => t.task.id !== enriched.task.id));
    } catch (err) {
      alert('Failed to complete task: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setCompletingId(null);
    }
  };

  // ── Update status — saves to Flowable process variable ─────
  const handleStatusChange = async (enriched: EnrichedTask, newStatus: TaskStatus) => {
    setStatusUpdatingId(enriched.task.id);
    try {
      // Persist to Flowable so it survives page refresh
      await saveProcessVariable(enriched.task.processInstanceId, 'taskStatus', newStatus);

      // If user picked Completed, also complete the Flowable task
      if (newStatus === 'Completed') {
        await completeTask(enriched.task.id, {
          approvalDecision: 'Approved',
          managerComments:  'Marked completed via status update',
        });
        setTasks((prev) => prev.filter((t) => t.task.id !== enriched.task.id));
        return;
      }

      // Otherwise just update local state
      setTasks((prev) =>
        prev.map((t) =>
          t.task.id === enriched.task.id ? { ...t, status: newStatus } : t
        )
      );
    } catch (err) {
      alert('Failed to update status: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setStatusUpdatingId(null);
    }
  };

  // ── Filter by search + status tab ─────────────────────────
  const filtered = tasks.filter((e) => {
    const matchesSearch =
      e.task.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.auditName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.stepName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.task.assignee || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'All' || e.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Count per status for filter pills
  const statusCounts = tasks.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">My Tasks</h1>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">

        {/* Tab bar */}
        <div className="border-b border-gray-200">
          <div className="flex items-center gap-8 px-6">
            {(['my', 'group', 'completed'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-4 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === tab
                    ? 'text-blue-600 border-blue-600'
                    : 'text-gray-500 border-transparent hover:text-gray-900'
                }`}>
                {tab === 'my' ? 'My Tasks' : tab === 'group' ? 'Group Tasks' : 'Completed Tasks'}
              </button>
            ))}
            <div className="ml-auto">
              <button
                onClick={fetchTasks}
                disabled={loading}
                className="flex items-center gap-1.5 py-4 text-sm text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50">
                <RefreshCwIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        <div className="p-6">

          {/* Search + Filter row */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-md">
              <SearchIcon className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              <FilterIcon className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          {/* Status filter pills */}
          {!loading && tasks.length > 0 && (
            <div className="flex items-center gap-2 mb-5 flex-wrap">
              <button
                onClick={() => setStatusFilter('All')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                  statusFilter === 'All'
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}>
                All <span className="ml-1 opacity-70">{tasks.length}</span>
              </button>
              {STATUS_CONFIG.map((s) => {
                const count = statusCounts[s.label] || 0;
                if (count === 0) return null;
                return (
                  <button
                    key={s.label}
                    onClick={() => setStatusFilter(s.label)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                      statusFilter === s.label
                        ? `${s.color} border-transparent`
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${s.dotColor}`} />
                    {s.label}
                    <span className="opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2Icon className="w-8 h-8 text-blue-600 animate-spin" />
              <p className="text-sm text-gray-500">Loading tasks from Flowable…</p>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
              <AlertCircleIcon className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-700">Failed to load tasks</p>
                <p className="text-sm text-red-600 mt-0.5">{error}</p>
                <button onClick={fetchTasks} className="mt-2 text-sm text-red-700 underline hover:no-underline">
                  Try again
                </button>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center">
                <CheckCircle2Icon className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-700">
                {searchQuery || statusFilter !== 'All'
                  ? 'No tasks match your filters'
                  : `No tasks assigned to "${user?.name || currentUser}"`}
              </p>
              <p className="text-xs text-gray-500">
                {searchQuery || statusFilter !== 'All'
                  ? 'Try clearing the search or status filter'
                  : 'Tasks assigned to you in Flowable will appear here'}
              </p>
            </div>
          )}

          {/* Task cards */}
          {!loading && filtered.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-visible relative">
              {filtered.map((enriched) => (
                <TaskCard
                  key={enriched.task.id}
                  enriched={enriched}
                  onViewTask={handleViewTask}
                  onCompleteTask={handleCompleteTask}
                  onStatusChange={handleStatusChange}
                  completing={completingId === enriched.task.id}
                  statusUpdating={statusUpdatingId === enriched.task.id}
                />
              ))}
            </div>
          )}

          {/* Row count */}
          {!loading && tasks.length > 0 && (
            <div className="mt-4 text-xs text-gray-400 text-right">
              Showing {filtered.length} of {tasks.length} task{tasks.length !== 1 ? 's' : ''} assigned to "{currentUser}" from Flowable
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
// // ============================================================
// //  MyTasks.tsx
// //  Updated with Flowable integration + Jira-style multi-status
// // ============================================================

// import React, { useState, useEffect, useCallback, useRef } from 'react';
// import { useNavigate } from 'react-router-dom';
// import { useAuth } from '../pages/AuthContext';
// import {
//   SearchIcon,
//   FilterIcon,
//   ClipboardListIcon,
//   ListIcon,
//   FileTextIcon,
//   CalendarIcon,
//   UserIcon,
//   BuildingIcon,
//   DownloadIcon,
//   ChevronDownIcon,
//   MessageSquareIcon,
//   Loader2Icon,
//   AlertCircleIcon,
//   RefreshCwIcon,
//   CheckCircle2Icon,
//   CircleIcon,
//   PlayCircleIcon,
//   PauseCircleIcon,
//   XCircleIcon,
//   AlertTriangleIcon,
//   BanIcon,
// } from 'lucide-react';
// import {
//   getTasksByAssignee,
//   getProcessVariables,
//   completeTask,
//   saveProcessVariable,
//   FlowableTask,
//   ProcessVariable,
//   getVariableValue,
// } from './services/flowableApi';

// // ─────────────────────────────────────────────────────────────
// // STATUS DEFINITIONS — Jira-style
// // ─────────────────────────────────────────────────────────────

// type TaskStatus =
//   | 'Open'
//   | 'In Progress'
//   | 'Blocked'
//   | 'On Hold'
//   | 'Invalid'
//   | 'Needs Review'
//   | 'Completed';

// interface StatusConfig {
//   label:      TaskStatus;
//   color:      string;   // badge bg + text
//   dotColor:   string;   // dot color
//   icon:       React.ReactNode;
//   menuClass:  string;   // hover bg in dropdown
// }

// const STATUS_CONFIG: StatusConfig[] = [
//   {
//     label:     'Open',
//     color:     'bg-orange-100 text-orange-700',
//     dotColor:  'bg-orange-500',
//     icon:      <CircleIcon className="w-3.5 h-3.5" />,
//     menuClass: 'hover:bg-orange-50 text-orange-700',
//   },
//   {
//     label:     'In Progress',
//     color:     'bg-blue-100 text-blue-700',
//     dotColor:  'bg-blue-500',
//     icon:      <PlayCircleIcon className="w-3.5 h-3.5" />,
//     menuClass: 'hover:bg-blue-50 text-blue-700',
//   },
//   {
//     label:     'Needs Review',
//     color:     'bg-purple-100 text-purple-700',
//     dotColor:  'bg-purple-500',
//     icon:      <AlertCircleIcon className="w-3.5 h-3.5" />,
//     menuClass: 'hover:bg-purple-50 text-purple-700',
//   },
//   {
//     label:     'On Hold',
//     color:     'bg-yellow-100 text-yellow-700',
//     dotColor:  'bg-yellow-500',
//     icon:      <PauseCircleIcon className="w-3.5 h-3.5" />,
//     menuClass: 'hover:bg-yellow-50 text-yellow-700',
//   },
//   {
//     label:     'Blocked',
//     color:     'bg-red-100 text-red-700',
//     dotColor:  'bg-red-500',
//     icon:      <BanIcon className="w-3.5 h-3.5" />,
//     menuClass: 'hover:bg-red-50 text-red-700',
//   },
//   {
//     label:     'Invalid',
//     color:     'bg-gray-100 text-gray-500',
//     dotColor:  'bg-gray-400',
//     icon:      <XCircleIcon className="w-3.5 h-3.5" />,
//     menuClass: 'hover:bg-gray-100 text-gray-600',
//   },
//   {
//     label:     'Completed',
//     color:     'bg-green-100 text-green-700',
//     dotColor:  'bg-green-500',
//     icon:      <CheckCircle2Icon className="w-3.5 h-3.5" />,
//     menuClass: 'hover:bg-green-50 text-green-700',
//   },
// ];

// function getStatusConfig(status: string): StatusConfig {
//   return STATUS_CONFIG.find((s) => s.label === status) ?? STATUS_CONFIG[0];
// }

// // ─────────────────────────────────────────────────────────────
// // TYPES
// // ─────────────────────────────────────────────────────────────

// interface EnrichedTask {
//   task:         FlowableTask;
//   auditName:    string;
//   projectName:  string;
//   stepName:     string;
//   evidenceFile: string;
//   comments:     string;
//   priority:     string;
//   daysLeft:     string;
//   status:       TaskStatus;
// }

// // ─────────────────────────────────────────────────────────────
// // HELPERS
// // ─────────────────────────────────────────────────────────────

// function formatDate(iso: string | null): string {
//   if (!iso) return '—';
//   try {
//     return new Date(iso).toLocaleDateString('en-GB', {
//       day: '2-digit', month: 'short', year: 'numeric',
//     });
//   } catch { return iso; }
// }

// function getDaysLeft(iso: string | null): string {
//   if (!iso) return '';
//   const diff = Math.ceil(
//     (new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
//   );
//   if (diff < 0)   return `${Math.abs(diff)} day${Math.abs(diff) !== 1 ? 's' : ''} overdue`;
//   if (diff === 0) return 'Due today';
//   return `${diff} day${diff !== 1 ? 's' : ''} left`;
// }

// function dueDateColor(iso: string | null): string {
//   if (!iso) return 'text-gray-600';
//   const diff = Math.ceil(
//     (new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
//   );
//   if (diff < 0)  return 'text-red-600 font-medium';
//   if (diff <= 2) return 'text-red-600 font-medium';
//   if (diff <= 5) return 'text-amber-600 font-medium';
//   return 'text-gray-900 font-medium';
// }

// function priorityFromNumber(p: number): string {
//   if (p >= 75) return 'High';
//   if (p >= 50) return 'Medium';
//   return 'Low';
// }

// function priorityBadgeClass(priority: string): string {
//   if (priority === 'High')   return 'bg-red-100 text-red-700';
//   if (priority === 'Medium') return 'bg-amber-100 text-amber-700';
//   return 'bg-green-100 text-green-700';
// }

// // Enrich a single Flowable task with process variables
// async function enrichTask(task: FlowableTask): Promise<EnrichedTask> {
//   let vars: ProcessVariable[] = [];
//   try {
//     vars = await getProcessVariables(task.processInstanceId);
//   } catch { /* skip if unavailable */ }

//   const priorityVar = getVariableValue(vars, 'priority');

//   // task.dueDate is null if not set directly on the Flowable task.
//   // Fall back to the process-level dueDate variable set during CreateAudit.
//   const effectiveDueDate = task.dueDate || getVariableValue(vars, 'dueDate') || null;

//   // Read persisted status from process variable, default to 'Open'
//   const savedStatus = getVariableValue(vars, 'taskStatus') as TaskStatus | null;

//   return {
//     task: { ...task, dueDate: effectiveDueDate },
//     auditName:    getVariableValue(vars, 'auditName')    || task.processDefinitionId || 'Audit',
//     projectName:  getVariableValue(vars, 'projectName')  || '—',
//     stepName:     getVariableValue(vars, 'stepName')     || task.name || '—',
//     evidenceFile: getVariableValue(vars, 'evidenceFile') || '',
//     comments:     getVariableValue(vars, 'comments')     || '',
//     priority:     priorityVar || priorityFromNumber(task.priority || 0),
//     daysLeft:     getDaysLeft(effectiveDueDate),
//     status:       savedStatus || 'Open',
//   };
// }

// // ─────────────────────────────────────────────────────────────
// // STATUS BADGE — standalone pill used in the card header
// // ─────────────────────────────────────────────────────────────

// function StatusBadge({ status }: { status: TaskStatus }) {
//   const cfg = getStatusConfig(status);
//   return (
//     <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
//       <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotColor}`} />
//       {status}
//     </span>
//   );
// }

// // ─────────────────────────────────────────────────────────────
// // STATUS DROPDOWN — Jira-style picker
// // ─────────────────────────────────────────────────────────────

// interface StatusDropdownProps {
//   current:   TaskStatus;
//   onChange:  (s: TaskStatus) => void;
//   loading:   boolean;
// }

// function StatusDropdown({ current, onChange, loading }: StatusDropdownProps) {
//   const [open, setOpen] = useState(false);
//   const ref = useRef<HTMLDivElement>(null);
//   const cfg = getStatusConfig(current);

//   // Close on outside click
//   useEffect(() => {
//     const handler = (e: MouseEvent) => {
//       if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
//     };
//     document.addEventListener('mousedown', handler);
//     return () => document.removeEventListener('mousedown', handler);
//   }, []);

//   return (
//     <div className="relative inline-block" ref={ref}>
//       <button
//         onClick={() => setOpen((v) => !v)}
//         disabled={loading}
//         className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium disabled:opacity-50"
//       >
//         {loading
//           ? <Loader2Icon className="w-3.5 h-3.5 animate-spin text-gray-500" />
//           : <span className={`inline-flex items-center gap-1 ${cfg.color.split(' ')[1]}`}>{cfg.icon}</span>
//         }
//         Update Status
//         <ChevronDownIcon className="w-4 h-4 text-gray-500" />
//       </button>

//       {open && (
//         <div className="absolute left-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-xl z-[9999] py-1 overflow-hidden">
//           <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
//             Change Status
//           </p>
//           {STATUS_CONFIG.map((s) => (
//             <button
//               key={s.label}
//               onClick={() => { onChange(s.label); setOpen(false); }}
//               className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium transition-colors ${s.menuClass} ${current === s.label ? 'opacity-50 cursor-default' : ''}`}
//               disabled={current === s.label}
//             >
//               {s.icon}
//               {s.label}
//               {current === s.label && (
//                 <span className="ml-auto text-[10px] font-normal text-gray-400">current</span>
//               )}
//             </button>
//           ))}
//         </div>
//       )}
//     </div>
//   );
// }

// // ─────────────────────────────────────────────────────────────
// // TASK CARD
// // ─────────────────────────────────────────────────────────────

// interface TaskCardProps {
//   enriched:         EnrichedTask;
//   onViewTask:       (t: EnrichedTask) => void;
//   onCompleteTask:   (t: EnrichedTask) => void;
//   onStatusChange:   (t: EnrichedTask, s: TaskStatus) => void;
//   completing:       boolean;
//   statusUpdating:   boolean;
// }

// function TaskCard({
//   enriched,
//   onViewTask,
//   onCompleteTask,
//   onStatusChange,
//   completing,
//   statusUpdating,
// }: TaskCardProps) {
//   const { task, auditName, projectName, stepName, evidenceFile, comments, priority, daysLeft, status } = enriched;

//   return (
//     <div className="bg-white p-6 border-b border-gray-200 last:border-b-0">
//       <div className="flex items-start justify-between mb-4">
//         <div className="flex-1">

//           {/* Title + status badge */}
//           <div className="flex items-center gap-3 mb-3 flex-wrap">
//             <h3 className="text-lg font-semibold text-blue-600">{task.name}</h3>
//             <StatusBadge status={status} />
//           </div>

//           {/* Priority badge */}
//           <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium mb-4 ${priorityBadgeClass(priority)}`}>
//             <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
//               <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
//             </svg>
//             {priority} Priority
//           </div>

//           {/* Details grid */}
//           <div className="grid grid-cols-2 gap-x-8 gap-y-3 mb-4">
//             <div className="flex items-center gap-2 text-sm">
//               <ClipboardListIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
//               <span className="text-gray-600">Audit</span>
//               <span className="text-gray-900 font-medium truncate">{auditName}</span>
//             </div>

//             <div className="flex items-center gap-2 text-sm">
//               <UserIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
//               <span className="text-gray-600">Assigned To</span>
//               <span className="text-gray-900 font-medium">{task.assignee || '—'}</span>
//             </div>

//             <div className="flex items-center gap-2 text-sm">
//               <ListIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
//               <span className="text-gray-600">Audit Step</span>
//               <span className="text-gray-900 font-medium truncate">{stepName}</span>
//             </div>

//             <div className="flex items-center gap-2 text-sm">
//               <FileTextIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
//               <span className="text-gray-600">Task Form</span>
//               <span className="text-gray-900 font-medium">managerReviewForm</span>
//             </div>

//             {comments && (
//               <div className="text-sm text-gray-700 col-span-2 bg-gray-50 rounded-lg p-2">
//                 {comments}
//               </div>
//             )}

//             <div className="flex items-center gap-2 text-sm">
//               <CalendarIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
//               <span className="text-gray-600">Due Date</span>
//               <span className={dueDateColor(task.dueDate)}>
//                 {formatDate(task.dueDate)}
//                 {daysLeft && <> ({daysLeft})</>}
//               </span>
//             </div>

//             <div className="flex items-center gap-2 text-sm">
//               <BuildingIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
//               <span className="text-gray-600">Project</span>
//               <span className="text-gray-900 font-medium truncate">{projectName}</span>
//             </div>

//             {/* Flowable task ID */}
//             <div className="col-span-2 text-xs text-gray-400 font-mono">
//               Task ID: {task.id}
//             </div>
//           </div>

//           {/* Evidence attachment */}
//           {evidenceFile && (
//             <div>
//               <div className="text-sm font-medium text-gray-700 mb-2">Attachments</div>
//               <div className="border border-gray-200 rounded-lg p-3 inline-flex items-center gap-3">
//                 <div className="w-8 h-8 bg-red-100 rounded flex items-center justify-center">
//                   <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
//                     <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
//                   </svg>
//                 </div>
//                 <div>
//                   <div className="text-sm font-medium text-gray-900">{evidenceFile}</div>
//                   <div className="text-xs text-gray-500">Evidence file</div>
//                 </div>
//                 <button className="ml-4 p-1 text-gray-600 hover:bg-gray-100 rounded transition-colors">
//                   <DownloadIcon className="w-4 h-4" />
//                 </button>
//               </div>
//             </div>
//           )}
//         </div>
//       </div>

//       {/* Action buttons */}
//       <div className="flex items-center gap-3 flex-wrap">
//         <button
//           onClick={() => onViewTask(enriched)}
//           className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
//           View Task
//         </button>

//         {/* Jira-style status dropdown */}
//         <StatusDropdown
//           current={status}
//           loading={statusUpdating}
//           onChange={(newStatus) => onStatusChange(enriched, newStatus)}
//         />

//         <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium">
//           <MessageSquareIcon className="w-4 h-4" />
//           Add Comment
//         </button>
//       </div>
//     </div>
//   );
// }

// // ─────────────────────────────────────────────────────────────
// // MAIN COMPONENT
// // ─────────────────────────────────────────────────────────────

// export function MyTasks() {
//   const navigate = useNavigate();

//   // const currentUser = localStorage.getItem('currentAuditorName') || 'admin';
//  const { user }    = useAuth();
//   const currentUser = user?.id || 'admin';
//   const [activeTab,       setActiveTab]       = useState<'my' | 'group' | 'completed'>('my');
//   const [searchQuery,     setSearchQuery]     = useState('');
//   const [statusFilter,    setStatusFilter]    = useState<TaskStatus | 'All'>('All');
//   const [tasks,           setTasks]           = useState<EnrichedTask[]>([]);
//   const [loading,         setLoading]         = useState(true);
//   const [error,           setError]           = useState('');
//   const [completingId,    setCompletingId]    = useState<string | null>(null);
//   const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);

//   // ── Fetch tasks from Flowable ──────────────────────────────
//   const fetchTasks = useCallback(async () => {
//     setLoading(true);
//     setError('');
//     try {
//       const rawTasks = await getTasksByAssignee(currentUser);
//       const enriched = await Promise.all(rawTasks.map(enrichTask));
//       setTasks(enriched);
//     } catch (err) {
//       setError(
//         err instanceof Error
//           ? err.message
//           : 'Failed to load tasks from Flowable. Make sure it is running on port 8080.'
//       );
//     } finally {
//       setLoading(false);
//     }
//   }, [currentUser]);

//   useEffect(() => { fetchTasks(); }, [fetchTasks]);

//   // ── View Task ──────────────────────────────────────────────
//   const handleViewTask = (enriched: EnrichedTask) => {
//     localStorage.setItem('currentTaskId',            enriched.task.id);
//     localStorage.setItem('currentProcessInstanceId', enriched.task.processInstanceId);
//     localStorage.setItem('currentAuditName',         enriched.auditName);
//     navigate(`/tasks/${enriched.task.id}`);
//   };

//   // ── Complete task in Flowable ──────────────────────────────
//   const handleCompleteTask = async (enriched: EnrichedTask) => {
//     if (!window.confirm(`Mark "${enriched.task.name}" as completed?`)) return;
//     setCompletingId(enriched.task.id);
//     try {
//       await completeTask(enriched.task.id, {
//         approvalDecision: 'Approved',
//         managerComments:  'Approved via My Tasks',
//       });
//       setTasks((prev) => prev.filter((t) => t.task.id !== enriched.task.id));
//     } catch (err) {
//       alert('Failed to complete task: ' + (err instanceof Error ? err.message : 'Unknown error'));
//     } finally {
//       setCompletingId(null);
//     }
//   };

//   // ── Update status — saves to Flowable process variable ─────
//   const handleStatusChange = async (enriched: EnrichedTask, newStatus: TaskStatus) => {
//     setStatusUpdatingId(enriched.task.id);
//     try {
//       // Persist to Flowable so it survives page refresh
//       await saveProcessVariable(enriched.task.processInstanceId, 'taskStatus', newStatus);

//       // If user picked Completed, also complete the Flowable task
//       if (newStatus === 'Completed') {
//         await completeTask(enriched.task.id, {
//           approvalDecision: 'Approved',
//           managerComments:  'Marked completed via status update',
//         });
//         setTasks((prev) => prev.filter((t) => t.task.id !== enriched.task.id));
//         return;
//       }

//       // Otherwise just update local state
//       setTasks((prev) =>
//         prev.map((t) =>
//           t.task.id === enriched.task.id ? { ...t, status: newStatus } : t
//         )
//       );
//     } catch (err) {
//       alert('Failed to update status: ' + (err instanceof Error ? err.message : 'Unknown error'));
//     } finally {
//       setStatusUpdatingId(null);
//     }
//   };

//   // ── Filter by search + status tab ─────────────────────────
//   const filtered = tasks.filter((e) => {
//     const matchesSearch =
//       e.task.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
//       e.auditName.toLowerCase().includes(searchQuery.toLowerCase()) ||
//       e.stepName.toLowerCase().includes(searchQuery.toLowerCase()) ||
//       (e.task.assignee || '').toLowerCase().includes(searchQuery.toLowerCase());

//     const matchesStatus = statusFilter === 'All' || e.status === statusFilter;

//     return matchesSearch && matchesStatus;
//   });

//   // Count per status for filter pills
//   const statusCounts = tasks.reduce<Record<string, number>>((acc, t) => {
//     acc[t.status] = (acc[t.status] || 0) + 1;
//     return acc;
//   }, {});

//   return (
//     <div className="p-8">
//       <h1 className="text-2xl font-semibold text-gray-900 mb-6">My Tasks</h1>

//       <div className="bg-white rounded-lg shadow-sm border border-gray-200">

//         {/* Tab bar */}
//         <div className="border-b border-gray-200">
//           <div className="flex items-center gap-8 px-6">
//             {(['my', 'group', 'completed'] as const).map((tab) => (
//               <button
//                 key={tab}
//                 onClick={() => setActiveTab(tab)}
//                 className={`py-4 text-sm font-medium transition-colors border-b-2 ${
//                   activeTab === tab
//                     ? 'text-blue-600 border-blue-600'
//                     : 'text-gray-500 border-transparent hover:text-gray-900'
//                 }`}>
//                 {tab === 'my' ? 'My Tasks' : tab === 'group' ? 'Group Tasks' : 'Completed Tasks'}
//               </button>
//             ))}
//             <div className="ml-auto">
//               <button
//                 onClick={fetchTasks}
//                 disabled={loading}
//                 className="flex items-center gap-1.5 py-4 text-sm text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50">
//                 <RefreshCwIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
//                 Refresh
//               </button>
//             </div>
//           </div>
//         </div>

//         <div className="p-6">

//           {/* Search + Filter row */}
//           <div className="flex items-center gap-3 mb-4">
//             <div className="relative flex-1 max-w-md">
//               <SearchIcon className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
//               <input
//                 type="text"
//                 placeholder="Search tasks..."
//                 value={searchQuery}
//                 onChange={(e) => setSearchQuery(e.target.value)}
//                 className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
//               />
//             </div>
//             <button className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
//               <FilterIcon className="w-5 h-5 text-gray-600" />
//             </button>
//           </div>

//           {/* Status filter pills */}
//           {!loading && tasks.length > 0 && (
//             <div className="flex items-center gap-2 mb-5 flex-wrap">
//               <button
//                 onClick={() => setStatusFilter('All')}
//                 className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
//                   statusFilter === 'All'
//                     ? 'bg-gray-900 text-white border-gray-900'
//                     : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
//                 }`}>
//                 All <span className="ml-1 opacity-70">{tasks.length}</span>
//               </button>
//               {STATUS_CONFIG.map((s) => {
//                 const count = statusCounts[s.label] || 0;
//                 if (count === 0) return null;
//                 return (
//                   <button
//                     key={s.label}
//                     onClick={() => setStatusFilter(s.label)}
//                     className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
//                       statusFilter === s.label
//                         ? `${s.color} border-transparent`
//                         : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
//                     }`}>
//                     <span className={`w-1.5 h-1.5 rounded-full ${s.dotColor}`} />
//                     {s.label}
//                     <span className="opacity-70">{count}</span>
//                   </button>
//                 );
//               })}
//             </div>
//           )}

//           {/* Loading */}
//           {loading && (
//             <div className="flex flex-col items-center justify-center py-16 gap-3">
//               <Loader2Icon className="w-8 h-8 text-blue-600 animate-spin" />
//               <p className="text-sm text-gray-500">Loading tasks from Flowable…</p>
//             </div>
//           )}

//           {/* Error */}
//           {!loading && error && (
//             <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
//               <AlertCircleIcon className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
//               <div>
//                 <p className="text-sm font-semibold text-red-700">Failed to load tasks</p>
//                 <p className="text-sm text-red-600 mt-0.5">{error}</p>
//                 <button onClick={fetchTasks} className="mt-2 text-sm text-red-700 underline hover:no-underline">
//                   Try again
//                 </button>
//               </div>
//             </div>
//           )}

//           {/* Empty state */}
//           {!loading && !error && filtered.length === 0 && (
//             <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
//               <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center">
//                 <CheckCircle2Icon className="w-6 h-6 text-gray-400" />
//               </div>
//               <p className="text-sm font-medium text-gray-700">
//                 {searchQuery || statusFilter !== 'All'
//                   ? 'No tasks match your filters'
//                   : `No tasks assigned to "${currentUser}"`}
//               </p>
//               <p className="text-xs text-gray-500">
//                 {searchQuery || statusFilter !== 'All'
//                   ? 'Try clearing the search or status filter'
//                   : 'Tasks assigned to you in Flowable will appear here'}
//               </p>
//             </div>
//           )}

//           {/* Task cards */}
//           {!loading && filtered.length > 0 && (
//             <div className="border border-gray-200 rounded-lg overflow-visible relative">
//               {filtered.map((enriched) => (
//                 <TaskCard
//                   key={enriched.task.id}
//                   enriched={enriched}
//                   onViewTask={handleViewTask}
//                   onCompleteTask={handleCompleteTask}
//                   onStatusChange={handleStatusChange}
//                   completing={completingId === enriched.task.id}
//                   statusUpdating={statusUpdatingId === enriched.task.id}
//                 />
//               ))}
//             </div>
//           )}

//           {/* Row count */}
//           {!loading && tasks.length > 0 && (
//             <div className="mt-4 text-xs text-gray-400 text-right">
//               Showing {filtered.length} of {tasks.length} task{tasks.length !== 1 ? 's' : ''} assigned to "{currentUser}" from Flowable
//             </div>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// }