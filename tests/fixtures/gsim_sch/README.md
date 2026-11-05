# comprehensive.gsim_sch fixture (FE-63)

This fixture is the shared FE-63 / BE-41 end-to-end model.

It intentionally includes at least one example of each required v2 feature:

- signal-flow and physical-network blocks
- converters
- goto/from pair
- nested subsystem (depth 2)
- annotations (text/polyline/rect/ellipse)
- expression parameter
- multi-analysis simulation

Used by:

- `apps/frontend/src/persistence/roundtrip.test.ts`
- `tests/backend/e2e/test_v2_comprehensive.py`
