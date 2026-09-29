import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultProjectRoot = path.resolve(scriptDirectory, "..");
const sourceExtensions = [".ts", ".tsx"];

export interface ArchitectureOptions {
  projectRoot?: string;
  appLineLimit?: number;
}

interface ModuleGraph {
  files: string[];
  dependencies: Map<string, string[]>;
}

function isInside(filePath: string, directoryPath: string): boolean {
  const relativePath = path.relative(directoryPath, filePath);
  return relativePath !== "" && !relativePath.startsWith(`..${path.sep}`) && relativePath !== ".." && !path.isAbsolute(relativePath);
}

function normalisePath(filePath: string): string {
  return path.resolve(filePath);
}

function readCompilerOptions(projectRoot: string): ts.CompilerOptions {
  const configPath = path.join(projectRoot, "tsconfig.json");
  const config = ts.readConfigFile(configPath, (filePath) => ts.sys.readFile(filePath));
  if (config.error) return {};
  return ts.parseJsonConfigFileContent(config.config, ts.sys, projectRoot).options;
}

function collectProductionFiles(projectRoot: string): string[] {
  const roots = [path.join(projectRoot, "src"), path.join(projectRoot, "server")];
  const files = roots.flatMap((root) => ts.sys.readDirectory(root, sourceExtensions));
  const serverEntry = path.join(projectRoot, "server.ts");
  if (ts.sys.fileExists(serverEntry)) files.push(serverEntry);

  return [...new Set(files.map(normalisePath))]
    .filter((filePath) => !filePath.endsWith(".d.ts"))
    .sort();
}

function getInternalDependencies(filePath: string, compilerOptions: ts.CompilerOptions, productionFiles: Set<string>): string[] {
  const sourceText = ts.sys.readFile(filePath);
  if (sourceText === undefined) return [];

  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const specifiers: string[] = [];
  sourceFile.forEachChild((node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier
      && ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }
  });

  return specifiers.flatMap((specifier) => {
    const resolved = ts.resolveModuleName(specifier, filePath, compilerOptions, ts.sys).resolvedModule?.resolvedFileName;
    if (!resolved) return [];
    const resolvedPath = normalisePath(resolved);
    return productionFiles.has(resolvedPath) ? [resolvedPath] : [];
  });
}

function buildModuleGraph(projectRoot: string): ModuleGraph {
  const files = collectProductionFiles(projectRoot);
  const productionFiles = new Set(files);
  const compilerOptions = readCompilerOptions(projectRoot);
  const dependencies = new Map(files.map((filePath) => [filePath, getInternalDependencies(filePath, compilerOptions, productionFiles)]));
  return { files, dependencies };
}

function findCycles(graph: ModuleGraph): string[][] {
  const visited = new Set<string>();
  const active = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const reported = new Set<string>();

  const visit = (filePath: string) => {
    visited.add(filePath);
    active.add(filePath);
    stack.push(filePath);

    for (const dependency of graph.dependencies.get(filePath) ?? []) {
      if (active.has(dependency)) {
        const cycle = [...stack.slice(stack.indexOf(dependency)), dependency];
        const key = cycle.slice(0, -1).sort().join("|");
        if (!reported.has(key)) {
          reported.add(key);
          cycles.push(cycle);
        }
      } else if (!visited.has(dependency)) {
        visit(dependency);
      }
    }

    stack.pop();
    active.delete(filePath);
  };

  for (const filePath of graph.files) {
    if (!visited.has(filePath)) visit(filePath);
  }

  return cycles;
}

export function checkArchitecture(options: ArchitectureOptions = {}): string[] {
  const projectRoot = normalisePath(options.projectRoot ?? defaultProjectRoot);
  const appLineLimit = options.appLineLimit ?? 500;
  const graph = buildModuleGraph(projectRoot);
  const errors: string[] = [];
  const servicesDirectory = path.join(projectRoot, "src/services");
  const hooksDirectory = path.join(projectRoot, "src/hooks");
  const componentsDirectory = path.join(projectRoot, "src/components");
  const serverDirectory = path.join(projectRoot, "server");
  const appPath = path.join(projectRoot, "src/App.tsx");

  for (const sourceFile of graph.files) {
    const dependencies = graph.dependencies.get(sourceFile) ?? [];
    const sourceIsService = isInside(sourceFile, servicesDirectory);
    const sourceIsHook = isInside(sourceFile, hooksDirectory);
    const sourceIsServer = isInside(sourceFile, serverDirectory) || sourceFile === path.join(projectRoot, "server.ts");

    for (const dependency of dependencies) {
      const importsUi = isInside(dependency, componentsDirectory) || dependency === appPath;
      const importsHooks = isInside(dependency, hooksDirectory);
      if ((sourceIsService || sourceIsHook) && importsUi) {
        errors.push(`${path.relative(projectRoot, sourceFile)} must not import UI module ${path.relative(projectRoot, dependency)}.`);
      }
      if (sourceIsService && importsHooks) {
        errors.push(`${path.relative(projectRoot, sourceFile)} must not import hook module ${path.relative(projectRoot, dependency)}.`);
      }
      if (sourceIsServer && (importsUi || importsHooks)) {
        errors.push(`${path.relative(projectRoot, sourceFile)} must not import frontend module ${path.relative(projectRoot, dependency)}.`);
      }
    }
  }

  const appSource = ts.sys.readFile(appPath);
  if (appSource === undefined) {
    errors.push("src/App.tsx is missing.");
  } else {
    const lineCount = appSource.trimEnd().split(/\r?\n/).length;
    if (lineCount > appLineLimit) {
      errors.push(`src/App.tsx has ${lineCount} physical lines; the budget is ${appLineLimit}.`);
    }
  }

  for (const cycle of findCycles(graph)) {
    errors.push(`Circular production import: ${cycle.map((filePath) => path.relative(projectRoot, filePath)).join(" -> ")}`);
  }

  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = checkArchitecture();
  if (errors.length === 0) {
    console.log("Architecture boundaries passed.");
  } else {
    console.error(`Architecture boundary check failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
    process.exitCode = 1;
  }
}
