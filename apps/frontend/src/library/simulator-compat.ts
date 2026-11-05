export interface SimulatorCompat {
  id: string;
  label: string;
  supported: string[];
}

export interface SimulatorCompatMap {
  simulators: SimulatorCompat[];
}

// Inline data derived from simulator-compat.yaml to avoid runtime YAML parsing in the browser.
//
// v1 ships general-simulator as the only target. `supported` is every type in
// gsim-core's netlist-compiler registry (crates/gsim-core/src/compile/spec.rs)
// except the internal `spice-subckt.boundary` pseudo-block.
const COMPAT_DATA: SimulatorCompatMap = {
  simulators: [
    {
      id: "general-simulator",
      label: "General Simulator",
      supported: [
        // Structural / routing
        "routing.ground",
        "routing.goto",
        "routing.from",
        // Passives
        "passive.resistor",
        "passive.capacitor",
        "passive.inductor",
        // Independent sources
        "source.voltage.dc",
        "source.voltage.sin",
        "source.current.dc",
        // Dependent sources
        "source.dependent.vcvs",
        "source.dependent.vccs",
        "source.dependent.cccs",
        "source.dependent.ccvs",
        // Switching devices
        "passive.switch.ideal",
        "passive.diode.ideal",
        // Signal <-> physical converters
        "converter.sig2phys",
        "converter.phys2sig",
        // Signal sources
        "source.const",
        "source.time",
        "source.sinwave",
        "source.pulsewave",
        "source.expwave",
        "source.sffmwave",
        // PWM modulators
        "power.pwm1",
        "power.pwm2",
        // Control
        "control.gain",
        "control.saturation",
        "control.vco",
        "control.integrator",
        "control.derivative",
        "control.delay",
        "control.sum",
        "control.product",
        "control.pid",
        "control.counter",
        // Linear dynamics
        "control.state_space",
        "control.discrete_state_space",
        "control.transfer_function",
        "control.discrete_transfer_function",
        // Coordinate transforms
        "control.transform.clarke",
        "control.transform.clarke_inv",
        "control.transform.park",
        "control.transform.park_inv",
        "control.transform.clarke_park",
        "control.transform.clarke_park_inv",
        // Machines
        "machine.pmsm",
        // Math
        "math.table_lookup",
        "math.fn1",
        "math.fn2",
        "math.fn3",
        // Logic
        "logic.hysteresis",
        "logic.gate",
        "logic.sr_latch",
        "logic.flip_flop",
        // Script-hosted blocks
        "extensibility.cscript",
        "extensibility.pyblock",
        "extensibility.pyfunc",
        "extensibility.octfunc",
        "extensibility.octblock",
      ],
    },
  ],
};

export function loadSimulatorCompat(): SimulatorCompatMap {
  return COMPAT_DATA;
}
