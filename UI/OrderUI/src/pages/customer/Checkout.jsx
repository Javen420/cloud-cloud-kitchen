import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { MapPin, Phone, User, CheckCircle2, Loader2, CreditCard, Lock } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { useCartStore } from "@/store/cartStore";
import { submitOrder } from "@/api/orderService";

export default function CustomerCheckout() {
  const [, setLocation] = useLocation();
  const cartItems = useCartStore(state => state.items);
  const cartTotal = useCartStore(state => state.getTotal());
  const clearCart = useCartStore(state => state.clearCart);

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
      <div className="min-h-screen bg-background">
        <Navbar role="customer" />
        <div className="container mx-auto px-4 py-20 text-center">
          <h2 className="text-2xl font-bold mb-4">Your cart is empty</h2>
          <button
            onClick={() => setLocation("/customer")}
            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition"
          >
            Back to Menu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar role="customer" />

      <div className="container mx-auto px-4 py-10 max-w-5xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-4xl font-bold mb-8">Checkout</h1>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

            {/* ── Left: Delivery Details Form ── */}
            <div className="lg:col-span-2 space-y-6">
              <div className="p-6 bg-card border border-white/5 rounded-xl shadow-xl">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <User className="text-primary w-5 h-5" /> Delivery Details
                </h3>

                <form id="checkout-form" onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                    {/* Full Name */}
                    <div className="space-y-2">
                      <label htmlFor="name" className="text-sm font-medium">
                        Full Name
                      </label>
                      <input
                        id="name"
                        required
                        placeholder="John Doe"
                        className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-white/10 focus:border-primary focus:outline-none text-sm"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                      />
                    </div>

                    {/* Phone */}
                    <div className="space-y-2">
                      <label htmlFor="phone" className="text-sm font-medium">
                        Phone Number
                      </label>
                      <div className="relative">
                        <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                          id="phone"
                          required
                          placeholder="91234567"
                          className="w-full pl-10 pr-3 py-2 rounded-lg bg-secondary/50 border border-white/10 focus:border-primary focus:outline-none text-sm"
                          value={formData.phone}
                          onChange={e => setFormData({ ...formData, phone: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Address */}
                  <div className="space-y-2">
                    <label htmlFor="address" className="text-sm font-medium">
                      Delivery Address
                    </label>
                    <div className="relative">
                      <MapPin className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        id="address"
                        required
                        placeholder="123 Orchard Rd, #04-01"
                        className="w-full pl-10 pr-3 py-2 rounded-lg bg-secondary/50 border border-white/10 focus:border-primary focus:outline-none text-sm"
                        value={formData.address}
                        onChange={e => setFormData({ ...formData, address: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="space-y-2">
                    <label htmlFor="notes" className="text-sm font-medium">
                      Delivery Notes <span className="text-muted-foreground">(Optional)</span>
                    </label>
                    <textarea
                      id="notes"
                      placeholder="Leave at the door, ring the bell..."
                      className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-white/10 focus:border-primary focus:outline-none text-sm min-h-[100px] resize-none"
                      value={formData.notes}
                      onChange={e => setFormData({ ...formData, notes: e.target.value })}
                    />
                  </div>

                  {/* Error Banner */}
                  {error && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
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

            {/* ── Right: Order Summary ── */}
            <div>
              <div className="p-6 bg-card border border-primary/20 rounded-xl shadow-xl sticky top-24">
                <h3 className="text-xl font-bold mb-6">Order Summary</h3>

                {/* Cart Items */}
                <div className="space-y-4 mb-6 max-h-[300px] overflow-y-auto pr-2">
                  {cartItems.map(item => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <div className="flex gap-2">
                        <span className="font-semibold text-primary">{item.cartQuantity}x</span>
                        <span className="text-muted-foreground">{item.name}</span>
                      </div>
                      <span className="font-medium">
                        ${(item.price * item.cartQuantity).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Totals */}
                <div className="space-y-3 pt-4 border-t border-white/10 mb-6">
                  <div className="flex justify-between text-muted-foreground text-sm">
                    <span>Subtotal</span>
                    <span>${cartTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground text-sm">
                    <span>Delivery Fee</span>
                    <span>$4.99</span>
                  </div>
                  <div className="flex justify-between font-bold text-xl pt-2">
                    <span>Total</span>
                    <span className="text-primary">${(cartTotal + 4.99).toFixed(2)}</span>
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  form="checkout-form"
                  disabled={isPending}
                  className="w-full h-12 text-base font-bold bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg shadow-lg shadow-primary/25 flex items-center justify-center gap-2 transition"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-5 w-5" />
                      Place Order
                    </>
                  )}
                </button>

                {/* Back to menu */}
                <button
                  type="button"
                  onClick={() => setLocation("/customer")}
                  className="w-full mt-3 text-sm text-muted-foreground hover:text-foreground transition text-center"
                >
                  ← Back to Menu
                </button>
              </div>
            </div>

          </div>
        </motion.div>
      </div>
    </div>
  );
}
