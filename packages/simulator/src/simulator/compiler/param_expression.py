"""Restricted expression evaluator for .gsim_sch v2 param tables (BE-30).

Grammar (§5.2):
  operators  : + - * / ** (power), unary + -
  grouping   : ( )
  functions  : sin cos tan exp log log10 sqrt abs min max pow
  constants  : pi e
  identifiers: resolve to other params in the table

Prohibited: attribute access, subscripts, comparisons, conditionals,
string ops, function definitions, __-prefixed names.
"""

from __future__ import annotations

import ast
import math
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_ALLOWED_CALLS: frozenset[str] = frozenset(
    {"sin", "cos", "tan", "exp", "log", "log10", "sqrt", "abs", "min", "max", "pow"}
)

_CONSTANTS: dict[str, float] = {"pi": math.pi, "e": math.e}

# AST node types permitted anywhere in a param expression.
_ALLOWED_NODE_TYPES: tuple[type[ast.AST], ...] = (
    ast.Expression,
    ast.BinOp,
    ast.UnaryOp,
    ast.Call,
    ast.Name,
    ast.Constant,
    # Operators
    ast.Add,
    ast.Sub,
    ast.Mult,
    ast.Div,
    ast.Pow,
    ast.UAdd,
    ast.USub,
    # Name context (yielded by iter_child_nodes in CPython)
    ast.Load,
)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


@dataclass
class _ParamEntry:
    numeric: float | None  # set for numeric literals; None for expressions/refs
    tree: ast.Expression | None  # parsed AST; set for expressions and refs
    deps: list[str]  # direct param dependencies (excludes constants)


def _check_ast(node: ast.AST) -> None:
    """Raise SyntaxError if *node* or any descendant uses a disallowed construct."""
    if not isinstance(node, _ALLOWED_NODE_TYPES):
        raise SyntaxError(
            f"Disallowed expression construct: {type(node).__name__}",
            ("<param_expr>", 0, 0, None),
        )
    if isinstance(node, ast.Constant) and (
        not isinstance(node.value, int | float) or isinstance(node.value, bool)
    ):
        raise SyntaxError(
            f"Non-numeric constant {node.value!r} is not allowed in param expressions",
            ("<param_expr>", 0, 0, None),
        )
    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name):
            raise SyntaxError(
                "Attribute access or subscript in function call is not allowed",
                ("<param_expr>", 0, 0, None),
            )
        if node.func.id not in _ALLOWED_CALLS:
            raise SyntaxError(
                f"Disallowed function: {node.func.id!r}",
                ("<param_expr>", 0, 0, None),
            )
        if node.keywords:
            raise SyntaxError(
                "Keyword arguments are not allowed in param expressions",
                ("<param_expr>", 0, 0, None),
            )
    if isinstance(node, ast.Name) and node.id.startswith("__"):
        raise SyntaxError(
            f"Disallowed identifier: {node.id!r}",
            ("<param_expr>", 0, 0, None),
        )
    for child in ast.iter_child_nodes(node):
        _check_ast(child)


def _parse_expr(expr_str: str) -> ast.Expression:
    """Parse *expr_str* and validate it; return the AST.

    Raises SyntaxError on any disallowed construct.
    """
    try:
        tree = ast.parse(expr_str, mode="eval")
    except SyntaxError as exc:
        raise SyntaxError(
            f"Parse error in param expression {expr_str!r}: {exc}",
            ("<param_expr>", 0, 0, None),
        ) from exc
    _check_ast(tree.body)
    return tree


def _collect_deps(tree: ast.Expression) -> list[str]:
    """Return all Name ids that are not allowed-call names or known constants."""
    return [
        node.id
        for node in ast.walk(tree)
        if isinstance(node, ast.Name)
        and node.id not in _ALLOWED_CALLS
        and node.id not in _CONSTANTS
    ]


