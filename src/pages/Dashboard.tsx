// ============================================================
//  Dashboard.tsx — with task status shown in My Open Tasks
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../pages/AuthContext';
import {
  ClipboardListIcon,
  CheckCircle2Icon,
  ClockIcon,
  AlertTriangleIcon,
  PlusIcon,
  Loader2Icon,
  RefreshCwIcon,
  AlertCircleIcon,
  ChevronRightIcon,
  UserIcon,
  FolderIcon,
  TrendingUpIcon,
  ActivityIcon,
  BanIcon,
  PauseCircleIcon,
} from 'lucide-react';
import {
  getAuditStats,
  getAllProcessInstances,
  getTasksByAssignee,
  getProcessVariables,
  getVariableValue,
  AuditStats,
  ProcessInstance,
  FlowableTask,
} from './services/flowableApi';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

type TaskStatus = 'Open' | 'In Progress' | 'Blocked' | 'On Hold' | 'Invalid' | 'Needs Review' | 'Completed';

interface RecentAudit {
  id:        string;
  name:      string;
  project:   string;
  auditor:   string;
  startTime: string;
  status:    'In Progress' | 'Completed' | 'Suspended';
}

interface EnrichedDashboardTask {
  task:       FlowableTask;
  taskStatus: TaskStatus;
}

interface DashboardData {
  stats:        AuditStats;
  recentAudits: RecentAudit[];
  myTasks:      EnrichedDashboardTask[];
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

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 1)  return 'just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function getInstanceStatus(instance: ProcessInstance): 'In Progress' | 'Completed' | 'Suspended' {
  if (instance.ended)     return 'Completed';
  if (instance.suspended) return 'Suspended';
  return 'In Progress';
}

// ─────────────────────────────────────────────────────────────
// TASK STATUS BADGE (for My Tasks panel)
// ─────────────────────────────────────────────────────────────

const ALERT_STATUSES: TaskStatus[] = ['Blocked', 'On Hold', 'Needs Review'];

