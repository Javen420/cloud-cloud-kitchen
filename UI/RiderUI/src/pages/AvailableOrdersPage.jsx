import RiderLayout from "../components/rider/RiderLayout";
import OrderListCard from "../components/rider/OrderListCard";
import { mockRiderOrders } from "../data/mockRiderOrders";

export default function AvailableOrdersPage() {
  return (
    <RiderLayout
      title="Nearby Available Orders"
      subtitle="These jobs are already payment-confirmed and eligible for rider assignment."
    >
      <div className="summary-banner">
        <div>
          <span className="middlebar">Current status</span>
          <p>Online and ready to accept jobs</p>
        </div>
        <div>
          <span className="middlebar">Available jobs</span>
          <p>{mockRiderOrders.length}</p>
        </div>
      </div>

      <div className="card-grid">
        {mockRiderOrders.map((order) => (
          <OrderListCard key={order.id} order={order} />
        ))}
      </div>
    </RiderLayout>
  );
}
