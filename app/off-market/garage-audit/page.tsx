import { getOffMarketCandidates } from "@/lib/off-market-data";
import GarageAuditClient from "./GarageAuditClient";
import "./garage-audit.css";

export const metadata = {
  title: "Garage Visual Audit | Property Extraction",
  description: "Address-by-address Street View audit of off-market Anchorage fourplex garage visibility.",
};

export const dynamic = "force-dynamic";

export default async function GarageAuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { candidates } = await getOffMarketCandidates();
  const query = await searchParams;
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const apiKey = process.env.Google_Maps_API?.trim() ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? "";
  return <GarageAuditClient candidates={candidates} apiKey={apiKey} initialPage={page}/>;
}
