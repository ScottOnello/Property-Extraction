export default function GoogleStreetView({
  apiKey,
  latitude,
  longitude,
  address,
  streetViewUrl,
}: {
  apiKey: string;
  latitude: number;
  longitude: number;
  address: string;
  streetViewUrl: string;
  fallbackImage: string;
  fallbackLabel: string;
}) {
  const query = new URLSearchParams({
    key: apiKey,
    location: `${latitude},${longitude}`,
    pitch: "0",
    fov: "90",
  });
  const embedUrl = `https://www.google.com/maps/embed/v1/streetview?${query.toString()}`;

  return <div className="listing-primary-image google-street-view" aria-label={`Interactive Google Street View for ${address}`}>
    <iframe
      className="google-street-view-canvas"
      src={embedUrl}
      title={`Google Street View for ${address}`}
      loading="lazy"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
    />
    <span>Google Street View · free interactive embed</span>
    <a className="street-view-badge" href={streetViewUrl} target="_blank" rel="noreferrer">Open in Google Maps ↗</a>
  </div>;
}
