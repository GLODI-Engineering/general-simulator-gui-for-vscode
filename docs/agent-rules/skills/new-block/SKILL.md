---
name: new-block
description: Scaffold a new functional block in packages/blocks/ with all required sync points — Python definition, metadata YAML, equation template, tests, and frontend registration.
---

# `/new-block` — Scaffold a new functional block

Invoke when adding a block to `packages/blocks/` (PID, transfer function,
hysteresis, gain, integrator, etc.). A "block" lives in **multiple
synchronized places**, and forgetting any one of them produces a block
that simulates but isn't visible to the frontend (or vice versa). This
skill walks all of them.

## When NOT to use this skill

- Adding a **device model** (R, L, MOSFET, BJT) — those go in
  `packages/components/`, not blocks. Use `/new-component` instead.
- Adding a **solver backend** — use `/new-solver`.
- Modifying an existing block — just edit the file. This skill is
  scaffolding only.

## What you'll create

| Path | Purpose |
|---|---|
| `packages/blocks/src/blocks/<category>/<name>.py` | Python class: ports, params, equation generation |
| `packages/blocks/src/blocks/<category>/<name>.yaml` | Metadata: display name, icon, synthesis targets |
| `packages/blocks/tests/test_<name>.py` | At least one equation-shape test |
| (optional) `apps/frontend/src/canvas/nodes/<Name>Node.tsx` | Only if non-default rendering |

The four pieces must stay in sync — the YAML name field, the Python class
name, and the frontend node type are joined by the `name` field as the
canonical identifier.

## Step 1 — Pick the category

```
packages/blocks/src/blocks/
├── control/     # PID, TF, integrator, state machine, hysteresis, LUT
├── power/       # ideal switch, averaged switch, converter topologies
└── signal/      # gain, adder, saturation, rate limiter, mux
```

If your block fits two categories, prefer the one that matches its *primary
output domain*. A "PWM modulator" is a `signal` block (it outputs a signal)
even though its purpose is to drive a `power` block.

## Step 2 — Read an existing block for the shape

Read the simplest existing block in the same category. If the category is
empty (early in the project), use the template below directly.

## Step 3 — Write the Python class

```python
# packages/blocks/src/blocks/<category>/<name>.py
"""<Name> block — <one-line description>."""

from blocks._spec import Block, Port, Param


class <Name>(Block):
    """One-line description used in the frontend tooltip."""

    name = "<name>"                 # snake_case — canonical id
    category = "<category>"          # "control" | "power" | "signal"
    display_name = "<Human Name>"    # shown in block browser

    inputs = [
        Port("u", domain="signal"),
    ]
    outputs = [
        Port("y", domain="signal"),
    ]
    params = [
        Param("gain", float, default=1.0, doc="Output gain"),
    ]

    def equations(self, ctx):
        """Return symbolic equations for IR-2.

        ctx provides:
          ctx["u"], ctx["y"]   → port-scoped symbolic variables
          self.gain            → bound parameter value
          ctx.eq(lhs, rhs)     → equation constructor
        """
        return [ctx.eq(ctx["y"], self.gain * ctx["u"])]
```

**Critical constraints (checked by CI, but easy to internalize):**

- **Equations must be smooth** — no `if`, no piecewise, no `Heaviside`. If
  you need a switch, use `tanh((x - threshold) / smoothing_width)` or
  declare the block as having a discrete-event interface (advanced).
  See `docs/agent-rules/architecture-invariants.md#smooth-models`.
- **Port domains** must be one of: `signal`, `signal[n]`, `electrical`,
  `thermal`, `mechanical`. Anything else is rejected by the IR-2 builder.
- **Param defaults** must be JSON-serializable. The diagram JSON is the
  single source of truth; non-serializable defaults break round-tripping.

## Step 4 — Write the metadata YAML

```yaml
# packages/blocks/src/blocks/<category>/<name>.yaml
name: <name>
display_name: <Human Name>
category: <category>
description: One-line tooltip shown in the block browser.
icon: icons/<category>/<name>.svg     # path under apps/frontend/public/

synthesis_targets:
  analog_circuit: null                # or: rules.<name>_to_<circuit>
  c_code: codegen.c.<name>            # template module path
  cpp_code: codegen.cpp.<name>
  python_code: codegen.python.<name>

ports:
  inputs:
    - {name: u, domain: signal}
  outputs:
    - {name: y, domain: signal}

params:
  - {name: gain, type: float, default: 1.0, doc: "Output gain"}
```

The `ports` and `params` sections must match the Python class. A
consistency check in the test enforces this.

## Step 5 — Write the test

```python
# packages/blocks/tests/test_<name>.py
"""Sanity tests for <Name> block."""

from blocks.<category>.<name> import <Name>


def test_<name>_has_expected_ports():
    block = <Name>()
    assert [p.name for p in block.inputs] == ["u"]
    assert [p.name for p in block.outputs] == ["y"]


def test_<name>_equations_produce_correct_io_relation():
    block = <Name>(gain=2.0)
    # ... assert the equation list has the right shape ...
```

At minimum: one port-shape test and one equation-shape test. If the block
has multiple modes (e.g., a PID with optional anti-windup), test each
branch.

## Step 6 — Run local checks

```bash
uv run pytest packages/blocks/tests/test_<name>.py -v
uv run ruff check packages/blocks/src/blocks/<category>/<name>.py
./scripts/check-invariants.sh           # confirms no smoothness violations
```

If smoothness check fails, the block contains a forbidden discontinuity.
Fix the equations or escalate to a discrete-event interface declaration.

## Step 7 — Commit

```
feat(blocks): add <Name> to <category>
```

Or use `/commit` to have the message drafted from the diff. The
conventional-commit hook validates either way.

## Synthesis targets — when to fill them in

The `synthesis_targets` section in the YAML can be `null` initially and
filled in later. The block remains simulatable without any synthesis target
defined; users just can't right-click → "synthesize to op-amp circuit"
until at least the `analog_circuit` rule exists.

For an MVP block: leave all synthesis targets `null` and add them in
follow-up commits as the synthesis engine matures.

## Cross-references

- Architectural invariants: `docs/agent-rules/architecture-invariants.md`
- Block library catalog: `docs/specs/simulator_concept.md` §"Planned Block Library"
- IR-2 schema: `packages/schemas/definitions/ir2/`
- Synthesis matrix: `docs/specs/simulator_concept.md` §"Synthesis Targets — Full Matrix"
