import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import RiderLayout from "../components/rider/RiderLayout";
import ProgressStepper from "../components/rider/ProgressStepper";
import DetailRow from "../components/rider/DetailRow";
import { getEtaTracking } from "../services/etaTrackingApi";
import { getDriverId, getCurrentPosition } from "../lib/driverSession";

export default function PickupPage() {
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
    : etaError
      ? "Unavailable"
      : "Calculating...";

  return (
    <RiderLayout
      title={`Pickup - ${order.id}`}
      subtitle="Proceed to the pickup location and collect the order."
    >
      <ProgressStepper currentStep={1} />

      <div className="two-column-layout">
        <section className="card details-card">
          <DetailRow label="Store" value={order.pickupStore} />
          <DetailRow label="Pickup Address" value={order.pickupAddress} />
          <DetailRow label="Order Code" value={order.orderCode} />
          <DetailRow label="Instruction" value={order.pickupInstruction} />

          <div className="action-row">
            <button
              className="secondary-btn"
              onClick={() => navigate(`/rider/order/${order.id}`, { state: { order } })}
            >
              Back
            </button>
            <button
              className="primary-btn"
              onClick={() => navigate(`/rider/delivery/${order.id}`, { state: { order } })}
            >
              Confirm Picked Up
            </button>
          </div>
        </section>

        <section className="card route-panel">
          <h3>Route to Pickup</h3>
          {loadingEta && <p>Loading ETA...</p>}
          {etaError && <p style={{ color: "orange" }}>ETA unavailable: {etaError}</p>}
          {etaData && (
            <div className="completion-summary">
              <div>
                <span className="label">ETA to Dropoff</span>
                <p>{etaLabel}</p>
              </div>
              <div>
                <span className="label">Distance</span>
                <p>
                  {etaData.distance_meters != null
                    ? `${(etaData.distance_meters / 1000).toFixed(1)} km`
                    : "—"}
                </p>
              </div>
              <div>
                <span className="label">Source</span>
                <p>{etaData.source || "—"}</p>
              </div>
            </div>
          )}

          <div className="fake-map">
            <div className="route-box">
              <div className="route-point start" />
              <div className="route-line" />
              <div className="route-point end" />
            </div>
            <p className="map-caption">Map preview placeholder</p>
          </div>
        </section>
      </div>
    </RiderLayout>
  );
}