function TaskStatusPill({ status }: { status: TaskStatus }) {
  const cfg: Partial<Record<TaskStatus, { cls: string; icon: React.ReactNode }>> = {
    'Blocked':      { cls: 'bg-red-100 text-red-700',      icon: <BanIcon className="w-3 h-3" /> },
    'On Hold':      { cls: 'bg-yellow-100 text-yellow-700', icon: <PauseCircleIcon className="w-3 h-3" /> },
    'Needs Review': { cls: 'bg-purple-100 text-purple-700', icon: <AlertTriangleIcon className="w-3 h-3" /> },
    'In Progress':  { cls: 'bg-blue-100 text-blue-700',    icon: <ClockIcon className="w-3 h-3" /> },
    'Invalid':      { cls: 'bg-gray-100 text-gray-500',    icon: null },
  };
  const c = cfg[status];
  if (!c) return null;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${c.cls}`}>
      {c.icon} {status}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// STAT CARD
// ─────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon, color, textColor, loading, onClick,
}: {
  label: string; value: number | string; icon: React.ReactNode;
  color: string; textColor: string; loading: boolean; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex items-center gap-5 ${onClick ? 'cursor-pointer hover:shadow-md hover:border-gray-300 transition-all' : ''}`}>
      <div className={`w-12 h-12 ${color} rounded-xl flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div>
        <p className="text-sm text-gray-500 mb-0.5">{label}</p>
        {loading
          ? <div className="h-8 w-16 bg-gray-100 rounded animate-pulse" />
          : <p className={`text-3xl font-bold ${textColor}`}>{value}</p>
        }
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: RecentAudit['status'] }) {
  const map = {
    'In Progress': 'bg-blue-100 text-blue-700',
    'Completed':   'bg-green-100 text-green-700',
    'Suspended':   'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${map[status]}`}>
      {status}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: number }) {
  if (priority >= 75) return <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">High</span>;
  if (priority >= 50) return <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">Medium</span>;
  return <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Low</span>;
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

export function Dashboard() {
  const navigate    = useNavigate();
  // const currentUser = 'admin';
  const { user, isAdmin } = useAuth();
  const currentUser       = user?.id || 'admin';

  const [data,      setData]      = useState<DashboardData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [stats, instances, rawTasks] = await Promise.all([
        getAuditStats(),
        getAllProcessInstances(),
        getTasksByAssignee(currentUser).catch(() => [] as FlowableTask[]),
      ]);

      // Enrich recent audits
      // const recent = instances
      //   .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      //   .slice(0, 5);

      // const recentAudits: RecentAudit[] = await Promise.all(
      //   recent.map(async (inst) => {
      //     let name = 'Unnamed Audit', project = '—', auditor = inst.startUserId || '—';
      //     const inlineVars = Array.isArray(inst.variables) && inst.variables.length > 0 ? inst.variables : null;
      //     if (inlineVars) {
      //       const get = (key: string) => {
      //         const v = (inlineVars as any[]).find((x: any) => x.name === key);
      //         return v ? String(v.value) : '';
      //       };
      //       name    = get('auditName')   || name;
      //       project = get('projectName') || project;
      //       auditor = get('auditorName') || auditor;
      //     } else if (!inst.ended && !inst._historic) {
      //       try {
      //         const vars = await getProcessVariables(inst.id);
      //         name    = getVariableValue(vars, 'auditName')   || name;
      //         project = getVariableValue(vars, 'projectName') || project;
      //         auditor = getVariableValue(vars, 'auditorName') || auditor;
      //       } catch { /* use defaults */ }
      //     }
      //     return { id: inst.id, name, project, auditor, startTime: inst.startTime, status: getInstanceStatus(inst) };
      //   })
      // );

      // Enrich tasks with their persisted taskStatus
      const myTasks: EnrichedDashboardTask[] = await Promise.all(
        rawTasks.map(async (task) => {
          let taskStatus: TaskStatus = 'Open';
          try {
            const vars = await getProcessVariables(task.processInstanceId);
            const saved = getVariableValue(vars, 'taskStatus') as TaskStatus | '';
            if (saved) taskStatus = saved;
          } catch { /* default Open */ }
          return { task, taskStatus };
        })
      );
// Enrich recent audits — auditors see only their own
      const sorted = instances
        .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
        .slice(0, 20);  // fetch more so auditor filter has enough after filtering

      const allEnriched: RecentAudit[] = await Promise.all(
        sorted.map(async (inst) => {
          let name = 'Unnamed Audit', project = '—', auditor = inst.startUserId || '—';
          const inlineVars = Array.isArray(inst.variables) && inst.variables.length > 0 ? inst.variables : null;
          if (inlineVars) {
            const get = (key: string) => {
              const v = (inlineVars as any[]).find((x: any) => x.name === key);
              return v ? String(v.value) : '';
            };
            name    = get('auditName')   || name;
            project = get('projectName') || project;
            auditor = get('auditorName') || auditor;
          } else if (!inst.ended && !inst._historic) {
            try {
              const vars = await getProcessVariables(inst.id);
              name    = getVariableValue(vars, 'auditName')   || name;
              project = getVariableValue(vars, 'projectName') || project;
              auditor = getVariableValue(vars, 'auditorName') || auditor;
            } catch { /* use defaults */ }
          }
          return { id: inst.id, name, project, auditor, startTime: inst.startTime, status: getInstanceStatus(inst) };
        })
      );

      // Filter by auditor name if not admin
      const recentAudits = isAdmin
        ? allEnriched.slice(0, 5)
        : allEnriched.filter(a => a.auditor === user?.name).slice(0, 5);

      setData({ stats, recentAudits, myTasks });
      setData({ stats, recentAudits, myTasks });
      setLastFetch(new Date());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load dashboard data from Flowable. Make sure Flowable is running on port 8080.'
      );
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const handleOpenAudit = (audit: RecentAudit) => {
    localStorage.setItem('currentProcessInstanceId', audit.id);
    localStorage.setItem('currentAuditName',         audit.name);
    localStorage.setItem('currentProjectName',        audit.project);
    localStorage.setItem('currentAuditorName',        audit.auditor);
    navigate('/audits/manufacturing-unit-1/checklist');
  };

  // Count tasks that need attention
  const alertTaskCount = (data?.myTasks ?? []).filter(
    e => ALERT_STATUSES.includes(e.taskStatus)
  ).length;

  return (
    <div className="p-8">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            JK Copier — Audit Management Overview
            {lastFetch && (
              <span className="ml-2 text-xs text-gray-400">
                · Updated {lastFetch.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchDashboard}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
            <RefreshCwIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
         {isAdmin && ( <button
            onClick={() => navigate('/audits/create')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            <PlusIcon className="w-4 h-4" />
            New Audit
          </button>)}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircleIcon className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700">Failed to load dashboard</p>
            <p className="text-sm text-red-600 mt-0.5">{error}</p>
            <button onClick={fetchDashboard} className="mt-2 text-sm text-red-700 underline hover:no-underline">
              Try again
            </button>
          </div>
        </div>
      )}

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-4 gap-5 mb-8">
        <StatCard
          label="Total Audits"
          value={data?.stats.total ?? 0}
          icon={<ClipboardListIcon className="w-6 h-6 text-blue-600" />}
          color="bg-blue-50" textColor="text-gray-900" loading={loading}
          onClick={() => navigate('/audits')}
        />
        <StatCard
          label="In Progress"
          value={data?.stats.inProgress ?? 0}
          icon={<TrendingUpIcon className="w-6 h-6 text-amber-600" />}
          color="bg-amber-50" textColor="text-amber-700" loading={loading}
          onClick={() => navigate('/audits')}
        />
        <StatCard
          label="Completed"
          value={data?.stats.completed ?? 0}
          icon={<CheckCircle2Icon className="w-6 h-6 text-green-600" />}
          color="bg-green-50" textColor="text-green-700" loading={loading}
        />
        <StatCard
          label="Overdue Tasks"
          value={data?.stats.overdue ?? 0}
          icon={<AlertTriangleIcon className="w-6 h-6 text-red-600" />}
          color="bg-red-50" textColor="text-red-600" loading={loading}
          onClick={() => navigate('/tasks')}
        />
      </div>

      {/* ── Main two-column layout ── */}
      <div className="grid grid-cols-3 gap-6">

        {/* ── LEFT: Recent Audits ── */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <ActivityIcon className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-800">Recent Audits</h2>
            </div>
            <button
              onClick={() => navigate('/audits')}
              className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
              View all <ChevronRightIcon className="w-3 h-3" />
            </button>
          </div>

          {loading && (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-100 rounded w-2/3 animate-pulse" />
                    <div className="h-3 bg-gray-100 rounded w-1/3 animate-pulse" />
                  </div>
                  <div className="h-6 w-20 bg-gray-100 rounded-full animate-pulse" />
                </div>
              ))}
            </div>
          )}

          {!loading && (data?.recentAudits.length ?? 0) === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <ClipboardListIcon className="w-10 h-10 text-gray-300" />
              <p className="text-sm text-gray-500">No audits found in Flowable</p>
              <button onClick={() => navigate('/audits/create')} className="text-sm text-blue-600 hover:underline">
                Create your first audit →
              </button>
            </div>
          )}

          {!loading && (data?.recentAudits ?? []).map((audit, idx) => (
            <div
              key={audit.id}
              className={`flex items-center gap-4 px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors ${idx < (data?.recentAudits.length ?? 1) - 1 ? 'border-b border-gray-100' : ''}`}
              onClick={() => handleOpenAudit(audit)}>
              <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <ClipboardListIcon className="w-4 h-4 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{audit.name}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <FolderIcon className="w-3 h-3" /> {audit.project}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <UserIcon className="w-3 h-3" /> {audit.auditor}
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                <StatusBadge status={audit.status} />
                <span className="text-xs text-gray-400">{timeAgo(audit.startTime)}</span>
              </div>
              <ChevronRightIcon className="w-4 h-4 text-gray-300 flex-shrink-0" />
            </div>
          ))}
        </div>

        {/* ── RIGHT: My Tasks ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <ClockIcon className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-800">My Open Tasks</h2>
              {/* Attention badge if any task is blocked/on-hold */}
              {!loading && alertTaskCount > 0 && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">
                  <BanIcon className="w-2.5 h-2.5" /> {alertTaskCount}
                </span>
              )}
            </div>
            <button
              onClick={() => navigate('/tasks')}
              className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
              View all <ChevronRightIcon className="w-3 h-3" />
            </button>
          </div>

          {loading && (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="h-4 bg-gray-100 rounded w-full animate-pulse" />
                  <div className="h-3 bg-gray-100 rounded w-2/3 animate-pulse" />
                </div>
              ))}
            </div>
          )}

          {!loading && (data?.myTasks.length ?? 0) === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center px-6">
              <CheckCircle2Icon className="w-8 h-8 text-green-400" />
              <p className="text-sm text-gray-500">No open tasks assigned to you</p>
            </div>
          )}

          {!loading && (data?.myTasks ?? []).slice(0, 6).map(({ task, taskStatus }, idx) => (
            <div
              key={task.id}
              className={`px-6 py-3.5 hover:bg-gray-50 cursor-pointer transition-colors
                ${idx < Math.min((data?.myTasks.length ?? 1), 6) - 1 ? 'border-b border-gray-100' : ''}
                ${ALERT_STATUSES.includes(taskStatus) ? 'bg-red-50/40' : ''}
              `}
              onClick={() => {
                localStorage.setItem('currentTaskId', task.id);
                localStorage.setItem('currentProcessInstanceId', task.processInstanceId);
                navigate(`/tasks/${task.id}`);
              }}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="text-sm font-medium text-gray-800 leading-snug line-clamp-2">{task.name}</p>
                <PriorityBadge priority={task.priority || 0} />
              </div>

              {/* Task status pill — only shown if not Open */}
              {taskStatus && taskStatus !== 'Open' && (
                <div className="mb-1">
                  <TaskStatusPill status={taskStatus} />
                </div>
              )}

              {task.dueDate && (
                <p className="text-xs text-gray-400 flex items-center gap-1">
                  <ClockIcon className="w-3 h-3" />
                  Due {formatDate(task.dueDate)}
                </p>
              )}
            </div>
          ))}

          {!loading && (data?.myTasks.length ?? 0) > 6 && (
            <div className="px-6 py-3 border-t border-gray-100">
              <button onClick={() => navigate('/tasks')} className="text-xs text-blue-600 hover:underline">
                +{(data?.myTasks.length ?? 0) - 6} more tasks →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">Quick Actions</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/audits/create')}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            <PlusIcon className="w-4 h-4" />
            Create New Audit
          </button>
          <button
            onClick={() => navigate('/audits')}
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            <ClipboardListIcon className="w-4 h-4" />
            View All Audits
          </button>
          <button
            onClick={() => navigate('/tasks')}
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            <ClockIcon className="w-4 h-4" />
            My Tasks
          </button>
          <button
            onClick={() => navigate('/workflows')}
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            <ActivityIcon className="w-4 h-4" />
            Workflow View
          </button>
        </div>
      </div>
    </div>
  );
}
// // ============================================================
// //  Dashboard.tsx
// //  Live stats from Flowable + activity feed
// //
// //  Flowable calls:
// //    getAuditStats()           → total, inProgress, completed, overdue
// //    getAllProcessInstances()   → recent audits list
// //    getTasksByAssignee(user)  → current user's open tasks
// // ============================================================

