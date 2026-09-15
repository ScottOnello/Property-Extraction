"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GarageDeal } from "@/lib/garage-data";

type LeafletMap = {
  fitBounds: (bounds: Array<[number, number]>, options?: { padding?: [number, number]; maxZoom?: number }) => void;
  setView: (center: [number, number], zoom: number) => void;
  remove: () => void;
};

type LeafletLayer = { addTo: (map: LeafletMap) => LeafletLayer };
type LeafletCircle = LeafletLayer & {
  addTo: (map: LeafletMap) => LeafletCircle;
  bindPopup: (content: string) => LeafletCircle;
};
type LeafletNamespace = {
  map: (element: HTMLElement, options?: Record<string, unknown>) => LeafletMap;
  tileLayer: (url: string, options: Record<string, string | number>) => LeafletLayer;
  circleMarker: (point: [number, number], options: Record<string, string | number | boolean>) => LeafletCircle;
};

declare global {
  interface Window {
    L?: LeafletNamespace;
  }
}

const LEAFLET_SCRIPT_ID = "garage-deals-leaflet-script";
const LEAFLET_STYLE_ID = "garage-deals-leaflet-style";
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);

  return new Promise<LeafletNamespace>((resolve, reject) => {
    let style = document.getElementById(LEAFLET_STYLE_ID) as HTMLLinkElement | null;
    if (!style) {
      style = document.createElement("link");
      style.id = LEAFLET_STYLE_ID;
      style.rel = "stylesheet";
      style.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      style.integrity = "sha256-p4NxAoJBhIINfQfQFqeo6aX48F1UluRI+6oJ5B9nqP8=";
      style.crossOrigin = "";
      document.head.appendChild(style);
    }

    const resolveWhenReady = () => {
      if (window.L) resolve(window.L);
      else reject(new Error("The map library did not load."));
    };
    const existing = document.getElementById(LEAFLET_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", resolveWhenReady, { once: true });
      existing.addEventListener("error", () => reject(new Error("The map library could not be loaded.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = LEAFLET_SCRIPT_ID;
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
    script.crossOrigin = "";
    script.async = true;
    script.addEventListener("load", resolveWhenReady, { once: true });
    script.addEventListener("error", () => reject(new Error("The map library could not be loaded.")), { once: true });
    document.head.appendChild(script);
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function popup(deal: GarageDeal) {
  const location = [deal.City, deal.State, deal.Postal_Code].filter(Boolean).join(", ");
  const price = deal.List_Price ?? deal.Close_Price;
  const priceLabel = deal.List_Price ? "List" : deal.Close_Price ? "Close" : "Price";
  return `<div class="garage-map-popup">
    <strong>${escapeHtml(deal.Address)}</strong>
    <span>${escapeHtml(location)}</span>
    <span>${deal.Units ?? "Multi-family"} ${deal.Units === 1 ? "unit" : "units"} · ${deal.Garage_Spaces} garage ${deal.Garage_Spaces === 1 ? "space" : "spaces"}</span>
    ${price ? `<span>${priceLabel} ${currency.format(price)}</span>` : ""}
    <a href="/analyze?listing=${encodeURIComponent(deal.Listing_Id)}">Analyze this deal →</a>
  </div>`;
}

export default function GarageDealsMap({ deals }: { deals: GarageDeal[] }) {
  const mapElement = useRef<HTMLDivElement>(null);
  const [mapError, setMapError] = useState(false);
  const mappedDeals = useMemo(() => deals.filter((deal) => deal.Latitude !== null && deal.Longitude !== null), [deals]);

  useEffect(() => {
    const element = mapElement.current;
    if (!element || !mappedDeals.length) return;

    let cancelled = false;
    let map: LeafletMap | null = null;
    loadLeaflet().then((L) => {
      if (cancelled) return;
      map = L.map(element, { scrollWheelZoom: false, preferCanvas: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      const bounds: Array<[number, number]> = [];
      for (const deal of mappedDeals) {
        const point: [number, number] = [deal.Latitude!, deal.Longitude!];
        bounds.push(point);
        const marker = L.circleMarker(point, {
          radius: deal.Status.toLowerCase() === "active" ? 6 : 4,
          color: deal.Status.toLowerCase() === "active" ? "#087055" : "#46677b",
          weight: 1.5,
          fillColor: deal.Status.toLowerCase() === "active" ? "#16aa7d" : "#86a2ae",
          fillOpacity: 0.9,
        });
        marker.addTo(map);
        marker.bindPopup(popup(deal));
      }

      if (bounds.length === 1) map.setView(bounds[0], 13);
      else map.fitBounds(bounds, { padding: [34, 34], maxZoom: 12 });
    }).catch(() => setMapError(true));

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [mappedDeals]);

  return <section className="garage-map-panel" aria-labelledby="garage-map-heading">
    <div className="garage-map-toolbar">
      <div><p className="eyebrow">PROPERTY LOCATIONS</p><h2 id="garage-map-heading">Map of garage deals</h2><p>Every pin is an MLS-provided latitude and longitude. Select a pin for the property summary and Buy Lab link.</p></div>
      <div className="garage-map-legend"><span><i className="garage-map-active"/> Active</span><span><i className="garage-map-history"/> Other MLS status</span></div>
    </div>
    {mappedDeals.length ? <><div className="garage-map-count">{mappedDeals.length.toLocaleString()} of {deals.length.toLocaleString()} listed properties have an MLS map location. Scroll to zoom; drag to explore.</div><div ref={mapElement} className="garage-map" aria-label="Interactive map of MLS garage properties"/>{mapError && <p className="garage-map-message">The map tiles are temporarily unavailable. The property list above is still available.</p>}</> : <p className="garage-map-message">No MLS coordinates are available for the current garage-deals list.</p>}
  </section>;
}
