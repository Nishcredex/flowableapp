// ============================================================
//  Sidebar.tsx — minimal patch: hide Users link for auditors
//  CHANGES from original:
//    1. Import useAuth
//    2. Filter NAV_ITEMS so auditors don't see /users
// ============================================================

import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  HomeIcon, ClipboardListIcon, BookOpenIcon, CheckSquareIcon,
  FolderIcon, BarChart3Icon, UsersIcon, SettingsIcon,
  ChevronLeftIcon, ChevronRightIcon, NetworkIcon,
} from 'lucide-react';
import { useSidebar } from './Layout';
import { useAuth } from '../pages/AuthContext';           // ← NEW
import { getOrgSettings } from '../pages/services/flowableApi';

const NAV_ITEMS = [
  { icon: HomeIcon,          label: 'Dashboard',        path: '/dashboard',         adminOnly: false },
  { icon: ClipboardListIcon, label: 'Audits',            path: '/audits',            adminOnly: false },
  { icon: NetworkIcon,       label: 'Workflows',         path: '/workflows',         adminOnly: false },
  { icon: BookOpenIcon,      label: 'Checklist Library', path: '/checklist-library', adminOnly: false },
  { icon: CheckSquareIcon,   label: 'Tasks',             path: '/tasks',             adminOnly: false },
  { icon: FolderIcon,        label: 'Projects',          path: '/projects',          adminOnly: false },
  { icon: BarChart3Icon,     label: 'Reports',           path: '/reports',           adminOnly: false },
  { icon: UsersIcon,         label: 'Users',             path: '/users',             adminOnly: true },  // ← admin only
  { icon: SettingsIcon,      label: 'Settings',          path: '/settings',          adminOnly: false },
];