// import React, { useState, useEffect, useCallback } from 'react';
// import { useNavigate } from 'react-router-dom';
// import {
//   ClipboardListIcon,
//   CheckCircle2Icon,
//   ClockIcon,
//   AlertTriangleIcon,
//   PlusIcon,
//   Loader2Icon,
//   RefreshCwIcon,
//   AlertCircleIcon,
//   ChevronRightIcon,
//   UserIcon,
//   FolderIcon,
//   TrendingUpIcon,
//   ActivityIcon,
// } from 'lucide-react';
// import {
//   getAuditStats,
//   getAllProcessInstances,
//   getTasksByAssignee,
//   getProcessVariables,
//   getVariableValue,
//   AuditStats,
//   ProcessInstance,
//   FlowableTask,
// } from './services/flowableApi';

// // ─────────────────────────────────────────────────────────────
// // TYPES
// // ─────────────────────────────────────────────────────────────

// interface RecentAudit {
//   id:          string;
//   name:        string;
//   project:     string;
//   auditor:     string;
//   startTime:   string;
//   status:      'In Progress' | 'Completed' | 'Suspended';
// }

// interface DashboardData {
//   stats:        AuditStats;
//   recentAudits: RecentAudit[];
//   myTasks:      FlowableTask[];
// }

// // ─────────────────────────────────────────────────────────────
// // HELPERS
// // ─────────────────────────────────────────────────────────────

