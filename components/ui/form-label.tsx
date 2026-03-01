import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils/cn';

interface FormLabelProps {
  children: React.ReactNode;
  required?: boolean;
  className?: string;
  htmlFor?: string;
}

export function FormLabel({
  children,
  required,
  className,
  htmlFor,
}: FormLabelProps) {
  return (
    <Label htmlFor={htmlFor} className={cn('text-sm font-medium', className)}>
      {children}
      {required && <span className="text-destructive ms-0.5">*</span>}
    </Label>
  );
}
