// ============================================================
//  LoginPage.tsx — Role-based login
//  Drop into src/pages/LoginPage.tsx
// ============================================================

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2Icon, AlertCircleIcon } from 'lucide-react';
import { useAuth, AuthUser } from '../pages/AuthContext';

// ── Hardcoded users (swap with API call when ready) ──────────
// Role 'admin'  → full access: create audits, cancel, manage users, see all
// Role 'auditor' → scoped: only sees their own audits & tasks, no destructive actions
const USERS: (AuthUser & { password: string })[] = [
  {
    id:       'admin',
    name:     'System Admin',
    email:    'admin@jkcopier.com',
    role:     'admin',
    password: 'admin123',
  },
  {
  id:       'anita.sharma',
  name:     'Anita Sharma',
  email:    'anita.sharma@jkcopier.com',
  role:     'auditor',
  password: 'auditor123',
},
  {
    id:       'rajesh.kumar',
    name:     'Rajesh Kumar',
    email:    'rajesh.kumar@jkcopier.com',
    role:     'auditor',
    password: 'auditor123',
  },
  {
    id:       'priya.sharma',
    name:     'Priya Sharma',
    email:    'priya.sharma@jkcopier.com',
    role:     'auditor',
    password: 'auditor123',
  },
  // Add more auditors here — or replace with a real API call
];

export function LoginPage() {
  const navigate        = useNavigate();
  const { login }       = useAuth();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Simulate slight delay (replace body with real fetch if needed)
    await new Promise(r => setTimeout(r, 400));

    const found = USERS.find(
      u => u.email.toLowerCase() === email.toLowerCase() && u.password === password
    );

    if (found) {
      const { password: _, ...user } = found;
      login(user);
      navigate('/dashboard', { replace: true });
    } else {
      setError('Invalid email or password.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2 justify-center mb-8">
          <div className="w-8 h-8 bg-[#C8102E] rounded flex items-center justify-center">
            <span className="text-white font-bold text-base">J</span>
          </div>
          <div className="w-8 h-8 bg-[#003875] rounded flex items-center justify-center">
            <span className="text-white font-bold text-base">K</span>
          </div>
          <span className="text-xl font-bold text-gray-900 ml-1">Audit System</span>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <h1 className="text-xl font-semibold text-gray-900 mb-1">Sign in</h1>
          <p className="text-sm text-gray-500 mb-6">Enter your credentials to continue</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@jkcopier.com"
                required
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircleIcon className="w-4 h-4 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
              {loading && <Loader2Icon className="w-4 h-4 animate-spin" />}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {/* Quick-login hint (remove in production) */}
          <div className="mt-5 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400 font-medium mb-2">Demo accounts</p>
            <div className="space-y-1.5">
              {USERS.map(u => (
                <button
                  key={u.id}
                  onClick={() => { setEmail(u.email); setPassword(u.password); }}
                  className="w-full text-left flex items-center justify-between px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors group">
                  <span className="text-xs text-gray-600 group-hover:text-gray-900">{u.name}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                    u.role === 'admin'
                      ? 'bg-purple-100 text-purple-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    {u.role}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}