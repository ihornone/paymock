'use client';

import * as React from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { projectsApi } from '@/shared/api/endpoints/projects';
import { ApiError } from '@/shared/api/client';
import type { Project, InvoiceRecord, WebhookLogRecord, InvoiceStats } from '@/shared/types/models';

interface DashboardContextType {
  projects: Project[];
  selectedProjectId: string;
  selectedProject: Project | null;
  setSelectedProjectId: (id: string) => void;
  invoices: InvoiceRecord[];
  webhookLogs: WebhookLogRecord[];
  stats: InvoiceStats;
  loading: boolean;
  fetchData: () => Promise<void>;
  isCreateOpen: boolean;
  setIsCreateOpen: (open: boolean) => void;
  handleCreateProject: (name: string) => Promise<Project | null>;
  handleUpdateProjectName: (id: string, name: string) => Promise<boolean>;
  handleUpdateProjectSettings: (id: string, settings: Partial<Project>) => Promise<boolean>;
  handleDeleteProject: (id: string, name: string) => Promise<boolean>;
  handleResetToken: (projectId: string) => Promise<string | null>;
  copiedKey: string | null;
  copyToClipboard: (text: string, key: string) => void;
  hasProjects: boolean;
  isUserAuthenticated: boolean;
  user: any;
  isLoaded: boolean;
}

const DashboardContext = React.createContext<DashboardContextType | null>(null);

// In-memory module cache to eliminate tab-switching delay & screen flicker
interface GlobalCache {
  userId: string;
  projects: Project[];
  invoices: InvoiceRecord[];
  webhookLogs: WebhookLogRecord[];
  stats: InvoiceStats;
  selectedProjectId: string;
}

let memoryCache: GlobalCache | null = null;

