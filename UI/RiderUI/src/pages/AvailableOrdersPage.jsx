import { useEffect, useState } from "react";
import RiderLayout from "../components/rider/RiderLayout";
import OrderListCard from "../components/rider/OrderListCard";
import { getAvailableOrders, haversineKm } from "../services/riderApi";
import { getCurrentPosition } from "../lib/driverSession";

export default function AvailableOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function fetchOrders() {
    setLoading(true);
    setError(null);
    try {
      const data = await getAvailableOrders();
      const { lat, lng } = await getCurrentPosition();
      const withDistance = data.map((o) => ({
        ...o,
        distanceFromRider:
          o.dropoff_lat != null && o.dropoff_lng != null
            ? `${haversineKm(lat, lng, o.dropoff_lat, o.dropoff_lng).toFixed(1)} km`
            : "—",
      }));
      setOrders(withDistance);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchOrders();
  }, []);

  return (
    <RiderLayout
      title="Nearby Available Orders"
      subtitle="These jobs are payment-confirmed and eligible for rider assignment."
    >
      <div className="summary-banner">
        <div>
          <span className="middlebar">Current status</span>
          <p>Online and ready to accept jobs</p>
        </div>
        <div>
          <span className="middlebar">Available jobs</span>
          <p>{loading ? "..." : orders.length}</p>
        </div>
        <div>
          <button className="secondary-btn" onClick={fetchOrders} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ color: "red", marginBottom: "1rem" }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {!loading && !error && orders.length === 0 && (
        <div className="card empty-card">
          <p>No available orders right now. Check back soon.</p>
        </div>
      )}

      <div className="card-grid">
        {orders.map((order) => (
          <OrderListCard key={order.id} order={order} />
        ))}
      </div>
    </RiderLayout>
  );
}
