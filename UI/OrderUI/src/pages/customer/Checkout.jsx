import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { MapPin, Phone, User, CheckCircle2, Loader2, CreditCard, Lock, ArrowLeft } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { useCartStore } from "@/store/cartStore";
import { submitOrder, verifyAddress } from "@/api/orderService";
import { createPaymentIntent } from "@/api/paymentService";

/** Keep in sync with composite `DELIVERY_FEE_CENTS` (default 499 = $4.99). */
const DELIVERY_FEE_SGD = 4.99;
const DELIVERY_FEE_CENTS = 499;
const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "";
const stripePromise = STRIPE_PUBLISHABLE_KEY ? loadStripe(STRIPE_PUBLISHABLE_KEY) : null;

function StripePaymentFields({ onReady }) {
  const stripe = useStripe();
  const elements = useElements();

  useEffect(() => {
    onReady({ stripe, elements });
  }, [stripe, elements, onReady]);

  return (
    <div className="space-y-3">
      <PaymentElement />
      <p className="text-xs text-muted-foreground flex items-center gap-1 pt-1">
        <Lock className="w-3 h-3" /> Apple Pay, Google Pay, and cards are supported.
      </p>
    </div>
  );
}

export default function CustomerCheckout() {
  const [, setLocation] = useLocation();
  const cartItems = useCartStore((state) => state.items);
  const cartTotal = useCartStore((state) => state.getTotal());
  const clearCart = useCartStore((state) => state.clearCart);

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    address: "",
    notes: "",
  });
  const [isPending, setIsPending] = useState(false);
  const [isPaymentBootstrapping, setIsPaymentBootstrapping] = useState(true);
  const [error, setError] = useState(null);
  const [clientSecret, setClientSecret] = useState("");
  const [paymentIntentId, setPaymentIntentId] = useState("");
  const [intentIdempotencyKey, setIntentIdempotencyKey] = useState("");
  const [stripeCtx, setStripeCtx] = useState({ stripe: null, elements: null });
  const totalCents = useMemo(
    () => Math.round(cartTotal * 100) + DELIVERY_FEE_CENTS,
    [cartTotal],
  );

  const inputClass =
    "w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 shadow-sm transition focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30";

  const preparePaymentIntent = useCallback(async () => {
    if (!STRIPE_PUBLISHABLE_KEY) {
      setError("Missing VITE_STRIPE_PUBLISHABLE_KEY for Stripe Payment Element.");
      setIsPaymentBootstrapping(false);
      return;
    }
    setIsPaymentBootstrapping(true);
    setError(null);
    try {
      const orderId = crypto.randomUUID();
      const idempotencyKey = crypto.randomUUID();
      const customerId = formData.phone || formData.name || "customer";
      const intent = await createPaymentIntent({
        order_id: orderId,
        customer_id: customerId,
        amount_cents: totalCents,
        currency: "sgd",
        idempotency_key: idempotencyKey,
      });
      setIntentIdempotencyKey(idempotencyKey);
      setPaymentIntentId(intent.payment_intent_id);
      setClientSecret(intent.client_secret);
    } catch (err) {
      setError(err.message || "Unable to initialize payment.");
    } finally {
      setIsPaymentBootstrapping(false);
    }
  }, [formData.phone, formData.name, totalCents]);

  useEffect(() => {
    preparePaymentIntent();
  }, [preparePaymentIntent]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsPending(true);
    setError(null);
    try {
      // Step 1: Verify Address and get Coordinates
      const geo = await verifyAddress(formData.address);
      const { lat, lng } = geo;

      // Step 2: Handle Stripe Payment
      const { stripe, elements } = stripeCtx;
      if (!stripe || !elements || !clientSecret) {
        throw new Error("Payment form is still loading. Please try again.");
      }

      const { error: submitError } = await elements.submit();
      if (submitError) throw new Error(submitError.message || "Payment details are incomplete.");

      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        clientSecret,
        redirect: "if_required",
      });
      if (confirmError) throw new Error(confirmError.message || "Payment confirmation failed.");
      if (!paymentIntent?.id || !["succeeded", "requires_capture"].includes(paymentIntent.status)) {
        throw new Error("Payment not completed yet. Please try again.");
      }

      // Step 3: Submit Order with Coordinates
      const data = await submitOrder({
        customer_id: formData.phone || formData.name || "customer",
        items: cartItems.map((item) => ({
          Id: item.id,
          Name: item.name,
          quantity: item.cartQuantity,
          price: item.price,
        })),
        dropoff_address: formData.address,
        dropoff_lat: lat,
        dropoff_lng: lng,
        idempotency_key: intentIdempotencyKey || crypto.randomUUID(),
        payment_intent_id: paymentIntent.id || paymentIntentId,
      });

      if (data.status === "confirmed" && data.order_id) {
        clearCart();
        setLocation(`/customer/track/${data.order_id}`);
      } else {
        setError(data.error || "Order was not confirmed. Please try again.");
      }
    } catch (err) {
      console.warn("Order failed:", err.message);
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setIsPending(false);
    }
  };

  if (cartItems.length === 0) {
    return (
      <div className="page-customer">
        <Navbar role="customer" />
        <div className="container mx-auto px-4 py-24 max-w-lg text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-muted text-4xl shadow-inner">
            🛒
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Your cart is empty</h2>
          <p className="text-muted-foreground text-sm mb-8">
            Add something delicious from the menu, then come back to checkout.
          </p>
          <button
            type="button"
            onClick={() => setLocation("/customer")}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-95 transition"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to menu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-customer pb-24">
      <Navbar role="customer" />

      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <button
            type="button"
            onClick={() => setLocation("/customer")}
            className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to menu
          </button>

          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground">
              Checkout
            </h1>
            <p className="text-muted-foreground mt-2 text-sm md:text-base">
              Enter your details and you&apos;ll get your order delivered as soon as possible.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-10">
            <div className="lg:col-span-3 space-y-6">
              <div className="rounded-3xl border border-border bg-card p-6 md:p-8 shadow-sm">
                <h3 className="text-lg font-bold flex items-center gap-2 mb-6 text-foreground">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <User className="w-4 h-4" />
                  </span>
                  Delivery details
                </h3>

                <form id="checkout-form" onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label htmlFor="name" className="text-sm font-semibold text-foreground">
                        Full name
                      </label>
                      <input
                        id="name"
                        required
                        placeholder="Simpson"
                        className={inputClass}
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="phone" className="text-sm font-semibold text-foreground">
                        Phone
                      </label>
                      <div className="relative">
                        <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <input
                          id="phone"
                          required
                          placeholder="91234567"
                          className={`${inputClass} pl-10`}
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="address" className="text-sm font-semibold text-foreground">
                      Delivery address
                    </label>
                    <div className="relative">
                      <MapPin className="w-4 h-4 absolute left-3 top-3 text-muted-foreground pointer-events-none" />
                      <input
                        id="address"
                        required
                        placeholder="67 Orchard Rd, #01-01"
                        className={`${inputClass} pl-10`}
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="notes" className="text-sm font-semibold text-foreground">
                      Notes{" "}
                      <span className="font-normal text-muted-foreground">(optional)</span>
                    </label>
                    <textarea
                      id="notes"
                      placeholder="Gate code, delivery instructions…"
                      rows={3}
                      className={`${inputClass} resize-none min-h-[96px]`}
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    />
                  </div>

                  {error && (
                    <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                      {error}
                    </div>
                  )}
                </form>
              </div>

              {/* ── Payment Details ── */}
              <div className="p-6 bg-card border border-white/5 rounded-xl shadow-xl">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <CreditCard className="text-primary w-5 h-5" /> Payment Details
                </h3>

                {!stripePromise ? (
                  <p className="text-sm text-destructive">
                    Stripe key missing. Set `VITE_STRIPE_PUBLISHABLE_KEY`.
                  </p>
                ) : isPaymentBootstrapping ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading payment methods...
                  </div>
                ) : clientSecret ? (
                  <Elements stripe={stripePromise} options={{ clientSecret }}>
                    <StripePaymentFields onReady={setStripeCtx} />
                  </Elements>
                ) : (
                  <p className="text-sm text-destructive">
                    Unable to load payment methods. Refresh and try again.
                  </p>
                )}
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="lg:sticky lg:top-24 rounded-3xl border border-border bg-card p-6 shadow-md ring-1 ring-primary/10">
                <h3 className="text-lg font-bold text-foreground mb-5">Order summary</h3>

                <ul className="space-y-3 mb-6 max-h-[280px] overflow-y-auto pr-1">
                  {cartItems.map((item) => (
                    <li
                      key={item.id}
                      className="flex justify-between gap-3 text-sm border-b border-border/60 pb-3 last:border-0 last:pb-0"
                    >
                      <span className="text-muted-foreground">
                        <span className="font-semibold text-foreground">{item.cartQuantity}×</span>{" "}
                        {item.name}
                      </span>
                      <span className="font-semibold tabular-nums shrink-0">
                        ${(item.price * item.cartQuantity).toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="space-y-2.5 pt-2 border-t border-border text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span className="tabular-nums">${cartTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Delivery</span>
                    <span className="tabular-nums">${DELIVERY_FEE_SGD.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-baseline pt-3 text-lg font-extrabold text-foreground">
                    <span>Total</span>
                    <span className="text-primary tabular-nums">
                      ${(cartTotal + DELIVERY_FEE_SGD).toFixed(2)}
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  form="checkout-form"
                  disabled={isPending || isPaymentBootstrapping || !clientSecret}
                  className="mt-6 w-full h-12 rounded-xl text-base font-bold bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition active:scale-[0.99]"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Processing…
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4 opacity-90" />
                      Continue to payment
                    </>
                  )}
                </button>

                <p className="mt-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
                  Secured by Stripe
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
