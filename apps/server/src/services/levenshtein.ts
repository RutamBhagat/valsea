export function levenshtein<T>(left: readonly T[], right: readonly T[]): number {
  let previousDistances = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const currentDistances = [leftIndex];

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      currentDistances.push(
        Math.min(
          currentDistances[rightIndex - 1]! + 1,
          previousDistances[rightIndex]! + 1,
          previousDistances[rightIndex - 1]! +
            (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
        ),
      );
    }

    previousDistances = currentDistances;
  }

  return previousDistances[right.length]!;
}
