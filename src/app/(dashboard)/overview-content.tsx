'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { DashboardShell } from '@/features/dashboard/components/dashboard-shell';
import { SectionCards } from '@/features/dashboard/components/section-cards';
import { ChartAreaInteractive } from '@/features/dashboard/components/chart-area-interactive';
import { RecentActivityTable } from '@/features/dashboard/components/recent-activity-table';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { DashboardRuntime } from '@/features/dashboard/components/dashboard-runtime';

function OverviewContent() {
  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <SectionCards />
      <div className="px-4 lg:px-6">
        <ChartAreaInteractive />
      </div>
      <RecentActivityTable />
    </div>
  );
}

export function PageContent() {
  return (
    <DashboardRuntime>

      <Suspense
        fallback={
          <div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6 animate-pulse">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
            <Skeleton className="h-72 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        }
      >
          <DashboardShell pageTitle="Огляд">
            <OverviewContent />
          </DashboardShell>
      </Suspense>

    </DashboardRuntime>
  );
}