export function Sidebar() {
  const location              = useLocation();
  const { collapsed, toggle } = useSidebar();
  const { isAdmin }           = useAuth();                 // ← NEW
  const [orgName, setOrgName] = useState('Copier');

  useEffect(() => {
    getOrgSettings()
      .then((s) => { if (s?.companyName) setOrgName(s.companyName); })
      .catch(() => {});
  }, []);

  const visibleItems = NAV_ITEMS.filter(item => !item.adminOnly || isAdmin); // ← NEW

  return (
    <div className={`${collapsed ? 'w-[64px]' : 'w-[190px]'} bg-[#0F1E2E] text-white flex flex-col h-screen fixed left-0 top-0 transition-all duration-200 z-20`}>

      {/* Logo */}
      <div className={`flex items-center gap-2 px-4 py-5 border-b border-white/10 min-h-[64px] ${collapsed ? 'justify-center' : ''}`}>
        <div className="flex items-center gap-1 flex-shrink-0">
          <div className="w-6 h-6 bg-[#C8102E] rounded flex items-center justify-center">
            <span className="text-white font-bold text-sm">J</span>
          </div>
          <div className="w-6 h-6 bg-[#003875] rounded flex items-center justify-center">
            <span className="text-white font-bold text-sm">K</span>
          </div>
        </div>
        {!collapsed && (
          <span className="text-lg font-bold leading-tight truncate">{orgName}</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto overflow-x-hidden">
        {visibleItems.map((item) => {             // ← uses visibleItems
          const Icon     = item.icon;
          const isActive = location.pathname.startsWith(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              title={collapsed ? item.label : undefined}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 transition-all duration-150
                ${isActive ? 'bg-blue-600 text-white' : 'text-white/70 hover:bg-white/[0.08] hover:text-white'}
                ${collapsed ? 'justify-center' : ''}
              `}>
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span className="text-sm">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Collapse button */}
      <button
        onClick={toggle}
        className={`flex items-center gap-2 px-4 py-4 border-t border-white/10 text-white/50 hover:text-white hover:bg-white/5 transition-colors ${collapsed ? 'justify-center' : ''}`}>
        {collapsed
          ? <ChevronRightIcon className="w-4 h-4" />
          : <><ChevronLeftIcon className="w-4 h-4" /><span className="text-xs">Collapse</span></>}
      </button>
    </div>
  );
}
// import React, { useEffect, useState } from 'react';
// import { Link, useLocation } from 'react-router-dom';
// import {
//   HomeIcon, ClipboardListIcon, BookOpenIcon, CheckSquareIcon,
//   FolderIcon, BarChart3Icon, UsersIcon, SettingsIcon,
//   ChevronLeftIcon, ChevronRightIcon, NetworkIcon,
// } from 'lucide-react';
// import { useSidebar } from './Layout';
// import { getOrgSettings } from '../pages/services/flowableApi';

// const NAV_ITEMS = [
//   { icon: HomeIcon,          label: 'Dashboard',        path: '/dashboard' },
//   { icon: ClipboardListIcon, label: 'Audits',            path: '/audits' },
//   { icon: NetworkIcon,       label: 'Workflows',         path: '/workflows' },
//   { icon: BookOpenIcon,      label: 'Checklist Library', path: '/checklist-library' },
//   { icon: CheckSquareIcon,   label: 'Tasks',             path: '/tasks' },
//   { icon: FolderIcon,        label: 'Projects',          path: '/projects' },
//   { icon: BarChart3Icon,     label: 'Reports',           path: '/reports' },
//   { icon: UsersIcon,         label: 'Users',             path: '/users' },
//   { icon: SettingsIcon,      label: 'Settings',          path: '/settings' },
// ];

// export function Sidebar() {
//   const location           = useLocation();
//   const { collapsed, toggle } = useSidebar();
//   const [orgName, setOrgName] = useState('Copier');

//   useEffect(() => {
//     getOrgSettings()
//       .then((s) => { if (s?.companyName) setOrgName(s.companyName); })
//       .catch(() => {});
//   }, []);

//   return (
//     <div className={`${collapsed ? 'w-[64px]' : 'w-[190px]'} bg-[#0F1E2E] text-white flex flex-col h-screen fixed left-0 top-0 transition-all duration-200 z-20`}>

//       {/* Logo */}
//       <div className={`flex items-center gap-2 px-4 py-5 border-b border-white/10 min-h-[64px] ${collapsed ? 'justify-center' : ''}`}>
//         <div className="flex items-center gap-1 flex-shrink-0">
//           <div className="w-6 h-6 bg-[#C8102E] rounded flex items-center justify-center">
//             <span className="text-white font-bold text-sm">J</span>
//           </div>
//           <div className="w-6 h-6 bg-[#003875] rounded flex items-center justify-center">
//             <span className="text-white font-bold text-sm">K</span>
//           </div>
//         </div>
//         {!collapsed && (
//           <span className="text-lg font-bold leading-tight truncate">{orgName}</span>
//         )}
//       </div>

//       {/* Nav */}
//       <nav className="flex-1 px-2 py-3 overflow-y-auto overflow-x-hidden">
//         {NAV_ITEMS.map((item) => {
//           const Icon     = item.icon;
//           const isActive = location.pathname.startsWith(item.path);
//           return (
//             <Link
//               key={item.path}
//               to={item.path}
//               title={collapsed ? item.label : undefined}
//               className={`
//                 flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 transition-all duration-150
//                 ${isActive ? 'bg-blue-600 text-white' : 'text-white/70 hover:bg-white/[0.08] hover:text-white'}
//                 ${collapsed ? 'justify-center' : ''}
//               `}>
//               <Icon className="w-5 h-5 flex-shrink-0" />
//               {!collapsed && <span className="text-sm">{item.label}</span>}
//             </Link>
//           );
//         })}
//       </nav>

//       {/* Collapse button */}
//       <button
//         onClick={toggle}
//         className={`flex items-center gap-2 px-4 py-4 border-t border-white/10 text-white/50 hover:text-white hover:bg-white/5 transition-colors ${collapsed ? 'justify-center' : ''}`}>
//         {collapsed
//           ? <ChevronRightIcon className="w-4 h-4" />
//           : <><ChevronLeftIcon className="w-4 h-4" /><span className="text-xs">Collapse</span></>}
//       </button>
//     </div>
//   );
// }