import { describe, expect, it } from "vitest";

import { buildKernelEnvironment, solverEnvVar } from "./kernel-environment";

const build = (
  settings: Parameters<typeof buildKernelEnvironment>[0]["settings"],
  base: NodeJS.ProcessEnv = {},
  workspaceRoot?: string,
) => buildKernelEnvironment({ base, settings, workspaceRoot, delimiter: ":" });

describe("solverEnvVar", () => {
  it("uses underscores, because a hyphen cannot be a shell identifier", () => {
    // `export GENSIM_GENERAL-SIMULATOR_PATH=...` is a syntax error in bash and
    // zsh, so the one solver most people need to point at was unreachable from
    // a terminal. The backend still accepts the hyphenated spelling.
    expect(solverEnvVar("general-simulator")).toBe("GENSIM_GENERAL_SIMULATOR_PATH");
    expect(solverEnvVar("ngspice")).toBe("GENSIM_NGSPICE_PATH");
    expect(solverEnvVar("xyce")).toBe("GENSIM_XYCE_PATH");
  });
});

describe("solver paths", () => {
  it("passes each configured binary as the variable the backend looks for", () => {
    const env = build({
      generalSimulatorPath: "/opt/gs/general-simulator",
      ngspicePath: "/usr/bin/ngspice",
      xycePath: "/opt/Xyce/bin/Xyce",
    });
    expect(env.GENSIM_GENERAL_SIMULATOR_PATH).toBe("/opt/gs/general-simulator");
    expect(env.GENSIM_NGSPICE_PATH).toBe("/usr/bin/ngspice");
    expect(env.GENSIM_XYCE_PATH).toBe("/opt/Xyce/bin/Xyce");
  });

  it("leaves a variable unset when the setting is empty or blank", () => {
    const env = build({ generalSimulatorPath: "   ", ngspicePath: "" });
    expect(env.GENSIM_GENERAL_SIMULATOR_PATH).toBeUndefined();
    expect(env.GENSIM_NGSPICE_PATH).toBeUndefined();
  });

  it("does not disturb the rest of the environment", () => {
    const env = build({ ngspicePath: "/usr/bin/ngspice" }, { HOME: "/home/a", PATH: "/usr/bin" });
    expect(env.HOME).toBe("/home/a");
    expect(env.PATH).toBe("/usr/bin");
  });
});

describe("octave", () => {
  it("puts the binary's directory first on PATH, since the engine only looks there", () => {
    const env = build({ octaveCliPath: "/opt/octave/bin/octave-cli" }, { PATH: "/usr/bin" });
    expect(env.PATH).toBe("/opt/octave/bin:/usr/bin");
  });

  it("works when the base environment has no PATH at all", () => {
    const env = build({ octaveCliPath: "/opt/octave/bin/octave-cli" }, {});
    expect(env.PATH).toBe("/opt/octave/bin");
  });

  it("drops a stale Windows-cased Path that would shadow the new one", () => {
    const env = build({ octaveCliPath: "/opt/octave/bin/octave-cli" }, { Path: "C:\\Windows" });
    expect(env.PATH).toBe("/opt/octave/bin:C:\\Windows");
    expect(env.Path).toBeUndefined();
  });
});

describe("pythonPath", () => {
  it("resolves relative entries against the workspace so a committed setting travels", () => {
    const env = build({ pythonPath: ["blocks", "/abs/lib"] }, {}, "/w/project");
    expect(env.PYTHONPATH).toBe("/w/project/blocks:/abs/lib");
  });

  it("prepends, keeping an inherited PYTHONPATH reachable", () => {
    const env = build({ pythonPath: ["/a"] }, { PYTHONPATH: "/already" });
    expect(env.PYTHONPATH).toBe("/a:/already");
  });

  it("ignores blank entries rather than injecting an empty path", () => {
    const env = build({ pythonPath: ["", "  ", "/a"] }, {});
    expect(env.PYTHONPATH).toBe("/a");
  });

  it("leaves PYTHONPATH untouched when nothing is configured", () => {
    expect(build({}, { PYTHONPATH: "/already" }).PYTHONPATH).toBe("/already");
    expect(build({}, {}).PYTHONPATH).toBeUndefined();
  });
});

describe("the escape hatch", () => {
  it("applies last, so it can override a setting above it", () => {
    const env = build({
      generalSimulatorPath: "/from/setting",
      environment: { GENSIM_GENERAL_SIMULATOR_PATH: "/from/escape-hatch", RUST_LOG: "debug" },
    });
    expect(env.GENSIM_GENERAL_SIMULATOR_PATH).toBe("/from/escape-hatch");
    expect(env.RUST_LOG).toBe("debug");
  });

  it("skips a blank key rather than writing an empty variable name", () => {
    const env = build({ environment: { "": "x", "  ": "y" } });
    expect(env[""]).toBeUndefined();
  });
});
