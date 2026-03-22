import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, ChefHat, Truck, Loader2, Package } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { getOrderStatus } from "@/api/orderService";
import { getFcmRegistrationToken, onForegroundMessage } from "@/lib/firebase";
import { subscribeToOrderTopic } from "@/api/notificationService";

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

  useEffect(() => {
    let unsubscribe = null;
    (async () => {
      try {
        const token = await getFcmRegistrationToken();
        if (!token) return;
        await subscribeToOrderTopic({ token, orderId });
        unsubscribe = await onForegroundMessage((payload) => {
          const data = payload?.data || {};
          if (data.order_id && data.order_id !== orderId) return;
          setOrder((prev) => ({
            ...(prev || {}),
            order_id: data.order_id || orderId,
            status: data.status || prev?.status,
            dropoff_address: data.dropoff_address || data.delivery_address || prev?.dropoff_address,
            total_cents: data.total_cents ? Number(data.total_cents) : prev?.total_cents,
          }));
        });
      } catch {
        // polling fallback
      }
    })();
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [orderId]);

  const rawStep = order ? STATUS_STEPS.findIndex((s) => s.key === order.status) : -1;
  const currentStepIndex = rawStep < 0 ? -1 : rawStep;

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
                      return (
                        <li key={step.key} className="relative flex gap-4 pb-8 last:pb-0">
                          <div
                            className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border-2 transition-all ${
                              isDone
                                ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/20"
                                : "border-border bg-muted/50 text-muted-foreground"
                            } ${isCurrent ? "ring-4 ring-primary/15 scale-105" : ""}`}
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
                            {isCurrent && (
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
                    <span className="text-primary font-bold">${(order.total_cents / 100)?.toFixed(2)}</span>
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
