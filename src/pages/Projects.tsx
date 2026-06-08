import React, { useState, useEffect, useCallback } from 'react';
import {
  PlusIcon, FolderIcon, UsersIcon, ClipboardListIcon,
  Edit2Icon, Trash2Icon, XIcon, Loader2Icon,
  AlertCircleIcon, RefreshCwIcon, MapPinIcon,
} from 'lucide-react';
import {
  getAllProjects, createProjectProcess, updateProjectVariable,
  deleteProject, getAllProcessInstances,
  ProjectInstance, CreateProjectPayload,
} from './services/flowableApi';

// ── Count audits per project name ─────────────────────────────
// Uses inline variables from getAllProcessInstances — no per-instance fetch needed.
async function fetchAuditCounts(): Promise<Record<string, number>> {
  try {
    const instances = await getAllProcessInstances();
    const counts: Record<string, number> = {};
    for (const inst of instances) {
      const vars = Array.isArray(inst.variables) ? inst.variables as any[] : [];
      const v = vars.find((x: any) => x.name === 'projectName');
      const name = v ? String(v.value) : '';
      if (name) counts[name] = (counts[name] || 0) + 1;
    }
    return counts;
  } catch { return {}; }
}

const STATUS_COLORS: Record<string, string> = {
  Active:    "bg-green-100 text-green-700",
  Planning:  "bg-blue-100 text-blue-700",
  "On Hold": "bg-orange-100 text-orange-700",
  Completed: "bg-gray-100 text-gray-700",
};
const STATUS_OPTIONS = ["Active", "Planning", "On Hold", "Completed"];

