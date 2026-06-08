// ============================================================
//  flowableApi.ts
//  Central service for all Flowable REST API calls
//  Used by: CreateAudit, AuditChecklist, CompleteStep,
//           MyTasks, TaskDetails, Dashboard, WorkflowView,
//           Settings
// ============================================================

// const FLOWABLE_BASE = 'http://localhost:8080/flowable-ui/process-api';
// const FLOWABLE_BASE = import.meta.env.VITE_API_URL
//   ? `${import.meta.env.VITE_API_URL}/flowable-api`
//   : 'http://localhost:3000/flowable-api';
const FLOWABLE_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000') + '/flowable-api';
const CREDENTIALS   = btoa('admin:test'); // base64 of "admin:test"

const HEADERS = {
  'Content-Type':  'application/json',
  'Authorization': `Basic ${CREDENTIALS}`,
};

// ─────────────────────────────────────────────────────────────
// TYPESCRIPT INTERFACES
// ─────────────────────────────────────────────────────────────

export interface FlowableVariable {
  name:  string;
  value: string | number | boolean;
  type:  'string' | 'integer' | 'boolean';
}

// Process Instance (one running audit workflow)
export interface ProcessInstance {
  id:                    string;
  name:                  string | null;
  processDefinitionId:   string;
  processDefinitionName: string;
  startTime:             string;
  startUserId:           string;
  ended:                 boolean;
  suspended:             boolean;
  variables:             FlowableVariable[];
  /** true when this row came from the historic endpoint (already completed) */
  _historic?:            boolean;
}

// Task (one step assigned to a user)
export interface FlowableTask {
  id:                string;
  name:              string;
  assignee:          string;
  created:           string;
  dueDate:           string | null;
  priority:          number;
  suspended:         boolean;
  formKey:           string | null;
  processInstanceId: string;
  processDefinitionId: string;
  taskDefinitionKey: string;
  description:       string | null;
}

// Process variable item returned by /variables endpoint
export interface ProcessVariable {
  name:  string;
  type:  string;
  value: string | number | boolean;
  scope: string;
}

// Start process request payload
export interface StartProcessPayload {
  auditName:    string;
  auditId:      string;
  projectName:  string;
  auditorName:  string;
  dueDate:      string;
  description:  string;
  checklistSteps: string; // JSON stringified array of step names
}

// Complete task request payload
export interface CompleteTaskPayload {
  stepName?:        string;
  comments?:        string;
  evidenceFile?:    string;
  completedBy?:     string;
  assignedTo?:      string;
  priority?:        string;
  taskTitle?:       string;
  approvalDecision?: 'Approved' | 'Rejected';
  managerComments?: string;
}

// Dashboard stats derived from Flowable data
export interface AuditStats {
  total:      number;
  inProgress: number;
  completed:  number;
  overdue:    number;
}

// ─────────────────────────────────────────────────────────────
// HELPER — generic fetch wrapper with error handling
// ─────────────────────────────────────────────────────────────