// function formatDate(iso: string): string {
//   try {
//     return new Date(iso).toLocaleDateString('en-GB', {
//       day: '2-digit', month: 'short', year: 'numeric',
//     });
//   } catch { return iso; }
// }

// function timeAgo(iso: string): string {
//   const diff = Date.now() - new Date(iso).getTime();
//   const mins  = Math.floor(diff / 60000);
//   const hours = Math.floor(diff / 3600000);
//   const days  = Math.floor(diff / 86400000);
//   if (mins  < 1)   return 'just now';
//   if (mins  < 60)  return `${mins}m ago`;
//   if (hours < 24)  return `${hours}h ago`;
//   return `${days}d ago`;
// }

// function getInstanceStatus(instance: ProcessInstance): 'In Progress' | 'Completed' | 'Suspended' {
//   if (instance.ended)     return 'Completed';
//   if (instance.suspended) return 'Suspended';
//   return 'In Progress';
// }

// // ─────────────────────────────────────────────────────────────
// // STAT CARD
// // ─────────────────────────────────────────────────────────────

// interface StatCardProps {
//   label:     string;
//   value:     number | string;
//   icon:      React.ReactNode;
//   color:     string;   // Tailwind bg class for icon bg
//   textColor: string;   // Tailwind text class for value
//   loading:   boolean;
//   onClick?:  () => void;
// }

