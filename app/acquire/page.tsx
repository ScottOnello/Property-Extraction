import { getPropertyData } from "@/lib/data";
import { getOffMarketCandidates } from "@/lib/off-market-data";
import AcquisitionClient, { type AcquisitionCandidate } from "./AcquisitionClient";
import "./acquire.css";

export const metadata = {
  title: "Fourplex Acquisition | Property Extraction",
  description: "Long-held Anchorage fourplex prospects with garage and zoning verification status.",
};

export default async function AcquisitionPage() {
  const [municipal, offMarket] = await Promise.all([getPropertyData(), getOffMarketCandidates()]);
  const parcels = new Map(municipal.properties.map((property) => [property.parcelId, property]));
  const candidates: AcquisitionCandidate[] = offMarket.candidates
    .filter((candidate) => (candidate.yearsOwned ?? 0) >= 25)
    .map((candidate) => {
      const parcel = parcels.get(candidate.parcelId);
      return {
        parcelId: candidate.parcelId,
        address: candidate.address,
        owner: candidate.owner,
        yearsOwned: candidate.yearsOwned,
        deedDate: candidate.deedDate,
        zoning: parcel?.zoning ?? "",
        assessedValue: candidate.assessedValue,
        score: candidate.score,
        yearBuilt: candidate.yearBuilt,
        inTransitCorridor: parcel?.inTransitCorridor ?? null,
        evidenceUrl: parcel?.evidenceUrl ?? "",
      };
    });
  return <AcquisitionClient candidates={candidates} generatedAt={offMarket.generatedAt}/>;
}
