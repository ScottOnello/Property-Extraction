export type DealRating = "good" | "bad";

export type DealSignals = {
  units: number;
  garageSpaces: number | null;
  locationScore: number | null;
  transitCorridor: boolean | null;
  yearBuilt: number | null;
  price: number;
  monthlyCashFlow: number;
  dscr: number;
  tenYearIrr: number;
};

export type DealFeedback = {
  id: string;
  address: string;
  rating: DealRating;
  signals: DealSignals;
  ratedAt: string;
};

export const DEAL_FEEDBACK_STORAGE_KEY = "property-extraction-deal-feedback-v1";

export function readDealFeedback(value: string | null): DealFeedback[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is DealFeedback => {
      if (!item || typeof item !== "object") return false;
      const row = item as Partial<DealFeedback>;
      return typeof row.id === "string" && typeof row.address === "string" &&
        (row.rating === "good" || row.rating === "bad") &&
        Boolean(row.signals && typeof row.signals.units === "number" &&
          typeof row.signals.price === "number" && typeof row.signals.dscr === "number" &&
          typeof row.signals.tenYearIrr === "number" && typeof row.signals.monthlyCashFlow === "number");
    });
  } catch { return []; }
}

export function rateDeal(rows: DealFeedback[], entry: DealFeedback): DealFeedback[] {
  return [...rows.filter((row) => row.id !== entry.id), entry];
}

function closeness(a: number, b: number, scale: number) {
  return Math.max(0, 1 - Math.abs(a - b) / scale);
}

function similarity(a: DealSignals, b: DealSignals) {
  const pieces: Array<[number, number]> = [
    [a.units === b.units ? 1 : closeness(a.units, b.units, 4), 2],
    [closeness(a.price, b.price, Math.max(a.price, b.price, 1)), 1],
    [closeness(a.monthlyCashFlow, b.monthlyCashFlow, 2500), 1.5],
    [closeness(a.dscr, b.dscr, 1.5), 1.5],
    [closeness(a.tenYearIrr, b.tenYearIrr, 20), 1.5],
  ];
  if (a.garageSpaces !== null && b.garageSpaces !== null) pieces.push([a.garageSpaces === b.garageSpaces ? 1 : .35, 1]);
  if (a.locationScore !== null && b.locationScore !== null) pieces.push([closeness(a.locationScore, b.locationScore, 50), 1.5]);
  if (a.transitCorridor !== null && b.transitCorridor !== null) pieces.push([a.transitCorridor === b.transitCorridor ? 1 : 0, 1]);
  if (a.yearBuilt !== null && b.yearBuilt !== null) pieces.push([closeness(a.yearBuilt, b.yearBuilt, 50), .5]);
  return pieces.reduce((sum, [value, weight]) => sum + value * weight, 0) / pieces.reduce((sum, [, weight]) => sum + weight, 0);
}

export function personalDealFit(id: string, signals: DealSignals, feedback: DealFeedback[]) {
  const comparisons = feedback.filter((row) => row.id !== id)
    .map((row) => ({ rating: row.rating, similarity: similarity(signals, row.signals) }))
    .filter((row) => row.similarity >= .55)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 8);
  if (comparisons.length < 2) return { label: "Learning your preferences", detail: `${feedback.length} deal${feedback.length === 1 ? "" : "s"} rated. Rate at least two other deals to see a personalized fit.`, count: comparisons.length, kind: "learning" as const };
  const goodWeight = comparisons.reduce((sum, row) => sum + (row.rating === "good" ? row.similarity : 0), 0);
  const totalWeight = comparisons.reduce((sum, row) => sum + row.similarity, 0);
  const share = goodWeight / totalWeight;
  const label = share >= .65 ? "Likely your kind of deal" : share <= .35 ? "Probably not your kind of deal" : "Mixed fit for your preferences";
  return { label, detail: `Based on ${comparisons.length} similar deal${comparisons.length === 1 ? "" : "s"} you rated on this browser. Your rating of this deal is excluded.`, count: comparisons.length, kind: share >= .65 ? "good" as const : share <= .35 ? "bad" as const : "mixed" as const };
}
