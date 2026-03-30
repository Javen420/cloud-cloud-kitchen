import { useState, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import RiderLayout from "../components/rider/RiderLayout";
import DetailRow from "../components/rider/DetailRow";
import { assignDriver } from "../services/riderApi";
import { initAndGetEta } from "../services/etaTrackingApi";
import { getDriverId, getCurrentPosition } from "../lib/driverSession";

export default function RiderOrderDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Order is passed via router state from AvailableOrdersPage
  const order = location.state?.order;

  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState(null);
  const [etaData, setEtaData] = useState(null);
  const [loadingEta, setLoadingEta] = useState(true);

  useEffect(() => {
    if (!order) return;
    async function loadEta() {
      setLoadingEta(true);
      try {
        const driverId = getDriverId();
        const { lat, lng } = await getCurrentPosition();
        const data = await initAndGetEta({
          orderId: id,
          driverId,
          customerId: order.customerName || "",
          driverLat: lat,
          driverLng: lng,
          dropoffLat: order.dropoff_lat,
          dropoffLng: order.dropoff_lng,
        });
        setEtaData(data);
      } catch {
        // ETA is non-critical — silently fall back to "Calculating..."
      } finally {
        setLoadingEta(false);
      }
    }
    loadEta();
  }, [id, order]);

  async function handleAccept() {
    setAccepting(true);
    setAcceptError(null);
    try {
      const driverId = getDriverId();
      const { lat, lng } = await getCurrentPosition();

      await assignDriver({
        orderId: id,
        driverId,
        driverLat: lat,
        driverLng: lng,
        dropoffLat: order.dropoff_lat,
        dropoffLng: order.dropoff_lng,
      });

      // Pass the accepted order to pickup page via state so it's available without re-fetch
      navigate(`/rider/pickup/${id}`, { state: { order } });
    } catch (err) {
      setAcceptError(err.message);
    } finally {
      setAccepting(false);
    }
  }

  if (!order) {
    return (
      <RiderLayout
        title="Order Not Found"
        subtitle="The selected order could not be found."
      >
        <div className="card empty-card">
          <p>Order data unavailable. Return to the orders list.</p>
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

  return (
    <RiderLayout
      title={`Order Details - ${order.id}`}
      subtitle="Review the delivery details before accepting the job."
    >
      <section className="card details-card">
        <DetailRow label="Store" value={order.pickupStore} />
        <DetailRow label="Pickup Address" value={order.pickupAddress} />
        <DetailRow label="Drop-off Address" value={order.dropoffAddress} />
        <DetailRow label="Customer" value={order.customerName} />
        <DetailRow label="Items" value={`${order.items} items`} />
        <DetailRow label="Payout" value={`$${order.payout.toFixed(2)}`} />
        <DetailRow
          label="Distance From Rider"
          value={
            etaData?.distance_meters != null
              ? `${(etaData.distance_meters / 1000).toFixed(1)} km`
              : loadingEta ? "Calculating..." : "Unavailable"
          }
        />
        <DetailRow
          label="ETA to Dropoff"
          value={
            etaData?.estimated_minutes != null
              ? `${etaData.estimated_minutes} mins`
              : loadingEta ? "Calculating..." : "Unavailable"
          }
        />

        {acceptError && (
          <p style={{ color: "red", marginTop: "0.5rem" }}>
            <strong>Error:</strong> {acceptError}
          </p>
        )}

        <div className="action-row">
          <button
            className="secondary-btn"
            onClick={() => navigate("/rider/available-orders")}
            disabled={accepting}
          >
            Back
          </button>
          <button
            className="primary-btn"
            onClick={handleAccept}
            disabled={accepting}
          >
            {accepting ? "Accepting..." : "Accept Order"}
          </button>
        </div>
      </section>
    </RiderLayout>
  );
}
