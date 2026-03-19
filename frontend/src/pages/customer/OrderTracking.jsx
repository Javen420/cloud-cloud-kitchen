import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, ChefHat, Truck, Loader2 } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { getOrderStatus } from "@/api/orderService";
import { getFcmRegistrationToken, onForegroundMessage } from "@/lib/firebase";
import { subscribeToOrderTopic } from "@/api/notificationService";

const STATUS_STEPS = [
  { key: "confirmed",   label: "Order Confirmed",  icon: CheckCircle2 },
  { key: "preparing",   label: "Being Prepared",   icon: ChefHat },
  { key: "out_for_delivery", label: "Out for Delivery", icon: Truck },
  { key: "delivered",   label: "Delivered",        icon: CheckCircle2 },
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
            delivery_address: data.delivery_address || prev?.delivery_address,
            total_amount: data.total_amount ? Number(data.total_amount) : prev?.total_amount,
          }));
        });
      } catch (e) {
        // ignore push setup failures; polling remains as fallback
      }
    })();
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [orderId]);

  const currentStepIndex = order
    ? STATUS_STEPS.findIndex(s => s.key === order.status)
    : 0;

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar role="customer" />

      <div className="container mx-auto px-4 py-10 max-w-2xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-4xl font-bold mb-2">Order Tracking</h1>
          <p className="text-muted-foreground mb-8">Order ID: <span className="text-primary font-mono">{orderId}</span></p>

          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          {order && (
            <div className="space-y-6">

              {/* Status Steps */}
              <div className="p-6 bg-card border border-white/5 rounded-xl shadow-xl">
                <div className="space-y-6">
                  {STATUS_STEPS.map((step, index) => {
                    const Icon = step.icon;
                    const isDone = index <= currentStepIndex;
                    const isCurrent = index === currentStepIndex;
                    return (
                      <div key={step.key} className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition ${
                          isDone ? "bg-primary text-white" : "bg-secondary/50 text-muted-foreground"
                        } ${isCurrent ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <p className={`font-medium ${isDone ? "text-foreground" : "text-muted-foreground"}`}>
                            {step.label}
                          </p>
                          {isCurrent && (
                            <p className="text-xs text-primary mt-0.5 flex items-center gap-1">
                              <Clock className="w-3 h-3" /> In progress...
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Order Details */}
              <div className="p-6 bg-card border border-white/5 rounded-xl shadow-xl">
                <h3 className="font-bold mb-4">Order Details</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Delivering to</span>
                    <span className="text-foreground text-right max-w-[60%]">{order.delivery_address}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Total Paid</span>
                    <span className="text-primary font-bold">${order.total_amount?.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {order.status === "delivered" && (
                <button
                  onClick={() => setLocation("/customer")}
                  className="w-full py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition"
                >
                  Order Again
                </button>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
