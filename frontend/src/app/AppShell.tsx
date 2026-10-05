import React from 'react';
import { ProjectStatusRail } from '@/features/project-status/ProjectStatusRail';

interface AppShellProps {
  children: React.ReactNode;
  navigation: React.ReactNode;
  projects: React.ReactNode;
}

export function AppShell({ children, navigation, projects }: AppShellProps) {
  return (
    <div className="min-h-screen bg-[#FAF8F4] flex flex-col font-sans antialiased text-[#1E2430] print:bg-white print:min-h-0">
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 lg:grid-rows-[minmax(700px,auto)] gap-6 p-6 max-w-[1800px] w-full mx-auto print:block print:p-0 print:max-w-none">
        <aside className="lg:col-span-3 lg:h-full bg-white p-6 rounded-2xl shadow-sm border border-[#D9D3C7]/40 flex flex-col min-h-0 overflow-hidden print:hidden">
          {projects}
        </aside>

        <section className="lg:col-span-6 lg:h-full min-w-0 bg-white p-8 rounded-2xl shadow-md border border-[#D9D3C7]/40 min-h-[700px] print:min-h-0 print:w-full print:max-w-none print:rounded-none print:border-0 print:shadow-none print:p-0">
          <div className="print:hidden">{navigation}</div>
          {children}
        </section>

        <div className="lg:col-span-3 lg:h-full bg-white rounded-2xl shadow-sm border border-[#D9D3C7]/40 overflow-hidden print:hidden">
          <ProjectStatusRail />
        </div>
      </main>
    </div>
  );
}
