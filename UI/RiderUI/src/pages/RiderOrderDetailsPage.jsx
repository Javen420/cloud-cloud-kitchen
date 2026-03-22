import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import RiderLayout from "../components/rider/RiderLayout";
import DetailRow from "../components/rider/DetailRow";
import { mockRiderOrders } from "../data/mockRiderOrders";

export default function RiderOrderDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const order = useMemo(
    () => mockRiderOrders.find((item) => item.id === id),
    [id],
  );

  if (!order) {
    return (
      <RiderLayout
        title="Order Not Found"
        subtitle="The selected order could not be found."
      >
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
          value={order.distanceFromRider}
        />
        <DetailRow label="ETA to Pickup" value={order.etaToPickup} />
        <DetailRow label="ETA to Customer" value={order.etaToCustomer} />
        <DetailRow label="Total Estimated Trip" value={order.totalEta} />

        <div className="action-row">
          <button
            className="secondary-btn"
            onClick={() => navigate("/rider/available-orders")}
          >
            Back
          </button>
          <button
            className="primary-btn"
            onClick={() => navigate(`/rider/pickup/${order.id}`)}
          >
            Accept Order
          </button>
        </div>
      </section>
    </RiderLayout>
  );
}
