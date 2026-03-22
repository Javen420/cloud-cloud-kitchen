import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import RiderLayout from "../components/rider/RiderLayout";
import ProgressStepper from "../components/rider/ProgressStepper";
import DetailRow from "../components/rider/DetailRow";
import RoutePanel from "../components/rider/RoutePanel";
import { mockRiderOrders } from "../data/mockRiderOrders";

export default function DeliveryPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const order = useMemo(
    () => mockRiderOrders.find((item) => item.id === id),
    [id],
  );

  if (!order) {
    return (
      <RiderLayout title="Order Not Found">
        <div className="card empty-card">
          <p>The order does not exist in the mock data.</p>
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
      title={`On Delivery - ${order.id}`}
      subtitle="Deliver the order to the customer and confirm completion."
    >
      <ProgressStepper currentStep={2} />

      <div className="two-column-layout">
        <section className="card details-card">
          <DetailRow label="Customer" value={order.customerName} />
          <DetailRow label="Drop-off Address" value={order.dropoffAddress} />
          <DetailRow label="ETA to Customer" value={order.etaToCustomer} />
          <DetailRow label="Payout" value={`$${order.payout.toFixed(2)}`} />
          <DetailRow label="Order Code" value={order.orderCode} />

          <div className="action-row">
            <button
              className="secondary-btn"
              onClick={() => navigate(`/rider/pickup/${order.id}`)}
            >
              Back
            </button>
            <button
              className="primary-btn"
              onClick={() => navigate(`/rider/completed/${order.id}`)}
            >
              Confirm Delivered
            </button>
          </div>
        </section>

        <RoutePanel
          title="Route to Customer"
          eta={order.etaToCustomer}
          from={order.pickupAddress}
          to={order.dropoffAddress}
        />
      </div>
    </RiderLayout>
  );
}
