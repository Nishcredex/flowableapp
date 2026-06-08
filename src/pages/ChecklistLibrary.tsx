import React, { useEffect, useState } from 'react';
import {
  PlusIcon, SearchIcon, FileTextIcon,
  Edit2Icon, Trash2Icon, CopyIcon,
  XIcon, Loader2Icon, PlusCircleIcon, MinusCircleIcon,
} from 'lucide-react';
import {
  getAllTemplates,
  createChecklistTemplate,
  updateChecklistTemplate,
  deleteChecklistTemplate,
  ChecklistTemplate,
} from '../pages/services/flowableApi';

const CATEGORY_COLORS: Record<string, string> = {
  'Quality Compliance': 'bg-blue-100 text-blue-700',
  'Environmental':      'bg-green-100 text-green-700',
  'Safety & HR':        'bg-orange-100 text-orange-700',
  'Production':         'bg-purple-100 text-purple-700',
  'Procurement':        'bg-pink-100 text-pink-700',
};

const CATEGORIES = [
  'Quality Compliance', 'Environmental', 'Safety & HR', 'Production', 'Procurement',
];

// ─── Template Modal (Create & Edit) ───────────────────────────
function TemplateModal({
  existing,
  onClose,
  onSaved,
}: {
  existing?: ChecklistTemplate;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!existing;
  const [name,     setName]     = useState(existing?.templateName ?? '');
  const [category, setCategory] = useState(existing?.category ?? CATEGORIES[0]);
  const [author,   setAuthor]   = useState(existing?.author ?? 'Anita Sharma');
  const [steps,    setSteps]    = useState<string[]>(
    existing ? JSON.parse(existing.steps) : ['']
  );
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const addStep    = () => setSteps(s => [...s, '']);
  const removeStep = (i: number) => setSteps(s => s.filter((_, idx) => idx !== i));
  const editStep   = (i: number, val: string) =>
    setSteps(s => s.map((v, idx) => (idx === i ? val : v)));

  const handleSave = async () => {
    const cleanSteps = steps.map(s => s.trim()).filter(Boolean);
    if (!name.trim())          { setError('Template name is required.'); return; }
    if (cleanSteps.length === 0) { setError('Add at least one step.'); return; }

    setSaving(true);
    setError('');
    try {
      if (isEdit && existing) {
        await updateChecklistTemplate(existing.id, {
          templateName: name.trim(),
          category,
          author,
          steps: JSON.stringify(cleanSteps),
          createdDate: existing.createdDate,
        });
      } else {
        await createChecklistTemplate({
          templateName: name.trim(),
          category,
          author,
          steps: JSON.stringify(cleanSteps),
          createdDate: new Date().toLocaleDateString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric',
          }),
        });
      }
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Failed to save template.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? 'Edit Template' : 'New Template'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <XIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Template Name</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. ISO 9001:2015 Quality Management Audit"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={category}
                onChange={e => setCategory(e.target.value)}
              >
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Author</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={author}
                onChange={e => setAuthor(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">
              Checklist Steps
            </label>
            <div className="space-y-2">
              {steps.map((step, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-5 text-right">{i + 1}.</span>
                  <input
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={step}
                    onChange={e => editStep(i, e.target.value)}
                    placeholder={`Step ${i + 1}`}
                  />
                  {steps.length > 1 && (
                    <button onClick={() => removeStep(i)} className="text-red-400 hover:text-red-600">
                      <MinusCircleIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={addStep}
              className="mt-2 flex items-center gap-1 text-blue-600 text-sm hover:underline"
            >
              <PlusCircleIcon className="w-4 h-4" />
              Add Step
            </button>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving && <Loader2Icon className="w-4 h-4 animate-spin" />}
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Template'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────
export function ChecklistLibrary() {
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing,   setEditing]   = useState<ChecklistTemplate | undefined>();

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const data = await getAllTemplates();
      setTemplates(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTemplates(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this template? This cannot be undone.')) return;
    try {
      await deleteChecklistTemplate(id);
      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch {
      alert('Failed to delete template.');
    }
  };

  const handleDuplicate = async (tpl: ChecklistTemplate) => {
    try {
      await createChecklistTemplate({
        templateName: `Copy of ${tpl.templateName}`,
        category:    tpl.category,
        author:      tpl.author,
        steps:       tpl.steps,
        createdDate: new Date().toLocaleDateString('en-GB', {
          day: '2-digit', month: 'short', year: 'numeric',
        }),
      });
      fetchTemplates();
    } catch {
      alert('Failed to duplicate template.');
    }
  };

  const openEdit = (tpl: ChecklistTemplate) => {
    setEditing(tpl);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(undefined);
  };

  const filtered = templates.filter(t =>
    t.templateName.toLowerCase().includes(search.toLowerCase()) ||
    t.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8">
      {showModal && (
        <TemplateModal
          existing={editing}
          onClose={closeModal}
          onSaved={fetchTemplates}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Checklist Library</h1>
          <p className="text-sm text-gray-500 mt-1">Reusable audit checklist templates</p>
        </div>
        <button
          onClick={() => { setEditing(undefined); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          <span className="text-sm font-medium">New Template</span>
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="relative max-w-md">
          <SearchIcon className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search templates..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 gap-2 text-gray-500">
          <Loader2Icon className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading templates...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400 text-sm">
          No templates found. Create your first template.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          {filtered.map((tpl) => {
            const parsedSteps: string[] = JSON.parse(tpl.steps || '[]');
            return (
              <div
                key={tpl.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                    <FileTextIcon className="w-5 h-5 text-blue-600" />
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[tpl.category] || 'bg-gray-100 text-gray-700'}`}>
                    {tpl.category}
                  </span>
                </div>

                <h3 className="text-base font-semibold text-gray-900 mb-2">{tpl.templateName}</h3>
                <div className="text-sm text-gray-500 mb-4">
                  <span>{parsedSteps.length} steps</span>
                  <span className="mx-2">•</span>
                  <span>Created {tpl.createdDate}</span>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                  <span className="text-xs text-gray-500">By {tpl.author}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDuplicate(tpl)}
                      className="p-1.5 text-gray-500 hover:bg-gray-100 rounded transition-colors"
                      title="Duplicate"
                    >
                      <CopyIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openEdit(tpl)}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="Edit"
                    >
                      <Edit2Icon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(tpl.id)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Delete"
                    >
                      <Trash2Icon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
// import React from 'react';
// import {
//   PlusIcon,
//   SearchIcon,
//   FileTextIcon,
//   Edit2Icon,
//   Trash2Icon,
//   CopyIcon } from
// 'lucide-react';
// export function ChecklistLibrary() {
//   const templates = [
//   {
//     id: 1,
//     name: 'ISO 9001:2015 Quality Management Audit',
//     category: 'Quality Compliance',
//     steps: 12,
//     lastUpdated: '15-May-2024',
//     author: 'Anita Sharma'
//   },
//   {
//     id: 2,
//     name: 'Environmental Compliance (MoEF & CPCB)',
//     category: 'Environmental',
//     steps: 10,
//     lastUpdated: '02-May-2024',
//     author: 'Anita Sharma'
//   },
//   {
//     id: 3,
//     name: 'Worker Safety & PPE Audit',
//     category: 'Safety & HR',
//     steps: 8,
//     lastUpdated: '20-Apr-2024',
//     author: 'Priya Nair'
//   },
//   {
//     id: 4,
//     name: 'Manufacturing Compliance Audit - Paper Mill',
//     category: 'Production',
//     steps: 7,
//     lastUpdated: '18-May-2024',
//     author: 'Anita Sharma'
//   },
//   {
//     id: 5,
//     name: 'Machinery Calibration & Maintenance',
//     category: 'Production',
//     steps: 9,
//     lastUpdated: '10-May-2024',
//     author: 'Vikram Singh'
//   },
//   {
//     id: 6,
//     name: 'Fire Safety & Emergency Preparedness',
//     category: 'Safety & HR',
//     steps: 11,
//     lastUpdated: '25-Apr-2024',
//     author: 'Priya Nair'
//   },
//   {
//     id: 7,
//     name: 'Raw Material Vendor Qualification',
//     category: 'Procurement',
//     steps: 6,
//     lastUpdated: '12-Apr-2024',
//     author: 'Anita Sharma'
//   },
//   {
//     id: 8,
//     name: 'Finished Goods Quality (GSM & Brightness)',
//     category: 'Quality Compliance',
//     steps: 5,
//     lastUpdated: '05-May-2024',
//     author: 'Anita Sharma'
//   }];

//   const categoryColors: Record<string, string> = {
//     'Quality Compliance': 'bg-blue-100 text-blue-700',
//     Environmental: 'bg-green-100 text-green-700',
//     'Safety & HR': 'bg-orange-100 text-orange-700',
//     Production: 'bg-purple-100 text-purple-700',
//     Procurement: 'bg-pink-100 text-pink-700'
//   };
//   return (
//     <div className="p-8">
//       <div className="flex items-center justify-between mb-6">
//         <div>
//           <h1 className="text-2xl font-semibold text-gray-900">
//             Checklist Library
//           </h1>
//           <p className="text-sm text-gray-500 mt-1">
//             Reusable audit checklist templates
//           </p>
//         </div>
//         <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
//           <PlusIcon className="w-4 h-4" />
//           <span className="text-sm font-medium">New Template</span>
//         </button>
//       </div>

//       <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
//         <div className="relative max-w-md">
//           <SearchIcon className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
//           <input
//             type="text"
//             placeholder="Search templates..."
//             className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          
//         </div>
//       </div>

//       <div className="grid grid-cols-2 gap-6">
//         {templates.map((tpl) =>
//         <div
//           key={tpl.id}
//           className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
          
//             <div className="flex items-start justify-between mb-4">
//               <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
//                 <FileTextIcon className="w-5 h-5 text-blue-600" />
//               </div>
//               <span
//               className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${categoryColors[tpl.category] || 'bg-gray-100 text-gray-700'}`}>
              
//                 {tpl.category}
//               </span>
//             </div>

//             <h3 className="text-base font-semibold text-gray-900 mb-2">
//               {tpl.name}
//             </h3>
//             <div className="text-sm text-gray-500 mb-4">
//               <span>{tpl.steps} steps</span>
//               <span className="mx-2">•</span>
//               <span>Updated {tpl.lastUpdated}</span>
//             </div>

//             <div className="flex items-center justify-between pt-4 border-t border-gray-100">
//               <span className="text-xs text-gray-500">By {tpl.author}</span>
//               <div className="flex items-center gap-1">
//                 <button
//                 className="p-1.5 text-gray-500 hover:bg-gray-100 rounded transition-colors"
//                 title="Duplicate">
                
//                   <CopyIcon className="w-4 h-4" />
//                 </button>
//                 <button
//                 className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
//                 title="Edit">
                
//                   <Edit2Icon className="w-4 h-4" />
//                 </button>
//                 <button
//                 className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
//                 title="Delete">
                
//                   <Trash2Icon className="w-4 h-4" />
//                 </button>
//               </div>
//             </div>
//           </div>
//         )}
//       </div>
//     </div>);

// }