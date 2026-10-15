'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { DashboardProvider } from '@/components/dashboard/dashboard-context';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { SectionCards } from '@/components/dashboard/section-cards';
import { ChartAreaInteractive } from '@/components/dashboard/chart-area-interactive';
import { RecentActivityTable } from '@/components/dashboard/recent-activity-table';
import { Skeleton } from '@/components/ui/skeleton';

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

export default function HomePage() {
  return (
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
      <DashboardProvider>
        <DashboardShell pageTitle="Огляд">
          <OverviewContent />
        </DashboardShell>
      </DashboardProvider>
    </Suspense>
  );
}
