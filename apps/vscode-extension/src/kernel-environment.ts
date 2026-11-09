/**
 * Turn the extension's settings into the environment the simulation kernel —
 * and everything it starts, including the `general-simulator` process itself —
 * will inherit.
 *
 * Kept apart from `kernel.ts` because it is the half worth testing: `kernel.ts`
 * spawns a child process, this decides what that child is told. Before this
 * existed the spawn passed no `env` at all, so the kernel inherited whatever
 * the editor happened to have and no setting could reach it.
 *
 * The resolution chain this feeds is `path_discovery.find_solver`'s: an
 * explicit request option, then the app settings file, then
 * `GENSIM_<NAME>_PATH`, then `PATH`. These settings are the third rung, which
 * is the one a GUI can set per-workspace without writing to a shared file.
 */

import * as path from "node:path";

/** Settings this module reads. Mirrors `contributes.configuration`. */
export interface KernelEnvironmentSettings {
  generalSimulatorPath?: string;
  ngspicePath?: string;
  xycePath?: string;
  octaveCliPath?: string;
  pythonPath?: string[];
  environment?: Record<string, string>;
}

export interface BuildKernelEnvironmentOptions {
  /** The environment to extend — normally `process.env`. */
  base: NodeJS.ProcessEnv;
  settings: KernelEnvironmentSettings;
  /** Folder that relative `pythonPath` entries resolve against. */
  workspaceRoot?: string;
  /** Separator for PATH-like variables. `path.delimiter` outside tests. */
  delimiter?: string;
}

/**
 * `general-simulator` becomes `GENSIM_GENERAL_SIMULATOR_PATH`, with underscores.
 *
 * The backend accepts a hyphenated spelling too, for anything already setting
 * it, but a hyphen is not a valid shell identifier — `export
 * GENSIM_GENERAL-SIMULATOR_PATH=...` is a syntax error — so this writes the
 * form a person could also type by hand.
 */
export function solverEnvVar(solverName: string): string {
  return `GENSIM_${solverName.toUpperCase().replaceAll("-", "_")}_PATH`;
}

const trimmed = (value: string | undefined): string => (value ?? "").trim();

export function buildKernelEnvironment(options: BuildKernelEnvironmentOptions): NodeJS.ProcessEnv {
  const { base, settings, workspaceRoot } = options;
  const delimiter = options.delimiter ?? path.delimiter;
  const env: NodeJS.ProcessEnv = { ...base };

  for (const [solver, configured] of [
    ["general-simulator", settings.generalSimulatorPath],
    ["ngspice", settings.ngspicePath],
    ["xyce", settings.xycePath],
  ] as const) {
    const value = trimmed(configured);
    if (value) env[solverEnvVar(solver)] = value;
  }

  // Octave has no setting on the engine side: `octave-ffi` spawns `octave-cli`
  // found on PATH and nothing else. So pointing at a binary means putting its
  // directory first on the PATH the simulation inherits.
  const octave = trimmed(settings.octaveCliPath);
  if (octave) {
    const dir = path.dirname(octave);
    const existing = env.PATH ?? env.Path ?? "";
    env.PATH = existing ? `${dir}${delimiter}${existing}` : dir;
    // Windows carries it as `Path`; leaving a stale copy would shadow the new one.
    // `delete` and not an assignment: this object is handed to `spawn` as `env`,
    // and whether an `undefined` value is skipped or stringified there is a
    // Node version detail worth not depending on. Removing the key is not.
    // biome-ignore lint/performance/noDelete: the key must be absent, not undefined
    if (env.Path !== undefined && env.Path !== env.PATH) delete env.Path;
  }

  // Extra module directories for pyblock/pyfunc. Relative entries are resolved
  // against the workspace so a setting can be committed and still work on
  // someone else's machine.
  const pythonPath = (settings.pythonPath ?? []).map((entry) => entry.trim()).filter(Boolean);
  if (pythonPath.length > 0) {
    const resolved = pythonPath.map((entry) =>
      path.isAbsolute(entry) || !workspaceRoot ? entry : path.join(workspaceRoot, entry),
    );
    const existing = env.PYTHONPATH ?? "";
    env.PYTHONPATH = existing
      ? `${resolved.join(delimiter)}${delimiter}${existing}`
      : resolved.join(delimiter);
  }

  // Last, so it can override anything above — that is what an escape hatch is for.
  for (const [key, value] of Object.entries(settings.environment ?? {})) {
    if (key.trim()) env[key] = value;
  }

  return env;
}
