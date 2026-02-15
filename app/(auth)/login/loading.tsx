import { Skeleton } from '@/components/ui/skeleton';

export default function LoginLoading() {
  return (
    <div className="w-full max-w-md">
      <Skeleton className="h-[500px] w-full rounded-2xl" />
    </div>
  );
}
