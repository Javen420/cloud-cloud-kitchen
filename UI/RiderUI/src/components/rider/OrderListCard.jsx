import { useNavigate } from "react-router-dom";

export default function OrderListCard({ order }) {
  const navigate = useNavigate();

  return (
    <article className="card order-list-card">
      <div className="card-top-row">
        <div>
          <h3>{order.id}</h3>
          <p className="muted">{order.pickupStore}</p>
        </div>
        <div className="price-pill">${order.payout.toFixed(2)}</div>
      </div>

      <div className="order-info-grid">
        <div>
          <span className="label">Pickup</span>
          <p>{order.pickupAddress}</p>
        </div>
        <div>
          <span className="label">Drop-off</span>
          <p>{order.dropoffAddress}</p>
        </div>
        <div>
          <span className="label">To Pickup</span>
          <p>{order.pickupDistanceKm != null ? `${order.pickupDistanceKm} km` : "—"}</p>
        </div>
        <div>
          <span className="label">To Drop-off</span>
          <p>{order.deliveryDistanceKm != null ? `${order.deliveryDistanceKm} km` : "—"}</p>
        </div>
      </div>

      <button
        className="primary-btn"
        onClick={() => navigate(`/rider/order/${order.id}`, { state: { order } })}
      >
        View Details
      </button>
    </article>
  );
}
