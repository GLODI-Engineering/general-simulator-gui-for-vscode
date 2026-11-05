type Props = {
  block: { id: string; type: string; params: Record<string, unknown> };
  onChange?: (params: Record<string, unknown>) => void;
};

const KNOWN_UNITS = new Set([
  "s",
  "ms",
  "us",
  "ns",
  "V",
  "mV",
  "A",
  "mA",
  "Hz",
  "kHz",
  "MHz",
  "rad",
  "deg",
  "m",
  "cm",
  "mm",
]);

function isKnownUnit(unit: string): boolean {
  return unit === "" || KNOWN_UNITS.has(unit);
}

export function UnitConversionInspector({ block, onChange }: Props) {
  const fromUnit = String(block.params.from_unit ?? "");
  const toUnit = String(block.params.to_unit ?? "");
  const unknown = !isKnownUnit(fromUnit) || !isKnownUnit(toUnit);

  return (
    <div className="unit-conversion-inspector">
      <div className="inspector-field">
        <label className="inspector-label" htmlFor={`uc-from-${block.id}`}>
          From unit
        </label>
        <input
          id={`uc-from-${block.id}`}
          aria-label="from unit"
          type="text"
          className={`inspector-input${!isKnownUnit(fromUnit) ? " inspector-input--error" : ""}`}
          defaultValue={fromUnit}
          onBlur={(ev) => onChange?.({ ...block.params, from_unit: ev.currentTarget.value })}
        />
      </div>

      <div className="inspector-field">
        <label className="inspector-label" htmlFor={`uc-to-${block.id}`}>
          To unit
        </label>
        <input
          id={`uc-to-${block.id}`}
          aria-label="to unit"
          type="text"
          className={`inspector-input${!isKnownUnit(toUnit) ? " inspector-input--error" : ""}`}
          defaultValue={toUnit}
          onBlur={(ev) => onChange?.({ ...block.params, to_unit: ev.currentTarget.value })}
        />
      </div>

      {unknown ? (
        <span className="inspector-error" role="alert">
          Unknown unit
        </span>
      ) : null}
    </div>
  );
}

export default UnitConversionInspector;
