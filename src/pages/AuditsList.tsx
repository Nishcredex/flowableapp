import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
// After line 24 (the flowableApi import block), add:
import { useAuth } from '../pages/AuthContext';
import {
  PlusIcon,
  SearchIcon,
  FilterIcon,
  Loader2Icon,
  AlertCircleIcon,
  RefreshCwIcon,
  Trash2Icon,
  BanIcon,
  PauseCircleIcon,
  AlertTriangleIcon,
} from 'lucide-react';
import {
  getAllProcessInstances,
  getProcessVariables,
  getHistoricProcessVariables,
  getTasksByProcessInstance,
  cancelProcessInstance,
  ProcessInstance,
  ProcessVariable,
  getVariableValue,
} from './services/flowableApi';

// ── Task status type (mirrors MyTasks.tsx) ────────────────────
type TaskStatus = 'Open' | 'In Progress' | 'Blocked' | 'On Hold' | 'Invalid' | 'Needs Review' | 'Completed';

// ── Shape of one row in the table ────────────────────────────
interface AuditRow {
  processInstanceId: string;
  name:              string;
  project:           string;
  auditor:           string;
  startDate:         string;
  dueDate:           string;
  status:            'In Progress' | 'Completed' | 'Not Started' | 'Suspended';
  progress:          number;
  checklistSteps:    string[];
  taskStatus:        TaskStatus | null;  // ← persisted status from MyTasks
}

// ── Task status alert badge (shown in audit row) ──────────────
const ALERT_STATUSES: TaskStatus[] = ['Blocked', 'On Hold', 'Needs Review', 'Invalid'];

