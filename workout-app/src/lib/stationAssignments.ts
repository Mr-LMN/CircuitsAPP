export type StationAssignmentsInput = unknown;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function sanitiseCodes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((code) => typeof code === 'string' || typeof code === 'number')
      .map((code) => String(code).toUpperCase())
      .filter((code) => code.length > 0);
  }

  if (isPlainObject(value)) {
    return Object.entries(value)
      .filter(([, flag]) => Boolean(flag))
      .map(([code]) => code)
      .filter((code) => code.length > 0)
      .map((code) => code.toUpperCase());
  }

  return [];
}

export function normaliseStationAssignments(
  input: StationAssignmentsInput,
  totalStations?: number
): string[][] {
  const desiredLength = Number.isFinite(totalStations) && (totalStations ?? 0) > 0 ? Number(totalStations) : undefined;

  let fallbackLength = 0;
  if (Array.isArray(input)) {
    fallbackLength = input.length;
  } else if (isPlainObject(input)) {
    const numericKeys = Object.keys(input)
      .map((key) => Number.parseInt(key, 10))
      .filter((value) => Number.isFinite(value) && value >= 0);
    fallbackLength = numericKeys.length ? Math.max(...numericKeys) + 1 : 0;
  }

  const length = desiredLength ?? fallbackLength;
  if (length <= 0) return [];

  return Array.from({ length }, (_, index) => {
    const value = Array.isArray(input)
      ? input[index]
      : isPlainObject(input)
      ? input[index] ?? input[String(index)]
      : [];

    return sanitiseCodes(value);
  });
}

export function serialiseStationAssignments(
  assignments: StationAssignmentsInput,
  totalStations?: number
): Record<string, Record<string, boolean>> {
  const normalised = normaliseStationAssignments(assignments, totalStations);
  return Object.fromEntries(
    normalised.map((codes, index) => [
      String(index),
      Object.fromEntries(codes.map((code) => [code, true]))
    ])
  );
}
