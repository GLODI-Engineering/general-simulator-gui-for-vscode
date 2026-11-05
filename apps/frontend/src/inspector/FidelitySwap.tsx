export interface FidelitySwapProps {
  blockId: string;
  currentFidelity: string;
  tiers: string[];
  onSwap?: (newFidelity: string) => void;
}

export function FidelitySwap({ currentFidelity, tiers, onSwap }: FidelitySwapProps) {
  if (tiers.length === 0) {
    return null;
  }

  return (
    <label className="inspector-field">
      <span>Fidelity</span>
      <select
        className="inspector-field__input"
        aria-label="Fidelity"
        value={currentFidelity}
        disabled={tiers.length < 2}
        onChange={(event) => {
          const next = event.currentTarget.value;
          onSwap?.(next);
        }}
      >
        {tiers.map((tier) => (
          <option key={tier} value={tier}>
            {tier}
          </option>
        ))}
      </select>
    </label>
  );
}

export default FidelitySwap;
