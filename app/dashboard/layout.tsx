import { requireAuth } from '@/lib/auth/guards';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();

  return (
    <div className="min-h-screen bg-background">
      <Sidebar user={session.pyraUser} />
      <div className="lg:ps-[280px] transition-all duration-300">
        <Topbar user={session.pyraUser} />
        <main className="p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
