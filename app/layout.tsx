import type { Metadata } from "next";
import "./globals.css";
import "./buylab.css";
import "./rankings.css";

export const metadata: Metadata = { title: "Property Extraction", description: "Private Anchorage fourplex opportunity intelligence" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