def _eval_expr(tree: ast.Expression, env: dict[str, float]) -> float:
    """Evaluate a pre-validated expression AST against *env*.

    Only the allowed math functions / constants + resolved param values are
    in scope.  ``__builtins__`` is suppressed so no builtin is reachable.
    """
    ns: dict[str, Any] = {
        "sin": math.sin,
        "cos": math.cos,
        "tan": math.tan,
        "exp": math.exp,
        "log": math.log,
        "log10": math.log10,
        "sqrt": math.sqrt,
        "abs": abs,
        "min": min,
        "max": max,
        "pow": pow,
        "pi": math.pi,
        "e": math.e,
    }
    ns.update(env)
    # Safe: AST validated by _check_ast before this call; builtins suppressed.
    return float(eval(compile(tree, "<param_expr>", "eval"), {"__builtins__": {}}, ns))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def evaluate_param_value(
    value: Any,
    resolve_identifier: Callable[[str], float],
) -> float:
    """Evaluate one param value using *resolve_identifier* for names.

    Supported value forms are the same as :func:`resolve_params`:

    * number  -> converted to ``float``
    * ``"{expr}"`` -> evaluated expression
    * ``"name"`` -> identifier reference

    Raises ``SyntaxError`` for disallowed expression constructs and
    ``ValueError`` for unsupported value types.
    """
    if isinstance(value, bool):
        raise ValueError("Boolean value is not allowed; use a number.")
    if isinstance(value, int | float):
        return float(value)
    if not isinstance(value, str):
        raise ValueError(f"Unexpected param value type {type(value).__name__!r}")

    expr_str = value[1:-1] if value.startswith("{") and value.endswith("}") else value
    tree = _parse_expr(expr_str)
    deps = _collect_deps(tree)
    env = {dep: float(resolve_identifier(dep)) for dep in deps}
    return _eval_expr(tree, env)


def resolve_params(raw_params: list[dict[str, Any]]) -> dict[str, float]:
    """Resolve a param table to a ``name → float`` mapping.

    Each entry in *raw_params* must have at minimum ``"name"`` and ``"value"``
    keys, following the three value forms in §5.1:

    * JSON number  → numeric literal
    * ``"{expr}"`` → expression string (evaluated against resolved table)
    * ``"name"``   → identifier reference (resolves to another param's value)

    Raises:
        SyntaxError: if any expression uses a disallowed construct.
        ValueError:  if a cycle is detected (message: "Param cycle: a -> b -> a")
                     or an identifier reference cannot be resolved.
    """
    # --- Step 1: parse all entries ----------------------------------------
    entries: dict[str, _ParamEntry] = {}
    for entry in raw_params:
        name: str = entry["name"]
        value: Any = entry["value"]

        if isinstance(value, bool):
            raise ValueError(f"Param {name!r}: boolean value is not allowed; use a number.")
        if isinstance(value, int | float):
            entries[name] = _ParamEntry(numeric=float(value), tree=None, deps=[])
        elif isinstance(value, str) and value.startswith("{") and value.endswith("}"):
            expr_str = value[1:-1]
            tree = _parse_expr(expr_str)
            deps = [d for d in _collect_deps(tree) if d != name]
            entries[name] = _ParamEntry(numeric=None, tree=tree, deps=deps)
        elif isinstance(value, str):
            # Plain identifier reference: treat as a single-name expression.
            tree = _parse_expr(value)
            deps = [d for d in _collect_deps(tree) if d != name]
            entries[name] = _ParamEntry(numeric=None, tree=tree, deps=deps)
        else:
            raise ValueError(f"Param {name!r}: unexpected value type {type(value).__name__!r}")

    # --- Step 2: topological resolution with DFS cycle detection ----------
    resolved: dict[str, float] = {}
    visiting: set[str] = set()

    def _resolve(name: str, path: list[str]) -> float:
        if name in resolved:
            return resolved[name]
        if name in _CONSTANTS:
            return _CONSTANTS[name]
        if name not in entries:
            raise ValueError(f"Undefined param reference: {name!r}")
        if name in visiting:
            cycle = " -> ".join([*path, name])
            raise ValueError(f"Param cycle: {cycle}")

        visiting.add(name)
        entry = entries[name]

        if entry.numeric is not None:
            result = entry.numeric
        else:
            assert entry.tree is not None  # invariant: tree set when numeric is None
            env = {dep: _resolve(dep, [*path, name]) for dep in entry.deps}
            result = _eval_expr(entry.tree, env)

        visiting.discard(name)
        resolved[name] = result
        return result

    for pname in entries:
        _resolve(pname, [])

    return resolved