const EMPTY_STATS: InvoiceStats = {
  totalCount: 0,
  totalAmount: 0,
  successCount: 0,
  failureCount: 0,
  createdCount: 0,
};

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedProjectIdParam = searchParams.get('projectId') || '';
  const { user, isLoaded, isSignedIn } = useUser();

  const currentUserId = user?.id || '';
  const hasValidCache = memoryCache && memoryCache.userId === currentUserId && memoryCache.projects.length > 0;

  const [projects, setProjects] = React.useState<Project[]>(() => hasValidCache ? memoryCache!.projects : []);
  const [invoices, setInvoices] = React.useState<InvoiceRecord[]>(() => hasValidCache ? memoryCache!.invoices : []);
  const [webhookLogs, setWebhookLogs] = React.useState<WebhookLogRecord[]>(() => hasValidCache ? memoryCache!.webhookLogs : []);
  const [stats, setStats] = React.useState<InvoiceStats>(() => hasValidCache ? memoryCache!.stats : {
    totalCount: 0,
    totalAmount: 0,
    successCount: 0,
    failureCount: 0,
    createdCount: 0,
  });

  const [loading, setLoading] = React.useState(!hasValidCache);
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  // The Clerk session cookie authenticates the request in production.
  // `x-user-id` is only honoured outside production and keeps local
  // development working without a Clerk session.
  const authHeaders = React.useMemo<Record<string, string>>(() => {
    return user?.id ? { 'x-user-id': user.id } : ({} as Record<string, string>);
  }, [user?.id]);

  const fetchData = React.useCallback(async () => {
    // If Clerk is loaded and user is not signed in, reset everything
    if (isLoaded && !isSignedIn) {
      memoryCache = null;
      setProjects([]);
      setInvoices([]);
      setWebhookLogs([]);
      setStats({
        totalCount: 0,
        totalAmount: 0,
        successCount: 0,
        failureCount: 0,
        createdCount: 0,
      });
      setLoading(false);
      return;
    }

    if (!isLoaded) return;

    try {
      // Only show full loading spinner if we have no cached data at all
      if (!memoryCache || memoryCache.userId !== currentUserId) {
        setLoading(true);
      }

      const data = await projectsApi.getDashboard(selectedProjectIdParam || undefined, { headers: authHeaders });
      const nextProjects = data.projects || [];
      const nextInvoices = data.invoices || [];
      const nextWebhooks = data.webhooks || [];
      const nextStats = data.stats || EMPTY_STATS;

      setProjects(nextProjects);
      setInvoices(nextInvoices);
      setWebhookLogs(nextWebhooks);
      setStats(nextStats);

      // Update memory cache
      if (currentUserId) {
        memoryCache = {
          userId: currentUserId,
          projects: nextProjects,
          invoices: nextInvoices,
          webhookLogs: nextWebhooks,
          stats: nextStats,
          selectedProjectId: selectedProjectIdParam,
        };
      }
    } catch (err) {
      // 4xx are expected rejections (not a crash); only 5xx is worth a console error.
      if (err instanceof ApiError && err.isExpectedRejection) {
        console.info('Dashboard request rejected:', err.code || err.kind);
      } else {
        console.error('Failed to fetch dashboard data:', err);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedProjectIdParam, isLoaded, isSignedIn, authHeaders, currentUserId]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const selectedProject = projects.find((p) => p.id === selectedProjectIdParam) || projects[0] || null;
  const selectedProjectId = selectedProject ? selectedProject.id : '';

  const setSelectedProjectId = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id) {
      params.set('projectId', id);
    } else {
      params.delete('projectId');
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleCreateProject = async (name: string): Promise<Project | null> => {
    if (!name.trim()) return null;
    try {
      const newProj = await projectsApi.createProject({ name: name.trim() }, { headers: authHeaders });
      setIsCreateOpen(false);
      // Invalidate cache and refetch
      memoryCache = null;
      await fetchData();
      if (newProj?.project?.id) {
        setSelectedProjectId(newProj.project.id);
      }
      return newProj?.project ?? null;
    } catch (err) {
      if (err instanceof ApiError && err.isExpectedRejection) {
        console.info('Project creation rejected:', err.code || err.kind);
      } else {
        console.error('Error creating project:', err);
      }
    }
    return null;
  };

  const handleUpdateProjectName = async (id: string, name: string): Promise<boolean> => {
    if (!name.trim()) return false;
    try {
      await projectsApi.updateProject({ id, name: name.trim() }, { headers: authHeaders });
      memoryCache = null;
      await fetchData();
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.isExpectedRejection) {
        console.info('Project rename rejected:', err.code || err.kind);
      } else {
        console.error('Error updating project name:', err);
      }
    }
    return false;
  };

  const handleUpdateProjectSettings = async (id: string, settings: Partial<Project>): Promise<boolean> => {
    try {
      await projectsApi.updateProject(
        {
          id,
          name: settings.name,
          logo_url: settings.logo_url,
          default_webhook_url: settings.default_webhook_url,
          default_success_url: settings.default_success_url,
          default_fail_url: settings.default_fail_url,
        },
        { headers: authHeaders }
      );
      memoryCache = null;
      await fetchData();
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.isExpectedRejection) {
        console.info('Project settings update rejected:', err.code || err.kind);
      } else {
        console.error('Error updating project settings:', err);
      }
    }
    return false;
  };

  const handleDeleteProject = async (id: string, name: string): Promise<boolean> => {
    if (!confirm(`Видалити проєкт "${name}"? Усі пов'язані інвойси також буде видалено.`)) return false;
    try {
      await projectsApi.deleteProject(id, { headers: authHeaders });
      memoryCache = null;
      await fetchData();
      router.push('/');
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.isExpectedRejection) {
        console.info('Project deletion rejected:', err.code || err.kind);
      } else {
        console.error('Error deleting project:', err);
      }
    }
    return false;
  };

  const handleResetToken = async (projectId: string): Promise<string | null> => {
    try {
      const data = await projectsApi.resetToken(projectId, { headers: authHeaders });
      memoryCache = null;
      await fetchData();
      return data.project?.token || null;
    } catch (err) {
      if (err instanceof ApiError && err.isExpectedRejection) {
        console.info('Token reset rejected:', err.code || err.kind);
      } else {
        console.error('Error resetting token:', err);
      }
    }
    return null;
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const hasProjects = projects.length > 0;
  const isUserAuthenticated = isLoaded && !!isSignedIn;

  return (
    <DashboardContext.Provider
      value={{
        projects,
        selectedProjectId,
        selectedProject,
        setSelectedProjectId,
        invoices,
        webhookLogs,
        stats,
        loading,
        fetchData,
        isCreateOpen,
        setIsCreateOpen,
        handleCreateProject,
        handleUpdateProjectName,
        handleUpdateProjectSettings,
        handleDeleteProject,
        handleResetToken,
        copiedKey,
        copyToClipboard,
        hasProjects,
        isUserAuthenticated,
        user,
        isLoaded,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const context = React.useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
}
