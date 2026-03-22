import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { MapPin, Phone, User, CheckCircle2, Loader2, CreditCard, Lock, ArrowLeft } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { useCartStore } from "@/store/cartStore";
import { submitOrder } from "@/api/orderService";

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
    cardNumber: "",
    cardExpiry: "",
    cardCvc: "",
    cardName: "",
  });
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState(null);

  const inputClass =
    "w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 shadow-sm transition focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsPending(true);
    setError(null);
    try {
      const data = await submitOrder({
        customer_id: formData.phone || formData.name || "customer",
        items: cartItems.map((item) => ({
          Id: item.id,
          Name: item.name,
          quantity: item.cartQuantity,
          price: item.price,
        })),
        dropoff_address: formData.address,
        idempotency_key: crypto.randomUUID(),
        payment: {
          card_number: formData.cardNumber.replace(/\s/g, ""),
          card_expiry: formData.cardExpiry.replace(/\s/g, ""),
          card_cvc: formData.cardCvc,
          card_name: formData.cardName,
        },
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

                <div className="space-y-4">
                  {/* Card Number */}
                  <div className="space-y-2">
                    <label htmlFor="cardNumber" className="text-sm font-medium">
                      Card Number
                    </label>
                    <div className="relative">
                      <CreditCard className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        id="cardNumber"
                        name="cardnumber"
                        required
                        form="checkout-form"
                        inputMode="numeric"
                        autoComplete="cc-number"
                        placeholder="4242 4242 4242 4242"
                        maxLength={19}
                        className="w-full pl-10 pr-3 py-2 rounded-lg bg-secondary/50 border border-white/10 focus:border-primary focus:outline-none text-sm tracking-wider"
                        value={formData.cardNumber}
                        onChange={e => {
                          const raw = e.target.value.replace(/\D/g, "").slice(0, 16);
                          const formatted = raw.replace(/(\d{4})(?=\d)/g, "$1 ");
                          setFormData({ ...formData, cardNumber: formatted });
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {/* Expiry */}
                    <div className="space-y-2">
                      <label htmlFor="cardExpiry" className="text-sm font-medium">
                        Expiry
                      </label>
                      <input
                        id="cardExpiry"
                        name="cc-exp"
                        required
                        form="checkout-form"
                        inputMode="numeric"
                        autoComplete="cc-exp"
                        placeholder="MM / YY"
                        maxLength={7}
                        className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-white/10 focus:border-primary focus:outline-none text-sm tracking-wider"
                        value={formData.cardExpiry}
                        onChange={e => {
                          const raw = e.target.value.replace(/\D/g, "").slice(0, 4);
                          const formatted = raw.length > 2 ? raw.slice(0, 2) + " / " + raw.slice(2) : raw;
                          setFormData({ ...formData, cardExpiry: formatted });
                        }}
                      />
                    </div>

                    {/* CVC */}
                    <div className="space-y-2">
                      <label htmlFor="cardCvc" className="text-sm font-medium">
                        CVC
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                          id="cardCvc"
                          name="cvc"
                          required
                          form="checkout-form"
                          inputMode="numeric"
                          autoComplete="cc-csc"
                          placeholder="123"
                          maxLength={4}
                          type="password"
                          className="w-full pl-10 pr-3 py-2 rounded-lg bg-secondary/50 border border-white/10 focus:border-primary focus:outline-none text-sm tracking-wider"
                          value={formData.cardCvc}
                          onChange={e => {
                            const raw = e.target.value.replace(/\D/g, "").slice(0, 4);
                            setFormData({ ...formData, cardCvc: raw });
                          }}
                        />
                      </div>
                    </div>

                    {/* Name on Card */}
                    <div className="space-y-2 col-span-2 md:col-span-1">
                      <label htmlFor="cardName" className="text-sm font-medium">
                        Name on Card
                      </label>
                      <input
                        id="cardName"
                        name="ccname"
                        required
                        form="checkout-form"
                        autoComplete="cc-name"
                        placeholder="John Doe"
                        className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-white/10 focus:border-primary focus:outline-none text-sm"
                        value={formData.cardName}
                        onChange={e => setFormData({ ...formData, cardName: e.target.value })}
                      />
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground flex items-center gap-1 pt-1">
                    <Lock className="w-3 h-3" /> Your payment info is securely processed via Stripe
                  </p>
                </div>
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
                    <span className="tabular-nums">$4.99</span>
                  </div>
                  <div className="flex justify-between items-baseline pt-3 text-lg font-extrabold text-foreground">
                    <span>Total</span>
                    <span className="text-primary tabular-nums">
                      ${(cartTotal + 4.99).toFixed(2)}
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  form="checkout-form"
                  disabled={isPending}
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
