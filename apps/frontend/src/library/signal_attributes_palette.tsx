const ATTRS = ["IC", "signal_specification", "unit_conversion", "probe"] as const;

export function SignalAttributesPalette() {
  return (
    <section className="library-activity" aria-label="Signal attributes palette">
      <header className="library-activity__header">
        <strong>Signal-attributes</strong>
      </header>
      <div className="library-tree">
        <section className="library-tree__section">
          <h3>Signal-attributes</h3>
          {ATTRS.map((name) => (
            <div key={name} className="library-item">
              <span className="library-item__label">{name}</span>
            </div>
          ))}
        </section>
      </div>
    </section>
  );
}

export default SignalAttributesPalette;
