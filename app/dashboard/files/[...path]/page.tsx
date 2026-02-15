import { FileExplorer } from '@/components/files/file-explorer';

interface FilePathPageProps {
  params: Promise<{ path: string[] }>;
}

export async function generateMetadata({ params }: FilePathPageProps) {
  const { path } = await params;
  const folderName = path[path.length - 1] || 'الملفات';
  return {
    title: `${decodeURIComponent(folderName)} | Pyra Workspace`,
  };
}

export default async function FilePathPage({ params }: FilePathPageProps) {
  const { path } = await params;
  const fullPath = path.map(decodeURIComponent).join('/');

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold">مدير الملفات</h1>
        <p className="text-muted-foreground text-sm mt-1">
          تصفح وإدارة ملفات المشاريع
        </p>
      </div>

      {/* File Explorer with initial path */}
      <FileExplorer initialPath={fullPath} />
    </div>
  );
}
