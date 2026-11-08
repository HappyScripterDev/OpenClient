import { describe, expect, it } from "vitest";
import {
  buildGameArguments,
  buildJvmArguments,
  evaluateRules,
  mergeVersionJson,
  nameToPath,
  planLibraries,
  splitLegacyArguments,
  substitutePlaceholders,
  type LaunchContext,
  type Library,
  type VersionJson,
} from "../electron/core/mojang";

const context: LaunchContext = {
  gameDir: "C:\\Games\\Minecraft",
  assetsRoot: "C:\\Data\\assets",
  assetsIndexName: "17",
  nativesDir: "C:\\Games\\Minecraft\\natives",
  libraryRoot: "C:\\Data\\libraries",
  classpath: "a.jar;b.jar",
  classpathSeparator: ";",
  authPlayerName: "Steve",
  authUuid: "00000000-0000-0000-0000-000000000000",
  authAccessToken: "token",
  authXuid: "xuid",
  clientId: "client",
  userType: "msa",
  versionName: "1.21.4",
  versionType: "release",
  launcherName: "OpenClient",
  launcherVersion: "1.0.0",
  javaMajor: 21,
};

function library(name: string, path: string, rules?: Library["rules"]) {
  return {
    name,
    downloads: { artifact: { path, sha1: "a".repeat(40), size: 10, url: "https://example.invalid/x" } },
    ...(rules ? { rules } : {}),
  };
}

describe("Mojang version rules", () => {
  it("allows libraries without rules", () => {
    expect(evaluateRules(undefined, "windows", "x86_64", "10.0.1")).toBe(true);
  });

  it("applies allow and disallow rules by OS", () => {
    const rules = [
      { action: "allow" as const, os: { name: "windows" } },
      { action: "disallow" as const, os: { name: "windows", version: "^10\\." } },
    ];
    expect(evaluateRules(rules, "windows", "x86_64", "10.0.19045")).toBe(false);
    expect(evaluateRules(rules, "windows", "x86_64", "6.1")).toBe(true);
    expect(evaluateRules(rules, "linux", "x86_64", "6.8")).toBe(false);
  });

  it("honours feature rules", () => {
    const rules = [{ action: "allow" as const, features: { has_custom_resolution: true } }];
    expect(evaluateRules(rules, "windows", "x86_64", "10", {})).toBe(false);
    expect(
      evaluateRules(rules, "windows", "x86_64", "10", {
        has_custom_resolution: true,
      }),
    ).toBe(true);
  });
});

describe("library planning", () => {
  const libraries = [
    library("org.example:normal:1.0", "org/example/normal/1.0/normal-1.0.jar"),
    library("org.example:linux:1.0", "org/example/linux/1.0/linux-1.0.jar", [
      { action: "allow", os: { name: "linux" } },
    ]),
    {
      name: "org.lwjgl:lwjgl:3.3.2:natives-windows",
      downloads: {
        artifact: {
          path: "org/lwjgl/lwjgl/3.3.2/lwjgl-3.3.2-natives-windows.jar",
          sha1: "b".repeat(40),
          size: 10,
          url: "https://example.invalid/n",
        },
      },
    },
    {
      name: "org.legacy:legacy:1.0",
      natives: { windows: "natives-windows-${arch}" },
      extract: { exclude: ["META-INF/"] },
      downloads: {
        classifiers: {
          "natives-windows-64": {
            path: "org/legacy/legacy/1.0/legacy-1.0-natives-windows-64.jar",
            sha1: "c".repeat(40),
            size: 10,
            url: "https://example.invalid/l",
          },
        },
      },
    },
  ];

  it("selects classpath and native archives for windows", () => {
    const plan = planLibraries(libraries, "windows", "x86_64", "10.0");
    expect(plan.classpath).toEqual([
      "org/example/normal/1.0/normal-1.0.jar",
    ]);
    expect(plan.nativeArchives.map((entry) => entry.path)).toEqual([
      "org/lwjgl/lwjgl/3.3.2/lwjgl-3.3.2-natives-windows.jar",
      "org/legacy/legacy/1.0/legacy-1.0-natives-windows-64.jar",
    ]);
  });

  it("selects Linux-only libraries on Linux", () => {
    const plan = planLibraries(libraries, "linux", "x86_64", "6.8");
    expect(plan.classpath).toContain("org/example/linux/1.0/linux-1.0.jar");
    expect(plan.classpath).not.toContain("org/lwjgl/lwjgl/3.3.2/lwjgl-3.3.2-natives-windows.jar");
  });

  it("builds maven paths from library names", () => {
    expect(nameToPath("net.fabricmc:fabric-loader:0.16.9")).toBe(
      "net/fabricmc/fabric-loader/0.16.9/fabric-loader-0.16.9.jar",
    );
    expect(nameToPath("bad-name")).toBeNull();
  });
});