// function StatCard({ label, value, icon, color, textColor, loading, onClick }: StatCardProps) {
//   return (
//     <div
//       onClick={onClick}
//       className={`bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex items-center gap-5 ${onClick ? 'cursor-pointer hover:shadow-md hover:border-gray-300 transition-all' : ''}`}>
//       <div className={`w-12 h-12 ${color} rounded-xl flex items-center justify-center flex-shrink-0`}>
//         {icon}
//       </div>
//       <div>
//         <p className="text-sm text-gray-500 mb-0.5">{label}</p>
//         {loading
//           ? <div className="h-8 w-16 bg-gray-100 rounded animate-pulse" />
//           : <p className={`text-3xl font-bold ${textColor}`}>{value}</p>
//         }
//       </div>
//     </div>
//   );
// }

// // ─────────────────────────────────────────────────────────────
// // STATUS BADGE
// // ─────────────────────────────────────────────────────────────

// function StatusBadge({ status }: { status: RecentAudit['status'] }) {
//   const map = {
//     'In Progress': 'bg-blue-100 text-blue-700',
//     'Completed':   'bg-green-100 text-green-700',
//     'Suspended':   'bg-gray-100 text-gray-500',
//   };
//   return (
//     <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${map[status]}`}>
//       {status}
//     </span>
//   );
// }

// // ─────────────────────────────────────────────────────────────
// // PRIORITY BADGE
// // ─────────────────────────────────────────────────────────────

// function PriorityBadge({ priority }: { priority: number }) {
//   if (priority >= 75) return <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">High</span>;
//   if (priority >= 50) return <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">Medium</span>;
//   return <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Low</span>;
// }

// // ─────────────────────────────────────────────────────────────
// // MAIN COMPONENT
// // ─────────────────────────────────────────────────────────────

// export function Dashboard() {
//   const navigate    = useNavigate();
//   // const currentUser = localStorage.getItem('currentAuditorName') || 'admin';
//   const currentUser = 'admin'; 

//   const [data,    setData]    = useState<DashboardData | null>(null);
//   const [loading, setLoading] = useState(true);
//   const [error,   setError]   = useState('');
//   const [lastFetch, setLastFetch] = useState<Date | null>(null);

