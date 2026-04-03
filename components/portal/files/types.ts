export interface FileTag {
  tag_name: string;
  color: string;
}

export interface FileWithProject {
  id: string;
  file_name: string;
  file_type: string;
  file_path: string;
  file_size?: number;
  added_at: string;
  project_id: string;
  project_name: string;
  approval: {
    id: string;
    status: 'pending' | 'approved' | 'revision_requested';
    comment: string | null;
  } | null;
  tags?: FileTag[];
}

export interface TreeFolder {
  name: string;
  label: string;
  fileCount: number;
  totalSize: number;
}

export interface LevelContents {
  folders: TreeFolder[];
  files: FileWithProject[];
}
