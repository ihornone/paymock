'use client';

import * as React from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import type { Project, InvoiceRecord, WebhookLogRecord, InvoiceStats } from '@/src/types/models';

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

      const url = selectedProjectIdParam ? `/api/admin/projects?projectId=${selectedProjectIdParam}` : '/api/admin/projects';
      const headers: Record<string, string> = {};
      if (user?.id) {
        headers['x-user-id'] = user.id;
      }
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        const nextProjects = data.projects || [];
        const nextInvoices = data.invoices || [];
        const nextWebhooks = data.webhooks || [];
        const nextStats = data.stats || {
          totalCount: 0,
          totalAmount: 0,
          successCount: 0,
          failureCount: 0,
          createdCount: 0,
        };

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
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedProjectIdParam, isLoaded, isSignedIn, user?.id, currentUserId]);

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
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (user?.id) {
        headers['x-user-id'] = user.id;
      }
      const res = await fetch('/api/admin/projects', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) {
        const newProj = await res.json();
        setIsCreateOpen(false);
        // Invalidate cache and refetch
        memoryCache = null;
        await fetchData();
        if (newProj?.id) {
          setSelectedProjectId(newProj.id);
        }
        return newProj;
      }
    } catch (err) {
      console.error('Error creating project:', err);
    }
    return null;
  };

  const handleUpdateProjectName = async (id: string, name: string): Promise<boolean> => {
    if (!name.trim()) return false;
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (user?.id) {
        headers['x-user-id'] = user.id;
      }
      const res = await fetch('/api/admin/projects', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ id, name: name.trim() }),
      });
      if (res.ok) {
        memoryCache = null;
        await fetchData();
        return true;
      }
    } catch (err) {
      console.error('Error updating project name:', err);
    }
    return false;
  };

  const handleUpdateProjectSettings = async (id: string, settings: Partial<Project>): Promise<boolean> => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (user?.id) {
        headers['x-user-id'] = user.id;
      }
      const res = await fetch('/api/admin/projects', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          id,
          name: settings.name,
          logo_url: settings.logo_url,
          default_webhook_url: settings.default_webhook_url,
          default_success_url: settings.default_success_url,
          default_fail_url: settings.default_fail_url,
        }),
      });
      if (res.ok) {
        memoryCache = null;
        await fetchData();
        return true;
      }
    } catch (err) {
      console.error('Error updating project settings:', err);
    }
    return false;
  };

  const handleDeleteProject = async (id: string, name: string): Promise<boolean> => {
    if (!confirm(`Видалити проєкт "${name}"? Усі пов'язані інвойси також буде видалено.`)) return false;
    try {
      const headers: Record<string, string> = {};
      if (user?.id) {
        headers['x-user-id'] = user.id;
      }
      const res = await fetch(`/api/admin/projects?id=${id}`, { method: 'DELETE', headers });
      if (res.ok) {
        memoryCache = null;
        await fetchData();
        router.push('/');
        return true;
      }
    } catch (err) {
      console.error('Error deleting project:', err);
    }
    return false;
  };

  const handleResetToken = async (projectId: string): Promise<string | null> => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (user?.id) {
        headers['x-user-id'] = user.id;
      }
      const res = await fetch('/api/admin/projects/reset-token', {
        method: 'POST',
        headers,
        body: JSON.stringify({ projectId }),
      });
      if (res.ok) {
        const data = await res.json();
        memoryCache = null;
        await fetchData();
        return data.project?.token || null;
      }
    } catch (err) {
      console.error('Error resetting token:', err);
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