//   const fetchDashboard = useCallback(async () => {
//     setLoading(true);
//     setError('');
//     try {
//       // Fetch in parallel
//       const [stats, instances, myTasks] = await Promise.all([
//         getAuditStats(),
//         getAllProcessInstances(),
//         getTasksByAssignee(currentUser).catch(() => [] as FlowableTask[]),
//       ]);

//       // Enrich recent audits with process variables (top 5 most recent)
//       const recent = instances
//         .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
//         .slice(0, 5);

//       const recentAudits: RecentAudit[] = await Promise.all(
//         recent.map(async (inst) => {
//           let name    = 'Unnamed Audit';
//           let project = '—';
//           let auditor = inst.startUserId || '—';

//           // getAllProcessInstances already attaches variables inline for historic
//           // instances and runtime instances include variables[] too — use them
//           // directly to avoid runtime/process-instances/{id} 404s for ended processes.
//           const inlineVars = Array.isArray(inst.variables) && inst.variables.length > 0
//             ? inst.variables
//             : null;

//           if (inlineVars) {
//             // inline vars are already mapped to { name, value } shape
//             const get = (key: string) => {
//               const v = (inlineVars as any[]).find((x: any) => x.name === key);
//               return v ? String(v.value) : '';
//             };
//             name    = get('auditName')   || name;
//             project = get('projectName') || project;
//             auditor = get('auditorName') || auditor;
//           } else if (!inst.ended && !inst._historic) {
//             // Only fetch variables for active (non-historic) instances
//             try {
//               const vars = await getProcessVariables(inst.id);
//               name    = getVariableValue(vars, 'auditName')   || name;
//               project = getVariableValue(vars, 'projectName') || project;
//               auditor = getVariableValue(vars, 'auditorName') || auditor;
//             } catch { /* use defaults */ }
//           }

//           return {
//             id:        inst.id,
//             name,
//             project,
//             auditor,
//             startTime: inst.startTime,
//             status:    getInstanceStatus(inst),
//           };
//         })
//       );

//       setData({ stats, recentAudits, myTasks });
//       setLastFetch(new Date());
//     } catch (err) {
//       setError(
//         err instanceof Error
//           ? err.message
//           : 'Failed to load dashboard data from Flowable. Make sure Flowable is running on port 8080.'
//       );
//     } finally {
//       setLoading(false);
//     }
//   }, [currentUser]);

//   useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

//   // Navigate to audit checklist from recent audits
//   const handleOpenAudit = (audit: RecentAudit) => {
//     localStorage.setItem('currentProcessInstanceId', audit.id);
//     localStorage.setItem('currentAuditName',         audit.name);
//     localStorage.setItem('currentProjectName',        audit.project);
//     localStorage.setItem('currentAuditorName',        audit.auditor);
//     navigate('/audits/manufacturing-unit-1/checklist');
//   };

//   // ── Render ──────────────────────────────────────────────────
//   return (
//     <div className="p-8">

//       {/* ── Header ── */}
//       <div className="flex items-center justify-between mb-8">
//         <div>
//           <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
//           <p className="text-sm text-gray-500 mt-0.5">
//             JK Copier — Audit Management Overview
//             {lastFetch && (
//               <span className="ml-2 text-xs text-gray-400">
//                 · Updated {lastFetch.toLocaleTimeString()}
//               </span>
//             )}
//           </p>
//         </div>
//         <div className="flex items-center gap-3">
//           <button
//             onClick={fetchDashboard}
//             disabled={loading}
//             className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
//             <RefreshCwIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
//             Refresh
//           </button>
//           <button
//             onClick={() => navigate('/audits/create')}
//             className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
//             <PlusIcon className="w-4 h-4" />
//             New Audit
//           </button>
//         </div>
//       </div>

//       {/* ── Error banner ── */}
//       {error && (
//         <div className="flex items-start gap-3 mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
//           <AlertCircleIcon className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
//           <div>
//             <p className="text-sm font-semibold text-red-700">Failed to load dashboard</p>
//             <p className="text-sm text-red-600 mt-0.5">{error}</p>
//             <button
//               onClick={fetchDashboard}
//               className="mt-2 text-sm text-red-700 underline hover:no-underline">
//               Try again
//             </button>
//           </div>
//         </div>
//       )}

