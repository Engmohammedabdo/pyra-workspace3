import { requirePermission } from '@/lib/auth/guards';
import ProjectsClient from './projects-client';

export const metadata = {
  title: 'المشاريع | Pyra Workspace',
};

export default async function ProjectsPage() {
  await requirePermission('projects.view');
  return <ProjectsClient />;
}
