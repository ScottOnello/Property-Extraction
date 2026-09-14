import type { Metadata } from "next";
import "./globals.css";
import "./buylab.css";
import "./rankings.css";
import "./interpretive.css";
import "./preferences.css";

export const metadata: Metadata = { title: "Property Extraction", description: "Private Alaska multifamily acquisition intelligence", icons: { icon: "/favicon.svg" } };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
