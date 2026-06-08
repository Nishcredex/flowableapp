import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarIcon, PlusIcon, Edit2Icon, Trash2Icon,
  Loader2Icon, AlertCircleIcon, CheckCircleIcon, ChevronDownIcon,
} from 'lucide-react';
import {
  startAuditProcess,
  getAllProjects,
  getAllTemplates,
  getAllUsers,
  ProjectInstance,
  ChecklistTemplate,
  FlowableUser,
} from '../pages/services/flowableApi';

interface ChecklistItem {
  id:   number;
  step: string;
  type: string;
}

type SubmitStatus = 'idle' | 'loading' | 'success' | 'error';

export function CreateAudit() {
  const navigate = useNavigate();

  // ── Remote data ────────────────────────────────────────────
  const [projectList, setProjectList] = useState<ProjectInstance[]>([]);
  const [templates,   setTemplates]   = useState<ChecklistTemplate[]>([]);
  const [userList,    setUserList]    = useState<FlowableUser[]>([]);

  useEffect(() => {
    getAllProjects().then(setProjectList).catch(() => {});
    getAllTemplates().then(setTemplates).catch(() => {});
    getAllUsers().then(setUserList).catch(() => {});
  }, []);

  // ── Form state ─────────────────────────────────────────────
  const [auditName,   setAuditName]   = useState('');
  const [project,     setProject]     = useState('');
  const [auditor,     setAuditor]     = useState('');
  const [startDate,   setStartDate]   = useState('');
  const [dueDate,     setDueDate]     = useState('');
  const [description, setDescription] = useState('');

  // ── Checklist state ────────────────────────────────────────
  const [checklist,   setChecklist]   = useState<ChecklistItem[]>([]);
  const [newStep,     setNewStep]     = useState('');
  const [addingStep,  setAddingStep]  = useState(false);

  // ── Template picker ────────────────────────────────────────
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  const loadTemplate = (tpl: ChecklistTemplate) => {
    const parsed: string[] = JSON.parse(tpl.steps || '[]');
    setChecklist(parsed.map((step, i) => ({ id: i + 1, step, type: 'Manual' })));
    setShowTemplatePicker(false);
  };

  // ── Submit state ───────────────────────────────────────────
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [processId,    setProcessId]    = useState('');

  // ── Validation ─────────────────────────────────────────────
  const validate = (): string | null => {
    if (!auditName.trim())      return 'Audit Name is required.';
    if (!project.trim())        return 'Project is required.';
    if (!auditor.trim())        return 'Auditor is required.';
    if (!startDate.trim())      return 'Start Date is required.';
    if (!dueDate.trim())        return 'Due Date is required.';
    if (checklist.length === 0) return 'Add at least one checklist step.';
    return null;
  };

  // ── Start Audit ────────────────────────────────────────────
  const handleStartAudit = async () => {
    const validationError = validate();
    if (validationError) {
      setErrorMessage(validationError);
      setSubmitStatus('error');
      return;
    }

    setSubmitStatus('loading');
    setErrorMessage('');

    try {
      const auditId = `audit-${Date.now()}`;
      const result = await startAuditProcess({
        auditName,
        auditId,
        projectName:    project,
        auditorName:    auditor,
        dueDate,
        description,
        checklistSteps: JSON.stringify(checklist.map((c) => c.step)),
      });

      localStorage.setItem('currentProcessInstanceId', result.id);
      localStorage.setItem('currentAuditName',         auditName);
      localStorage.setItem('currentProjectName',        project);
      localStorage.setItem('currentAuditorName',        auditor);
      // ⚠ Must persist step names locally — Flowable variables become
      // inaccessible once the process ends, causing AuditChecklist to
      // fall back to the 7 hardcoded DEFAULT_STEPS.
      localStorage.setItem('currentChecklistSteps',    JSON.stringify(checklist.map((c) => c.step)));

      setProcessId(result.id);
      setSubmitStatus('success');

      setTimeout(() => {
        navigate('/audits/manufacturing-unit-1/checklist');
      }, 1200);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Failed to connect to Flowable. Make sure it is running on port 8080.'
      );
      setSubmitStatus('error');
    }
  };

  // ── Checklist helpers ──────────────────────────────────────
  const handleDeleteStep = (id: number) =>
    setChecklist((prev) => prev.filter((item) => item.id !== id));

  const handleAddStep = () => {
    if (!newStep.trim()) return;
    const nextId = checklist.length > 0 ? Math.max(...checklist.map((c) => c.id)) + 1 : 1;
    setChecklist((prev) => [...prev, { id: nextId, step: newStep.trim(), type: 'Manual' }]);
    setNewStep('');
    setAddingStep(false);
  };

  const isLoading = submitStatus === 'loading';

  // ──────────────────────────────────────────────────────────
  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Create Audit</h1>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>Audits</span>
          <span>&gt;</span>
          <span>Create</span>
        </div>
      </div>

      {/* Error banner */}
      {submitStatus === 'error' && (
        <div className="flex items-start gap-3 mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircleIcon className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700">Failed to start audit</p>
            <p className="text-sm text-red-600 mt-0.5">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Success banner */}
      {submitStatus === 'success' && (
        <div className="flex items-start gap-3 mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircleIcon className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-700">Audit workflow started successfully!</p>
            <p className="text-sm text-green-600 mt-0.5">Process ID: {processId} — redirecting to checklist…</p>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex justify-end gap-3 mb-6">
        <button
          onClick={() => navigate('/audits')}
          disabled={isLoading}
          className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleStartAudit}
          disabled={isLoading || submitStatus === 'success'}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <><Loader2Icon className="w-4 h-4 animate-spin" />Starting Audit…</>
          ) : submitStatus === 'success' ? (
            <><CheckCircleIcon className="w-4 h-4" />Started!</>
          ) : (
            'Start Audit'
          )}
        </button>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-2 gap-6">

        {/* ── Left: Audit Details ── */}
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Audit Details</h2>

          <div className="space-y-4">

            {/* Audit Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Audit Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={auditName}
                onChange={(e) => setAuditName(e.target.value)}
                disabled={isLoading}
                placeholder="e.g. Q2 Manufacturing Compliance Audit"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
              />
            </div>

            {/* Project */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Project <span className="text-red-500">*</span>
              </label>
              <select
                value={project}
                onChange={(e) => setProject(e.target.value)}
                disabled={isLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
              >
                <option value="">— Select a project —</option>
                {projectList.map((p) => (
                  <option key={p.id} value={p.name}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Auditor */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Auditor <span className="text-red-500">*</span>
              </label>
              <select
                value={auditor}
                onChange={(e) => setAuditor(e.target.value)}
                disabled={isLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
              >
                <option value="">— Select an auditor —</option>
                {userList.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName}
                  </option>
                ))}
              </select>
            </div>

            {/* Start Date
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={isLoading}
                  placeholder="e.g. 20-May-2024"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
                />
                <CalendarIcon className="absolute right-3 top-2.5 w-5 h-5 text-gray-400" />
              </div>
            </div> */}
{/* Start Date */}
<div>
  <label className="block text-sm font-medium text-gray-700 mb-1">
    Start Date <span className="text-red-500">*</span>
  </label>
  <div className="relative">
    <input
      type="date"
      value={startDate}
      onChange={(e) => setStartDate(e.target.value)}
      disabled={isLoading}
      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
    />
    <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
  </div>
</div>

            {/* Due Date
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Due Date <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  disabled={isLoading}
                  placeholder="e.g. 30-May-2024"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
                />
                <CalendarIcon className="absolute right-3 top-2.5 w-5 h-5 text-gray-400" />
              </div>
            </div> */}

{/* Due Date */}
<div>
  <label className="block text-sm font-medium text-gray-700 mb-1">
    Due Date <span className="text-red-500">*</span>
  </label>
  <div className="relative">
    <input
      type="date"
      value={dueDate}
      onChange={(e) => setDueDate(e.target.value)}
      disabled={isLoading}
      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
    />
    <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
  </div>
</div>
            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                disabled={isLoading}
                placeholder="Brief description of this audit..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none disabled:bg-gray-50"
              />
            </div>
          </div>
        </div>

        {/* ── Right: Checklist ── */}
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">

          {/* Checklist header with Load from Template button */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Checklist</h2>
            <div className="relative">
              <button
                onClick={() => setShowTemplatePicker((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
              >
                Load from Template
                <ChevronDownIcon className="w-4 h-4" />
              </button>

              {/* Template dropdown */}
              {showTemplatePicker && (
                <div className="absolute right-0 top-10 z-20 bg-white border border-gray-200 rounded-lg shadow-lg w-72 max-h-60 overflow-y-auto">
                  {templates.length === 0 ? (
                    <p className="text-sm text-gray-400 p-4 text-center">
                      No templates yet. Create one in Checklist Library.
                    </p>
                  ) : (
                    templates.map((tpl) => (
                      <button
                        key={tpl.id}
                        onClick={() => loadTemplate(tpl)}
                        className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-gray-100 last:border-0 transition-colors"
                      >
                        <p className="text-sm font-medium text-gray-800">{tpl.templateName}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {tpl.category} • {JSON.parse(tpl.steps || '[]').length} steps
                        </p>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Checklist table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-2 text-sm font-medium text-gray-700">#</th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-gray-700">Audit Step</th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-gray-700">Type</th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {checklist.length === 0 && !addingStep && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-sm text-gray-400">
                      No steps added yet. Load a template or add steps manually.
                    </td>
                  </tr>
                )}

                {checklist.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="py-3 px-2 text-sm text-gray-600">{item.id}</td>
                    <td className="py-3 px-2 text-sm text-gray-900">{item.step}</td>
                    <td className="py-3 px-2 text-sm text-gray-600">{item.type}</td>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDeleteStep(item.id)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Delete step"
                        >
                          <Trash2Icon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {/* Inline add row */}
                {addingStep && (
                  <tr className="border-b border-gray-100 bg-blue-50">
                    <td className="py-3 px-2 text-sm text-gray-400">{checklist.length + 1}</td>
                    <td className="py-3 px-2" colSpan={2}>
                      <input
                        type="text"
                        value={newStep}
                        onChange={(e) => setNewStep(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddStep();
                          if (e.key === 'Escape') setAddingStep(false);
                        }}
                        placeholder="Enter step name…"
                        autoFocus
                        className="w-full px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={handleAddStep}
                          className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                        >
                          Add
                        </button>
                        <button
                          onClick={() => setAddingStep(false)}
                          className="px-2 py-1 text-gray-600 text-xs rounded hover:bg-gray-100"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Add step button */}
          {!addingStep && (
            <button
              onClick={() => setAddingStep(true)}
              className="mt-4 flex items-center gap-2 text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-lg transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              <span className="text-sm font-medium">Add Audit Step</span>
            </button>
          )}

          {/* Info note */}
          <div className="mt-6 p-3 bg-blue-50 border border-blue-100 rounded-lg">
            <p className="text-xs text-blue-600">
              <span className="font-semibold">ℹ️ Note:</span> Clicking "Start Audit" will create a
              workflow process in Flowable with all the details and checklist steps above.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
// import React, { useState, useEffect } from 'react';
// import { useNavigate } from 'react-router-dom';
// import {
//   CalendarIcon, PlusIcon, Edit2Icon, Trash2Icon,
//   Loader2Icon, AlertCircleIcon, CheckCircleIcon, ChevronDownIcon,
// } from 'lucide-react';
// import {
//   startAuditProcess,
//   getAllProjects,
//   getAllTemplates,
//   ProjectInstance,
//   ChecklistTemplate,
// } from '../pages/services/flowableApi';

// interface ChecklistItem {
//   id:   number;
//   step: string;
//   type: string;
// }

// type SubmitStatus = 'idle' | 'loading' | 'success' | 'error';

// export function CreateAudit() {
//   const navigate = useNavigate();

//   // ── Remote data ────────────────────────────────────────────
//   const [projectList, setProjectList] = useState<ProjectInstance[]>([]);
//   const [templates,   setTemplates]   = useState<ChecklistTemplate[]>([]);

//   useEffect(() => {
//     getAllProjects().then(setProjectList).catch(() => {});
//     getAllTemplates().then(setTemplates).catch(() => {});
//   }, []);

//   // ── Form state ─────────────────────────────────────────────
//   const [auditName,   setAuditName]   = useState('');
//   const [project,     setProject]     = useState('');
//   const [auditor,     setAuditor]     = useState('Anita Sharma');
//   const [startDate,   setStartDate]   = useState('');
//   const [dueDate,     setDueDate]     = useState('');
//   const [description, setDescription] = useState('');

//   // ── Checklist state ────────────────────────────────────────
//   const [checklist,   setChecklist]   = useState<ChecklistItem[]>([]);
//   const [newStep,     setNewStep]     = useState('');
//   const [addingStep,  setAddingStep]  = useState(false);

//   // ── Template picker ────────────────────────────────────────
//   const [showTemplatePicker, setShowTemplatePicker] = useState(false);

//   const loadTemplate = (tpl: ChecklistTemplate) => {
//     const parsed: string[] = JSON.parse(tpl.steps || '[]');
//     setChecklist(parsed.map((step, i) => ({ id: i + 1, step, type: 'Manual' })));
//     setShowTemplatePicker(false);
//   };

//   // ── Submit state ───────────────────────────────────────────
//   const [submitStatus, setSubmitStatus] = useState<SubmitStatus>('idle');
//   const [errorMessage, setErrorMessage] = useState('');
//   const [processId,    setProcessId]    = useState('');

//   // ── Validation ─────────────────────────────────────────────
//   const validate = (): string | null => {
//     if (!auditName.trim())      return 'Audit Name is required.';
//     if (!project.trim())        return 'Project is required.';
//     if (!auditor.trim())        return 'Auditor is required.';
//     if (!startDate.trim())      return 'Start Date is required.';
//     if (!dueDate.trim())        return 'Due Date is required.';
//     if (checklist.length === 0) return 'Add at least one checklist step.';
//     return null;
//   };

//   // ── Start Audit ────────────────────────────────────────────
//   const handleStartAudit = async () => {
//     const validationError = validate();
//     if (validationError) {
//       setErrorMessage(validationError);
//       setSubmitStatus('error');
//       return;
//     }

//     setSubmitStatus('loading');
//     setErrorMessage('');

//     try {
//       const auditId = `audit-${Date.now()}`;
//       const result = await startAuditProcess({
//         auditName,
//         auditId,
//         projectName:    project,
//         auditorName:    auditor,
//         dueDate,
//         description,
//         checklistSteps: JSON.stringify(checklist.map((c) => c.step)),
//       });

//       localStorage.setItem('currentProcessInstanceId', result.id);
//       localStorage.setItem('currentAuditName',         auditName);
//       localStorage.setItem('currentProjectName',        project);
//       localStorage.setItem('currentAuditorName',        auditor);
//       // ⚠ Must persist step names locally — Flowable variables become
//       // inaccessible once the process ends, causing AuditChecklist to
//       // fall back to the 7 hardcoded DEFAULT_STEPS.
//       localStorage.setItem('currentChecklistSteps',    JSON.stringify(checklist.map((c) => c.step)));

//       setProcessId(result.id);
//       setSubmitStatus('success');

//       setTimeout(() => {
//         navigate('/audits/manufacturing-unit-1/checklist');
//       }, 1200);
//     } catch (err) {
//       setErrorMessage(
//         err instanceof Error
//           ? err.message
//           : 'Failed to connect to Flowable. Make sure it is running on port 8080.'
//       );
//       setSubmitStatus('error');
//     }
//   };

//   // ── Checklist helpers ──────────────────────────────────────
//   const handleDeleteStep = (id: number) =>
//     setChecklist((prev) => prev.filter((item) => item.id !== id));

//   const handleAddStep = () => {
//     if (!newStep.trim()) return;
//     const nextId = checklist.length > 0 ? Math.max(...checklist.map((c) => c.id)) + 1 : 1;
//     setChecklist((prev) => [...prev, { id: nextId, step: newStep.trim(), type: 'Manual' }]);
//     setNewStep('');
//     setAddingStep(false);
//   };

//   const isLoading = submitStatus === 'loading';

//   // ──────────────────────────────────────────────────────────
//   return (
//     <div className="p-8">
//       {/* Header */}
//       <div className="mb-6">
//         <h1 className="text-2xl font-semibold text-gray-900 mb-2">Create Audit</h1>
//         <div className="flex items-center gap-2 text-sm text-gray-600">
//           <span>Audits</span>
//           <span>&gt;</span>
//           <span>Create</span>
//         </div>
//       </div>

//       {/* Error banner */}
//       {submitStatus === 'error' && (
//         <div className="flex items-start gap-3 mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
//           <AlertCircleIcon className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
//           <div>
//             <p className="text-sm font-semibold text-red-700">Failed to start audit</p>
//             <p className="text-sm text-red-600 mt-0.5">{errorMessage}</p>
//           </div>
//         </div>
//       )}

//       {/* Success banner */}
//       {submitStatus === 'success' && (
//         <div className="flex items-start gap-3 mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
//           <CheckCircleIcon className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
//           <div>
//             <p className="text-sm font-semibold text-green-700">Audit workflow started successfully!</p>
//             <p className="text-sm text-green-600 mt-0.5">Process ID: {processId} — redirecting to checklist…</p>
//           </div>
//         </div>
//       )}

//       {/* Action buttons */}
//       <div className="flex justify-end gap-3 mb-6">
//         <button
//           onClick={() => navigate('/audits')}
//           disabled={isLoading}
//           className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
//         >
//           Cancel
//         </button>
//         <button
//           onClick={handleStartAudit}
//           disabled={isLoading || submitStatus === 'success'}
//           className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
//         >
//           {isLoading ? (
//             <><Loader2Icon className="w-4 h-4 animate-spin" />Starting Audit…</>
//           ) : submitStatus === 'success' ? (
//             <><CheckCircleIcon className="w-4 h-4" />Started!</>
//           ) : (
//             'Start Audit'
//           )}
//         </button>
//       </div>

//       {/* Main grid */}
//       <div className="grid grid-cols-2 gap-6">

//         {/* ── Left: Audit Details ── */}
//         <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
//           <h2 className="text-lg font-semibold text-gray-900 mb-6">Audit Details</h2>

//           <div className="space-y-4">

//             {/* Audit Name */}
//             <div>
//               <label className="block text-sm font-medium text-gray-700 mb-1">
//                 Audit Name <span className="text-red-500">*</span>
//               </label>
//               <input
//                 type="text"
//                 value={auditName}
//                 onChange={(e) => setAuditName(e.target.value)}
//                 disabled={isLoading}
//                 placeholder="e.g. Q2 Manufacturing Compliance Audit"
//                 className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
//               />
//             </div>

//             {/* Project */}
//             <div>
//               <label className="block text-sm font-medium text-gray-700 mb-1">
//                 Project <span className="text-red-500">*</span>
//               </label>
//               <select
//                 value={project}
//                 onChange={(e) => setProject(e.target.value)}
//                 disabled={isLoading}
//                 className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
//               >
//                 <option value="">— Select a project —</option>
//                 {projectList.map((p) => (
//                   <option key={p.id} value={p.name}>{p.name}</option>
//                 ))}
//               </select>
//             </div>

//             {/* Auditor */}
//             <div>
//               <label className="block text-sm font-medium text-gray-700 mb-1">
//                 Auditor <span className="text-red-500">*</span>
//               </label>
//               <select
//                 value={auditor}
//                 onChange={(e) => setAuditor(e.target.value)}
//                 disabled={isLoading}
//                 className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
//               >
//                 <option>Anita Sharma</option>
//                 <option>Vikram Singh</option>
//                 <option>Priya Nair</option>
//                 <option>Suresh Iyer</option>
//                 <option>Meera Reddy</option>
//               </select>
//             </div>

//             {/* Start Date
//             <div>
//               <label className="block text-sm font-medium text-gray-700 mb-1">
//                 Start Date <span className="text-red-500">*</span>
//               </label>
//               <div className="relative">
//                 <input
//                   type="date"
//                   value={startDate}
//                   onChange={(e) => setStartDate(e.target.value)}
//                   disabled={isLoading}
//                   placeholder="e.g. 20-May-2024"
//                   className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
//                 />
//                 <CalendarIcon className="absolute right-3 top-2.5 w-5 h-5 text-gray-400" />
//               </div>
//             </div> */}
// {/* Start Date */}
// <div>
//   <label className="block text-sm font-medium text-gray-700 mb-1">
//     Start Date <span className="text-red-500">*</span>
//   </label>
//   <div className="relative">
//     <input
//       type="date"
//       value={startDate}
//       onChange={(e) => setStartDate(e.target.value)}
//       disabled={isLoading}
//       className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
//     />
//     <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
//   </div>
// </div>

//             {/* Due Date
//             <div>
//               <label className="block text-sm font-medium text-gray-700 mb-1">
//                 Due Date <span className="text-red-500">*</span>
//               </label>
//               <div className="relative">
//                 <input
//                   type="date"
//                   value={dueDate}
//                   onChange={(e) => setDueDate(e.target.value)}
//                   disabled={isLoading}
//                   placeholder="e.g. 30-May-2024"
//                   className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
//                 />
//                 <CalendarIcon className="absolute right-3 top-2.5 w-5 h-5 text-gray-400" />
//               </div>
//             </div> */}

// {/* Due Date */}
// <div>
//   <label className="block text-sm font-medium text-gray-700 mb-1">
//     Due Date <span className="text-red-500">*</span>
//   </label>
//   <div className="relative">
//     <input
//       type="date"
//       value={dueDate}
//       onChange={(e) => setDueDate(e.target.value)}
//       disabled={isLoading}
//       className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
//     />
//     <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
//   </div>
// </div>
//             {/* Description */}
//             <div>
//               <label className="block text-sm font-medium text-gray-700 mb-1">
//                 Description
//               </label>
//               <textarea
//                 value={description}
//                 onChange={(e) => setDescription(e.target.value)}
//                 rows={4}
//                 disabled={isLoading}
//                 placeholder="Brief description of this audit..."
//                 className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none disabled:bg-gray-50"
//               />
//             </div>
//           </div>
//         </div>

//         {/* ── Right: Checklist ── */}
//         <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">

//           {/* Checklist header with Load from Template button */}
//           <div className="flex items-center justify-between mb-4">
//             <h2 className="text-lg font-semibold text-gray-900">Checklist</h2>
//             <div className="relative">
//               <button
//                 onClick={() => setShowTemplatePicker((v) => !v)}
//                 className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
//               >
//                 Load from Template
//                 <ChevronDownIcon className="w-4 h-4" />
//               </button>

//               {/* Template dropdown */}
//               {showTemplatePicker && (
//                 <div className="absolute right-0 top-10 z-20 bg-white border border-gray-200 rounded-lg shadow-lg w-72 max-h-60 overflow-y-auto">
//                   {templates.length === 0 ? (
//                     <p className="text-sm text-gray-400 p-4 text-center">
//                       No templates yet. Create one in Checklist Library.
//                     </p>
//                   ) : (
//                     templates.map((tpl) => (
//                       <button
//                         key={tpl.id}
//                         onClick={() => loadTemplate(tpl)}
//                         className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-gray-100 last:border-0 transition-colors"
//                       >
//                         <p className="text-sm font-medium text-gray-800">{tpl.templateName}</p>
//                         <p className="text-xs text-gray-400 mt-0.5">
//                           {tpl.category} • {JSON.parse(tpl.steps || '[]').length} steps
//                         </p>
//                       </button>
//                     ))
//                   )}
//                 </div>
//               )}
//             </div>
//           </div>

//           {/* Checklist table */}
//           <div className="overflow-x-auto">
//             <table className="w-full">
//               <thead>
//                 <tr className="border-b border-gray-200">
//                   <th className="text-left py-3 px-2 text-sm font-medium text-gray-700">#</th>
//                   <th className="text-left py-3 px-2 text-sm font-medium text-gray-700">Audit Step</th>
//                   <th className="text-left py-3 px-2 text-sm font-medium text-gray-700">Type</th>
//                   <th className="text-left py-3 px-2 text-sm font-medium text-gray-700">Actions</th>
//                 </tr>
//               </thead>
//               <tbody>
//                 {checklist.length === 0 && !addingStep && (
//                   <tr>
//                     <td colSpan={4} className="py-8 text-center text-sm text-gray-400">
//                       No steps added yet. Load a template or add steps manually.
//                     </td>
//                   </tr>
//                 )}

//                 {checklist.map((item) => (
//                   <tr key={item.id} className="border-b border-gray-100">
//                     <td className="py-3 px-2 text-sm text-gray-600">{item.id}</td>
//                     <td className="py-3 px-2 text-sm text-gray-900">{item.step}</td>
//                     <td className="py-3 px-2 text-sm text-gray-600">{item.type}</td>
//                     <td className="py-3 px-2">
//                       <div className="flex items-center gap-2">
//                         <button
//                           onClick={() => handleDeleteStep(item.id)}
//                           className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
//                           title="Delete step"
//                         >
//                           <Trash2Icon className="w-4 h-4" />
//                         </button>
//                       </div>
//                     </td>
//                   </tr>
//                 ))}

//                 {/* Inline add row */}
//                 {addingStep && (
//                   <tr className="border-b border-gray-100 bg-blue-50">
//                     <td className="py-3 px-2 text-sm text-gray-400">{checklist.length + 1}</td>
//                     <td className="py-3 px-2" colSpan={2}>
//                       <input
//                         type="text"
//                         value={newStep}
//                         onChange={(e) => setNewStep(e.target.value)}
//                         onKeyDown={(e) => {
//                           if (e.key === 'Enter') handleAddStep();
//                           if (e.key === 'Escape') setAddingStep(false);
//                         }}
//                         placeholder="Enter step name…"
//                         autoFocus
//                         className="w-full px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
//                       />
//                     </td>
//                     <td className="py-3 px-2">
//                       <div className="flex items-center gap-1">
//                         <button
//                           onClick={handleAddStep}
//                           className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
//                         >
//                           Add
//                         </button>
//                         <button
//                           onClick={() => setAddingStep(false)}
//                           className="px-2 py-1 text-gray-600 text-xs rounded hover:bg-gray-100"
//                         >
//                           Cancel
//                         </button>
//                       </div>
//                     </td>
//                   </tr>
//                 )}
//               </tbody>
//             </table>
//           </div>

//           {/* Add step button */}
//           {!addingStep && (
//             <button
//               onClick={() => setAddingStep(true)}
//               className="mt-4 flex items-center gap-2 text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-lg transition-colors"
//             >
//               <PlusIcon className="w-4 h-4" />
//               <span className="text-sm font-medium">Add Audit Step</span>
//             </button>
//           )}

//           {/* Info note */}
//           <div className="mt-6 p-3 bg-blue-50 border border-blue-100 rounded-lg">
//             <p className="text-xs text-blue-600">
//               <span className="font-semibold">ℹ️ Note:</span> Clicking "Start Audit" will create a
//               workflow process in Flowable with all the details and checklist steps above.
//             </p>
//           </div>
//         </div>

//       </div>
//     </div>
//   );
// }

