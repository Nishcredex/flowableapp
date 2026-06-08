import React, { useEffect, useState, useRef } from 'react';
import { PlusIcon, SearchIcon, MailIcon, MoreVerticalIcon, XIcon, Loader2Icon } from 'lucide-react';
import {
  getAllUsers,
  createUser,
  deleteUser,
  FlowableUser,
} from '../pages/services/flowableApi'

// Avatar colors cycle based on index
const AVATAR_COLORS = [
  'bg-purple-500','bg-blue-500','bg-green-500','bg-orange-500',
  'bg-pink-500','bg-teal-500','bg-gray-500','bg-indigo-500','bg-red-500','bg-yellow-500',
];

const getInitials = (firstName: string, lastName: string) =>
  `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase();

// ─── Invite Modal ─────────────────────────────────────────────
function InviteModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: 'test', // default password
    role: '',
    department: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!form.firstName || !form.lastName || !form.email || !form.role || !form.department) {
      setError('Please fill in all fields.');
      return;
    }
    // Build id from email prefix e.g. "anita.sharma"
    const id = form.email.split('@')[0].toLowerCase().replace(/\s+/g, '.');
    setSaving(true);
    setError('');
    try {
      await createUser({ id, ...form });
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Failed to create user.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">Invite User</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <XIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">First Name</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={form.firstName}
                onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Last Name</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={form.lastName}
                onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input
              type="email"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
            >
              <option value="">Select role...</option>
              <option>Lead Auditor</option>
              <option>Plant Manager</option>
              <option>Safety Officer</option>
              <option>Production Lead</option>
              <option>Environmental Auditor</option>
              <option>Quality Inspector</option>
              <option>Administrator</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Department</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g. Quality Compliance, EHS, Unit 1 - Rayagada"
              value={form.department}
              onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
            />
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
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving && <Loader2Icon className="w-4 h-4 animate-spin" />}
            {saving ? 'Creating...' : 'Create User'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────
export function Users() {
  const [users, setUsers] = useState<FlowableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await getAllUsers();
      setUsers(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleDelete = async (userId: string) => {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    try {
      await deleteUser(userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch (e) {
      alert('Failed to delete user.');
    }
    setMenuOpen(null);
  };

  const filtered = users.filter(u => {
    const name = `${u.firstName} ${u.lastName}`.toLowerCase();
    return name.includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
  });

  const getInitialsFromUser = (u: FlowableUser) => getInitials(u.firstName, u.lastName);

  return (
    <div className="p-8">
      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onCreated={fetchUsers}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500 mt-1">Manage team members, roles, and access</p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          <span className="text-sm font-medium">Invite User</span>
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="relative max-w-md">
            <SearchIcon className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-gray-500">
            <Loader2Icon className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading users...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/50">
                  <th className="text-left py-3 px-6 text-sm font-medium text-gray-700">User</th>
                  <th className="text-left py-3 px-6 text-sm font-medium text-gray-700">Login ID</th>
                  <th className="text-left py-3 px-6 text-sm font-medium text-gray-700">Email</th>
                  <th className="text-left py-3 px-6 text-sm font-medium text-gray-700"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-12 text-sm text-gray-400">
                      No users found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((user, idx) => (
                    <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 ${AVATAR_COLORS[idx % AVATAR_COLORS.length]} rounded-full flex items-center justify-center text-white font-semibold text-sm`}>
                            {getInitialsFromUser(user)}
                          </div>
                          <div className="text-sm font-medium text-gray-900">
                            {user.firstName} {user.lastName}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-sm text-gray-600 font-mono">{user.id}</td>
                      <td className="py-4 px-6">
                        <div className="text-xs text-gray-500 flex items-center gap-1">
                          <MailIcon className="w-3 h-3" />
                          {user.email}
                        </div>
                      </td>
                      <td className="py-4 px-6 relative" ref={menuOpen === user.id ? menuRef : null}>
                        <button
                          onClick={() => setMenuOpen(menuOpen === user.id ? null : user.id)}
                          className="p-1.5 text-gray-500 hover:bg-gray-100 rounded transition-colors"
                        >
                          <MoreVerticalIcon className="w-4 h-4" />
                        </button>
                        {menuOpen === user.id && (
                          <div className="absolute right-6 top-12 z-10 bg-white border border-gray-200 rounded-lg shadow-lg w-36 py-1">
                            <button
                              onClick={() => handleDelete(user.id)}
                              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                            >
                              Delete User
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}