async function flowableFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${FLOWABLE_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      ...HEADERS,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Flowable API error [${response.status}]: ${errorText}`
    );
  }

  // 204 No Content (e.g. complete task returns no body)
  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

// ─────────────────────────────────────────────────────────────
// 1. START PROCESS
//    Called from: CreateAudit.tsx on "Start Audit" click
// ─────────────────────────────────────────────────────────────

export async function startAuditProcess(
  payload: StartProcessPayload
): Promise<ProcessInstance> {
  const variables: FlowableVariable[] = [
    { name: 'auditName',       value: payload.auditName,       type: 'string' },
    { name: 'auditId',         value: payload.auditId,         type: 'string' },
    { name: 'projectName',     value: payload.projectName,     type: 'string' },
    { name: 'auditorName',     value: payload.auditorName,     type: 'string' },
    { name: 'dueDate',         value: payload.dueDate,         type: 'string' },
    { name: 'description',     value: payload.description,     type: 'string' },
    { name: 'checklistSteps',  value: payload.checklistSteps,  type: 'string' },
  ];

  return flowableFetch<ProcessInstance>('/runtime/process-instances', {
    method: 'POST',
    body: JSON.stringify({
      processDefinitionKey: 'auditManagementWorkflow',
      variables,
    }),
  });
}

// ─────────────────────────────────────────────────────────────
// 2. GET ALL PROCESS INSTANCES
//    Called from: AuditsList.tsx, Dashboard.tsx
// ─────────────────────────────────────────────────────────────

// Shape returned by historic-process-instances when includeProcessVariables=true
interface HistoricProcessInstance {
  id:                    string;
  name:                  string | null;
  processDefinitionId:   string;
  processDefinitionName: string;
  startTime:             string;
  startUserId:           string;
  endTime:               string | null;
  // Variables are inlined as an array when includeProcessVariables=true
  variables?: Array<{ variableName: string; value: string | number | boolean; variableTypeName: string }>;
}

export async function getAllProcessInstances(): Promise<ProcessInstance[]> {
  // Query active (runtime) and completed (historic) instances in parallel.
  // For historic instances, include variables inline so AuditsList doesn't need
  // a separate per-instance fetch — eliminates the per-row 404s entirely.
  const [runtimeRes, historicRes] = await Promise.allSettled([
    flowableFetch<{ data: ProcessInstance[] }>(
      '/runtime/process-instances?processDefinitionKey=auditManagementWorkflow&size=100'
    ),
    flowableFetch<{ data: HistoricProcessInstance[] }>(
      '/history/historic-process-instances?processDefinitionKey=auditManagementWorkflow&size=100&finished=true&includeProcessVariables=true'
    ),
  ]);

  const runtimeInstances: ProcessInstance[] =
    runtimeRes.status === 'fulfilled' ? (runtimeRes.value.data || []) : [];

  const runtimeIds = new Set(runtimeInstances.map((i) => i.id));

  const historicInstances: ProcessInstance[] =
    historicRes.status === 'fulfilled'
      ? (historicRes.value.data || [])
          .filter((i) => !runtimeIds.has(i.id))
          .map((i) => {
            // Map inline variables from variableName → name so getVariableValue works
            const mappedVars: FlowableVariable[] = (i.variables || []).map((v: any) => ({
              name:  v.variableName ?? v.name ?? '',
              value: v.value,
              type:  (v.variableTypeName ?? v.type ?? 'string') as 'string' | 'integer' | 'boolean',
            }));
            return {
              ...i,
              ended:     true,
              suspended: false,
              _historic: true,
              variables: mappedVars,
            } as ProcessInstance;
          })
      : [];

  return [...runtimeInstances, ...historicInstances];
}

// ─────────────────────────────────────────────────────────────
// 3. GET PROCESS VARIABLES
//    For completed processes use the history endpoint directly —
//    never hit the runtime endpoint which 404s for ended processes.
// ─────────────────────────────────────────────────────────────

/** Variables for a COMPLETED process — uses history endpoint.
 *  Returns [] on 404 (safe fallback) so callers never crash. */
export async function getHistoricProcessVariables(
  processInstanceId: string
): Promise<ProcessVariable[]> {
  try {
    const data = await flowableFetch<{
      data: Array<{ variableName: string; value: string | number | boolean; variableTypeName: string }>;
    }>(`/history/historic-variable-instances?processInstanceId=${processInstanceId}&size=100`);

    return (data.data || []).map((v) => ({
      name:  v.variableName,
      type:  v.variableTypeName || 'string',
      value: v.value,
      scope: 'global',
    }));
  } catch (err) {
    console.warn(`getHistoricProcessVariables(${processInstanceId}) failed:`, err);
    return [];
  }
}

export async function getProcessVariables(
  processInstanceId: string
): Promise<ProcessVariable[]> {
  // Try runtime first; on 404 (process ended) fall back to history
  try {
    const data = await flowableFetch<ProcessVariable[] | { data: ProcessVariable[] }>(
      `/runtime/process-instances/${processInstanceId}/variables`
    );
    if (Array.isArray(data)) return data;
    return (data as any).data || [];
  } catch (err) {
    if (err instanceof Error && err.message.includes('[404]')) {
      return getHistoricProcessVariables(processInstanceId);
    }
    throw err;
  }
}

// Helper — get a single variable value by name
export function getVariableValue(
  variables: ProcessVariable[],
  name: string
): string {
  const found = variables.find((v) => v.name === name);
  return found ? String(found.value) : '';
}

// ─────────────────────────────────────────────────────────────
// 4. GET TASKS BY ASSIGNEE
//    Called from: MyTasks.tsx
// ─────────────────────────────────────────────────────────────

// getTasksByAssignee queries Flowable for tasks assigned to a user.
// Old audits may have stored the display name ("Anita Sharma") as the assignee
// while new audits store the login id ("anita.sharma").
// We query both and deduplicate so auditors always see their tasks.
export async function getTasksByAssignee(
  assignee: string,
  displayName?: string
): Promise<FlowableTask[]> {
  const queries: string[] = [assignee];
  if (displayName && displayName.toLowerCase() !== assignee.toLowerCase()) {
    queries.push(displayName);
  }

  const results = await Promise.allSettled(
    queries.map((a) =>
      flowableFetch<{ data: FlowableTask[] }>(
        `/runtime/tasks?assignee=${encodeURIComponent(a)}&size=100`
      ).then((d) => d.data || [])
    )
  );

  const seen = new Set<string>();
  const tasks: FlowableTask[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      for (const t of r.value) {
        if (!seen.has(t.id)) {
          seen.add(t.id);
          tasks.push(t);
        }
      }
    }
  }
  return tasks;
}

export async function getHistoricProcessInstances(): Promise<ProcessInstance[]> {
  const data = await flowableFetch<{ data: ProcessInstance[] }>(
    '/history/historic-process-instances?processDefinitionKey=auditManagementWorkflow&size=100&finished=true'
  );
  return data.data || [];
}

// ─────────────────────────────────────────────────────────────
// 5. GET ALL TASKS (for a process instance)
//    Called from: AuditChecklist.tsx to get step statuses
// ─────────────────────────────────────────────────────────────

export async function getTasksByProcessInstance(
  processInstanceId: string
): Promise<FlowableTask[]> {
  try {
    const data = await flowableFetch<{ data: FlowableTask[] }>(
      `/runtime/tasks?processInstanceId=${processInstanceId}&size=100`
    );
    return data.data || [];
  } catch {
    // Process may have ended — active tasks no longer exist
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// 6. GET SINGLE TASK BY ID
//    Called from: TaskDetails.tsx
// ─────────────────────────────────────────────────────────────

export async function getTaskById(
  taskId: string
): Promise<FlowableTask> {
  return flowableFetch<FlowableTask>(`/runtime/tasks/${taskId}`);
}

// ─────────────────────────────────────────────────────────────
// 7. COMPLETE A TASK
//    Called from: CompleteStep.tsx, TaskDetails.tsx, MyTasks.tsx
// ─────────────────────────────────────────────────────────────

export async function completeTask(
  taskId:    string,
  payload?:  CompleteTaskPayload
): Promise<void> {
  const variables: FlowableVariable[] = payload
    ? Object.entries(payload)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([key, value]) => ({
          name:  key,
          value: value as string,
          type:  'string' as const,
        }))
    : [];

  await flowableFetch<void>(
    `/runtime/tasks/${taskId}`,
    {
      method: 'POST',
      body: JSON.stringify({
        action:    'complete',
        variables: variables.length > 0 ? variables : undefined,
      }),
    }
  );
}

// ─────────────────────────────────────────────────────────────
// 8. GET DASHBOARD STATS
//    Called from: Dashboard.tsx
// ─────────────────────────────────────────────────────────────

export async function getAuditStats(): Promise<AuditStats> {
  const instances = await getAllProcessInstances();

  const total      = instances.length;
  const completed  = instances.filter((i) => i.ended).length;
  const inProgress = instances.filter((i) => !i.ended && !i.suspended).length;

  // Count overdue by checking dueDate variable on active instances
  // (avoids the /runtime/tasks?dueBefore= query which Flowable rejects with 400)
  const now = new Date();
  let overdue = 0;
  for (const inst of instances) {
    if (inst.ended || inst.suspended) continue;
    const vars = Array.isArray(inst.variables) ? inst.variables as any[] : [];
    const dueDateVar = vars.find((v: any) => v.name === 'dueDate');
    if (dueDateVar?.value) {
      const due = new Date(String(dueDateVar.value));
      if (!isNaN(due.getTime()) && due < now) overdue++;
    }
  }

  return { total, inProgress, completed, overdue };
}

// ─────────────────────────────────────────────────────────────
// 9. GET PROCESS DEFINITION (for WorkflowView BPMN diagram)
//    Called from: WorkflowView.tsx
// ─────────────────────────────────────────────────────────────

export async function getProcessDefinition() {
  const data = await flowableFetch<{ data: unknown[] }>(
    '/repository/process-definitions?key=auditManagementWorkflow&size=1'
  );
  return data.data?.[0] || null;
}

// ─────────────────────────────────────────────────────────────
// 10. DELETE / CANCEL A PROCESS INSTANCE
//     Called from: AuditsList.tsx if user cancels an audit
// ─────────────────────────────────────────────────────────────

export async function cancelProcessInstance(
  processInstanceId: string
): Promise<void> {
  await flowableFetch<void>(
    `/runtime/process-instances/${processInstanceId}`,
    { method: 'DELETE' }
  );
}

// ─────────────────────────────────────────────────────────────
// PROJECT INTERFACES
// ─────────────────────────────────────────────────────────────

export interface ProjectInstance {
  id:          string;   // processInstanceId
  name:        string;
  location:    string;
  managerName: string;
  description: string;
  status:      string;
  startTime:   string;
  ended:       boolean;
}

export interface CreateProjectPayload {
  projectName:  string;
  location:     string;
  managerName:  string;
  description:  string;
  status:       string;
}

// ─────────────────────────────────────────────────────────────
// START PROJECT PROCESS
// ─────────────────────────────────────────────────────────────

export async function createProjectProcess(
  payload: CreateProjectPayload
): Promise<ProcessInstance> {
  const variables: FlowableVariable[] = [
    { name: "projectName",  value: payload.projectName,  type: "string" },
    { name: "location",     value: payload.location,     type: "string" },
    { name: "managerName",  value: payload.managerName,  type: "string" },
    { name: "description",  value: payload.description,  type: "string" },
    { name: "status",       value: payload.status,       type: "string" },
  ];

  return flowableFetch<ProcessInstance>("/runtime/process-instances", {
    method: "POST",
    body: JSON.stringify({
      processDefinitionKey: "projectManagementWorkflow",
      variables,
    }),
  });
}

// ─────────────────────────────────────────────────────────────
// GET ALL PROJECTS
// ─────────────────────────────────────────────────────────────

export async function getAllProjects(): Promise<ProjectInstance[]> {
  const data = await flowableFetch<{ data: ProcessInstance[] }>(
    "/runtime/process-instances?processDefinitionKey=projectManagementWorkflow&size=100"
  );

  const instances = data.data || [];

  const projects = await Promise.all(
    instances.map(async (inst) => {
      const vars = await getProcessVariables(inst.id);
      return {
        id:          inst.id,
        name:        getVariableValue(vars, "projectName"),
        location:    getVariableValue(vars, "location"),
        managerName: getVariableValue(vars, "managerName"),
        description: getVariableValue(vars, "description"),
        status:      getVariableValue(vars, "status") || "Active",
        startTime:   inst.startTime,
        ended:       inst.ended,
      } as ProjectInstance;
    })
  );

  return projects;
}

// ─────────────────────────────────────────────────────────────
// UPDATE PROJECT (update variables on the process instance)
// ─────────────────────────────────────────────────────────────

export async function updateProjectVariable(
  processInstanceId: string,
  name: string,
  value: string
): Promise<void> {
  await flowableFetch<void>(
    `/runtime/process-instances/${processInstanceId}/variables/${name}`,
    {
      method: "PUT",
      body: JSON.stringify({ name, value, type: "string" }),
    }
  );
}

// ─────────────────────────────────────────────────────────────
// DELETE PROJECT (cancel the process instance)
// ─────────────────────────────────────────────────────────────

export async function deleteProject(processInstanceId: string): Promise<void> {
  await flowableFetch<void>(
    `/runtime/process-instances/${processInstanceId}`,
    { method: "DELETE" }
  );
}

// ─────────────────────────────────────────────────────────────
// USER MANAGEMENT
// ─────────────────────────────────────────────────────────────

export interface FlowableUser {
  id:        string;
  firstName: string;
  lastName:  string;
  email:     string;
}

export interface CreateUserPayload {
  id:         string;
  firstName:  string;
  lastName:   string;
  email:      string;
  password:   string;
  role:       string;
  department: string;
}

// GET /identity/users
export async function getAllUsers(): Promise<FlowableUser[]> {
  const data = await flowableFetch<{ data: FlowableUser[] }>(
    '/identity/users?size=100'
  );
  return data.data || [];
}

// GET /identity/users/{id}
export async function getUserById(userId: string): Promise<FlowableUser> {
  return flowableFetch<FlowableUser>(`/identity/users/${userId}`);
}

// POST /identity/users
export async function createUser(
  payload: CreateUserPayload
): Promise<FlowableUser> {
  return flowableFetch<FlowableUser>('/identity/users', {
    method: 'POST',
    body: JSON.stringify({
      id:        payload.id,
      firstName: payload.firstName,
      lastName:  payload.lastName,
      email:     payload.email,
      password:  payload.password,
    }),
  });
}

// PUT /identity/users/{id}  — update profile fields
export async function updateUser(
  userId: string,
  payload: { firstName: string; lastName: string; email: string }
): Promise<FlowableUser> {
  return flowableFetch<FlowableUser>(`/identity/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify({
      id:        userId,
      firstName: payload.firstName,
      lastName:  payload.lastName,
      email:     payload.email,
    }),
  });
}

