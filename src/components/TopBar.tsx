// ============================================================
//  TopBar.tsx — minimal patch: reads user from AuthContext
//  CHANGES from original:
//    1. Import useAuth
//    2. Replace CURRENT_USER_ID constant with auth.user.id
//    3. Derive display name/initials from auth user (fallback to Flowable)
//    4. Sign out calls auth.logout()
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BellIcon, HelpCircleIcon, ChevronDownIcon,
  CheckSquareIcon, LogOutIcon, UserIcon, SettingsIcon, XIcon,
} from 'lucide-react';
import { useSidebar } from './Layout';
import { useAuth } from '../pages/AuthContext';          // ← NEW
import { getTasksByAssignee, FlowableTask } from '../pages/services/flowableApi';

export function TopBar() {
  const navigate        = useNavigate();
  const { collapsed }   = useSidebar();
  const { user, logout } = useAuth();                      // ← NEW

  const [tasks,       setTasks]       = useState<FlowableTask[]>([]);
  const [showBell,    setShowBell]    = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const bellRef    = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user?.id) {
      getTasksByAssignee(user.id).then(setTasks).catch(() => {});
    }
  }, [user?.id]);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (bellRef.current    && !bellRef.current.contains(e.target as Node))    setShowBell(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setShowProfile(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  function timeAgo(iso: string) {
    const d = Date.now() - new Date(iso).getTime();
    const m = Math.floor(d / 60000), h = Math.floor(d / 3600000), dy = Math.floor(d / 86400000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`;
    return `${dy}d ago`;
  }

  const initials = user
    ? user.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
    : 'SA';
  const fullName = user?.name  || 'System Admin';
  const email    = user?.email || '';
  const roleBadge = user?.role === 'admin' ? 'Administrator' : 'Auditor';

  const leftOffset = collapsed ? 'left-[64px]' : 'left-[190px]';
  const unread = tasks.length;

  return (
    <div className={`h-16 bg-white border-b border-gray-200 flex items-center justify-end px-6 gap-3 fixed top-0 right-0 ${leftOffset} z-10 transition-all duration-200`}>

      {/* Bell */}
      <div ref={bellRef} className="relative">
        <button
          onClick={() => { setShowBell(v => !v); setShowProfile(false); }}
          className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <BellIcon className="w-5 h-5 text-gray-600" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>

        {showBell && (
          <div className="absolute right-0 top-12 w-80 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <span className="text-sm font-semibold text-gray-900">
                My Open Tasks
                {unread > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 bg-red-100 text-red-600 text-xs font-bold rounded-full">{unread}</span>
                )}
              </span>
              <button onClick={() => setShowBell(false)}><XIcon className="w-4 h-4 text-gray-400" /></button>
            </div>

            <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
              {tasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                  <CheckSquareIcon className="w-8 h-8 mb-2 opacity-40" />
                  <p className="text-sm">All caught up!</p>
                </div>
              ) : (
                tasks.slice(0, 8).map((task) => (
                  <button
                    key={task.id}
                    onClick={() => { navigate('/tasks'); setShowBell(false); }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors">
                    <p className="text-sm font-medium text-gray-900 truncate">{task.name}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-gray-400">{timeAgo(task.created)}</span>
                      {task.dueDate && (
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${new Date(task.dueDate) < new Date() ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
                          Due {new Date(task.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                        </span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>

            {tasks.length > 0 && (
              <button
                onClick={() => { navigate('/tasks'); setShowBell(false); }}
                className="w-full py-3 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors border-t border-gray-100">
                View all tasks →
              </button>
            )}
          </div>
        )}
      </div>

      {/* Help */}
      <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
        <HelpCircleIcon className="w-5 h-5 text-gray-600" />
      </button>

      {/* Profile */}
      <div ref={profileRef} className="relative">
        <button
          onClick={() => { setShowProfile(v => !v); setShowBell(false); }}
          className="flex items-center gap-3 hover:bg-gray-50 rounded-lg px-3 py-2 transition-colors">
          <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0">
            {initials}
          </div>
          <div className="text-left hidden sm:block">
            <div className="text-sm font-medium text-gray-900 leading-tight">{fullName}</div>
            <div className="text-xs text-gray-500 truncate max-w-[120px]">{roleBadge}</div>
          </div>
          <ChevronDownIcon className={`w-4 h-4 text-gray-400 transition-transform ${showProfile ? 'rotate-180' : ''}`} />
        </button>

        {showProfile && (
          <div className="absolute right-0 top-12 w-56 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-900">{fullName}</p>
              <p className="text-xs text-gray-500 truncate">{email}</p>
              <span className={`mt-1 inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                user?.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
              }`}>
                {user?.role}
              </span>
            </div>
            <div className="py-1">
              <button
                onClick={() => { navigate('/settings'); setShowProfile(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                <UserIcon className="w-4 h-4 text-gray-400" /> My Profile
              </button>
              <button
                onClick={() => { navigate('/settings'); setShowProfile(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                <SettingsIcon className="w-4 h-4 text-gray-400" /> Settings
              </button>
            </div>
            <div className="border-t border-gray-100 py-1">
              <button
                onClick={() => { logout(); navigate('/login', { replace: true }); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
                <LogOutIcon className="w-4 h-4" /> Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
// import React, { useState, useEffect, useRef } from 'react';
// import { useNavigate } from 'react-router-dom';
// import {
//   BellIcon, HelpCircleIcon, ChevronDownIcon,
//   CheckSquareIcon, LogOutIcon, UserIcon, SettingsIcon, XIcon,
// } from 'lucide-react';
// import { useSidebar } from './Layout';
// import { getUserById, getTasksByAssignee, FlowableUser, FlowableTask } from '../pages/services/flowableApi';

// const CURRENT_USER_ID = 'admin';

// function getInitials(u: FlowableUser | null) {
//   if (!u) return 'SA';
//   const f = (u.firstName || '').trim();
//   const l = (u.lastName  || '').trim();
//   if (f && l) return `${f[0]}${l[0]}`.toUpperCase();
//   return (f || u.id).slice(0, 2).toUpperCase();
// }

// function getFullName(u: FlowableUser | null) {
//   if (!u) return 'System Admin';
//   return `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.id;
// }

// function timeAgo(iso: string) {
//   const d = Date.now() - new Date(iso).getTime();
//   const m = Math.floor(d / 60000), h = Math.floor(d / 3600000), dy = Math.floor(d / 86400000);
//   if (m < 1) return 'just now';
//   if (m < 60) return `${m}m ago`;
//   if (h < 24) return `${h}h ago`;
//   return `${dy}d ago`;
// }

// export function TopBar() {
//   const navigate = useNavigate();
//   const { collapsed } = useSidebar();

//   const [user,        setUser]        = useState<FlowableUser | null>(null);
//   const [tasks,       setTasks]       = useState<FlowableTask[]>([]);
//   const [showBell,    setShowBell]    = useState(false);
//   const [showProfile, setShowProfile] = useState(false);

//   const bellRef    = useRef<HTMLDivElement>(null);
//   const profileRef = useRef<HTMLDivElement>(null);

//   useEffect(() => {
//     getUserById(CURRENT_USER_ID).then(setUser).catch(() => {});
//     getTasksByAssignee(CURRENT_USER_ID).then(setTasks).catch(() => {});
//   }, []);

//   useEffect(() => {
//     function onOutside(e: MouseEvent) {
//       if (bellRef.current    && !bellRef.current.contains(e.target as Node))    setShowBell(false);
//       if (profileRef.current && !profileRef.current.contains(e.target as Node)) setShowProfile(false);
//     }
//     document.addEventListener('mousedown', onOutside);
//     return () => document.removeEventListener('mousedown', onOutside);
//   }, []);

//   const leftOffset = collapsed ? 'left-[64px]' : 'left-[190px]';
//   const unread = tasks.length;

//   return (
//     <div className={`h-16 bg-white border-b border-gray-200 flex items-center justify-end px-6 gap-3 fixed top-0 right-0 ${leftOffset} z-10 transition-all duration-200`}>

//       {/* Bell */}
//       <div ref={bellRef} className="relative">
//         <button
//           onClick={() => { setShowBell(v => !v); setShowProfile(false); }}
//           className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors">
//           <BellIcon className="w-5 h-5 text-gray-600" />
//           {unread > 0 && (
//             <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
//               {unread > 9 ? '9+' : unread}
//             </span>
//           )}
//         </button>

//         {showBell && (
//           <div className="absolute right-0 top-12 w-80 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50">
//             <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
//               <span className="text-sm font-semibold text-gray-900">
//                 My Open Tasks
//                 {unread > 0 && (
//                   <span className="ml-2 px-1.5 py-0.5 bg-red-100 text-red-600 text-xs font-bold rounded-full">{unread}</span>
//                 )}
//               </span>
//               <button onClick={() => setShowBell(false)}><XIcon className="w-4 h-4 text-gray-400" /></button>
//             </div>

//             <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
//               {tasks.length === 0 ? (
//                 <div className="flex flex-col items-center justify-center py-10 text-gray-400">
//                   <CheckSquareIcon className="w-8 h-8 mb-2 opacity-40" />
//                   <p className="text-sm">All caught up!</p>
//                 </div>
//               ) : (
//                 tasks.slice(0, 8).map((task) => (
//                   <button
//                     key={task.id}
//                     onClick={() => { navigate('/tasks'); setShowBell(false); }}
//                     className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors">
//                     <p className="text-sm font-medium text-gray-900 truncate">{task.name}</p>
//                     <div className="flex items-center justify-between mt-1">
//                       <span className="text-xs text-gray-400">{timeAgo(task.created)}</span>
//                       {task.dueDate && (
//                         <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${new Date(task.dueDate) < new Date() ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
//                           Due {new Date(task.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
//                         </span>
//                       )}
//                     </div>
//                   </button>
//                 ))
//               )}
//             </div>

//             {tasks.length > 0 && (
//               <button
//                 onClick={() => { navigate('/tasks'); setShowBell(false); }}
//                 className="w-full py-3 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors border-t border-gray-100">
//                 View all tasks →
//               </button>
//             )}
//           </div>
//         )}
//       </div>

//       {/* Help */}
//       <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
//         <HelpCircleIcon className="w-5 h-5 text-gray-600" />
//       </button>

//       {/* Profile */}
//       <div ref={profileRef} className="relative">
//         <button
//           onClick={() => { setShowProfile(v => !v); setShowBell(false); }}
//           className="flex items-center gap-3 hover:bg-gray-50 rounded-lg px-3 py-2 transition-colors">
//           <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0">
//             {getInitials(user)}
//           </div>
//           <div className="text-left hidden sm:block">
//             <div className="text-sm font-medium text-gray-900 leading-tight">{getFullName(user)}</div>
//             <div className="text-xs text-gray-500 truncate max-w-[120px]">{user?.email || 'Administrator'}</div>
//           </div>
//           <ChevronDownIcon className={`w-4 h-4 text-gray-400 transition-transform ${showProfile ? 'rotate-180' : ''}`} />
//         </button>

//         {showProfile && (
//           <div className="absolute right-0 top-12 w-56 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50">
//             <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
//               <p className="text-sm font-semibold text-gray-900">{getFullName(user)}</p>
//               <p className="text-xs text-gray-500 truncate">{user?.email || ''}</p>
//             </div>
//             <div className="py-1">
//               <button
//                 onClick={() => { navigate('/settings'); setShowProfile(false); }}
//                 className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
//                 <UserIcon className="w-4 h-4 text-gray-400" /> My Profile
//               </button>
//               <button
//                 onClick={() => { navigate('/settings'); setShowProfile(false); }}
//                 className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
//                 <SettingsIcon className="w-4 h-4 text-gray-400" /> Settings
//               </button>
//             </div>
//             <div className="border-t border-gray-100 py-1">
//               <button
//                 onClick={() => { localStorage.clear(); window.location.href = '/'; }}
//                 className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
//                 <LogOutIcon className="w-4 h-4" /> Sign out
//               </button>
//             </div>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }