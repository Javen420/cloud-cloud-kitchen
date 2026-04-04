import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import RiderLayout from "../components/rider/RiderLayout";
import OrderListCard from "../components/rider/OrderListCard";
import { getAvailableOrders, getCurrentDriverOrders } from "../services/riderApi";
import { getActiveOrder, getCurrentPosition, getDriverId } from "../lib/driverSession";

export default function AvailableOrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeJob, setActiveJob] = useState(() => getActiveOrder());
  const driverId = getDriverId();
  const latestFetchIdRef = useRef(0);

  async function fetchOrders() {
    const fetchId = latestFetchIdRef.current + 1;
    latestFetchIdRef.current = fetchId;
    setLoading(true);
    setError(null);
    try {
      const { lat, lng } = await getCurrentPosition();
      const data = await getAvailableOrders(lat, lng);
      if (latestFetchIdRef.current !== fetchId) return;
      setOrders(data);
      setError(null);
    } catch (err) {
      if (latestFetchIdRef.current !== fetchId) return;
      setError(err.message);
    } finally {
      if (latestFetchIdRef.current !== fetchId) return;
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchOrders();
  }, []);

  useEffect(() => {
    setActiveJob(getActiveOrder());
  }, []);

  useEffect(() => {
    async function loadCurrentJob() {
      try {
        const currentOrders = await getCurrentDriverOrders(driverId);
        if (!currentOrders.length) return;
        const current = currentOrders[0];
        setActiveJob({
          driverId,
          stage: current.status === "out_for_delivery" ? "delivery" : "pickup",
          order: current,
        });
      } catch {
        // local fallback remains
      }
    }
    if (driverId) loadCurrentJob();
  }, [driverId]);

  function resumeActiveJob() {
    if (!activeJob?.order) return;
    const target =
      activeJob.stage === "delivery"
        ? `/rider/delivery/${activeJob.order.id}`
        : `/rider/pickup/${activeJob.order.id}`;
    navigate(target, { state: { order: activeJob.order } });
  }

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

      {activeJob?.order && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <strong>Current job:</strong> {activeJob.order.id} at {activeJob.order.pickupStore}
          <div style={{ marginTop: "0.75rem" }}>
            <button className="primary-btn" onClick={resumeActiveJob}>
              Resume Current Job
            </button>
          </div>
        </div>
      )}

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
