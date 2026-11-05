# Buck converter direct ngspice demo

This demo exercises the path requested for schematic-driven circuit simulation:

```text
schematic document -> embedded SPICE netlist -> kernel-sidecar -> ngspice -> waveform viewer
```

It deliberately does **not** route the buck case through IR lowering.

## Files

| File | Purpose |
|---|---|
| `buck_converter.gsim_sch` | Saved frontend schematic document. Contains `model.metadata.spice_netlist` and visually shows the PULSE gate source plus 4-terminal voltage-controlled switch. |
| `buck_converter.sp` | Direct SPICE netlist executed by ngspice; includes `Vgate gate 0 PULSE(...)` and `Ssw vin sw gate 0 SWMOD`. |
| `backend_result/` | Kernel-sidecar waveform result copied from the direct netlist run. |
| `buck_waveform_summary.json` | Numeric min/max/final summary from real ngspice data. |
| `buck_vout_samples.csv` | 1000 sampled `v(out)` points. |
| `frontend_buck_schematic.png` | Frontend schematic screenshot. |
| `frontend_buck_waveform.png` | Frontend waveform viewer screenshot showing real backend data. |

## Solver

ngspice binary used:

```text
/mnt/external_drive/Github Works/Électronique/tools/ngspice-46/bin/ngspice
```

## Result summary

See `buck_waveform_summary.json` for exact values. The run produced 18,608 points with signals:

- `v(out)`
- `v(sw)`
- `i(l1)`
