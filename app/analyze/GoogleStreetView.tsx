"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";

type StreetViewMaps = {
  StreetViewService: new () => {
    getPanorama: (request: { location: { lat: number; lng: number }; radius: number }, callback: (data: unknown, status: string) => void) => void;
  };
  StreetViewPanorama: new (element: HTMLElement, options: Record<string, unknown>) => unknown;
  StreetViewStatus: { OK: string };
};

declare global {
  interface Window {
    google?: { maps?: StreetViewMaps };
  }
}

function loadGoogleMaps(apiKey: string) {
  if (window.google?.maps?.StreetViewPanorama) return Promise.resolve(window.google.maps);

  return new Promise<StreetViewMaps>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-property-extraction-google-maps="true"]');
    if (existing) {
      existing.addEventListener("load", () => window.google?.maps ? resolve(window.google.maps) : reject(new Error("Google Maps did not load.")), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google Maps could not load.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.dataset.propertyExtractionGoogleMaps = "true";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.async = true;
    script.onload = () => window.google?.maps ? resolve(window.google.maps) : reject(new Error("Google Maps did not load."));
    script.onerror = () => reject(new Error("Google Maps could not load."));
    document.head.appendChild(script);
  });
}

export default function GoogleStreetView({
  apiKey,
  latitude,
  longitude,
  address,
  streetViewUrl,
  fallbackImage,
  fallbackLabel,
}: {
  apiKey: string;
  latitude: number;
  longitude: number;
  address: string;
  streetViewUrl: string;
  fallbackImage: string;
  fallbackLabel: string;
}) {
  const canvas = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");

  useEffect(() => {
    let cancelled = false;
    const position = { lat: latitude, lng: longitude };

    loadGoogleMaps(apiKey)
      .then((maps) => {
        const service = new maps.StreetViewService();
        service.getPanorama({ location: position, radius: 1200 }, (_data, result) => {
          if (cancelled) return;
          if (result !== maps.StreetViewStatus.OK || !canvas.current) {
            setStatus("unavailable");
            return;
          }

          new maps.StreetViewPanorama(canvas.current, {
            position,
            pov: { heading: 0, pitch: 0 },
            zoom: 0,
            addressControl: false,
            fullscreenControl: true,
            motionTracking: false,
            panControl: false,
            zoomControl: true,
            linksControl: true,
            showRoadLabels: false,
          });
          setStatus("ready");
        });
      })
      .catch(() => {
        if (!cancelled) setStatus("unavailable");
      });

    return () => { cancelled = true; };
  }, [apiKey, latitude, longitude]);

  if (status === "unavailable") return <a className="listing-primary-image" href={streetViewUrl} target="_blank" rel="noreferrer">
    {fallbackImage ? <img src={fallbackImage} alt={`Property view of ${address}`} /> : <div className="image-missing">Property imagery unavailable</div>}
    <span>{fallbackLabel}</span>
    <strong className="street-view-badge">Open Google Street View ↗</strong>
  </a>;

  return <div className="listing-primary-image google-street-view" aria-label={`Interactive Google Street View for ${address}`}>
    <div ref={canvas} className="google-street-view-canvas" />
    {status === "loading" && <div className="google-street-view-loading">Loading Google Street View…</div>}
    <span>Google Street View · interactive</span>
    <a className="street-view-badge" href={streetViewUrl} target="_blank" rel="noreferrer">Open in Google Maps ↗</a>
  </div>;
}