//       {/* ── Stat Cards ── */}
//       <div className="grid grid-cols-4 gap-5 mb-8">
//         <StatCard
//           label="Total Audits"
//           value={data?.stats.total ?? 0}
//           icon={<ClipboardListIcon className="w-6 h-6 text-blue-600" />}
//           color="bg-blue-50"
//           textColor="text-gray-900"
//           loading={loading}
//           onClick={() => navigate('/audits')}
//         />
//         <StatCard
//           label="In Progress"
//           value={data?.stats.inProgress ?? 0}
//           icon={<TrendingUpIcon className="w-6 h-6 text-amber-600" />}
//           color="bg-amber-50"
//           textColor="text-amber-700"
//           loading={loading}
//           onClick={() => navigate('/audits')}
//         />
//         <StatCard
//           label="Completed"
//           value={data?.stats.completed ?? 0}
//           icon={<CheckCircle2Icon className="w-6 h-6 text-green-600" />}
//           color="bg-green-50"
//           textColor="text-green-700"
//           loading={loading}
//         />
//         <StatCard
//           label="Overdue Tasks"
//           value={data?.stats.overdue ?? 0}
//           icon={<AlertTriangleIcon className="w-6 h-6 text-red-600" />}
//           color="bg-red-50"
//           textColor="text-red-600"
//           loading={loading}
//           onClick={() => navigate('/tasks')}
//         />
//       </div>

//       {/* ── Main two-column layout ── */}
//       <div className="grid grid-cols-3 gap-6">

//         {/* ── LEFT: Recent Audits (2/3 width) ── */}
//         <div className="col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm">
//           <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
//             <div className="flex items-center gap-2">
//               <ActivityIcon className="w-4 h-4 text-gray-400" />
//               <h2 className="text-sm font-semibold text-gray-800">Recent Audits</h2>
//             </div>
//             <button
//               onClick={() => navigate('/audits')}
//               className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
//               View all <ChevronRightIcon className="w-3 h-3" />
//             </button>
//           </div>

//           {/* Loading skeleton */}
//           {loading && (
//             <div className="p-6 space-y-4">
//               {[1, 2, 3].map((i) => (
//                 <div key={i} className="flex items-center gap-4">
//                   <div className="flex-1 space-y-2">
//                     <div className="h-4 bg-gray-100 rounded w-2/3 animate-pulse" />
//                     <div className="h-3 bg-gray-100 rounded w-1/3 animate-pulse" />
//                   </div>
//                   <div className="h-6 w-20 bg-gray-100 rounded-full animate-pulse" />
//                 </div>
//               ))}
//             </div>
//           )}

//           {/* Audit rows */}
//           {!loading && (data?.recentAudits.length ?? 0) === 0 && (
//             <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
//               <ClipboardListIcon className="w-10 h-10 text-gray-300" />
//               <p className="text-sm text-gray-500">No audits found in Flowable</p>
//               <button
//                 onClick={() => navigate('/audits/create')}
//                 className="text-sm text-blue-600 hover:underline">
//                 Create your first audit →
//               </button>
//             </div>
//           )}

//           {!loading && (data?.recentAudits ?? []).map((audit, idx) => (
//             <div
//               key={audit.id}
//               className={`flex items-center gap-4 px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors ${idx < (data?.recentAudits.length ?? 1) - 1 ? 'border-b border-gray-100' : ''}`}
//               onClick={() => handleOpenAudit(audit)}>
//               {/* Audit icon */}
//               <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
//                 <ClipboardListIcon className="w-4 h-4 text-blue-600" />
//               </div>

//               {/* Details */}
//               <div className="flex-1 min-w-0">
//                 <p className="text-sm font-medium text-gray-900 truncate">{audit.name}</p>
//                 <div className="flex items-center gap-3 mt-0.5">
//                   <span className="flex items-center gap-1 text-xs text-gray-400">
//                     <FolderIcon className="w-3 h-3" /> {audit.project}
//                   </span>
//                   <span className="flex items-center gap-1 text-xs text-gray-400">
//                     <UserIcon className="w-3 h-3" /> {audit.auditor}
//                   </span>
//                 </div>
//               </div>

