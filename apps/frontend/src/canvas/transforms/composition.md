# Transform Composition

Canonical form in v1:

- Rotation stays in `0 | 90 | 180 | 270`.
- Mirror stays in `none | x | y`.
- Applying the same mirror axis twice returns to `none`.
- Rotation updates block-local orientation; mirror remains a separate flag.
