import { useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import RiderLayout from "../components/rider/RiderLayout";
import ProgressStepper from "../components/rider/ProgressStepper";
import { clearActiveOrder } from "../lib/driverSession";

export default function CompletedPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const order = location.state?.order;

  useEffect(() => {
    clearActiveOrder();
  }, []);

  return (
    <RiderLayout
      title={`Completed - ${id}`}
      subtitle="The delivery has been completed successfully."
    >
      <ProgressStepper currentStep={3} />

      <section className="card success-card">
        <div className="success-icon">✓</div>
        <h2>Delivery Completed</h2>
        <p>
          You have successfully delivered <strong>{id}</strong>
          {order?.customerName ? (
            <>
              {" "}to <strong>{order.customerName}</strong>
            </>
          ) : null}.
        </p>

        {order && (
          <div className="completion-summary">
            <div>
              <span className="label">Payout</span>
              <p>${order.payout.toFixed(2)}</p>
            </div>
            <div>
              <span className="label">Items</span>
              <p>{order.items} items</p>
            </div>
            <div>
              <span className="label">Drop-off</span>
              <p>{order.dropoffAddress}</p>
            </div>
          </div>
        )}

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
