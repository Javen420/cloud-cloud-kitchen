import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import RiderLayout from "../components/rider/RiderLayout";
import ProgressStepper from "../components/rider/ProgressStepper";
import DetailRow from "../components/rider/DetailRow";
import { mockRiderOrders } from "../data/mockRiderOrders";
import { getMockEtaTracking } from "../services/etaTrackingApi";

export default function PickupPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [etaData, setEtaData] = useState(null);
  const [loadingEta, setLoadingEta] = useState(true);

  const order = useMemo(
    () => mockRiderOrders.find((item) => item.id === id),
    [id],
  );

  useEffect(() => {
    async function loadEta() {
      try {
        setLoadingEta(true);
        const data = await getMockEtaTracking(id, "pickup");
        setEtaData(data);
      } catch (error) {
        console.error(error);
      } finally {
        setLoadingEta(false);
      }
    }

    loadEta();
  }, [id]);

  if (!order) {
    return <div>Order not found.</div>;
  }

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
              onClick={() => navigate(`/rider/order/${order.id}`)}
            >
              Back
            </button>
            <button
              className="primary-btn"
              onClick={() => navigate(`/rider/delivery/${order.id}`)}
            >
              Confirm Picked Up
            </button>
          </div>
        </section>

        <section className="card route-panel">
          <h3>Route to Pickup</h3>
          {loadingEta ? (
            <p>Loading ETA...</p>
          ) : etaData ? (
            <>
              <div className="completion-summary">
                <div>
                  <span className="label">From</span>
                  <p>{etaData.fromLabel}</p>
                </div>
                <div>
                  <span className="label">To</span>
                  <p>{etaData.toLabel}</p>
                </div>
                <div>
                  <span className="label">Distance</span>
                  <p>{etaData.distanceKm} km</p>
                </div>
                <div>
                  <span className="label">Duration</span>
                  <p>{etaData.durationMinutes} mins</p>
                </div>
                <div>
                  <span className="label">Source</span>
                  <p>{etaData.source}</p>
                </div>
              </div>

              <div className="fake-map">
                Backend-provided route preview placeholder
              </div>
            </>
          ) : (
            <p>ETA unavailable.</p>
          )}
        </section>
      </div>
    </RiderLayout>
  );
}
