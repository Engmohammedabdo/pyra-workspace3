export default function PortalAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-portal/5 via-white to-portal/5 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 p-4">
      {children}
    </div>
  );
}
