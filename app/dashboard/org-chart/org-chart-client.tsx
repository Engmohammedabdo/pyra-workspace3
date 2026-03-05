'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Network,
  ChevronDown,
  ChevronLeft,
  Briefcase,
  Building2,
  Users,
  Minus,
  Plus,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils/cn';

// ─── Types ──────────────────────────────────────────────────
interface OrgUser {
  username: string;
  display_name: string | null;
  email: string | null;
  role: string;
  job_title: string | null;
  department: string | null;
  manager_username: string | null;
  avatar_url: string | null;
}

interface TreeNode extends OrgUser {
  children: TreeNode[];
}

// ─── Build tree from flat list ──────────────────────────────
function buildTree(users: OrgUser[]): TreeNode[] {
  const map = new Map<string, TreeNode>();

  // Create tree nodes
  for (const user of users) {
    map.set(user.username, { ...user, children: [] });
  }

  const roots: TreeNode[] = [];

  // Assign children to parents
  for (const user of users) {
    const node = map.get(user.username)!;
    if (user.manager_username && map.has(user.manager_username)) {
      map.get(user.manager_username)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children alphabetically
  const sortChildren = (nodes: TreeNode[]) => {
    nodes.sort((a, b) =>
      (a.display_name || a.username).localeCompare(b.display_name || b.username, 'ar')
    );
    for (const node of nodes) {
      sortChildren(node.children);
    }
  };
  sortChildren(roots);

  return roots;
}

// ─── Tree Node Component ────────────────────────────────────
function OrgTreeNode({
  node,
  level,
  expandedNodes,
  toggleNode,
}: {
  node: TreeNode;
  level: number;
  expandedNodes: Set<string>;
  toggleNode: (username: string) => void;
}) {
  const isExpanded = expandedNodes.has(node.username);
  const hasChildren = node.children.length > 0;
  const initials = (node.display_name || node.username || 'U')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: level * 0.03 }}
    >
      {/* Node card */}
      <div className="flex items-start gap-2">
        {/* Expand/collapse button */}
        <div className="w-6 pt-3 shrink-0">
          {hasChildren && (
            <button
              onClick={() => toggleNode(node.username)}
              className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted transition-colors text-muted-foreground"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
          )}
        </div>

        {/* User card */}
        <Card
          className={cn(
            'flex-1 transition-all hover:border-orange-300 dark:hover:border-orange-700',
            hasChildren && 'cursor-pointer'
          )}
          onClick={hasChildren ? () => toggleNode(node.username) : undefined}
        >
          <CardContent className="p-3 flex items-center gap-3">
            <Avatar className="h-10 w-10 border-2 border-orange-200 dark:border-orange-800 shrink-0">
              <AvatarImage
                src={node.avatar_url || undefined}
                alt={node.display_name || node.username}
              />
              <AvatarFallback className="bg-orange-500/10 text-orange-600 font-bold text-sm">
                {initials}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-sm truncate">
                  {node.display_name || node.username}
                </h3>
                {hasChildren && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] shrink-0"
                  >
                    {node.children.length} تابعين
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                {node.job_title && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Briefcase className="h-3 w-3 shrink-0" />
                    {node.job_title}
                  </span>
                )}
                {node.department && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Building2 className="h-3 w-3 shrink-0" />
                    {node.department}
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Children */}
      <AnimatePresence>
        {isExpanded && hasChildren && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="ms-8 border-s-2 border-orange-200 dark:border-orange-800/50 ps-4 mt-1 space-y-1">
              {node.children.map((child) => (
                <OrgTreeNode
                  key={child.username}
                  node={child}
                  level={level + 1}
                  expandedNodes={expandedNodes}
                  toggleNode={toggleNode}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main Client ────────────────────────────────────────────
export default function OrgChartClient() {
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/dashboard/org-chart')
      .then((res) => res.json())
      .then(({ data }) => {
        const list: OrgUser[] = data || [];
        setUsers(list);
        // Auto-expand root nodes on first load
        const roots = list
          .filter((u) => !u.manager_username || !list.some((m) => m.username === u.manager_username))
          .map((u) => u.username);
        setExpandedNodes(new Set(roots));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const tree = useMemo(() => buildTree(users), [users]);

  const toggleNode = useCallback((username: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(username)) {
        next.delete(username);
      } else {
        next.add(username);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedNodes(new Set(users.map((u) => u.username)));
  }, [users]);

  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set());
  }, []);

  // ─── Stats ──────────────────────────────────────────────
  const stats = useMemo(() => {
    const totalUsers = users.length;
    const managers = new Set(users.map((u) => u.manager_username).filter(Boolean)).size;
    const departments = new Set(users.map((u) => u.department).filter(Boolean)).size;
    const rootCount = tree.length;
    return { totalUsers, managers, departments, rootCount };
  }, [users, tree]);

  // ─── Loading ────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-40 rounded-xl" />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // ─── Empty ──────────────────────────────────────────────
  if (users.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon={Network}
          title="لا يوجد بيانات"
          description="لم يتم العثور على مستخدمين لعرض الهيكل التنظيمي"
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Network className="h-6 w-6 text-orange-500" />
            الهيكل التنظيمي
          </h1>
          <p className="text-sm text-muted-foreground">
            عرض شجري للهيكل الإداري والتقارير المباشرة
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={expandAll}>
            <Plus className="h-4 w-4 me-1" />
            توسيع الكل
          </Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>
            <Minus className="h-4 w-4 me-1" />
            طي الكل
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-orange-500">{stats.totalUsers}</p>
            <p className="text-xs text-muted-foreground">إجمالي الأعضاء</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-orange-500">{stats.rootCount}</p>
            <p className="text-xs text-muted-foreground">المستوى الأعلى</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-orange-500">{stats.managers}</p>
            <p className="text-xs text-muted-foreground">المديرون</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-orange-500">{stats.departments}</p>
            <p className="text-xs text-muted-foreground">الأقسام</p>
          </CardContent>
        </Card>
      </div>

      {/* Tree */}
      <div className="space-y-1">
        {tree.map((rootNode) => (
          <OrgTreeNode
            key={rootNode.username}
            node={rootNode}
            level={0}
            expandedNodes={expandedNodes}
            toggleNode={toggleNode}
          />
        ))}
      </div>
    </div>
  );
}
