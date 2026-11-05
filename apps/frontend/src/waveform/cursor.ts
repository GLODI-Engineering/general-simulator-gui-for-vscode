export function nearestIndex(samples: number[], target: number): number {
  if (samples.length === 0) {
    return -1;
  }
  let bestIndex = 0;
  const firstSample = samples[0];
  if (firstSample === undefined) {
    return -1;
  }
  let bestDistance = Math.abs(firstSample - target);
  for (let index = 1; index < samples.length; index += 1) {
    const sample = samples[index];
    if (sample === undefined) {
      continue;
    }
    const distance = Math.abs(sample - target);
    if (distance < bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
  }
  return bestIndex;
}
