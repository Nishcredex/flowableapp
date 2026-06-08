// ============================================================
//  CompleteStep.tsx — Full-page two-column layout
// ============================================================

import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DownloadIcon,
  Trash2Icon,
  Loader2Icon,
  AlertCircleIcon,
  CheckCircle2Icon,
  UploadIcon,
  ClockIcon,
  UserIcon,
  FolderIcon,
  ArrowLeftIcon,
} from 'lucide-react';
import { completeTask } from './services/flowableApi';

export function CompleteStep() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stepName    = localStorage.getItem('currentStepName')    || 'Audit Step';
  const auditName   = localStorage.getItem('currentAuditName')   || 'Audit';
  const auditorName = localStorage.getItem('currentAuditorName') || '';
  const taskId      = localStorage.getItem('currentTaskId')      || '';

  const [comments,    setComments]    = useState('');
  const [fileName,    setFileName]    = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [success,     setSuccess]     = useState(false);
  const [completedAt, setCompletedAt] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setFileName(file.name);
  };

  const handleRemoveFile = () => {
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCompleteStep = async () => {
    if (!comments.trim()) {
      setSubmitError('Please add comments before completing this step.');
      return;
    }
    if (!taskId) {
      navigate('/tasks');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      await completeTask(taskId, {
        stepName,
        comments,
        evidenceFile: fileName,
        completedBy: auditorName,
      });
      const now = new Date();
      setCompletedAt(
        now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
        ' ' +
        now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      );
      setSuccess(true);
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : 'Failed to complete step. Check that Flowable is running on port 8080.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success screen ────────────────────────────────────────────
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-5 text-center p-8">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2Icon className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-semibold text-gray-900">Step Completed!</h2>
        <p className="text-sm text-gray-500 max-w-sm">
          <strong>{stepName}</strong> has been marked complete by{' '}
          <strong>{auditorName}</strong> on {completedAt}.
        </p>
        <div className="flex gap-3 mt-2">
          <button
            onClick={() => navigate(-1)}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            Back to Checklist
          </button>
          <button
            onClick={() => navigate('/tasks')}
            className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            View My Tasks
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">

      {/* ── Top bar ── */}
      <div className="px-8 pt-6 pb-4 border-b border-gray-200 bg-white">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-3">
          <ArrowLeftIcon className="w-4 h-4" />
          Back to Checklist
        </button>

        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
              <span>Audits</span><span>/</span>
              <span>{auditName}</span><span>/</span>
              <span>Checklist</span><span>/</span>
              <span className="text-gray-600 font-medium">{stepName}</span>
            </div>
            <h1 className="text-xl font-semibold text-gray-900">Audit Step — {stepName}</h1>
          </div>

          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
            <ClockIcon className="w-3.5 h-3.5" />
            In Progress
          </span>
        </div>
      </div>

      {/* ── Error banner ── */}
      {submitError && (
        <div className="mx-8 mt-4 flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircleIcon className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700">Failed to complete step</p>
            <p className="text-sm text-red-600 mt-0.5">{submitError}</p>
          </div>
        </div>
      )}

      {/* ── Two-column body ── */}
      <div className="flex flex-1 gap-6 p-8 overflow-auto">

        {/* ── LEFT: Step metadata (narrower, info-only) ── */}
        <div className="w-72 flex-shrink-0 space-y-4">

          {/* Info card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Step Info</h2>

            <div className="flex items-start gap-3">
              <FolderIcon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-400">Audit</p>
                <p className="text-sm font-medium text-gray-800">{auditName}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CheckCircle2Icon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-400">Step Name</p>
                <p className="text-sm font-medium text-gray-800">{stepName}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <UserIcon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-400">Auditor</p>
                <p className="text-sm font-medium text-gray-800">{auditorName || '—'}</p>
              </div>
            </div>

            <hr className="border-gray-100" />

            <div>
              <p className="text-xs text-gray-400 mb-1">Completed By</p>
              <p className="text-sm text-gray-400 italic">— set on completion</p>
            </div>

            <div>
              <p className="text-xs text-gray-400 mb-1">Completed On</p>
              <p className="text-sm text-gray-400 italic">— set on completion</p>
            </div>
          </div>

          {/* Flowable task chip */}
          {taskId ? (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-500 font-medium mb-0.5">Flowable Task ID</p>
              <p className="text-xs text-blue-700 font-mono break-all">{taskId}</p>
            </div>
          ) : (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-700">
                ⚠ No active Flowable task linked. Make sure this step is "In Progress".
              </p>
            </div>
          )}
        </div>

        {/* ── RIGHT: Action panel ── */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm p-6 flex flex-col">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Complete This Step</h2>
          <p className="text-sm text-gray-500 mb-6">
            Record your findings and attach any supporting evidence, then mark the step as complete.
          </p>

          <div className="flex-1 space-y-5">

            {/* Comments */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Comments <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={6}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Describe your findings for this step..."
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>

            {/* Attach Evidence */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Attach Evidence <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.xlsx,.docx"
                onChange={handleFileChange}
                className="hidden"
              />
              {fileName ? (
                <div className="border border-gray-200 rounded-lg p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-red-100 rounded flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">{fileName}</div>
                      <div className="text-xs text-gray-500">Attached</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button className="p-2 text-gray-500 hover:bg-gray-100 rounded transition-colors">
                      <DownloadIcon className="w-4 h-4" />
                    </button>
                    <button onClick={handleRemoveFile} className="p-2 text-red-500 hover:bg-red-50 rounded transition-colors">
                      <Trash2Icon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-4 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors">
                  <UploadIcon className="w-4 h-4" />
                  Click to attach evidence (PDF, image, etc.)
                </button>
              )}
            </div>
          </div>

          {/* Footer actions — pinned to bottom of card */}
          <div className="flex items-center justify-between pt-6 mt-6 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              Completing as <span className="font-medium text-gray-600">{auditorName || 'current user'}</span>
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(-1)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                Cancel
              </button>
              <button
                onClick={handleCompleteStep}
                disabled={submitting}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed text-sm font-medium">
                {submitting ? (
                  <><Loader2Icon className="w-4 h-4 animate-spin" /> Completing…</>
                ) : (
                  <><CheckCircle2Icon className="w-4 h-4" /> Complete Step</>
                )}
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
