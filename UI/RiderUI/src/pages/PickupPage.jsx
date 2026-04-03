import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import RiderLayout from "../components/rider/RiderLayout";
import ProgressStepper from "../components/rider/ProgressStepper";
import DetailRow from "../components/rider/DetailRow";
import RoutePanel from "../components/rider/RoutePanel";
import { getEtaTracking } from "../services/etaTrackingApi";
import { markPickedUp } from "../services/riderApi";
import { getDriverId, getCurrentPosition } from "../lib/driverSession";

export default function PickupPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const order = location.state?.order;

  const [etaData, setEtaData] = useState(null);
  const [loadingEta, setLoadingEta] = useState(true);
  const [etaError, setEtaError] = useState(null);
  const [driverCoords, setDriverCoords] = useState(null);
  const [pickingUp, setPickingUp] = useState(false);
  const [pickupError, setPickupError] = useState(null);

  useEffect(() => {
    async function loadEta() {
      setLoadingEta(true);
      setEtaError(null);
      try {
        const driverId = getDriverId();
        const { lat, lng } = await getCurrentPosition();
        setDriverCoords({ lat, lng });
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

  async function handlePickupComplete() {
    setPickingUp(true);
    setPickupError(null);
    try {
      await markPickedUp({
        orderId: order.id,
        driverId: getDriverId(),
      });
      navigate(`/rider/delivery/${order.id}`, { state: { order } });
    } catch (err) {
      setPickupError(err.message);
    } finally {
      setPickingUp(false);
    }
  }

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

          {pickupError && (
            <p style={{ color: "red", fontSize: "0.85rem" }}>
              Pickup error: {pickupError}
            </p>
          )}

          <div className="action-row">
            <button
              className="secondary-btn"
              onClick={() => navigate(`/rider/order/${order.id}`, { state: { order } })}
              disabled={pickingUp}
            >
              Back
            </button>
            <button
              className="primary-btn"
              onClick={handlePickupComplete}
              disabled={pickingUp}
            >
              {pickingUp ? "Updating..." : "Confirm Picked Up"}
            </button>
          </div>
        </section>

        <RoutePanel
          title="Route to Pickup"
          eta={loadingEta ? "Calculating..." : etaLabel}
          from="Current rider location"
          to={order.pickupAddress}
          mapFrom={driverCoords ? `${driverCoords.lat},${driverCoords.lng}` : null}
          mapTo={order.pickupAddress}
          distanceKm={
            etaData?.distance_meters != null
              ? etaData.distance_meters / 1000
              : null
          }
          source={etaError ? `Unavailable: ${etaError}` : etaData?.source}
        />
      </div>
    </RiderLayout>
  );
}
