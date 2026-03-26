import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import RiderLayout from "../components/rider/RiderLayout";
import ProgressStepper from "../components/rider/ProgressStepper";
import DetailRow from "../components/rider/DetailRow";
import RoutePanel from "../components/rider/RoutePanel";
import { getEtaTracking } from "../services/etaTrackingApi";
import { getDriverId, getCurrentPosition } from "../lib/driverSession";

export default function DeliveryPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const order = location.state?.order;

  const [etaData, setEtaData] = useState(null);
  const [loadingEta, setLoadingEta] = useState(true);
  const [etaError, setEtaError] = useState(null);

  useEffect(() => {
    async function loadEta() {
      setLoadingEta(true);
      setEtaError(null);
      try {
        const driverId = getDriverId();
        const { lat, lng } = await getCurrentPosition();
        const data = await getEtaTracking(id, lat, lng, driverId);
        setEtaData(data);
      } catch (err) {
        setEtaError(err.message);
      } finally {
        setLoadingEta(false);
      }
    }

    loadEta();
  }, [id]);

  if (!order) {
    return (
      <RiderLayout title="Order Not Found">
        <div className="card empty-card">
          <p>Order data unavailable.</p>
          <button
            className="primary-btn"
            onClick={() => navigate("/rider/available-orders")}
          >
            Back to Orders
          </button>
        </div>
      </RiderLayout>
    );
  }

  const etaLabel = etaData
    ? `${etaData.estimated_minutes} mins`
    : loadingEta
      ? "Calculating..."
      : "Unavailable";

  return (
    <RiderLayout
      title={`On Delivery - ${order.id}`}
      subtitle="Deliver the order to the customer and confirm completion."
    >
      <ProgressStepper currentStep={2} />

      <div className="two-column-layout">
        <section className="card details-card">
          <DetailRow label="Customer" value={order.customerName} />
          <DetailRow label="Drop-off Address" value={order.dropoffAddress} />
          <DetailRow
            label="ETA to Customer"
            value={etaError ? "Unavailable" : etaLabel}
          />
          <DetailRow label="Payout" value={`$${order.payout.toFixed(2)}`} />
          <DetailRow label="Order Code" value={order.orderCode} />

          {etaError && (
            <p style={{ color: "orange", fontSize: "0.85rem" }}>
              ETA error: {etaError}
            </p>
          )}

          <div className="action-row">
            <button
              className="secondary-btn"
              onClick={() => navigate(`/rider/pickup/${order.id}`, { state: { order } })}
            >
              Back
            </button>
            <button
              className="primary-btn"
              onClick={() => navigate(`/rider/completed/${order.id}`, { state: { order } })}
            >
              Confirm Delivered
            </button>
          </div>
        </section>

        <RoutePanel
          title="Route to Customer"
          eta={etaLabel}
          from={order.pickupAddress}
          to={order.dropoffAddress}
        />
      </div>
    </RiderLayout>
  );
}
