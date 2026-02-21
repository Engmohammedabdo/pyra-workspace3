import { redirect } from 'next/navigation';
import { getPortalSession } from '@/lib/portal/auth';
import { PortalSidebar } from '@/components/portal/portal-sidebar';
import { PortalTopbar } from '@/components/portal/portal-topbar';
import { ErrorBoundaryWrapper } from '@/components/error-boundary-wrapper';
import { PortalBrandingWrapper } from '@/components/portal/PortalBrandingWrapper';

export default async function PortalMainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const client = await getPortalSession();

  if (!client) {
    redirect('/portal/login');
  }

  return (
    <PortalBrandingWrapper>
      <div className="min-h-screen bg-background">
        <PortalSidebar />
        <div className="lg:ps-[240px] transition-all duration-300">
          <PortalTopbar
            client={{
              id: client.id,
              name: client.name,
              email: client.email,
              company: client.company,
            }}
          />
          <main className="p-4 lg:p-6">
            <ErrorBoundaryWrapper>{children}</ErrorBoundaryWrapper>
          </main>
        </div>
      </div>
    </PortalBrandingWrapper>
  );
}