describe("version merging", () => {
  const parent: VersionJson = {
    id: "1.21.1",
    type: "release",
    mainClass: "net.minecraft.client.main.Main",
    assets: "17",
    assetIndex: { id: "17", url: "https://example.invalid/index.json" },
    downloads: { client: { url: "https://example.invalid/client.jar", sha1: "d".repeat(40), size: 100 } },
    libraries: [library("org.example:a:1.0", "org/example/a/1.0/a-1.0.jar")],
    arguments: {
      game: ["--username", "${auth_player_name}"],
      jvm: ["-Djava.library.path=${natives_directory}"],
    },
    javaVersion: { component: "java-runtime-delta", majorVersion: 21 },
  };

  const child: VersionJson = {
    id: "1.21.1-fabric",
    type: "release",
    mainClass: "net.fabricmc.loader.impl.launch.knot.KnotClient",
    inheritsFrom: "1.21.1",
    libraries: [library("org.example:a:2.0", "org/example/a/2.0/a-2.0.jar")],
    arguments: { game: ["--fabric"] },
  };

  it("merges libraries, arguments and downloads", () => {
    const merged = mergeVersionJson(parent, child);
    expect(merged.mainClass).toContain("KnotClient");
    expect(merged.downloads?.client?.url).toContain("client.jar");
    expect(merged.libraries?.map((entry) => entry.name)).toEqual(["org.example:a:2.0"]);
    expect(merged.arguments?.game).toEqual(["--username", "${auth_player_name}", "--fabric"]);
    expect(merged.javaVersion?.majorVersion).toBe(21);
  });

  it("substitutes placeholders and compacts UUIDs", () => {
    expect(substitutePlaceholders("${auth_player_name}-${auth_uuid}", context)).toBe(
      "Steve-00000000000000000000000000000000",
    );
    expect(substitutePlaceholders("${unknown_placeholder}", context)).toBe("${unknown_placeholder}");
  });

  it("builds per-OS game arguments", () => {
    const version: VersionJson = {
      ...parent,
      arguments: {
        game: [
          "--username",
          "${auth_player_name}",
          {
            rules: [{ action: "allow", os: { name: "windows" } }],
            value: ["--winArg", "${version_name}"],
          },
          {
            rules: [{ action: "allow", os: { name: "linux" } }],
            value: "--linuxArg",
          },
        ],
      },
    };
    const args = buildGameArguments(version, context, "windows", "x86_64", "10.0");
    expect(args).toEqual(["--username", "Steve", "--winArg", "1.21.4"]);
  });

  it("supports legacy minecraftArguments", () => {
    const version: VersionJson = {
      ...parent,
      arguments: undefined,
      minecraftArguments: "--username ${auth_player_name} --gameDir ${game_directory}",
    };
    expect(buildGameArguments(version, context)).toEqual([
      "--username",
      "Steve",
      "--gameDir",
      "C:\\Games\\Minecraft",
    ]);
    expect(splitLegacyArguments("a  b   c")).toEqual(["a", "b", "c"]);
  });

  it("uses the fallback JVM arguments when none are declared", () => {
    const version: VersionJson = { ...parent, arguments: {} };
    expect(buildJvmArguments(version, context)).toEqual([
      "-Djava.library.path=C:\\Games\\Minecraft\\natives",
      "-cp",
      "a.jar;b.jar",
    ]);
  });
});
