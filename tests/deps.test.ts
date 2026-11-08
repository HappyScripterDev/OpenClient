import { describe, expect, it } from "vitest";
import { resolveDependencyPlan, orderInstallPlan } from "../electron/core/deps";

const entries = new Map([
  [
    "root",
    {
      projectId: "root",
      title: "Root",
      required: true,
      dependencies: [
        { projectId: "library", required: true },
        { projectId: "optional", required: false },
      ],
    },
  ],
  [
    "library",
    {
      projectId: "library",
      title: "Library",
      required: true,
      dependencies: [{ projectId: "core", required: true }],
    },
  ],
  [
    "core",
    {
      projectId: "core",
      title: "Core",
      required: true,
      dependencies: [],
    },
  ],
  [
    "optional",
    {
      projectId: "optional",
      title: "Optional",
      required: false,
      dependencies: [],
    },
  ],
]);

describe("dependency resolution", () => {
  it("walks required dependencies and records depth", () => {
    const plan = resolveDependencyPlan("root", entries);
    expect(plan.nodes.map((node) => node.projectId)).toEqual([
      "root",
      "library",
      "optional",
      "core",
    ]);
    expect(plan.nodes.find((node) => node.projectId === "core")?.depth).toBe(2);
    expect(plan.missing).toEqual([]);
  });

  it("orders installs deepest first", () => {
    const plan = resolveDependencyPlan("root", entries);
    expect(orderInstallPlan(plan.nodes).map((node) => node.projectId)).toEqual([
      "core",
      "library",
      "optional",
      "root",
    ]);
  });

  it("reports missing dependencies without dropping the root", () => {
    const plan = resolveDependencyPlan("root", entries, 256);
    const limited = resolveDependencyPlan("missing-root", new Map());
    expect(limited.nodes).toEqual([]);
    expect(plan.missing).toEqual([]);
    const broken = new Map([
      [
        "root",
        {
          projectId: "root",
          title: "Root",
          required: true,
          dependencies: [{ projectId: "absent", required: true }],
        },
      ],
    ]);
    const result = resolveDependencyPlan("root", broken);
    expect(result.nodes.map((node) => node.projectId)).toEqual(["root"]);
    expect(result.missing).toEqual(["absent"]);
  });

  it("detects cycles", () => {
    const cyclic = new Map([
      [
        "a",
        {
          projectId: "a",
          title: "A",
          required: true,
          dependencies: [{ projectId: "b", required: true }],
        },
      ],
      [
        "b",
        {
          projectId: "b",
          title: "B",
          required: true,
          dependencies: [{ projectId: "a", required: true }],
        },
      ],
    ]);
    const result = resolveDependencyPlan("a", cyclic);
    expect(result.cycles).toContain("a");
    expect(result.nodes.map((node) => node.projectId)).toEqual(["a", "b"]);
  });
});
