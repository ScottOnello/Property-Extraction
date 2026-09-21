export default function GoogleLocationMap({
  apiKey,
  latitude,
  longitude,
  address,
  directionsUrl,
}: {
  apiKey: string;
  latitude: number;
  longitude: number;
  address: string;
  directionsUrl: string;
}) {
  const query = new URLSearchParams({
    key: apiKey,
    q: `${latitude},${longitude}`,
    zoom: "12",
    maptype: "roadmap",
  });
  const embedUrl = `https://www.google.com/maps/embed/v1/place?${query.toString()}`;

  return <section id="location-map" className="panel property-location-map">
    <div className="panel-head">
      <div>
        <p className="eyebrow">ANCHORAGE LOCATION</p>
        <h2>Where this property is located</h2>
        <p>{address} shown in relation to the surrounding Anchorage area.</p>
      </div>
      <a className="location-map-link" href={directionsUrl} target="_blank" rel="noreferrer">Open directions ↗</a>
    </div>
    <iframe
      className="property-location-map-frame"
      src={embedUrl}
      title={`Map showing ${address} in Anchorage`}
      loading="lazy"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
    />
  </section>;
}
