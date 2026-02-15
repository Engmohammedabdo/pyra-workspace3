import { Skeleton } from '@/components/ui/skeleton';

export default function PortalLoginLoading() {
  return (
    <div className="w-full max-w-[960px] grid grid-cols-1 lg:grid-cols-2 gap-0 rounded-2xl overflow-hidden shadow-2xl">
      {/* Branding skeleton */}
      <Skeleton className="hidden lg:block h-[600px] rounded-none" />
      {/* Form skeleton */}
      <div className="bg-card p-8 lg:p-12 space-y-6">
        <div className="space-y-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="space-y-5">
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="h-11 w-full" />
        </div>
        <Skeleton className="h-3 w-44 mx-auto mt-8" />
      </div>
    </div>
  );
}
