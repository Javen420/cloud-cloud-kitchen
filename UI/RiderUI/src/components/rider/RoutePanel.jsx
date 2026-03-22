export default function RoutePanel({ title, eta, from, to }) {
  return (
    <section className="card route-panel">
      <div className="route-header">
        <div>
          <h3>{title}</h3>
          <p className="muted">Estimated travel time: {eta}</p>
        </div>
        <div className="eta-badge">{eta}</div>
      </div>

      <div className="fake-map">
        <div className="route-box">
          <div className="route-point start" />
          <div className="route-line" />
          <div className="route-point end" />
        </div>
        <p className="map-caption">Map preview placeholder</p>
      </div>

      <div className="route-addresses">
        <div>
          <span className="label">From</span>
          <p>{from}</p>
        </div>
        <div>
          <span className="label">To</span>
          <p>{to}</p>
        </div>
      </div>
    </section>
  );
}
