import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import RiderLayout from "../components/rider/RiderLayout";
import DetailRow from "../components/rider/DetailRow";
import { assignDriver, getCurrentDriverOrders } from "../services/riderApi";
import { getActiveOrder, getDriverId, getCurrentPosition, saveActiveOrder } from "../lib/driverSession";

export default function RiderOrderDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Order is passed via router state from AvailableOrdersPage
  const fallbackOrder = useMemo(() => {
    const active = getActiveOrder()?.order;
    return active?.id === id ? active : null;
  }, [id]);
  const [serverOrder, setServerOrder] = useState(null);
  const order = location.state?.order || fallbackOrder || serverOrder;
  const [loadingServerOrder, setLoadingServerOrder] = useState(false);

  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState(null);

  useEffect(() => {
    if (order) return;
    async function loadCurrentOrder() {
      setLoadingServerOrder(true);
      try {
        const currentOrders = await getCurrentDriverOrders(getDriverId());
        const match = currentOrders.find((currentOrder) => currentOrder.id === id) || null;
        setServerOrder(match);
      } finally {
        setLoadingServerOrder(false);
      }
    }
    loadCurrentOrder();
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
      saveActiveOrder(order, "pickup");

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
          {loadingServerOrder ? <p>Loading current jobs...</p> : null}
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
        <DetailRow
          label="Items"
          value={
            order.itemsList && order.itemsList.length > 0
              ? (
                <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
                  {order.itemsList.map((item, i) => (
                    <li key={i}>
                      {item.quantity}x {item.Name}{" "}
                      {item.price != null && (
                        <span className="muted">(${Number(item.price).toFixed(2)} ea)</span>
                      )}
                    </li>
                  ))}
                </ul>
              )
              : `${order.items} items`
          }
        />
        <DetailRow label="Payout" value={`$${order.payout.toFixed(2)}`} />
        <DetailRow
          label="To Pickup"
          value={
            order.pickupDistanceKm != null
              ? `${order.pickupDistanceKm} km`
              : "Calculating..."
          }
        />
        <DetailRow
          label="To Drop-off"
          value={
            order.deliveryDistanceKm != null
              ? `${order.deliveryDistanceKm} km`
              : "Calculating..."
          }
        />
        <DetailRow
          label="ETA to Dropoff"
          value="Calculated after assignment"
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
