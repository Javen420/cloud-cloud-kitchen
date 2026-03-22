import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import RiderLayout from "../components/rider/RiderLayout";
import ProgressStepper from "../components/rider/ProgressStepper";
import { mockRiderOrders } from "../data/mockRiderOrders";

export default function CompletedPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const order = useMemo(
    () => mockRiderOrders.find((item) => item.id === id),
    [id],
  );

  if (!order) {
    return (
      <RiderLayout title="Order Completed">
        <div className="card success-card">
          <p>Order flow completed.</p>
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
      title={`Completed - ${order.id}`}
      subtitle="The delivery has been completed successfully."
    >
      <ProgressStepper currentStep={3} />

      <section className="card success-card">
        <div className="success-icon">✓</div>
        <h2>Delivery Completed</h2>
        <p>
          You have successfully delivered <strong>{order.id}</strong> to{" "}
          <strong>{order.customerName}</strong>.
        </p>

        <div className="completion-summary">
          <div>
            <span className="label">Payout</span>
            <p>${order.payout.toFixed(2)}</p>
          </div>
          <div>
            <span className="label">Trip Time</span>
            <p>{order.totalEta}</p>
          </div>
          <div>
            <span className="label">Drop-off</span>
            <p>{order.dropoffAddress}</p>
          </div>
        </div>

        <button
          className="primary-btn"
          onClick={() => navigate("/rider/available-orders")}
        >
          Back to Available Orders
        </button>
      </section>
    </RiderLayout>
  );
}
