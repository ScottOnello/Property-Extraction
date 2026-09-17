import { getOffMarketCandidates } from "@/lib/off-market-data";
import OffMarketClient from "./OffMarketClient";
import "./off-market.css";

export const metadata = {
  title: "Off-Market Candidates | Property Extraction",
  description: "Map-first screening workspace for long-held Anchorage fourplex candidates.",
};

export default async function OffMarketPage() {
  const data = await getOffMarketCandidates();
  return <OffMarketClient {...data}/>;
}
