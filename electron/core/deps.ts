export interface DependencyEntry {
  projectId: string;
  title: string;
  required: boolean;
  dependencies: { projectId: string; required: boolean }[];
}

export interface DependencyPlanNode {
  projectId: string;
  title: string;
  required: boolean;
  depth: number;
}

export interface DependencyResolution {
  nodes: DependencyPlanNode[];
  missing: string[];
  cycles: string[];
}

export function resolveDependencyPlan(
  rootProjectId: string,
  entries: Map<string, DependencyEntry>,
  maxNodes = 64,
): DependencyResolution {
  const nodes: DependencyPlanNode[] = [];
  const missing = new Set<string>();
  const cycles = new Set<string>();
  const visited = new Set<string>();
  const stack = new Set<string>();

  function visit(projectId: string, required: boolean, depth: number): void {
    if (nodes.length >= maxNodes) return;
    if (stack.has(projectId)) {
      cycles.add(projectId);
      return;
    }
    if (visited.has(projectId)) {
      const existing = nodes.find((node) => node.projectId === projectId);
      if (existing && required) existing.required = true;
      return;
    }
    const entry = entries.get(projectId);
    if (!entry) {
      if (projectId !== rootProjectId) missing.add(projectId);
      return;
    }
    visited.add(projectId);
    stack.add(projectId);
    nodes.push({
      projectId,
      title: entry.title,
      required: required || entry.required,
      depth,
    });
    for (const dependency of entry.dependencies) {
      if (!dependency.projectId) continue;
      visit(dependency.projectId, dependency.required, depth + 1);
    }
    stack.delete(projectId);
  }

  visit(rootProjectId, true, 0);
  return {
    nodes: nodes.sort((a, b) => a.depth - b.depth),
    missing: [...missing],
    cycles: [...cycles],
  };
}

export function orderInstallPlan(
  nodes: DependencyPlanNode[],
): DependencyPlanNode[] {
  return [...nodes].sort(
    (a, b) => b.depth - a.depth || a.projectId.localeCompare(b.projectId),
  );
}
