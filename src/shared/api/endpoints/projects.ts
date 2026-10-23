import { apiRequest, type ApiRequestOptions } from '@/shared/api/client';
import type { Project, InvoiceRecord, InvoiceStats, WebhookLogRecord } from '@/shared/types/models';

/**
 * Response of `GET /api/admin/projects` — the dashboard bootstrap payload.
 */
export interface DashboardData {
  projects: Project[];
  currentProjectId: string | null;
  invoices: InvoiceRecord[];
  webhooks: WebhookLogRecord[];
  stats: InvoiceStats;
}

export interface CreateProjectInput {
  name: string;
  edrpou?: string;
}

export interface CreatedProject {
  ok: boolean;
  project: Project;
  /**
   * The merchant token and the webhook signing secret.
   *
   * They are returned exactly once — only their hashes are stored, so a lost
   * token must be rotated rather than looked up.
   */
  token: string;
  webhookSecret: string;
}

/**
 * Typed endpoint definitions for the dashboard / project management API.
 */
export const projectsApi = {
  /** Loads projects, the selected project's invoices, webhooks and stats. */
  getDashboard: (projectId?: string, options?: ApiRequestOptions) =>
    apiRequest<DashboardData>(
      projectId
        ? `/api/admin/projects?projectId=${encodeURIComponent(projectId)}`
        : '/api/admin/projects',
      options
    ),

  createProject: (input: CreateProjectInput, options?: ApiRequestOptions) =>
    apiRequest<CreatedProject>('/api/admin/projects', {
      ...options,
      method: 'POST',
      body: input,
    }),

  updateProject: (
    input: {
      id: string;
      name?: string;
      logo_url?: string | null;
      default_webhook_url?: string | null;
      default_success_url?: string | null;
      default_fail_url?: string | null;
    },
    options?: ApiRequestOptions
  ) =>
    apiRequest<Project>('/api/admin/projects', {
      ...options,
      method: 'PATCH',
      body: input,
    }),

  deleteProject: (id: string, options?: ApiRequestOptions) =>
    apiRequest<{ success: boolean }>(`/api/admin/projects?id=${encodeURIComponent(id)}`, {
      ...options,
      method: 'DELETE',
    }),

  resetToken: (projectId: string, options?: ApiRequestOptions) =>
    apiRequest<{ success: boolean; project: Project; token: string }>(
      '/api/admin/projects/reset-token',
      {
        ...options,
        method: 'POST',
        body: { projectId },
      }
    ),
};