// PUT /identity/users/{id}  — change password
// Flowable uses the same PUT /identity/users/{id} endpoint with a password field
export async function changeUserPassword(
  userId: string,
  newPassword: string
): Promise<void> {
  await flowableFetch<void>(`/identity/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify({
      id:       userId,
      password: newPassword,
    }),
  });
}

// DELETE /identity/users/{id}
export async function deleteUser(userId: string): Promise<void> {
  await flowableFetch<void>(`/identity/users/${userId}`, {
    method: 'DELETE',
  });
}

// ─────────────────────────────────────────────────────────────
// CHECKLIST TEMPLATE MANAGEMENT
// ─────────────────────────────────────────────────────────────

export interface ChecklistTemplate {
  id:           string;
  templateName: string;
  category:     string;
  steps:        string;
  author:       string;
  createdDate:  string;
}

export interface ChecklistTemplatePayload {
  templateName: string;
  category:     string;
  steps:        string;
  author:       string;
  createdDate:  string;
}

export async function getAllTemplates(): Promise<ChecklistTemplate[]> {
  const data = await flowableFetch<{ data: ProcessInstance[] }>(
    '/runtime/process-instances?processDefinitionKey=checklistTemplateWorkflow&size=100'
  );
  const instances = data.data || [];

  const templates = await Promise.all(
    instances.map(async (inst) => {
      const vars = await getProcessVariables(inst.id);
      return {
        id:           inst.id,
        templateName: getVariableValue(vars, 'templateName'),
        category:     getVariableValue(vars, 'category'),
        steps:        getVariableValue(vars, 'steps') || '[]',
        author:       getVariableValue(vars, 'author'),
        createdDate:  getVariableValue(vars, 'createdDate'),
      } as ChecklistTemplate;
    })
  );
  return templates;
}

export async function createChecklistTemplate(
  payload: ChecklistTemplatePayload
): Promise<ProcessInstance> {
  const variables: FlowableVariable[] = [
    { name: 'templateName', value: payload.templateName, type: 'string' },
    { name: 'category',     value: payload.category,     type: 'string' },
    { name: 'steps',        value: payload.steps,        type: 'string' },
    { name: 'author',       value: payload.author,       type: 'string' },
    { name: 'createdDate',  value: payload.createdDate,  type: 'string' },
  ];

  return flowableFetch<ProcessInstance>('/runtime/process-instances', {
    method: 'POST',
    body: JSON.stringify({
      processDefinitionKey: 'checklistTemplateWorkflow',
      variables,
    }),
  });
}

export async function updateChecklistTemplate(
  processInstanceId: string,
  payload: ChecklistTemplatePayload
): Promise<void> {
  const fields = ['templateName', 'category', 'steps', 'author', 'createdDate'] as const;
  await Promise.all(
    fields.map(field =>
      flowableFetch<void>(
        `/runtime/process-instances/${processInstanceId}/variables/${field}`,
        {
          method: 'PUT',
          body: JSON.stringify({ name: field, value: payload[field], type: 'string' }),
        }
      )
    )
  );
}

export async function deleteChecklistTemplate(
  processInstanceId: string
): Promise<void> {
  await flowableFetch<void>(
    `/runtime/process-instances/${processInstanceId}`,
    { method: 'DELETE' }
  );
}

// ─────────────────────────────────────────────────────────────
// ORGANIZATION SETTINGS
// Stored as variables on a single long-running process instance
// processDefinitionKey: orgSettingsWorkflow
//
// Fields: companyName, industry, address, gstin, cin,
//         fiscalYear, timezone
//
// On first use: createOrgSettings() starts the process
// On subsequent uses: updateOrgSetting() updates individual vars
// ─────────────────────────────────────────────────────────────

export interface OrgSettings {
  processInstanceId: string;
  companyName:  string;
  industry:     string;
  address:      string;
  gstin:        string;
  cin:          string;
  fiscalYear:   string;
  timezone:     string;
}

export interface OrgSettingsPayload {
  companyName:  string;
  industry:     string;
  address:      string;
  gstin:        string;
  cin:          string;
  fiscalYear:   string;
  timezone:     string;
}

// GET the single org settings process instance (returns null if not created yet)
export async function getOrgSettings(): Promise<OrgSettings | null> {
  const data = await flowableFetch<{ data: ProcessInstance[] }>(
    '/runtime/process-instances?processDefinitionKey=orgSettingsWorkflow&size=1'
  );
  const instances = data.data || [];
  if (instances.length === 0) return null;

  const inst = instances[0];
  const vars = await getProcessVariables(inst.id);
  return {
    processInstanceId: inst.id,
    companyName:  getVariableValue(vars, 'companyName'),
    industry:     getVariableValue(vars, 'industry'),
    address:      getVariableValue(vars, 'address'),
    gstin:        getVariableValue(vars, 'gstin'),
    cin:          getVariableValue(vars, 'cin'),
    fiscalYear:   getVariableValue(vars, 'fiscalYear'),
    timezone:     getVariableValue(vars, 'timezone'),
  };
}

// CREATE org settings process for the very first time
export async function createOrgSettings(
  payload: OrgSettingsPayload
): Promise<ProcessInstance> {
  const variables: FlowableVariable[] = [
    { name: 'companyName', value: payload.companyName, type: 'string' },
    { name: 'industry',    value: payload.industry,    type: 'string' },
    { name: 'address',     value: payload.address,     type: 'string' },
    { name: 'gstin',       value: payload.gstin,       type: 'string' },
    { name: 'cin',         value: payload.cin,         type: 'string' },
    { name: 'fiscalYear',  value: payload.fiscalYear,  type: 'string' },
    { name: 'timezone',    value: payload.timezone,    type: 'string' },
  ];
  return flowableFetch<ProcessInstance>('/runtime/process-instances', {
    method: 'POST',
    body: JSON.stringify({
      processDefinitionKey: 'orgSettingsWorkflow',
      variables,
    }),
  });
}

// UPDATE org settings (update all variables on existing instance)
// export async function updateOrgSettings(
//   processInstanceId: string,
//   payload: OrgSettingsPayload
// ): Promise<void> {
//   const fields = ['companyName', 'industry', 'address', 'gstin', 'cin', 'fiscalYear', 'timezone'] as const;
//   await Promise.all(
//     fields.map(field =>
//       flowableFetch<void>(
//         `/runtime/process-instances/${processInstanceId}/variables/${field}`,
//         {
//           method: 'PUT',
//           body: JSON.stringify({ name: field, value: payload[field], type: 'string' }),
//         }
//       )
//     )
//   );
// }
export async function updateOrgSettings(
  processInstanceId: string,
  payload: OrgSettingsPayload
): Promise<void> {
  const fields = ['companyName', 'industry', 'address', 'gstin', 'cin', 'fiscalYear', 'timezone'] as const;
  
  for (const field of fields) {
    await flowableFetch<void>(
      `/runtime/process-instances/${processInstanceId}/variables/${field}`,
      {
        method: 'PUT',
        body: JSON.stringify({ name: field, value: payload[field], type: 'string' }),
      }
    );
  }
}

// ─────────────────────────────────────────────────────────────
// SAVE A SINGLE PROCESS VARIABLE (without completing the task)
// Called from CompleteStep.tsx to track step-by-step progress
// ─────────────────────────────────────────────────────────────
// export async function saveProcessVariable(
//   processInstanceId: string,
//   name: string,
//   value: string
// ): Promise<void> {
//   await flowableFetch<void>(
//     `/runtime/process-instances/${processInstanceId}/variables/${name}`,
//     {
//       method: 'PUT',
//       body: JSON.stringify({ name, value, type: 'string' }),
//     }
//   );
// }
export async function saveProcessVariable(
  processInstanceId: string,
  name: string,
  value: string
): Promise<void> {
  const variableBody = { name, value, type: 'string' };

  try {
    // Try PUT first — updates an existing variable
    await flowableFetch<void>(
      `/runtime/process-instances/${processInstanceId}/variables/${name}`,
      {
        method: 'PUT',
        body: JSON.stringify(variableBody),
      }
    );
  } catch (err) {
    // Variable doesn't exist yet → create it via POST (expects an array)
    if (err instanceof Error && err.message.includes('[404]')) {
      await flowableFetch<void>(
        `/runtime/process-instances/${processInstanceId}/variables`,
        {
          method: 'POST',
          body: JSON.stringify([variableBody]),  // ← wrap in array
        }
      );
    } else {
      throw err;
    }
  }
}

// ─────────────────────────────────────────────────────────────
// USER PREFERENCES (Notifications + Regional + Appearance)
// Stored as variables on a per-user process instance
// processDefinitionKey: userPreferencesWorkflow
//
// Fields: userId, emailNotif, pushNotif, reminderNotif,
//         language, currency, dateFormat, theme
//
// One process instance per user (keyed by userId variable)
// ─────────────────────────────────────────────────────────────

export interface UserPreferences {
  processInstanceId: string;
  userId:        string;
  emailNotif:    boolean;
  pushNotif:     boolean;
  reminderNotif: boolean;
  language:      string;
  currency:      string;
  dateFormat:    string;
  theme:         string;
}

export interface UserPreferencesPayload {
  userId:        string;
  emailNotif:    boolean;
  pushNotif:     boolean;
  reminderNotif: boolean;
  language:      string;
  currency:      string;
  dateFormat:    string;
  theme:         string;
}

// GET preferences for a specific user
// Searches all userPreferencesWorkflow instances and finds the one with matching userId variable
export async function getUserPreferences(userId: string): Promise<UserPreferences | null> {
  const data = await flowableFetch<{ data: ProcessInstance[] }>(
    '/runtime/process-instances?processDefinitionKey=userPreferencesWorkflow&size=100'
  );
  const instances = data.data || [];

  // Find the instance belonging to this user
  for (const inst of instances) {
    const vars = await getProcessVariables(inst.id);
    const storedUserId = getVariableValue(vars, 'userId');
    if (storedUserId === userId) {
      return {
        processInstanceId: inst.id,
        userId,
        emailNotif:    getVariableValue(vars, 'emailNotif') === 'true',
        pushNotif:     getVariableValue(vars, 'pushNotif') === 'true',
        reminderNotif: getVariableValue(vars, 'reminderNotif') === 'true',
        language:      getVariableValue(vars, 'language') || 'English (India)',
        currency:      getVariableValue(vars, 'currency') || 'INR (₹)',
        dateFormat:    getVariableValue(vars, 'dateFormat') || 'DD-MMM-YYYY',
        theme:         getVariableValue(vars, 'theme') || 'light',
      };
    }
  }
  return null;
}

// CREATE a preferences instance for a new user
export async function createUserPreferences(
  payload: UserPreferencesPayload
): Promise<ProcessInstance> {
  const variables: FlowableVariable[] = [
    { name: 'userId',        value: payload.userId,                    type: 'string' },
    { name: 'emailNotif',    value: String(payload.emailNotif),        type: 'string' },
    { name: 'pushNotif',     value: String(payload.pushNotif),         type: 'string' },
    { name: 'reminderNotif', value: String(payload.reminderNotif),     type: 'string' },
    { name: 'language',      value: payload.language,                  type: 'string' },
    { name: 'currency',      value: payload.currency,                  type: 'string' },
    { name: 'dateFormat',    value: payload.dateFormat,                type: 'string' },
    { name: 'theme',         value: payload.theme,                     type: 'string' },
  ];
  return flowableFetch<ProcessInstance>('/runtime/process-instances', {
    method: 'POST',
    body: JSON.stringify({
      processDefinitionKey: 'userPreferencesWorkflow',
      variables,
    }),
  });
}

// UPDATE all preference variables on an existing instance
// export async function updateUserPreferences(
//   processInstanceId: string,
//   payload: UserPreferencesPayload
// ): Promise<void> {
//   const entries: Array<[string, string]> = [
//     ['userId',        payload.userId],
//     ['emailNotif',    String(payload.emailNotif)],
//     ['pushNotif',     String(payload.pushNotif)],
//     ['reminderNotif', String(payload.reminderNotif)],
//     ['language',      payload.language],
//     ['currency',      payload.currency],
//     ['dateFormat',    payload.dateFormat],
//     ['theme',         payload.theme],
//   ];
//   await Promise.all(
//     entries.map(([name, value]) =>
//       flowableFetch<void>(
//         `/runtime/process-instances/${processInstanceId}/variables/${name}`,
//         {
//           method: 'PUT',
//           body: JSON.stringify({ name, value, type: 'string' }),
//         }
//       )
//     )
//   );
// }
// AFTER — runs PUTs one at a time
export async function updateUserPreferences(
  processInstanceId: string,
  payload: UserPreferencesPayload
): Promise<void> {
  const entries: Array<[string, string]> = [
    ['userId',        payload.userId],
    ['emailNotif',    String(payload.emailNotif)],
    ['pushNotif',     String(payload.pushNotif)],
    ['reminderNotif', String(payload.reminderNotif)],
    ['language',      payload.language],
    ['currency',      payload.currency],
    ['dateFormat',    payload.dateFormat],
    ['theme',         payload.theme],
  ];
  for (const [name, value] of entries) {   // ✅ sequential
    await flowableFetch<void>(
      `/runtime/process-instances/${processInstanceId}/variables/${name}`,
      {
        method: 'PUT',
        body: JSON.stringify({ name, value, type: 'string' }),
      }
    );
  }
}
// ─────────────────────────────────────────────────────────────
// SAVE PREFERENCES — convenience wrapper used by Settings.tsx
// Creates if not exists, updates if exists
// ─────────────────────────────────────────────────────────────
export async function saveUserPreferences(
  payload: UserPreferencesPayload
): Promise<void> {
  const existing = await getUserPreferences(payload.userId);
  if (existing) {
    await updateUserPreferences(existing.processInstanceId, payload);
  } else {
    await createUserPreferences(payload);
  }
}

// ─────────────────────────────────────────────────────────────
// SAVE ORG SETTINGS — convenience wrapper used by Settings.tsx
// Creates if not exists, updates if exists
// ─────────────────────────────────────────────────────────────
export async function saveOrgSettings(payload: OrgSettingsPayload): Promise<void> {
  const existing = await getOrgSettings();
  if (existing) {
    await updateOrgSettings(existing.processInstanceId, payload);
  } else {
    await createOrgSettings(payload);
  }
}
// // ============================================================
// //  flowableApi.ts
// //  Central service for all Flowable REST API calls
// //  Used by: CreateAudit, AuditChecklist, CompleteStep,
// //           MyTasks, TaskDetails, Dashboard, WorkflowView,
// //           Settings
// // ============================================================

// // const FLOWABLE_BASE = 'http://localhost:8080/flowable-ui/process-api';
// const FLOWABLE_BASE = 'http://localhost:3000/flowable-api';
// const CREDENTIALS   = btoa('admin:test'); // base64 of "admin:test"

// const HEADERS = {
//   'Content-Type':  'application/json',
//   'Authorization': `Basic ${CREDENTIALS}`,
// };

// // ─────────────────────────────────────────────────────────────
// // TYPESCRIPT INTERFACES
// // ─────────────────────────────────────────────────────────────

// export interface FlowableVariable {
//   name:  string;
//   value: string | number | boolean;
//   type:  'string' | 'integer' | 'boolean';
// }

// // Process Instance (one running audit workflow)
// export interface ProcessInstance {
//   id:                    string;
//   name:                  string | null;
//   processDefinitionId:   string;
//   processDefinitionName: string;
//   startTime:             string;
//   startUserId:           string;
//   ended:                 boolean;
//   suspended:             boolean;
//   variables:             FlowableVariable[];
//   /** true when this row came from the historic endpoint (already completed) */
//   _historic?:            boolean;
// }

// // Task (one step assigned to a user)
// export interface FlowableTask {
//   id:                string;
//   name:              string;
//   assignee:          string;
//   created:           string;
//   dueDate:           string | null;
//   priority:          number;
//   suspended:         boolean;
//   formKey:           string | null;
//   processInstanceId: string;
//   processDefinitionId: string;
//   taskDefinitionKey: string;
//   description:       string | null;
// }

// // Process variable item returned by /variables endpoint
// export interface ProcessVariable {
//   name:  string;
//   type:  string;
//   value: string | number | boolean;
//   scope: string;
// }

// // Start process request payload
// export interface StartProcessPayload {
//   auditName:    string;
//   auditId:      string;
//   projectName:  string;
//   auditorName:  string;
//   dueDate:      string;
//   description:  string;
//   checklistSteps: string; // JSON stringified array of step names
// }

// // Complete task request payload
// export interface CompleteTaskPayload {
//   stepName?:        string;
//   comments?:        string;
//   evidenceFile?:    string;
//   completedBy?:     string;
//   assignedTo?:      string;
//   priority?:        string;
//   taskTitle?:       string;
//   approvalDecision?: 'Approved' | 'Rejected';
//   managerComments?: string;
// }

// // Dashboard stats derived from Flowable data
// export interface AuditStats {
//   total:      number;
//   inProgress: number;
//   completed:  number;
//   overdue:    number;
// }

// // ─────────────────────────────────────────────────────────────
// // HELPER — generic fetch wrapper with error handling
// // ─────────────────────────────────────────────────────────────

// async function flowableFetch<T>(
//   endpoint: string,
//   options: RequestInit = {}
// ): Promise<T> {
//   const url = `${FLOWABLE_BASE}${endpoint}`;

//   const response = await fetch(url, {
//     ...options,
//     headers: {
//       ...HEADERS,
//       ...(options.headers || {}),
//     },
//   });

//   if (!response.ok) {
//     const errorText = await response.text();
//     throw new Error(
//       `Flowable API error [${response.status}]: ${errorText}`
//     );
//   }

//   // 204 No Content (e.g. complete task returns no body)
//   if (response.status === 204) {
//     return {} as T;
//   }

//   return response.json() as Promise<T>;
// }

// // ─────────────────────────────────────────────────────────────
// // 1. START PROCESS
// //    Called from: CreateAudit.tsx on "Start Audit" click
// // ─────────────────────────────────────────────────────────────

// export async function startAuditProcess(
//   payload: StartProcessPayload
// ): Promise<ProcessInstance> {
//   const variables: FlowableVariable[] = [
//     { name: 'auditName',       value: payload.auditName,       type: 'string' },
//     { name: 'auditId',         value: payload.auditId,         type: 'string' },
//     { name: 'projectName',     value: payload.projectName,     type: 'string' },
//     { name: 'auditorName',     value: payload.auditorName,     type: 'string' },
//     { name: 'dueDate',         value: payload.dueDate,         type: 'string' },
//     { name: 'description',     value: payload.description,     type: 'string' },
//     { name: 'checklistSteps',  value: payload.checklistSteps,  type: 'string' },
//   ];

//   return flowableFetch<ProcessInstance>('/runtime/process-instances', {
//     method: 'POST',
//     body: JSON.stringify({
//       processDefinitionKey: 'auditManagementWorkflow',
//       variables,
//     }),
//   });
// }

// // ─────────────────────────────────────────────────────────────
// // 2. GET ALL PROCESS INSTANCES
// //    Called from: AuditsList.tsx, Dashboard.tsx
// // ─────────────────────────────────────────────────────────────

// // Shape returned by historic-process-instances when includeProcessVariables=true
// interface HistoricProcessInstance {
//   id:                    string;
//   name:                  string | null;
//   processDefinitionId:   string;
//   processDefinitionName: string;
//   startTime:             string;
//   startUserId:           string;
//   endTime:               string | null;
//   // Variables are inlined as an array when includeProcessVariables=true
//   variables?: Array<{ variableName: string; value: string | number | boolean; variableTypeName: string }>;
// }

// export async function getAllProcessInstances(): Promise<ProcessInstance[]> {
//   // Query active (runtime) and completed (historic) instances in parallel.
//   // For historic instances, include variables inline so AuditsList doesn't need
//   // a separate per-instance fetch — eliminates the per-row 404s entirely.
//   const [runtimeRes, historicRes] = await Promise.allSettled([
//     flowableFetch<{ data: ProcessInstance[] }>(
//       '/runtime/process-instances?processDefinitionKey=auditManagementWorkflow&size=100'
//     ),
//     flowableFetch<{ data: HistoricProcessInstance[] }>(
//       '/history/historic-process-instances?processDefinitionKey=auditManagementWorkflow&size=100&finished=true&includeProcessVariables=true'
//     ),
//   ]);

//   const runtimeInstances: ProcessInstance[] =
//     runtimeRes.status === 'fulfilled' ? (runtimeRes.value.data || []) : [];

//   const runtimeIds = new Set(runtimeInstances.map((i) => i.id));

//   const historicInstances: ProcessInstance[] =
//     historicRes.status === 'fulfilled'
//       ? (historicRes.value.data || [])
//           .filter((i) => !runtimeIds.has(i.id))
//           .map((i) => {
//             // Map inline variables from variableName → name so getVariableValue works
//             const mappedVars: FlowableVariable[] = (i.variables || []).map((v: any) => ({
//               name:  v.variableName ?? v.name ?? '',
//               value: v.value,
//               type:  (v.variableTypeName ?? v.type ?? 'string') as 'string' | 'integer' | 'boolean',
//             }));
//             return {
//               ...i,
//               ended:     true,
//               suspended: false,
//               _historic: true,
//               variables: mappedVars,
//             } as ProcessInstance;
//           })
//       : [];

//   return [...runtimeInstances, ...historicInstances];
// }

// // ─────────────────────────────────────────────────────────────
// // 3. GET PROCESS VARIABLES
// //    For completed processes use the history endpoint directly —
// //    never hit the runtime endpoint which 404s for ended processes.
// // ─────────────────────────────────────────────────────────────

// /** Variables for a COMPLETED process — uses history endpoint.
//  *  Returns [] on 404 (safe fallback) so callers never crash. */
// export async function getHistoricProcessVariables(
//   processInstanceId: string
// ): Promise<ProcessVariable[]> {
//   try {
//     const data = await flowableFetch<{
//       data: Array<{ variableName: string; value: string | number | boolean; variableTypeName: string }>;
//     }>(`/history/historic-variable-instances?processInstanceId=${processInstanceId}&size=100`);

//     return (data.data || []).map((v) => ({
//       name:  v.variableName,
//       type:  v.variableTypeName || 'string',
//       value: v.value,
//       scope: 'global',
//     }));
//   } catch (err) {
//     console.warn(`getHistoricProcessVariables(${processInstanceId}) failed:`, err);
//     return [];
//   }
// }

// export async function getProcessVariables(
//   processInstanceId: string
// ): Promise<ProcessVariable[]> {
//   // Try runtime first; on 404 (process ended) fall back to history
//   try {
//     const data = await flowableFetch<ProcessVariable[] | { data: ProcessVariable[] }>(
//       `/runtime/process-instances/${processInstanceId}/variables`
//     );
//     if (Array.isArray(data)) return data;
//     return (data as any).data || [];
//   } catch (err) {
//     if (err instanceof Error && err.message.includes('[404]')) {
//       return getHistoricProcessVariables(processInstanceId);
//     }
//     throw err;
//   }
// }

// // Helper — get a single variable value by name
// export function getVariableValue(
//   variables: ProcessVariable[],
//   name: string
// ): string {
//   const found = variables.find((v) => v.name === name);
//   return found ? String(found.value) : '';
// }

// // ─────────────────────────────────────────────────────────────
// // 4. GET TASKS BY ASSIGNEE
// //    Called from: MyTasks.tsx
// // ─────────────────────────────────────────────────────────────

// export async function getTasksByAssignee(
//   assignee: string
// ): Promise<FlowableTask[]> {
//   const data = await flowableFetch<{ data: FlowableTask[] }>(
//     `/runtime/tasks?assignee=${encodeURIComponent(assignee)}&size=100`
//   );
//   return data.data || [];
// }

// export async function getHistoricProcessInstances(): Promise<ProcessInstance[]> {
//   const data = await flowableFetch<{ data: ProcessInstance[] }>(
//     '/history/historic-process-instances?processDefinitionKey=auditManagementWorkflow&size=100&finished=true'
//   );
//   return data.data || [];
// }

// // ─────────────────────────────────────────────────────────────
// // 5. GET ALL TASKS (for a process instance)
// //    Called from: AuditChecklist.tsx to get step statuses
// // ─────────────────────────────────────────────────────────────

// export async function getTasksByProcessInstance(
//   processInstanceId: string
// ): Promise<FlowableTask[]> {
//   try {
//     const data = await flowableFetch<{ data: FlowableTask[] }>(
//       `/runtime/tasks?processInstanceId=${processInstanceId}&size=100`
//     );
//     return data.data || [];
//   } catch {
//     // Process may have ended — active tasks no longer exist
//     return [];
//   }
// }

// // ─────────────────────────────────────────────────────────────
// // 6. GET SINGLE TASK BY ID
// //    Called from: TaskDetails.tsx
// // ─────────────────────────────────────────────────────────────

// export async function getTaskById(
//   taskId: string
// ): Promise<FlowableTask> {
//   return flowableFetch<FlowableTask>(`/runtime/tasks/${taskId}`);
// }

// // ─────────────────────────────────────────────────────────────
// // 7. COMPLETE A TASK
// //    Called from: CompleteStep.tsx, TaskDetails.tsx, MyTasks.tsx
// // ─────────────────────────────────────────────────────────────

// export async function completeTask(
//   taskId:    string,
//   payload?:  CompleteTaskPayload
// ): Promise<void> {
//   const variables: FlowableVariable[] = payload
//     ? Object.entries(payload)
//         .filter(([, v]) => v !== undefined && v !== '')
//         .map(([key, value]) => ({
//           name:  key,
//           value: value as string,
//           type:  'string' as const,
//         }))
//     : [];

//   await flowableFetch<void>(
//     `/runtime/tasks/${taskId}`,
//     {
//       method: 'POST',
//       body: JSON.stringify({
//         action:    'complete',
//         variables: variables.length > 0 ? variables : undefined,
//       }),
//     }
//   );
// }

// // ─────────────────────────────────────────────────────────────
// // 8. GET DASHBOARD STATS
// //    Called from: Dashboard.tsx
// // ─────────────────────────────────────────────────────────────

// export async function getAuditStats(): Promise<AuditStats> {
//   const instances = await getAllProcessInstances();

//   const total      = instances.length;
//   const completed  = instances.filter((i) => i.ended).length;
//   const inProgress = instances.filter((i) => !i.ended && !i.suspended).length;

//   // Count overdue by checking dueDate variable on active instances
//   // (avoids the /runtime/tasks?dueBefore= query which Flowable rejects with 400)
//   const now = new Date();
//   let overdue = 0;
//   for (const inst of instances) {
//     if (inst.ended || inst.suspended) continue;
//     const vars = Array.isArray(inst.variables) ? inst.variables as any[] : [];
//     const dueDateVar = vars.find((v: any) => v.name === 'dueDate');
//     if (dueDateVar?.value) {
//       const due = new Date(String(dueDateVar.value));
//       if (!isNaN(due.getTime()) && due < now) overdue++;
//     }
//   }

//   return { total, inProgress, completed, overdue };
// }

// // ─────────────────────────────────────────────────────────────
// // 9. GET PROCESS DEFINITION (for WorkflowView BPMN diagram)
// //    Called from: WorkflowView.tsx
// // ─────────────────────────────────────────────────────────────

// export async function getProcessDefinition() {
//   const data = await flowableFetch<{ data: unknown[] }>(
//     '/repository/process-definitions?key=auditManagementWorkflow&size=1'
//   );
//   return data.data?.[0] || null;
// }

// // ─────────────────────────────────────────────────────────────
// // 10. DELETE / CANCEL A PROCESS INSTANCE
// //     Called from: AuditsList.tsx if user cancels an audit
// // ─────────────────────────────────────────────────────────────

// export async function cancelProcessInstance(
//   processInstanceId: string
// ): Promise<void> {
//   await flowableFetch<void>(
//     `/runtime/process-instances/${processInstanceId}`,
//     { method: 'DELETE' }
//   );
// }

// // ─────────────────────────────────────────────────────────────
// // PROJECT INTERFACES
// // ─────────────────────────────────────────────────────────────

// export interface ProjectInstance {
//   id:          string;   // processInstanceId
//   name:        string;
//   location:    string;
//   managerName: string;
//   description: string;
//   status:      string;
//   startTime:   string;
//   ended:       boolean;
// }

// export interface CreateProjectPayload {
//   projectName:  string;
//   location:     string;
//   managerName:  string;
//   description:  string;
//   status:       string;
// }

// // ─────────────────────────────────────────────────────────────
// // START PROJECT PROCESS
// // ─────────────────────────────────────────────────────────────

// export async function createProjectProcess(
//   payload: CreateProjectPayload
// ): Promise<ProcessInstance> {
//   const variables: FlowableVariable[] = [
//     { name: "projectName",  value: payload.projectName,  type: "string" },
//     { name: "location",     value: payload.location,     type: "string" },
//     { name: "managerName",  value: payload.managerName,  type: "string" },
//     { name: "description",  value: payload.description,  type: "string" },
//     { name: "status",       value: payload.status,       type: "string" },
//   ];

//   return flowableFetch<ProcessInstance>("/runtime/process-instances", {
//     method: "POST",
//     body: JSON.stringify({
//       processDefinitionKey: "projectManagementWorkflow",
//       variables,
//     }),
//   });
// }

// // ─────────────────────────────────────────────────────────────
// // GET ALL PROJECTS
// // ─────────────────────────────────────────────────────────────

// export async function getAllProjects(): Promise<ProjectInstance[]> {
//   const data = await flowableFetch<{ data: ProcessInstance[] }>(
//     "/runtime/process-instances?processDefinitionKey=projectManagementWorkflow&size=100"
//   );

//   const instances = data.data || [];

//   const projects = await Promise.all(
//     instances.map(async (inst) => {
//       const vars = await getProcessVariables(inst.id);
//       return {
//         id:          inst.id,
//         name:        getVariableValue(vars, "projectName"),
//         location:    getVariableValue(vars, "location"),
//         managerName: getVariableValue(vars, "managerName"),
//         description: getVariableValue(vars, "description"),
//         status:      getVariableValue(vars, "status") || "Active",
//         startTime:   inst.startTime,
//         ended:       inst.ended,
//       } as ProjectInstance;
//     })
//   );

//   return projects;
// }

// // ─────────────────────────────────────────────────────────────
// // UPDATE PROJECT (update variables on the process instance)
// // ─────────────────────────────────────────────────────────────

// export async function updateProjectVariable(
//   processInstanceId: string,
//   name: string,
//   value: string
// ): Promise<void> {
//   await flowableFetch<void>(
//     `/runtime/process-instances/${processInstanceId}/variables/${name}`,
//     {
//       method: "PUT",
//       body: JSON.stringify({ name, value, type: "string" }),
//     }
//   );
// }

// // ─────────────────────────────────────────────────────────────
// // DELETE PROJECT (cancel the process instance)
// // ─────────────────────────────────────────────────────────────

// export async function deleteProject(processInstanceId: string): Promise<void> {
//   await flowableFetch<void>(
//     `/runtime/process-instances/${processInstanceId}`,
//     { method: "DELETE" }
//   );
// }

// // ─────────────────────────────────────────────────────────────
// // USER MANAGEMENT
// // ─────────────────────────────────────────────────────────────

// export interface FlowableUser {
//   id:        string;
//   firstName: string;
//   lastName:  string;
//   email:     string;
// }

// export interface CreateUserPayload {
//   id:         string;
//   firstName:  string;
//   lastName:   string;
//   email:      string;
//   password:   string;
//   role:       string;
//   department: string;
// }

// // GET /identity/users
// export async function getAllUsers(): Promise<FlowableUser[]> {
//   const data = await flowableFetch<{ data: FlowableUser[] }>(
//     '/identity/users?size=100'
//   );
//   return data.data || [];
// }

// // GET /identity/users/{id}
// export async function getUserById(userId: string): Promise<FlowableUser> {
//   return flowableFetch<FlowableUser>(`/identity/users/${userId}`);
// }

// // POST /identity/users
// export async function createUser(
//   payload: CreateUserPayload
// ): Promise<FlowableUser> {
//   return flowableFetch<FlowableUser>('/identity/users', {
//     method: 'POST',
//     body: JSON.stringify({
//       id:        payload.id,
//       firstName: payload.firstName,
//       lastName:  payload.lastName,
//       email:     payload.email,
//       password:  payload.password,
//     }),
//   });
// }

// // PUT /identity/users/{id}  — update profile fields
// export async function updateUser(
//   userId: string,
//   payload: { firstName: string; lastName: string; email: string }
// ): Promise<FlowableUser> {
//   return flowableFetch<FlowableUser>(`/identity/users/${userId}`, {
//     method: 'PUT',
//     body: JSON.stringify({
//       id:        userId,
//       firstName: payload.firstName,
//       lastName:  payload.lastName,
//       email:     payload.email,
//     }),
//   });
// }

// // PUT /identity/users/{id}  — change password
// // Flowable uses the same PUT /identity/users/{id} endpoint with a password field
// export async function changeUserPassword(
//   userId: string,
//   newPassword: string
// ): Promise<void> {
//   await flowableFetch<void>(`/identity/users/${userId}`, {
//     method: 'PUT',
//     body: JSON.stringify({
//       id:       userId,
//       password: newPassword,
//     }),
//   });
// }

// // DELETE /identity/users/{id}
// export async function deleteUser(userId: string): Promise<void> {
//   await flowableFetch<void>(`/identity/users/${userId}`, {
//     method: 'DELETE',
//   });
// }

// // ─────────────────────────────────────────────────────────────
// // CHECKLIST TEMPLATE MANAGEMENT
// // ─────────────────────────────────────────────────────────────

// export interface ChecklistTemplate {
//   id:           string;
//   templateName: string;
//   category:     string;
//   steps:        string;
//   author:       string;
//   createdDate:  string;
// }

// export interface ChecklistTemplatePayload {
//   templateName: string;
//   category:     string;
//   steps:        string;
//   author:       string;
//   createdDate:  string;
// }

// export async function getAllTemplates(): Promise<ChecklistTemplate[]> {
//   const data = await flowableFetch<{ data: ProcessInstance[] }>(
//     '/runtime/process-instances?processDefinitionKey=checklistTemplateWorkflow&size=100'
//   );
//   const instances = data.data || [];

//   const templates = await Promise.all(
//     instances.map(async (inst) => {
//       const vars = await getProcessVariables(inst.id);
//       return {
//         id:           inst.id,
//         templateName: getVariableValue(vars, 'templateName'),
//         category:     getVariableValue(vars, 'category'),
//         steps:        getVariableValue(vars, 'steps') || '[]',
//         author:       getVariableValue(vars, 'author'),
//         createdDate:  getVariableValue(vars, 'createdDate'),
//       } as ChecklistTemplate;
//     })
//   );
//   return templates;
// }

// export async function createChecklistTemplate(
//   payload: ChecklistTemplatePayload
// ): Promise<ProcessInstance> {
//   const variables: FlowableVariable[] = [
//     { name: 'templateName', value: payload.templateName, type: 'string' },
//     { name: 'category',     value: payload.category,     type: 'string' },
//     { name: 'steps',        value: payload.steps,        type: 'string' },
//     { name: 'author',       value: payload.author,       type: 'string' },
//     { name: 'createdDate',  value: payload.createdDate,  type: 'string' },
//   ];

//   return flowableFetch<ProcessInstance>('/runtime/process-instances', {
//     method: 'POST',
//     body: JSON.stringify({
//       processDefinitionKey: 'checklistTemplateWorkflow',
//       variables,
//     }),
//   });
// }

// export async function updateChecklistTemplate(
//   processInstanceId: string,
//   payload: ChecklistTemplatePayload
// ): Promise<void> {
//   const fields = ['templateName', 'category', 'steps', 'author', 'createdDate'] as const;
//   await Promise.all(
//     fields.map(field =>
//       flowableFetch<void>(
//         `/runtime/process-instances/${processInstanceId}/variables/${field}`,
//         {
//           method: 'PUT',
//           body: JSON.stringify({ name: field, value: payload[field], type: 'string' }),
//         }
//       )
//     )
//   );
// }

// export async function deleteChecklistTemplate(
//   processInstanceId: string
// ): Promise<void> {
//   await flowableFetch<void>(
//     `/runtime/process-instances/${processInstanceId}`,
//     { method: 'DELETE' }
//   );
// }

// // ─────────────────────────────────────────────────────────────
// // ORGANIZATION SETTINGS
// // Stored as variables on a single long-running process instance
// // processDefinitionKey: orgSettingsWorkflow
// //
// // Fields: companyName, industry, address, gstin, cin,
// //         fiscalYear, timezone
// //
// // On first use: createOrgSettings() starts the process
// // On subsequent uses: updateOrgSetting() updates individual vars
// // ─────────────────────────────────────────────────────────────

// export interface OrgSettings {
//   processInstanceId: string;
//   companyName:  string;
//   industry:     string;
//   address:      string;
//   gstin:        string;
//   cin:          string;
//   fiscalYear:   string;
//   timezone:     string;
// }

// export interface OrgSettingsPayload {
//   companyName:  string;
//   industry:     string;
//   address:      string;
//   gstin:        string;
//   cin:          string;
//   fiscalYear:   string;
//   timezone:     string;
// }

// // GET the single org settings process instance (returns null if not created yet)
// export async function getOrgSettings(): Promise<OrgSettings | null> {
//   const data = await flowableFetch<{ data: ProcessInstance[] }>(
//     '/runtime/process-instances?processDefinitionKey=orgSettingsWorkflow&size=1'
//   );
//   const instances = data.data || [];
//   if (instances.length === 0) return null;

//   const inst = instances[0];
//   const vars = await getProcessVariables(inst.id);
//   return {
//     processInstanceId: inst.id,
//     companyName:  getVariableValue(vars, 'companyName'),
//     industry:     getVariableValue(vars, 'industry'),
//     address:      getVariableValue(vars, 'address'),
//     gstin:        getVariableValue(vars, 'gstin'),
//     cin:          getVariableValue(vars, 'cin'),
//     fiscalYear:   getVariableValue(vars, 'fiscalYear'),
//     timezone:     getVariableValue(vars, 'timezone'),
//   };
// }

// // CREATE org settings process for the very first time
// export async function createOrgSettings(
//   payload: OrgSettingsPayload
// ): Promise<ProcessInstance> {
//   const variables: FlowableVariable[] = [
//     { name: 'companyName', value: payload.companyName, type: 'string' },
//     { name: 'industry',    value: payload.industry,    type: 'string' },
//     { name: 'address',     value: payload.address,     type: 'string' },
//     { name: 'gstin',       value: payload.gstin,       type: 'string' },
//     { name: 'cin',         value: payload.cin,         type: 'string' },
//     { name: 'fiscalYear',  value: payload.fiscalYear,  type: 'string' },
//     { name: 'timezone',    value: payload.timezone,    type: 'string' },
//   ];
//   return flowableFetch<ProcessInstance>('/runtime/process-instances', {
//     method: 'POST',
//     body: JSON.stringify({
//       processDefinitionKey: 'orgSettingsWorkflow',
//       variables,
//     }),
//   });
// }

// // UPDATE org settings (update all variables on existing instance)
// // export async function updateOrgSettings(
// //   processInstanceId: string,
// //   payload: OrgSettingsPayload
// // ): Promise<void> {
// //   const fields = ['companyName', 'industry', 'address', 'gstin', 'cin', 'fiscalYear', 'timezone'] as const;
// //   await Promise.all(
// //     fields.map(field =>
// //       flowableFetch<void>(
// //         `/runtime/process-instances/${processInstanceId}/variables/${field}`,
// //         {
// //           method: 'PUT',
// //           body: JSON.stringify({ name: field, value: payload[field], type: 'string' }),
// //         }
// //       )
// //     )
// //   );
// // }
// export async function updateOrgSettings(
//   processInstanceId: string,
//   payload: OrgSettingsPayload
// ): Promise<void> {
//   const fields = ['companyName', 'industry', 'address', 'gstin', 'cin', 'fiscalYear', 'timezone'] as const;
  
//   for (const field of fields) {
//     await flowableFetch<void>(
//       `/runtime/process-instances/${processInstanceId}/variables/${field}`,
//       {
//         method: 'PUT',
//         body: JSON.stringify({ name: field, value: payload[field], type: 'string' }),
//       }
//     );
//   }
// }

// // ─────────────────────────────────────────────────────────────
// // SAVE A SINGLE PROCESS VARIABLE (without completing the task)
// // Called from CompleteStep.tsx to track step-by-step progress
// // ─────────────────────────────────────────────────────────────
// // export async function saveProcessVariable(
// //   processInstanceId: string,
// //   name: string,
// //   value: string
// // ): Promise<void> {
// //   await flowableFetch<void>(
// //     `/runtime/process-instances/${processInstanceId}/variables/${name}`,
// //     {
// //       method: 'PUT',
// //       body: JSON.stringify({ name, value, type: 'string' }),
// //     }
// //   );
// // }
// export async function saveProcessVariable(
//   processInstanceId: string,
//   name: string,
//   value: string
// ): Promise<void> {
//   const variableBody = { name, value, type: 'string' };

//   try {
//     // Try PUT first — updates an existing variable
//     await flowableFetch<void>(
//       `/runtime/process-instances/${processInstanceId}/variables/${name}`,
//       {
//         method: 'PUT',
//         body: JSON.stringify(variableBody),
//       }
//     );
//   } catch (err) {
//     // Variable doesn't exist yet → create it via POST (expects an array)
//     if (err instanceof Error && err.message.includes('[404]')) {
//       await flowableFetch<void>(
//         `/runtime/process-instances/${processInstanceId}/variables`,
//         {
//           method: 'POST',
//           body: JSON.stringify([variableBody]),  // ← wrap in array
//         }
//       );
//     } else {
//       throw err;
//     }
//   }
// }

// // ─────────────────────────────────────────────────────────────
// // USER PREFERENCES (Notifications + Regional + Appearance)
// // Stored as variables on a per-user process instance
// // processDefinitionKey: userPreferencesWorkflow
// //
// // Fields: userId, emailNotif, pushNotif, reminderNotif,
// //         language, currency, dateFormat, theme
// //
// // One process instance per user (keyed by userId variable)
// // ─────────────────────────────────────────────────────────────

// export interface UserPreferences {
//   processInstanceId: string;
//   userId:        string;
//   emailNotif:    boolean;
//   pushNotif:     boolean;
//   reminderNotif: boolean;
//   language:      string;
//   currency:      string;
//   dateFormat:    string;
//   theme:         string;
// }

// export interface UserPreferencesPayload {
//   userId:        string;
//   emailNotif:    boolean;
//   pushNotif:     boolean;
//   reminderNotif: boolean;
//   language:      string;
//   currency:      string;
//   dateFormat:    string;
//   theme:         string;
// }

// // GET preferences for a specific user
// // Searches all userPreferencesWorkflow instances and finds the one with matching userId variable
// export async function getUserPreferences(userId: string): Promise<UserPreferences | null> {
//   const data = await flowableFetch<{ data: ProcessInstance[] }>(
//     '/runtime/process-instances?processDefinitionKey=userPreferencesWorkflow&size=100'
//   );
//   const instances = data.data || [];

//   // Find the instance belonging to this user
//   for (const inst of instances) {
//     const vars = await getProcessVariables(inst.id);
//     const storedUserId = getVariableValue(vars, 'userId');
//     if (storedUserId === userId) {
//       return {
//         processInstanceId: inst.id,
//         userId,
//         emailNotif:    getVariableValue(vars, 'emailNotif') === 'true',
//         pushNotif:     getVariableValue(vars, 'pushNotif') === 'true',
//         reminderNotif: getVariableValue(vars, 'reminderNotif') === 'true',
//         language:      getVariableValue(vars, 'language') || 'English (India)',
//         currency:      getVariableValue(vars, 'currency') || 'INR (₹)',
//         dateFormat:    getVariableValue(vars, 'dateFormat') || 'DD-MMM-YYYY',
//         theme:         getVariableValue(vars, 'theme') || 'light',
//       };
//     }
//   }
//   return null;
// }

// // CREATE a preferences instance for a new user
// export async function createUserPreferences(
//   payload: UserPreferencesPayload
// ): Promise<ProcessInstance> {
//   const variables: FlowableVariable[] = [
//     { name: 'userId',        value: payload.userId,                    type: 'string' },
//     { name: 'emailNotif',    value: String(payload.emailNotif),        type: 'string' },
//     { name: 'pushNotif',     value: String(payload.pushNotif),         type: 'string' },
//     { name: 'reminderNotif', value: String(payload.reminderNotif),     type: 'string' },
//     { name: 'language',      value: payload.language,                  type: 'string' },
//     { name: 'currency',      value: payload.currency,                  type: 'string' },
//     { name: 'dateFormat',    value: payload.dateFormat,                type: 'string' },
//     { name: 'theme',         value: payload.theme,                     type: 'string' },
//   ];
//   return flowableFetch<ProcessInstance>('/runtime/process-instances', {
//     method: 'POST',
//     body: JSON.stringify({
//       processDefinitionKey: 'userPreferencesWorkflow',
//       variables,
//     }),
//   });
// }

// // UPDATE all preference variables on an existing instance
// // export async function updateUserPreferences(
// //   processInstanceId: string,
// //   payload: UserPreferencesPayload
// // ): Promise<void> {
// //   const entries: Array<[string, string]> = [
// //     ['userId',        payload.userId],
// //     ['emailNotif',    String(payload.emailNotif)],
// //     ['pushNotif',     String(payload.pushNotif)],
// //     ['reminderNotif', String(payload.reminderNotif)],
// //     ['language',      payload.language],
// //     ['currency',      payload.currency],
// //     ['dateFormat',    payload.dateFormat],
// //     ['theme',         payload.theme],
// //   ];
// //   await Promise.all(
// //     entries.map(([name, value]) =>
// //       flowableFetch<void>(
// //         `/runtime/process-instances/${processInstanceId}/variables/${name}`,
// //         {
// //           method: 'PUT',
// //           body: JSON.stringify({ name, value, type: 'string' }),
// //         }
// //       )
// //     )
// //   );
// // }
// // AFTER — runs PUTs one at a time
// export async function updateUserPreferences(
//   processInstanceId: string,
//   payload: UserPreferencesPayload
// ): Promise<void> {
//   const entries: Array<[string, string]> = [
//     ['userId',        payload.userId],
//     ['emailNotif',    String(payload.emailNotif)],
//     ['pushNotif',     String(payload.pushNotif)],
//     ['reminderNotif', String(payload.reminderNotif)],
//     ['language',      payload.language],
//     ['currency',      payload.currency],
//     ['dateFormat',    payload.dateFormat],
//     ['theme',         payload.theme],
//   ];
//   for (const [name, value] of entries) {   // ✅ sequential
//     await flowableFetch<void>(
//       `/runtime/process-instances/${processInstanceId}/variables/${name}`,
//       {
//         method: 'PUT',
//         body: JSON.stringify({ name, value, type: 'string' }),
//       }
//     );
//   }
// }
// // ─────────────────────────────────────────────────────────────
// // SAVE PREFERENCES — convenience wrapper used by Settings.tsx
// // Creates if not exists, updates if exists
// // ─────────────────────────────────────────────────────────────
// export async function saveUserPreferences(
//   payload: UserPreferencesPayload
// ): Promise<void> {
//   const existing = await getUserPreferences(payload.userId);
//   if (existing) {
//     await updateUserPreferences(existing.processInstanceId, payload);
//   } else {
//     await createUserPreferences(payload);
//   }
// }

// // ─────────────────────────────────────────────────────────────
// // SAVE ORG SETTINGS — convenience wrapper used by Settings.tsx
// // Creates if not exists, updates if exists
// // ─────────────────────────────────────────────────────────────
// export async function saveOrgSettings(payload: OrgSettingsPayload): Promise<void> {
//   const existing = await getOrgSettings();
//   if (existing) {
//     await updateOrgSettings(existing.processInstanceId, payload);
//   } else {
//     await createOrgSettings(payload);
//   }
// }