//               {/* Status + time */}
//               <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
//                 <StatusBadge status={audit.status} />
//                 <span className="text-xs text-gray-400">{timeAgo(audit.startTime)}</span>
//               </div>

//               <ChevronRightIcon className="w-4 h-4 text-gray-300 flex-shrink-0" />
//             </div>
//           ))}
//         </div>

//         {/* ── RIGHT: My Tasks (1/3 width) ── */}
//         <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
//           <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
//             <div className="flex items-center gap-2">
//               <ClockIcon className="w-4 h-4 text-gray-400" />
//               <h2 className="text-sm font-semibold text-gray-800">My Open Tasks</h2>
//             </div>
//             <button
//               onClick={() => navigate('/tasks')}
//               className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
//               View all <ChevronRightIcon className="w-3 h-3" />
//             </button>
//           </div>

//           {loading && (
//             <div className="p-6 space-y-4">
//               {[1, 2, 3].map((i) => (
//                 <div key={i} className="space-y-2">
//                   <div className="h-4 bg-gray-100 rounded w-full animate-pulse" />
//                   <div className="h-3 bg-gray-100 rounded w-2/3 animate-pulse" />
//                 </div>
//               ))}
//             </div>
//           )}

//           {!loading && (data?.myTasks.length ?? 0) === 0 && (
//             <div className="flex flex-col items-center justify-center py-12 gap-2 text-center px-6">
//               <CheckCircle2Icon className="w-8 h-8 text-green-400" />
//               <p className="text-sm text-gray-500">No open tasks assigned to you</p>
//             </div>
//           )}

//           {!loading && (data?.myTasks ?? []).slice(0, 6).map((task, idx) => (
//             <div
//               key={task.id}
//               className={`px-6 py-3.5 hover:bg-gray-50 cursor-pointer transition-colors ${idx < Math.min((data?.myTasks.length ?? 1), 6) - 1 ? 'border-b border-gray-100' : ''}`}
//               onClick={() => {
//                 localStorage.setItem('currentTaskId', task.id);
//                 localStorage.setItem('currentProcessInstanceId', task.processInstanceId);
//                 navigate(`/tasks/${task.id}`);
//               }}>
//               <div className="flex items-start justify-between gap-2">
//                 <p className="text-sm font-medium text-gray-800 leading-snug line-clamp-2">{task.name}</p>
//                 <PriorityBadge priority={task.priority || 0} />
//               </div>
//               {task.dueDate && (
//                 <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
//                   <ClockIcon className="w-3 h-3" />
//                   Due {formatDate(task.dueDate)}
//                 </p>
//               )}
//             </div>
//           ))}

//           {/* Show count if more than 6 */}
//           {!loading && (data?.myTasks.length ?? 0) > 6 && (
//             <div className="px-6 py-3 border-t border-gray-100">
//               <button
//                 onClick={() => navigate('/tasks')}
//                 className="text-xs text-blue-600 hover:underline">
//                 +{(data?.myTasks.length ?? 0) - 6} more tasks →
//               </button>
//             </div>
//           )}
//         </div>
//       </div>

//       {/* ── Quick Actions ── */}
//       <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
//         <h2 className="text-sm font-semibold text-gray-800 mb-4">Quick Actions</h2>
//         <div className="flex items-center gap-3">
//           <button
//             onClick={() => navigate('/audits/create')}
//             className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
//             <PlusIcon className="w-4 h-4" />
//             Create New Audit
//           </button>
//           <button
//             onClick={() => navigate('/audits')}
//             className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
//             <ClipboardListIcon className="w-4 h-4" />
//             View All Audits
//           </button>
//           <button
//             onClick={() => navigate('/tasks')}
//             className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
//             <ClockIcon className="w-4 h-4" />
//             My Tasks
//           </button>
//           <button
//             onClick={() => navigate('/workflows')}
//             className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
//             <ActivityIcon className="w-4 h-4" />
//             Workflow View
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// }