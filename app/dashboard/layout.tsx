import { requireAuth } from '@/lib/auth/guards';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { ErrorBoundaryWrapper } from '@/components/error-boundary-wrapper';
import { PageTransition } from '@/components/layout/page-transition';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();
  const layoutUser = {
    username: session.pyraUser.username,
    role: session.pyraUser.role,
    display_name: session.pyraUser.display_name,
    rolePermissions: session.pyraUser.rolePermissions,
    role_name_ar: session.pyraUser.role_name_ar,
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar user={layoutUser} />
      <div className="lg:ps-[280px] transition-all duration-300">
        <Topbar user={layoutUser} />
        <main className="p-4 lg:p-6">
          <ErrorBoundaryWrapper>
            <PageTransition>
              {children}
            </PageTransition>
          </ErrorBoundaryWrapper>
        </main>
      </div>
    </div>
  );
}