// ── Modal ─────────────────────────────────────────────────────
function ProjectModal({
  initial, onSave, onClose, saving,
}: {
  initial?: ProjectInstance | null;
  onSave:  (p: CreateProjectPayload) => void;
  onClose: () => void;
  saving:  boolean;
}) {
  const [form, setForm] = useState({
    projectName:  initial?.name        ?? "",
    location:     initial?.location    ?? "",
    managerName:  initial?.managerName ?? "",
    description:  initial?.description ?? "",
    status:       initial?.status      ?? "Active",
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const valid = form.projectName.trim() && form.location.trim() && form.managerName.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">
            {initial ? "Edit Project" : "New Project"}
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <XIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="space-y-4">
          {[
            { key: "projectName", label: "Project Name", placeholder: "e.g. Copier Paper Production - Unit 3" },
            { key: "location",    label: "Location",     placeholder: "e.g. Rayagada, Odisha" },
            { key: "managerName", label: "Manager",      placeholder: "e.g. Rajesh Kumar" },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {label} <span className="text-red-500">*</span>
              </label>
              <input
                value={(form as any)[key]}
                onChange={e => set(key, e.target.value)}
                placeholder={placeholder}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          ))}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={form.status}
              onChange={e => set("status", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
            >
              {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={e => set("description", e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">
            Cancel
          </button>
          <button
            onClick={() => onSave(form as CreateProjectPayload)}
            disabled={!valid || saving}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving && <Loader2Icon className="w-4 h-4 animate-spin" />}
            {initial ? "Save Changes" : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────
export function Projects() {
  const [projects,   setProjects]   = useState<ProjectInstance[]>([]);
  const [counts,     setCounts]     = useState<Record<string, number>>({});
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [showModal,  setShowModal]  = useState(false);
  const [editing,    setEditing]    = useState<ProjectInstance | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [projs, auditCounts] = await Promise.all([
        getAllProjects(),
        fetchAuditCounts(),
      ]);
      setProjects(projs);
      setCounts(auditCounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Create ────────────────────────────────────────────────
  const handleCreate = async (payload: CreateProjectPayload) => {
    setSaving(true);
    try {
      await createProjectProcess(payload);
      await load();
      setShowModal(false);
    } catch (err) {
      alert("Failed: " + (err instanceof Error ? err.message : ""));
    } finally {
      setSaving(false);
    }
  };

  // ── Edit: update each changed variable on the process instance ──
  const handleEdit = async (payload: CreateProjectPayload) => {
    if (!editing) return;
    setSaving(true);
    try {
      const fields: [string, string][] = [
        ["projectName",  payload.projectName],
        ["location",     payload.location],
        ["managerName",  payload.managerName],
        ["description",  payload.description],
        ["status",       payload.status],
      ];
      await Promise.all(
        fields.map(([k, v]) => updateProjectVariable(editing.id, k, v))
      );
      await load();
      setEditing(null);
    } catch (err) {
      alert("Failed: " + (err instanceof Error ? err.message : ""));
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────
  const handleDelete = async (p: ProjectInstance) => {
    if (!window.confirm(`Delete "${p.name}"?`)) return;
    setDeletingId(p.id);
    try {
      await deleteProject(p.id);
      setProjects(prev => prev.filter(x => x.id !== p.id));
    } catch (err) {
      alert("Failed: " + (err instanceof Error ? err.message : ""));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-8">
      {showModal && (
        <ProjectModal onSave={handleCreate} onClose={() => setShowModal(false)} saving={saving} />
      )}
      {editing && (
        <ProjectModal initial={editing} onSave={handleEdit} onClose={() => setEditing(null)} saving={saving} />
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Projects</h1>
          <p className="text-sm text-gray-500 mt-1">Manufacturing facilities and active initiatives</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm text-gray-600 disabled:opacity-50">
            <RefreshCwIcon className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <PlusIcon className="w-4 h-4" />
            <span className="text-sm font-medium">New Project</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircleIcon className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700">Failed to load projects</p>
            <p className="text-sm text-red-600">{error}</p>
            <button onClick={load} className="mt-1 text-sm text-red-700 underline">Try again</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-3 gap-6">
          {[1,2,3].map(i => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-6 animate-pulse">
              <div className="h-10 w-10 bg-gray-200 rounded-lg mb-4" />
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-6">
          {projects.map(project => (
            <div key={project.id}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                  <FolderIcon className="w-6 h-6 text-blue-600" />
                </div>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[project.status] ?? "bg-gray-100 text-gray-700"}`}>
                  {project.status}
                </span>
              </div>

              <h3 className="text-base font-semibold text-gray-900 mb-1">{project.name}</h3>
              <p className="text-sm text-gray-500 mb-1 flex items-center gap-1">
                <MapPinIcon className="w-3.5 h-3.5" />{project.location}
              </p>
              {project.description && (
                <p className="text-xs text-gray-400 mb-3 line-clamp-2">{project.description}</p>
              )}

              <div className="space-y-2 mb-4 pb-4 border-b border-gray-100">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Project Manager</span>
                  <span className="text-gray-900 font-medium">{project.managerName}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-center mb-4">
                <div>
                  <ClipboardListIcon className="w-3.5 h-3.5 mx-auto text-gray-400 mb-1" />
                  <div className="text-lg font-semibold text-gray-900">
                    {counts[project.name] ?? 0}
                  </div>
                  <div className="text-xs text-gray-500">Audits</div>
                </div>
                <div>
                  <UsersIcon className="w-3.5 h-3.5 mx-auto text-gray-400 mb-1" />
                  <div className="text-lg font-semibold text-gray-900">—</div>
                  <div className="text-xs text-gray-500">Members</div>
                </div>
              </div>

              <div className="flex justify-end gap-1 pt-2 border-t border-gray-100">
                <button onClick={() => setEditing(project)}
                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors">
                  <Edit2Icon className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(project)} disabled={deletingId === project.id}
                  className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50">
                  {deletingId === project.id
                    ? <Loader2Icon className="w-4 h-4 animate-spin" />
                    : <Trash2Icon className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ))}

          {projects.length === 0 && (
            <div className="col-span-3 text-center py-16 text-gray-400">
              <FolderIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No projects yet.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}