function TaskStatusAlert({ status }: { status: TaskStatus }) {
  const cfg: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
    Blocked:       { cls: 'bg-red-100 text-red-700 border-red-200',       icon: <BanIcon className="w-3 h-3" />,           label: 'Blocked' },
    'On Hold':     { cls: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: <PauseCircleIcon className="w-3 h-3" />,   label: 'On Hold' },
    'Needs Review':{ cls: 'bg-purple-100 text-purple-700 border-purple-200', icon: <AlertTriangleIcon className="w-3 h-3" />, label: 'Needs Review' },
    Invalid:       { cls: 'bg-gray-100 text-gray-600 border-gray-200',    icon: <AlertTriangleIcon className="w-3 h-3" />, label: 'Invalid' },
  };
  const c = cfg[status];
  if (!c) return null;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${c.cls}`}>
      {c.icon} Task {c.label}
    </span>
  );
}

// ── Derive status colour from status string ──────────────────
function statusColor(status: AuditRow['status']): string {
  switch (status) {
    case 'In Progress':  return 'bg-blue-100 text-blue-700';
    case 'Completed':    return 'bg-green-100 text-green-700';
    case 'Not Started':  return 'bg-gray-100 text-gray-700';
    case 'Suspended':    return 'bg-orange-100 text-orange-700';
    default:             return 'bg-gray-100 text-gray-700';
  }
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch {
    return iso;
  }
}

async function buildAuditRow(instance: ProcessInstance): Promise<AuditRow> {
  const isHistoric = instance._historic || instance.ended;

  const inlineVars: ProcessVariable[] | undefined =
    isHistoric && instance.variables && instance.variables.length > 0
      ? (instance.variables as unknown as ProcessVariable[])
      : undefined;

  const [vars, tasks] = await Promise.all([
    inlineVars
      ? Promise.resolve(inlineVars)
      : isHistoric
        ? getHistoricProcessVariables(instance.id)
        : getProcessVariables(instance.id),
    isHistoric
      ? Promise.resolve([])
      : getTasksByProcessInstance(instance.id),
  ]);

  let status: AuditRow['status'] = 'Not Started';
  if (instance.ended)          status = 'Completed';
  else if (instance.suspended) status = 'Suspended';
  else if (tasks.length > 0)   status = 'In Progress';

  const checklistStepsRaw = getVariableValue(vars, 'checklistSteps');
  let parsedStepNames: string[] = [];
  let totalSteps = 7;
  if (checklistStepsRaw) {
    try {
      const parsed = JSON.parse(checklistStepsRaw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        parsedStepNames = parsed;
        totalSteps = parsed.length;
      }
    } catch { /* use default */ }
  }
  const activeTasks    = tasks.length;
  const completedSteps = Math.max(0, totalSteps - activeTasks);
  const progress = instance.ended
    ? 100
    : totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  // Read persisted taskStatus variable
  const taskStatusRaw = getVariableValue(vars, 'taskStatus') as TaskStatus | '';

  return {
    processInstanceId: instance.id,
    name:      getVariableValue(vars, 'auditName')    || instance.processDefinitionName || 'Untitled Audit',
    project:   getVariableValue(vars, 'projectName')  || '—',
    auditor:   getVariableValue(vars, 'auditorName')  || instance.startUserId || '—',
    startDate: formatDate(instance.startTime),
    dueDate:   getVariableValue(vars, 'dueDate')      || '—',
    status,
    progress,
    checklistSteps: parsedStepNames,
    taskStatus: (taskStatusRaw as TaskStatus) || null,
  };
}

export function AuditsList() {
  const navigate = useNavigate();
  const { isAdmin, user } = useAuth();
  const [auditRows,    setAuditRows]    = useState<AuditRow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [searchQuery,  setSearchQuery]  = useState('');
  const [deletingId,   setDeletingId]   = useState<string | null>(null);

  const fetchAudits = async () => {
    setLoading(true);
    setError('');
    try {
      const instances = await getAllProcessInstances();
      const rows = await Promise.all(instances.map(buildAuditRow));
      setAuditRows(rows);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load audits from Flowable. Make sure it is running on port 8080.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAudits(); }, []);

  const handleCancel = async (processInstanceId: string, name: string) => {
    if (!window.confirm(`Cancel audit "${name}"? This cannot be undone.`)) return;
    setDeletingId(processInstanceId);
    try {
      await cancelProcessInstance(processInstanceId);
      setAuditRows((prev) => prev.filter((r) => r.processInstanceId !== processInstanceId));
    } catch (err) {
      alert('Failed to cancel audit: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setDeletingId(null);
    }
  };

  const handleView = (row: AuditRow) => {
    localStorage.setItem('currentProcessInstanceId', row.processInstanceId);
    localStorage.setItem('currentAuditName',         row.name);
    localStorage.setItem('currentProjectName',        row.project);
    localStorage.setItem('currentAuditorName',        row.auditor);
    if (row.checklistSteps.length > 0) {
      localStorage.setItem('currentChecklistSteps', JSON.stringify(row.checklistSteps));
    }
    navigate('/audits/manufacturing-unit-1/checklist');
  };

  // Match auditor field against the logged-in user.
  // Audits created before the fix store the display name ("Anita Sharma");
  // audits created after the fix store the login id ("anita.sharma").
  // We accept either so that both old and new records are visible.
  const isMyAudit = (auditorField: string): boolean => {
    if (!user) return false;
    const f = auditorField.toLowerCase();
    if (f === user.id.toLowerCase())   return true;  // login id match
    if (f === user.name.toLowerCase()) return true;  // display name match
    if (user.email && f === user.email.split('@')[0].toLowerCase()) return true; // email prefix
    return false;
  };

  const visibleRows = isAdmin ? auditRows : auditRows.filter(r => isMyAudit(r.auditor));

  const filtered = visibleRows.filter((row) =>
    row.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    row.project.toLowerCase().includes(searchQuery.toLowerCase()) ||
    row.auditor.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Count audits with attention-needed task statuses (scoped to the user's visible rows)
  const alertCount = visibleRows.filter(
    r => r.taskStatus && ALERT_STATUSES.includes(r.taskStatus)
  ).length;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Audits</h1>
          {alertCount > 0 && (
            <p className="text-sm text-red-600 mt-1 flex items-center gap-1.5">
              <AlertTriangleIcon className="w-4 h-4" />
              {alertCount} audit{alertCount !== 1 ? 's' : ''} need attention (blocked / on hold)
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAudits}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm text-gray-600 disabled:opacity-50"
            title="Refresh">
            <RefreshCwIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {isAdmin && (
  <Link
    to="/audits/create"
    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
    <PlusIcon className="w-4 h-4" />
    <span className="text-sm font-medium">Create Audit</span>
  </Link>
)}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircleIcon className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700">Failed to load audits</p>
            <p className="text-sm text-red-600 mt-0.5">{error}</p>
            <button onClick={fetchAudits} className="mt-2 text-sm text-red-700 underline hover:no-underline">
              Try again
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-md">
            <SearchIcon className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search audits..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          </div>
          <button className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            <FilterIcon className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2Icon className="w-8 h-8 text-blue-600 animate-spin" />
            <p className="text-sm text-gray-500">Loading audits from Flowable…</p>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center">
              <SearchIcon className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-700">
              {searchQuery ? 'No audits match your search' : 'No audits found'}
            </p>
            {!searchQuery && isAdmin && (
              <Link to="/audits/create" className="mt-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
                Create Audit
              </Link>
            )}
            {!searchQuery && !isAdmin && (
              <p className="text-xs text-gray-400">Audits assigned to you by an admin will appear here.</p>
            )}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/50">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Audit Name</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Project</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Auditor</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Start Date</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Due Date</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Progress</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Task Status</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((audit) => (
                  <tr
                    key={audit.processInstanceId}
                    className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                      audit.taskStatus && ALERT_STATUSES.includes(audit.taskStatus)
                        ? 'bg-red-50/30'
                        : ''
                    }`}>

                    {/* Name */}
                    <td className="py-4 px-4 text-sm font-medium text-gray-900 max-w-[200px]">
                      <span className="line-clamp-2">{audit.name}</span>
                    </td>

                    {/* Project */}
                    <td className="py-4 px-4 text-sm text-gray-600">{audit.project}</td>

                    {/* Auditor */}
                    <td className="py-4 px-4 text-sm text-gray-600">{audit.auditor}</td>

                    {/* Start Date */}
                    <td className="py-4 px-4 text-sm text-gray-600">{audit.startDate}</td>

                    {/* Due Date */}
                    <td className="py-4 px-4 text-sm text-gray-600">{audit.dueDate}</td>

                    {/* Progress */}
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-gray-200 rounded-full h-1.5">
                          <div
                            className="bg-blue-600 h-1.5 rounded-full transition-all"
                            style={{ width: `${audit.progress}%` }} />
                        </div>
                        <span className="text-xs text-gray-600">{audit.progress}%</span>
                      </div>
                    </td>

                    {/* Audit Status */}
                    <td className="py-4 px-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor(audit.status)}`}>
                        {audit.status}
                      </span>
                    </td>

                    {/* Task Status — shows Blocked / On Hold / Needs Review alert */}
                    <td className="py-4 px-4">
                      {audit.taskStatus && ALERT_STATUSES.includes(audit.taskStatus) ? (
                        <TaskStatusAlert status={audit.taskStatus} />
                      ) : audit.taskStatus && audit.taskStatus !== 'Open' ? (
                        <span className="text-xs text-gray-400">{audit.taskStatus}</span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleView(audit)}
                          className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                          View
                        </button>
                        {isAdmin && audit.status !== 'Completed' && (
                          <button
                            onClick={() => handleCancel(audit.processInstanceId, audit.name)}
                            disabled={deletingId === audit.processInstanceId}
                            className="text-red-500 hover:text-red-600 disabled:opacity-50"
                            title="Cancel audit">
                            {deletingId === audit.processInstanceId
                              ? <Loader2Icon className="w-4 h-4 animate-spin" />
                              : <Trash2Icon className="w-4 h-4" />
                            }
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 text-xs text-gray-400 text-right">
              Showing {filtered.length} of {auditRows.length} audit{auditRows.length !== 1 ? 's' : ''} from Flowable
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
// import React, { useState, useEffect } from 'react';
// import { Link, useNavigate } from 'react-router-dom';
// // After line 24 (the flowableApi import block), add:
// import { useAuth } from '../pages/AuthContext';
// import {
//   PlusIcon,
//   SearchIcon,
//   FilterIcon,
//   Loader2Icon,
//   AlertCircleIcon,
//   RefreshCwIcon,
//   Trash2Icon,
//   BanIcon,
//   PauseCircleIcon,
//   AlertTriangleIcon,
// } from 'lucide-react';
// import {
//   getAllProcessInstances,
//   getProcessVariables,
//   getHistoricProcessVariables,
//   getTasksByProcessInstance,
//   cancelProcessInstance,
//   ProcessInstance,
//   ProcessVariable,
//   getVariableValue,
// } from './services/flowableApi';

// // ── Task status type (mirrors MyTasks.tsx) ────────────────────
// type TaskStatus = 'Open' | 'In Progress' | 'Blocked' | 'On Hold' | 'Invalid' | 'Needs Review' | 'Completed';

// // ── Shape of one row in the table ────────────────────────────
// interface AuditRow {
//   processInstanceId: string;
//   name:              string;
//   project:           string;
//   auditor:           string;
//   startDate:         string;
//   dueDate:           string;
//   status:            'In Progress' | 'Completed' | 'Not Started' | 'Suspended';
//   progress:          number;
//   checklistSteps:    string[];
//   taskStatus:        TaskStatus | null;  // ← persisted status from MyTasks
// }

// // ── Task status alert badge (shown in audit row) ──────────────
// const ALERT_STATUSES: TaskStatus[] = ['Blocked', 'On Hold', 'Needs Review', 'Invalid'];

// function TaskStatusAlert({ status }: { status: TaskStatus }) {
//   const cfg: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
//     Blocked:       { cls: 'bg-red-100 text-red-700 border-red-200',       icon: <BanIcon className="w-3 h-3" />,           label: 'Blocked' },
//     'On Hold':     { cls: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: <PauseCircleIcon className="w-3 h-3" />,   label: 'On Hold' },
//     'Needs Review':{ cls: 'bg-purple-100 text-purple-700 border-purple-200', icon: <AlertTriangleIcon className="w-3 h-3" />, label: 'Needs Review' },
//     Invalid:       { cls: 'bg-gray-100 text-gray-600 border-gray-200',    icon: <AlertTriangleIcon className="w-3 h-3" />, label: 'Invalid' },
//   };
//   const c = cfg[status];
//   if (!c) return null;
//   return (
//     <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${c.cls}`}>
//       {c.icon} Task {c.label}
//     </span>
//   );
// }

// // ── Derive status colour from status string ──────────────────
// function statusColor(status: AuditRow['status']): string {
//   switch (status) {
//     case 'In Progress':  return 'bg-blue-100 text-blue-700';
//     case 'Completed':    return 'bg-green-100 text-green-700';
//     case 'Not Started':  return 'bg-gray-100 text-gray-700';
//     case 'Suspended':    return 'bg-orange-100 text-orange-700';
//     default:             return 'bg-gray-100 text-gray-700';
//   }
// }

// function formatDate(iso: string): string {
//   if (!iso) return '—';
//   try {
//     return new Date(iso).toLocaleDateString('en-GB', {
//       day: '2-digit', month: 'short', year: 'numeric',
//     });
//   } catch {
//     return iso;
//   }
// }

// async function buildAuditRow(instance: ProcessInstance): Promise<AuditRow> {
//   const isHistoric = instance._historic || instance.ended;

//   const inlineVars: ProcessVariable[] | undefined =
//     isHistoric && instance.variables && instance.variables.length > 0
//       ? (instance.variables as unknown as ProcessVariable[])
//       : undefined;

//   const [vars, tasks] = await Promise.all([
//     inlineVars
//       ? Promise.resolve(inlineVars)
//       : isHistoric
//         ? getHistoricProcessVariables(instance.id)
//         : getProcessVariables(instance.id),
//     isHistoric
//       ? Promise.resolve([])
//       : getTasksByProcessInstance(instance.id),
//   ]);

//   let status: AuditRow['status'] = 'Not Started';
//   if (instance.ended)          status = 'Completed';
//   else if (instance.suspended) status = 'Suspended';
//   else if (tasks.length > 0)   status = 'In Progress';

//   const checklistStepsRaw = getVariableValue(vars, 'checklistSteps');
//   let parsedStepNames: string[] = [];
//   let totalSteps = 7;
//   if (checklistStepsRaw) {
//     try {
//       const parsed = JSON.parse(checklistStepsRaw);
//       if (Array.isArray(parsed) && parsed.length > 0) {
//         parsedStepNames = parsed;
//         totalSteps = parsed.length;
//       }
//     } catch { /* use default */ }
//   }
//   const activeTasks    = tasks.length;
//   const completedSteps = Math.max(0, totalSteps - activeTasks);
//   const progress = instance.ended
//     ? 100
//     : totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

//   // Read persisted taskStatus variable
//   const taskStatusRaw = getVariableValue(vars, 'taskStatus') as TaskStatus | '';

//   return {
//     processInstanceId: instance.id,
//     name:      getVariableValue(vars, 'auditName')    || instance.processDefinitionName || 'Untitled Audit',
//     project:   getVariableValue(vars, 'projectName')  || '—',
//     auditor:   getVariableValue(vars, 'auditorName')  || instance.startUserId || '—',
//     startDate: formatDate(instance.startTime),
//     dueDate:   getVariableValue(vars, 'dueDate')      || '—',
//     status,
//     progress,
//     checklistSteps: parsedStepNames,
//     taskStatus: (taskStatusRaw as TaskStatus) || null,
//   };
// }

// export function AuditsList() {
//   const navigate = useNavigate();
//   const { isAdmin, user } = useAuth();
//   const [auditRows,    setAuditRows]    = useState<AuditRow[]>([]);
//   const [loading,      setLoading]      = useState(true);
//   const [error,        setError]        = useState('');
//   const [searchQuery,  setSearchQuery]  = useState('');
//   const [deletingId,   setDeletingId]   = useState<string | null>(null);

//   const fetchAudits = async () => {
//     setLoading(true);
//     setError('');
//     try {
//       const instances = await getAllProcessInstances();
//       const rows = await Promise.all(instances.map(buildAuditRow));
//       setAuditRows(rows);
//     } catch (err) {
//       setError(
//         err instanceof Error
//           ? err.message
//           : 'Failed to load audits from Flowable. Make sure it is running on port 8080.'
//       );
//     } finally {
//       setLoading(false);
//     }
//   };

//   useEffect(() => { fetchAudits(); }, []);

//   const handleCancel = async (processInstanceId: string, name: string) => {
//     if (!window.confirm(`Cancel audit "${name}"? This cannot be undone.`)) return;
//     setDeletingId(processInstanceId);
//     try {
//       await cancelProcessInstance(processInstanceId);
//       setAuditRows((prev) => prev.filter((r) => r.processInstanceId !== processInstanceId));
//     } catch (err) {
//       alert('Failed to cancel audit: ' + (err instanceof Error ? err.message : 'Unknown error'));
//     } finally {
//       setDeletingId(null);
//     }
//   };

//   const handleView = (row: AuditRow) => {
//     localStorage.setItem('currentProcessInstanceId', row.processInstanceId);
//     localStorage.setItem('currentAuditName',         row.name);
//     localStorage.setItem('currentProjectName',        row.project);
//     localStorage.setItem('currentAuditorName',        row.auditor);
//     if (row.checklistSteps.length > 0) {
//       localStorage.setItem('currentChecklistSteps', JSON.stringify(row.checklistSteps));
//     }
//     navigate('/audits/manufacturing-unit-1/checklist');
//   };

//   const filtered = auditRows.filter((row) => {
//     const matchesSearch =
//       row.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
//       row.project.toLowerCase().includes(searchQuery.toLowerCase()) ||
//       row.auditor.toLowerCase().includes(searchQuery.toLowerCase());

//     // Auditors only see audits assigned to them (matched by user.id)
//     const matchesRole = isAdmin || row.auditor === user?.id;

//     return matchesSearch && matchesRole;
//   });

//   // Count audits with attention-needed task statuses
//   const alertCount = auditRows.filter(
//     r => r.taskStatus && ALERT_STATUSES.includes(r.taskStatus)
//   ).length;

//   return (
//     <div className="p-8">
//       <div className="flex items-center justify-between mb-6">
//         <div>
//           <h1 className="text-2xl font-semibold text-gray-900">Audits</h1>
//           {alertCount > 0 && (
//             <p className="text-sm text-red-600 mt-1 flex items-center gap-1.5">
//               <AlertTriangleIcon className="w-4 h-4" />
//               {alertCount} audit{alertCount !== 1 ? 's' : ''} need attention (blocked / on hold)
//             </p>
//           )}
//         </div>
//         <div className="flex items-center gap-2">
//           <button
//             onClick={fetchAudits}
//             disabled={loading}
//             className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm text-gray-600 disabled:opacity-50"
//             title="Refresh">
//             <RefreshCwIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
//             Refresh
//           </button>
//           {isAdmin && (
//   <Link
//     to="/audits/create"
//     className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
//     <PlusIcon className="w-4 h-4" />
//     <span className="text-sm font-medium">Create Audit</span>
//   </Link>
// )}
//         </div>
//       </div>

//       {error && (
//         <div className="flex items-start gap-3 mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
//           <AlertCircleIcon className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
//           <div>
//             <p className="text-sm font-semibold text-red-700">Failed to load audits</p>
//             <p className="text-sm text-red-600 mt-0.5">{error}</p>
//             <button onClick={fetchAudits} className="mt-2 text-sm text-red-700 underline hover:no-underline">
//               Try again
//             </button>
//           </div>
//         </div>
//       )}

//       <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
//         <div className="flex items-center gap-3 mb-6">
//           <div className="relative flex-1 max-w-md">
//             <SearchIcon className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
//             <input
//               type="text"
//               placeholder="Search audits..."
//               value={searchQuery}
//               onChange={(e) => setSearchQuery(e.target.value)}
//               className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
//           </div>
//           <button className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
//             <FilterIcon className="w-5 h-5 text-gray-600" />
//           </button>
//         </div>

//         {loading && (
//           <div className="flex flex-col items-center justify-center py-16 gap-3">
//             <Loader2Icon className="w-8 h-8 text-blue-600 animate-spin" />
//             <p className="text-sm text-gray-500">Loading audits from Flowable…</p>
//           </div>
//         )}

//         {!loading && !error && filtered.length === 0 && (
//           <div className="flex flex-col items-center justify-center py-16 gap-3">
//             <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center">
//               <SearchIcon className="w-6 h-6 text-gray-400" />
//             </div>
//             <p className="text-sm font-medium text-gray-700">
//               {searchQuery ? 'No audits match your search' : 'No audits found'}
//             </p>
//             {!searchQuery && isAdmin && (
//               <Link to="/audits/create" className="mt-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
//                 Create Audit
//               </Link>
//             )}
//             {!searchQuery && !isAdmin && (
//               <p className="text-xs text-gray-400">Audits assigned to you by an admin will appear here.</p>
//             )}
//           </div>
//         )}

//         {!loading && filtered.length > 0 && (
//           <div className="overflow-x-auto">
//             <table className="w-full">
//               <thead>
//                 <tr className="border-b border-gray-200 bg-gray-50/50">
//                   <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Audit Name</th>
//                   <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Project</th>
//                   <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Auditor</th>
//                   <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Start Date</th>
//                   <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Due Date</th>
//                   <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Progress</th>
//                   <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Status</th>
//                   <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Task Status</th>
//                   <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Action</th>
//                 </tr>
//               </thead>
//               <tbody>
//                 {filtered.map((audit) => (
//                   <tr
//                     key={audit.processInstanceId}
//                     className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
//                       audit.taskStatus && ALERT_STATUSES.includes(audit.taskStatus)
//                         ? 'bg-red-50/30'
//                         : ''
//                     }`}>

//                     {/* Name */}
//                     <td className="py-4 px-4 text-sm font-medium text-gray-900 max-w-[200px]">
//                       <span className="line-clamp-2">{audit.name}</span>
//                     </td>

//                     {/* Project */}
//                     <td className="py-4 px-4 text-sm text-gray-600">{audit.project}</td>

//                     {/* Auditor */}
//                     <td className="py-4 px-4 text-sm text-gray-600">{audit.auditor}</td>

//                     {/* Start Date */}
//                     <td className="py-4 px-4 text-sm text-gray-600">{audit.startDate}</td>

//                     {/* Due Date */}
//                     <td className="py-4 px-4 text-sm text-gray-600">{audit.dueDate}</td>

//                     {/* Progress */}
//                     <td className="py-4 px-4">
//                       <div className="flex items-center gap-2">
//                         <div className="w-24 bg-gray-200 rounded-full h-1.5">
//                           <div
//                             className="bg-blue-600 h-1.5 rounded-full transition-all"
//                             style={{ width: `${audit.progress}%` }} />
//                         </div>
//                         <span className="text-xs text-gray-600">{audit.progress}%</span>
//                       </div>
//                     </td>

//                     {/* Audit Status */}
//                     <td className="py-4 px-4">
//                       <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor(audit.status)}`}>
//                         {audit.status}
//                       </span>
//                     </td>

//                     {/* Task Status — shows Blocked / On Hold / Needs Review alert */}
//                     <td className="py-4 px-4">
//                       {audit.taskStatus && ALERT_STATUSES.includes(audit.taskStatus) ? (
//                         <TaskStatusAlert status={audit.taskStatus} />
//                       ) : audit.taskStatus && audit.taskStatus !== 'Open' ? (
//                         <span className="text-xs text-gray-400">{audit.taskStatus}</span>
//                       ) : (
//                         <span className="text-xs text-gray-300">—</span>
//                       )}
//                     </td>

//                     {/* Actions */}
//                     <td className="py-4 px-4">
//                       <div className="flex items-center gap-3">
//                         <button
//                           onClick={() => handleView(audit)}
//                           className="text-blue-600 hover:text-blue-700 text-sm font-medium">
//                           View
//                         </button>
//                         {isAdmin && audit.status !== 'Completed' && (
//                           <button
//                             onClick={() => handleCancel(audit.processInstanceId, audit.name)}
//                             disabled={deletingId === audit.processInstanceId}
//                             className="text-red-500 hover:text-red-600 disabled:opacity-50"
//                             title="Cancel audit">
//                             {deletingId === audit.processInstanceId
//                               ? <Loader2Icon className="w-4 h-4 animate-spin" />
//                               : <Trash2Icon className="w-4 h-4" />
//                             }
//                           </button>
//                         )}
//                       </div>
//                     </td>
//                   </tr>
//                 ))}
//               </tbody>
//             </table>

//             <div className="mt-4 text-xs text-gray-400 text-right">
//               Showing {filtered.length} of {auditRows.length} audit{auditRows.length !== 1 ? 's' : ''} from Flowable
//             </div>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }
// // import React, { useState, useEffect } from 'react';
// // import { Link, useNavigate } from 'react-router-dom';
// // // After line 24 (the flowableApi import block), add:
// // import { useAuth } from '../pages/AuthContext';
// // import {
// //   PlusIcon,
// //   SearchIcon,
// //   FilterIcon,
// //   Loader2Icon,
// //   AlertCircleIcon,
// //   RefreshCwIcon,
// //   Trash2Icon,
// //   BanIcon,
// //   PauseCircleIcon,
// //   AlertTriangleIcon,
// // } from 'lucide-react';
// // import {
// //   getAllProcessInstances,
// //   getProcessVariables,
// //   getHistoricProcessVariables,
// //   getTasksByProcessInstance,
// //   cancelProcessInstance,
// //   ProcessInstance,
// //   ProcessVariable,
// //   getVariableValue,
// // } from './services/flowableApi';

// // // ── Task status type (mirrors MyTasks.tsx) ────────────────────
// // type TaskStatus = 'Open' | 'In Progress' | 'Blocked' | 'On Hold' | 'Invalid' | 'Needs Review' | 'Completed';

// // // ── Shape of one row in the table ────────────────────────────
// // interface AuditRow {
// //   processInstanceId: string;
// //   name:              string;
// //   project:           string;
// //   auditor:           string;
// //   startDate:         string;
// //   dueDate:           string;
// //   status:            'In Progress' | 'Completed' | 'Not Started' | 'Suspended';
// //   progress:          number;
// //   checklistSteps:    string[];
// //   taskStatus:        TaskStatus | null;  // ← persisted status from MyTasks
// // }

// // // ── Task status alert badge (shown in audit row) ──────────────
// // const ALERT_STATUSES: TaskStatus[] = ['Blocked', 'On Hold', 'Needs Review', 'Invalid'];

// // function TaskStatusAlert({ status }: { status: TaskStatus }) {
// //   const cfg: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
// //     Blocked:       { cls: 'bg-red-100 text-red-700 border-red-200',       icon: <BanIcon className="w-3 h-3" />,           label: 'Blocked' },
// //     'On Hold':     { cls: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: <PauseCircleIcon className="w-3 h-3" />,   label: 'On Hold' },
// //     'Needs Review':{ cls: 'bg-purple-100 text-purple-700 border-purple-200', icon: <AlertTriangleIcon className="w-3 h-3" />, label: 'Needs Review' },
// //     Invalid:       { cls: 'bg-gray-100 text-gray-600 border-gray-200',    icon: <AlertTriangleIcon className="w-3 h-3" />, label: 'Invalid' },
// //   };
// //   const c = cfg[status];
// //   if (!c) return null;
// //   return (
// //     <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${c.cls}`}>
// //       {c.icon} Task {c.label}
// //     </span>
// //   );
// // }

// // // ── Derive status colour from status string ──────────────────
// // function statusColor(status: AuditRow['status']): string {
// //   switch (status) {
// //     case 'In Progress':  return 'bg-blue-100 text-blue-700';
// //     case 'Completed':    return 'bg-green-100 text-green-700';
// //     case 'Not Started':  return 'bg-gray-100 text-gray-700';
// //     case 'Suspended':    return 'bg-orange-100 text-orange-700';
// //     default:             return 'bg-gray-100 text-gray-700';
// //   }
// // }

// // function formatDate(iso: string): string {
// //   if (!iso) return '—';
// //   try {
// //     return new Date(iso).toLocaleDateString('en-GB', {
// //       day: '2-digit', month: 'short', year: 'numeric',
// //     });
// //   } catch {
// //     return iso;
// //   }
// // }

// // async function buildAuditRow(instance: ProcessInstance): Promise<AuditRow> {
// //   const isHistoric = instance._historic || instance.ended;

// //   const inlineVars: ProcessVariable[] | undefined =
// //     isHistoric && instance.variables && instance.variables.length > 0
// //       ? (instance.variables as unknown as ProcessVariable[])
// //       : undefined;

// //   const [vars, tasks] = await Promise.all([
// //     inlineVars
// //       ? Promise.resolve(inlineVars)
// //       : isHistoric
// //         ? getHistoricProcessVariables(instance.id)
// //         : getProcessVariables(instance.id),
// //     isHistoric
// //       ? Promise.resolve([])
// //       : getTasksByProcessInstance(instance.id),
// //   ]);

// //   let status: AuditRow['status'] = 'Not Started';
// //   if (instance.ended)          status = 'Completed';
// //   else if (instance.suspended) status = 'Suspended';
// //   else if (tasks.length > 0)   status = 'In Progress';

// //   const checklistStepsRaw = getVariableValue(vars, 'checklistSteps');
// //   let parsedStepNames: string[] = [];
// //   let totalSteps = 7;
// //   if (checklistStepsRaw) {
// //     try {
// //       const parsed = JSON.parse(checklistStepsRaw);
// //       if (Array.isArray(parsed) && parsed.length > 0) {
// //         parsedStepNames = parsed;
// //         totalSteps = parsed.length;
// //       }
// //     } catch { /* use default */ }
// //   }
// //   const activeTasks    = tasks.length;
// //   const completedSteps = Math.max(0, totalSteps - activeTasks);
// //   const progress = instance.ended
// //     ? 100
// //     : totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

// //   // Read persisted taskStatus variable
// //   const taskStatusRaw = getVariableValue(vars, 'taskStatus') as TaskStatus | '';

// //   return {
// //     processInstanceId: instance.id,
// //     name:      getVariableValue(vars, 'auditName')    || instance.processDefinitionName || 'Untitled Audit',
// //     project:   getVariableValue(vars, 'projectName')  || '—',
// //     auditor:   getVariableValue(vars, 'auditorName')  || instance.startUserId || '—',
// //     startDate: formatDate(instance.startTime),
// //     dueDate:   getVariableValue(vars, 'dueDate')      || '—',
// //     status,
// //     progress,
// //     checklistSteps: parsedStepNames,
// //     taskStatus: (taskStatusRaw as TaskStatus) || null,
// //   };
// // }

// // export function AuditsList() {
// //   const navigate = useNavigate();
// // const { isAdmin } = useAuth(); 
// //   const [auditRows,    setAuditRows]    = useState<AuditRow[]>([]);
// //   const [loading,      setLoading]      = useState(true);
// //   const [error,        setError]        = useState('');
// //   const [searchQuery,  setSearchQuery]  = useState('');
// //   const [deletingId,   setDeletingId]   = useState<string | null>(null);

// //   const fetchAudits = async () => {
// //     setLoading(true);
// //     setError('');
// //     try {
// //       const instances = await getAllProcessInstances();
// //       const rows = await Promise.all(instances.map(buildAuditRow));
// //       setAuditRows(rows);
// //     } catch (err) {
// //       setError(
// //         err instanceof Error
// //           ? err.message
// //           : 'Failed to load audits from Flowable. Make sure it is running on port 8080.'
// //       );
// //     } finally {
// //       setLoading(false);
// //     }
// //   };

// //   useEffect(() => { fetchAudits(); }, []);

// //   const handleCancel = async (processInstanceId: string, name: string) => {
// //     if (!window.confirm(`Cancel audit "${name}"? This cannot be undone.`)) return;
// //     setDeletingId(processInstanceId);
// //     try {
// //       await cancelProcessInstance(processInstanceId);
// //       setAuditRows((prev) => prev.filter((r) => r.processInstanceId !== processInstanceId));
// //     } catch (err) {
// //       alert('Failed to cancel audit: ' + (err instanceof Error ? err.message : 'Unknown error'));
// //     } finally {
// //       setDeletingId(null);
// //     }
// //   };

// //   const handleView = (row: AuditRow) => {
// //     localStorage.setItem('currentProcessInstanceId', row.processInstanceId);
// //     localStorage.setItem('currentAuditName',         row.name);
// //     localStorage.setItem('currentProjectName',        row.project);
// //     localStorage.setItem('currentAuditorName',        row.auditor);
// //     if (row.checklistSteps.length > 0) {
// //       localStorage.setItem('currentChecklistSteps', JSON.stringify(row.checklistSteps));
// //     }
// //     navigate('/audits/manufacturing-unit-1/checklist');
// //   };

// //   const filtered = auditRows.filter((row) =>
// //     row.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
// //     row.project.toLowerCase().includes(searchQuery.toLowerCase()) ||
// //     row.auditor.toLowerCase().includes(searchQuery.toLowerCase())
// //   );

// //   // Count audits with attention-needed task statuses
// //   const alertCount = auditRows.filter(
// //     r => r.taskStatus && ALERT_STATUSES.includes(r.taskStatus)
// //   ).length;

// //   return (
// //     <div className="p-8">
// //       <div className="flex items-center justify-between mb-6">
// //         <div>
// //           <h1 className="text-2xl font-semibold text-gray-900">Audits</h1>
// //           {alertCount > 0 && (
// //             <p className="text-sm text-red-600 mt-1 flex items-center gap-1.5">
// //               <AlertTriangleIcon className="w-4 h-4" />
// //               {alertCount} audit{alertCount !== 1 ? 's' : ''} need attention (blocked / on hold)
// //             </p>
// //           )}
// //         </div>
// //         <div className="flex items-center gap-2">
// //           <button
// //             onClick={fetchAudits}
// //             disabled={loading}
// //             className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm text-gray-600 disabled:opacity-50"
// //             title="Refresh">
// //             <RefreshCwIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
// //             Refresh
// //           </button>
// //           {isAdmin && (
// //   <Link
// //     to="/audits/create"
// //     className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
// //     <PlusIcon className="w-4 h-4" />
// //     <span className="text-sm font-medium">Create Audit</span>
// //   </Link>
// // )}
// //         </div>
// //       </div>

// //       {error && (
// //         <div className="flex items-start gap-3 mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
// //           <AlertCircleIcon className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
// //           <div>
// //             <p className="text-sm font-semibold text-red-700">Failed to load audits</p>
// //             <p className="text-sm text-red-600 mt-0.5">{error}</p>
// //             <button onClick={fetchAudits} className="mt-2 text-sm text-red-700 underline hover:no-underline">
// //               Try again
// //             </button>
// //           </div>
// //         </div>
// //       )}

// //       <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
// //         <div className="flex items-center gap-3 mb-6">
// //           <div className="relative flex-1 max-w-md">
// //             <SearchIcon className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
// //             <input
// //               type="text"
// //               placeholder="Search audits..."
// //               value={searchQuery}
// //               onChange={(e) => setSearchQuery(e.target.value)}
// //               className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
// //           </div>
// //           <button className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
// //             <FilterIcon className="w-5 h-5 text-gray-600" />
// //           </button>
// //         </div>

// //         {loading && (
// //           <div className="flex flex-col items-center justify-center py-16 gap-3">
// //             <Loader2Icon className="w-8 h-8 text-blue-600 animate-spin" />
// //             <p className="text-sm text-gray-500">Loading audits from Flowable…</p>
// //           </div>
// //         )}

// //         {!loading && !error && filtered.length === 0 && (
// //           <div className="flex flex-col items-center justify-center py-16 gap-3">
// //             <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center">
// //               <SearchIcon className="w-6 h-6 text-gray-400" />
// //             </div>
// //             <p className="text-sm font-medium text-gray-700">
// //               {searchQuery ? 'No audits match your search' : 'No audits found'}
// //             </p>
// //             {!searchQuery && (
// //               <Link to="/audits/create" className="mt-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
// //                 Create Audit
// //               </Link>
// //             )}
// //           </div>
// //         )}

// //         {!loading && filtered.length > 0 && (
// //           <div className="overflow-x-auto">
// //             <table className="w-full">
// //               <thead>
// //                 <tr className="border-b border-gray-200 bg-gray-50/50">
// //                   <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Audit Name</th>
// //                   <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Project</th>
// //                   <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Auditor</th>
// //                   <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Start Date</th>
// //                   <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Due Date</th>
// //                   <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Progress</th>
// //                   <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Status</th>
// //                   <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Task Status</th>
// //                   <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Action</th>
// //                 </tr>
// //               </thead>
// //               <tbody>
// //                 {filtered.map((audit) => (
// //                   <tr
// //                     key={audit.processInstanceId}
// //                     className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
// //                       audit.taskStatus && ALERT_STATUSES.includes(audit.taskStatus)
// //                         ? 'bg-red-50/30'
// //                         : ''
// //                     }`}>

// //                     {/* Name */}
// //                     <td className="py-4 px-4 text-sm font-medium text-gray-900 max-w-[200px]">
// //                       <span className="line-clamp-2">{audit.name}</span>
// //                     </td>

// //                     {/* Project */}
// //                     <td className="py-4 px-4 text-sm text-gray-600">{audit.project}</td>

// //                     {/* Auditor */}
// //                     <td className="py-4 px-4 text-sm text-gray-600">{audit.auditor}</td>

// //                     {/* Start Date */}
// //                     <td className="py-4 px-4 text-sm text-gray-600">{audit.startDate}</td>

// //                     {/* Due Date */}
// //                     <td className="py-4 px-4 text-sm text-gray-600">{audit.dueDate}</td>

// //                     {/* Progress */}
// //                     <td className="py-4 px-4">
// //                       <div className="flex items-center gap-2">
// //                         <div className="w-24 bg-gray-200 rounded-full h-1.5">
// //                           <div
// //                             className="bg-blue-600 h-1.5 rounded-full transition-all"
// //                             style={{ width: `${audit.progress}%` }} />
// //                         </div>
// //                         <span className="text-xs text-gray-600">{audit.progress}%</span>
// //                       </div>
// //                     </td>

// //                     {/* Audit Status */}
// //                     <td className="py-4 px-4">
// //                       <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor(audit.status)}`}>
// //                         {audit.status}
// //                       </span>
// //                     </td>

// //                     {/* Task Status — shows Blocked / On Hold / Needs Review alert */}
// //                     <td className="py-4 px-4">
// //                       {audit.taskStatus && ALERT_STATUSES.includes(audit.taskStatus) ? (
// //                         <TaskStatusAlert status={audit.taskStatus} />
// //                       ) : audit.taskStatus && audit.taskStatus !== 'Open' ? (
// //                         <span className="text-xs text-gray-400">{audit.taskStatus}</span>
// //                       ) : (
// //                         <span className="text-xs text-gray-300">—</span>
// //                       )}
// //                     </td>

// //                     {/* Actions */}
// //                     <td className="py-4 px-4">
// //                       <div className="flex items-center gap-3">
// //                         <button
// //                           onClick={() => handleView(audit)}
// //                           className="text-blue-600 hover:text-blue-700 text-sm font-medium">
// //                           View
// //                         </button>
// //                         {isAdmin && audit.status !== 'Completed' && (
// //                           <button
// //                             onClick={() => handleCancel(audit.processInstanceId, audit.name)}
// //                             disabled={deletingId === audit.processInstanceId}
// //                             className="text-red-500 hover:text-red-600 disabled:opacity-50"
// //                             title="Cancel audit">
// //                             {deletingId === audit.processInstanceId
// //                               ? <Loader2Icon className="w-4 h-4 animate-spin" />
// //                               : <Trash2Icon className="w-4 h-4" />
// //                             }
// //                           </button>
// //                         )}
// //                       </div>
// //                     </td>
// //                   </tr>
// //                 ))}
// //               </tbody>
// //             </table>

// //             <div className="mt-4 text-xs text-gray-400 text-right">
// //               Showing {filtered.length} of {auditRows.length} audit{auditRows.length !== 1 ? 's' : ''} from Flowable
// //             </div>
// //           </div>
// //         )}
// //       </div>
// //     </div>
// //   );
// // }