import { getSixplexData } from "@/lib/sixplex-data";
import SixplexClient from "./SixplexClient";

export const metadata = {
  title: "Sixplex Prospects | Property Extraction",
  description: "Private sixplex acquisition research with MLS and public-record evidence.",
};

export default async function SixplexPage() {
  const prospects = await getSixplexData();
  return <SixplexClient generatedAt={prospects.generatedAt} confirmed={prospects.confirmed} review={prospects.review} />;
}
