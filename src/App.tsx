// ============================================================
//  App.tsx — with AuthProvider + ProtectedRoute
// ============================================================

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './pages/AuthContext';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/Loginpage';
import { CreateAudit } from './pages/CreateAudit';
import { AuditChecklist } from './pages/AuditChecklist';
import { CompleteStep } from './pages/CompleteStep';
import { MyTasks } from './pages/MyTasks';
import { TaskDetails } from './pages/TaskDetails';
import { Dashboard } from './pages/Dashboard';
import { WorkflowView } from './pages/WorkflowView';
import { EmailReminder } from './pages/EmailReminder';
import { AuditsList } from './pages/AuditsList';
import { ChecklistLibrary } from './pages/ChecklistLibrary';
import { Projects } from './pages/Projects';
import { Reports } from './pages/Reports';
import { Users } from './pages/Users';
import { Settings } from './pages/Settings';

// ── Guards ────────────────────────────────────────────────────

/** Redirects to /login if not logged in */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Redirects auditors away from admin-only pages */
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAdmin } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

// ── Inner app (needs auth context) ───────────────────────────
function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      {/* Public */}
      <Route
        path="/login"
        element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />}
      />

      {/* Protected — all roles */}
      <Route path="/" element={
        <ProtectedRoute>
          <Layout>
            <Routes>
              <Route index element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Layout>
        </ProtectedRoute>
      } />

      <Route path="/dashboard" element={
        <ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>
      } />

      <Route path="/audits" element={
        <ProtectedRoute><Layout><AuditsList /></Layout></ProtectedRoute>
      } />

      {/* Admin only — create audit */}
      <Route path="/audits/create" element={
        <AdminRoute><Layout><CreateAudit /></Layout></AdminRoute>
      } />

      <Route path="/audits/manufacturing-unit-1/checklist" element={
        <ProtectedRoute><Layout><AuditChecklist /></Layout></ProtectedRoute>
      } />

      <Route path="/audits/manufacturing-unit-1/checklist/step-1" element={
        <ProtectedRoute><Layout><CompleteStep /></Layout></ProtectedRoute>
      } />

      <Route path="/workflows" element={
        <ProtectedRoute><Layout><WorkflowView /></Layout></ProtectedRoute>
      } />

      <Route path="/checklist-library" element={
        <ProtectedRoute><Layout><ChecklistLibrary /></Layout></ProtectedRoute>
      } />

      <Route path="/tasks" element={
        <ProtectedRoute><Layout><MyTasks /></Layout></ProtectedRoute>
      } />

      <Route path="/tasks/:taskId" element={
        <ProtectedRoute><Layout><TaskDetails /></Layout></ProtectedRoute>
      } />

      <Route path="/projects" element={
        <ProtectedRoute><Layout><Projects /></Layout></ProtectedRoute>
      } />

      <Route path="/reports" element={
        <ProtectedRoute><Layout><Reports /></Layout></ProtectedRoute>
      } />

      {/* Admin only — users page */}
      <Route path="/users" element={
        <AdminRoute><Layout><Users /></Layout></AdminRoute>
      } />

      <Route path="/settings" element={
        <ProtectedRoute><Layout><Settings /></Layout></ProtectedRoute>
      } />

      <Route path="/email-reminder" element={
        <ProtectedRoute><Layout><EmailReminder /></Layout></ProtectedRoute>
      } />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
// import React from 'react';
// import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
// import { Layout } from './components/Layout';
// import { CreateAudit } from './pages/CreateAudit';
// import { AuditChecklist } from './pages/AuditChecklist';
// import { CompleteStep } from './pages/CompleteStep';
// import { MyTasks } from './pages/MyTasks';
// import { TaskDetails } from './pages/TaskDetails';
// import { Dashboard } from './pages/Dashboard';
// import { WorkflowView } from './pages/WorkflowView';
// import { EmailReminder } from './pages/EmailReminder';
// import { AuditsList } from './pages/AuditsList';
// import { ChecklistLibrary } from './pages/ChecklistLibrary';
// import { Projects } from './pages/Projects';
// import { Reports } from './pages/Reports';
// import { Users } from './pages/Users';
// import { Settings } from './pages/Settings';
// export function App() {
//   return (
//     <BrowserRouter>
//       <Layout>
//         <Routes>
//           <Route path="/" element={<Navigate to="/dashboard" replace />} />
//           <Route path="/dashboard" element={<Dashboard />} />

//           <Route path="/audits" element={<AuditsList />} />
//           <Route path="/audits/create" element={<CreateAudit />} />
//           <Route
//             path="/audits/manufacturing-unit-1/checklist"
//             element={<AuditChecklist />} />
          
//           <Route
//             path="/audits/manufacturing-unit-1/checklist/step-1"
//             element={<CompleteStep />} />
          

//           <Route path="/workflows" element={<WorkflowView />} />
//           <Route path="/checklist-library" element={<ChecklistLibrary />} />

//           <Route path="/tasks" element={<MyTasks />} />
//           <Route path="/tasks/:taskId" element={<TaskDetails />} />

//           <Route path="/projects" element={<Projects />} />
//           <Route path="/reports" element={<Reports />} />
//           <Route path="/users" element={<Users />} />
//           <Route path="/settings" element={<Settings />} />

//           <Route path="/email-reminder" element={<EmailReminder />} />
//         </Routes>
//       </Layout>
//     </BrowserRouter>);

// }