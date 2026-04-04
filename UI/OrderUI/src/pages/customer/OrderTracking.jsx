import { useCallback, useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, ChefHat, Truck, Loader2, Package } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { getOrderStatus } from "@/api/orderService";
import { getFcmRegistrationToken, onForegroundMessage } from "@/lib/firebase";
import { subscribeToOrderTopic } from "@/api/notificationService";

function formatDbTimestamp(iso) {
  if (iso == null || iso === "") return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // DB stores UTC; browser shows local timezone
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

const STATUS_STEPS = [
  { key: "confirmed", label: "Order confirmed", icon: CheckCircle2 },
  { key: "preparing", label: "Being prepared", icon: ChefHat },
  { key: "out_for_delivery", label: "Out for delivery", icon: Truck },
  { key: "delivered", label: "Delivered", icon: Package },
];

export default function OrderTracking() {
  const params = useParams();
  const orderId = params.id;
  const [, setLocation] = useLocation();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notificationStatus, setNotificationStatus] = useState("checking");
  const [notificationError, setNotificationError] = useState("");

  useEffect(() => {
    let interval;

    const fetchOrder = async () => {
      try {
        const data = await getOrderStatus(orderId);
        setOrder(data);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
    // Poll every 10 seconds for status updates
    interval = setInterval(fetchOrder, 10000);
    return () => clearInterval(interval);
  }, [orderId]);

  const handleForegroundPayload = useCallback((payload) => {
    const data = payload?.data || {};
    if (data.order_id && String(data.order_id) !== String(orderId)) return;
    const cents =
      data.total_cents != null
        ? Number(data.total_cents)
        : data.total_amount != null
          ? Number(data.total_amount)
          : undefined;
    const etaTotal =
      data.eta_total_minutes != null ? Number(data.eta_total_minutes) : undefined;
    const etaTravel =
      data.eta_travel_minutes != null ? Number(data.eta_travel_minutes) : undefined;
    const etaCook =
      data.eta_cooking_minutes != null ? Number(data.eta_cooking_minutes) : undefined;
    const etaDist =
      data.eta_distance_km != null ? Number(data.eta_distance_km) : undefined;
    setOrder((prev) => ({
      ...(prev || {}),
      order_id: data.order_id || orderId,
      status: data.status || prev?.status,
      dropoff_address:
        data.dropoff_address || data.delivery_address || prev?.dropoff_address,
      total_cents: cents !== undefined && !Number.isNaN(cents) ? cents : prev?.total_cents,
      ...(etaTotal != null && !Number.isNaN(etaTotal) ? { eta_total_minutes: etaTotal } : {}),
      ...(etaTravel != null && !Number.isNaN(etaTravel) ? { eta_travel_minutes: etaTravel } : {}),
      ...(etaCook != null && !Number.isNaN(etaCook) ? { eta_cooking_minutes: etaCook } : {}),
      ...(etaDist != null && !Number.isNaN(etaDist) ? { eta_distance_km: etaDist } : {}),
    }));
  }, [orderId]);

  const enableNotifications = useCallback(async (requestPermission = false) => {
    if (typeof Notification === "undefined") {
      setNotificationStatus("unsupported");
      setNotificationError("This browser does not support web notifications.");
      return () => {};
    }

    if (Notification.permission === "denied") {
      setNotificationStatus("denied");
      setNotificationError("Notifications are blocked in browser site settings.");
      return () => {};
    }

    if (Notification.permission === "default" && !requestPermission) {
      setNotificationStatus("prompt");
      setNotificationError("");
      return () => {};
    }

    try {
      const token = await getFcmRegistrationToken({ requestPermission });
      if (!token) {
        setNotificationStatus(
          Notification.permission === "granted" ? "error" : "prompt",
        );
        if (Notification.permission === "granted") {
          setNotificationError("Could not get an FCM token for this browser.");
        }
        return () => {};
      }

      await subscribeToOrderTopic({ token, orderId });
      const unsubscribe = await onForegroundMessage(handleForegroundPayload);
      setNotificationStatus("enabled");
      setNotificationError("");
      return unsubscribe;
    } catch (err) {
      setNotificationStatus("error");
      setNotificationError(err?.message || "Notification setup failed.");
      return () => {};
    }
  }, [handleForegroundPayload, orderId]);

  useEffect(() => {
    let unsubscribe = null;
    (async () => {
      unsubscribe = await enableNotifications(false);
    })();
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [enableNotifications]);

  const rawStep = order ? STATUS_STEPS.findIndex((s) => s.key === order.status) : -1;
  const currentStepIndex = rawStep < 0 ? -1 : rawStep;

  const placedAt =
    order && !loading ? formatDbTimestamp(order.created_at) : null;

  return (
    <div className="page-customer pb-24">
      <Navbar role="customer" />

      <div className="container mx-auto px-4 py-8 max-w-lg">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <div className="mb-8">
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
              Track order
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              Order ID{" "}
              <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded-md text-foreground">
                {orderId}
              </span>
            </p>
            {placedAt && (
              <p className="text-xs text-muted-foreground mt-2">Placed {placedAt}</p>
            )}
          </div>

          {loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading status…</p>
            </div>
          )}

          {error && !loading && (
            <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
              {error}
            </div>
          )}

          {order && !loading && (
            <div className="space-y-6">
              <div
                className={`rounded-3xl border p-5 md:p-6 shadow-sm ${
                  order.eta_total_minutes != null && !Number.isNaN(Number(order.eta_total_minutes))
                    ? "border-primary/25 bg-primary/5"
                    : "border-border bg-card"
                }`}
              >
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Delivery estimate
                </h2>
                {order.eta_total_minutes != null && !Number.isNaN(Number(order.eta_total_minutes)) ? (
                  <>
                    <p className="text-2xl font-extrabold text-foreground tabular-nums">
                      ~{order.eta_total_minutes} minutes
                    </p>
                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                      Includes cooking and delivery time. Refresh the page to see latest order status.
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {order.eta_unavailable_reason || "Estimated time is updating"}
                  </p>
                )}
              </div>

              <div className="rounded-3xl border border-border bg-card p-6 md:p-8 shadow-sm">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-6">
                  Progress
                </h2>
                <div className="relative">
                  <div
                    className="absolute left-[19px] top-3 bottom-3 w-0.5 bg-border rounded-full"
                    aria-hidden
                  />
                  <ul className="space-y-0">
                    {STATUS_STEPS.map((step, index) => {
                      const Icon = step.icon;
                      const isDone = currentStepIndex >= 0 && index <= currentStepIndex;
                      const isCurrent = index === currentStepIndex;
                      const showInProgress = isCurrent && order.status !== "delivered";
                      return (
                        <li key={step.key} className="relative flex gap-4 pb-8 last:pb-0">
                          <div
                            className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border-2 transition-all ${
                              isDone
                                ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/20"
                                : "border-border bg-muted/50 text-muted-foreground"
                            } ${showInProgress ? "ring-4 ring-primary/15 scale-105" : ""}`}
                          >
                            <Icon className="w-5 h-5" />
                          </div>
                          <div className="pt-1.5 min-w-0">
                            <p
                              className={`font-semibold ${
                                isDone ? "text-foreground" : "text-muted-foreground"
                              }`}
                            >
                              {step.label}
                            </p>
                            {showInProgress && (
                              <p className="text-xs text-primary mt-1 flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 shrink-0" />
                                In progress…
                              </p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>

              {/* Order Details */}
              <div className="p-6 bg-card border border-white/5 rounded-xl shadow-xl">
                <h3 className="font-bold mb-4">Order Details</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Delivering to</span>
                    <span className="text-foreground text-right max-w-[60%]">{order.dropoff_address}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Total Paid</span>
                    <span className="text-primary font-bold">
                      $
                      {(
                        Number(order.total_cents ?? order.total_amount ?? 0) / 100
                      ).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {order.status === "delivered" && (
                <button
                  type="button"
                  onClick={() => setLocation("/customer")}
                  className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/20 hover:opacity-95 transition"
                >
                  Order again
                </button>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
