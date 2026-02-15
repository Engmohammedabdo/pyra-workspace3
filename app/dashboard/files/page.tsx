import { FileExplorer } from '@/components/files/file-explorer';

export const metadata = {
  title: 'الملفات | Pyra Workspace',
};

export default function FilesPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold">مدير الملفات</h1>
        <p className="text-muted-foreground text-sm mt-1">
          تصفح وإدارة ملفات المشاريع
        </p>
      </div>

      {/* File Explorer */}
      <FileExplorer />
    </div>
  );
}
