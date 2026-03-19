import { useState } from "react";
import { useLocation } from "wouter";
import { ShoppingBag, UtensilsCrossed } from "lucide-react";
import { useCartStore } from "@/store/cartStore";

export function Navbar({ role }) {
  const [location, setLocation] = useLocation();
  const itemCount = useCartStore(state => state.getCount());
  const cartItems = useCartStore(state => state.items);
  const cartTotal = useCartStore(state => state.getTotal());
  const updateQuantity = useCartStore(state => state.updateQuantity);

  const [cartOpen, setCartOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full glass border-b">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">

        {/* Logo */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
              <UtensilsCrossed className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight text-foreground hidden sm:block">
              Cloud Cloud <span className="text-primary">Kitchen</span>
            </span>
            {role && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-secondary text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {role}
              </span>
            )}
          </div>
        </div>

        {/* Cart Button */}
        {role === "customer" && location !== "/customer/checkout" && (
          <>
            <button
              onClick={() => setCartOpen(true)}
              className="relative flex items-center gap-2 px-4 py-2 rounded-lg bg-card hover:bg-secondary border border-white/10 transition"
            >
              <ShoppingBag className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">Cart</span>
              {itemCount > 0 && (
                <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-primary text-[10px] font-bold text-white flex items-center justify-center">
                  {itemCount}
                </span>
              )}
            </button>

            {/* Cart Drawer Overlay */}
            {cartOpen && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 bg-black/50 z-50"
                  onClick={() => setCartOpen(false)}
                />

                {/* Drawer */}
                <div className="fixed top-0 right-0 h-full w-full sm:max-w-md bg-background/95 backdrop-blur-xl border-l border-white/10 z-50 flex flex-col">

                  {/* Header */}
                  <div className="p-6 border-b border-white/5 flex items-center justify-between">
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                      <ShoppingBag className="w-5 h-5 text-primary" /> Your Order
                    </h2>
                    <button
                      onClick={() => setCartOpen(false)}
                      className="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Items */}
                  <div className="flex-1 overflow-y-auto p-6">
                    {cartItems.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4 pt-20">
                        <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
                          <ShoppingBag className="w-8 h-8 opacity-50" />
                        </div>
                        <p>Your cart is empty</p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {cartItems.map(item => (
                          <div key={item.id} className="flex gap-4">
                            <div className="w-20 h-20 rounded-xl overflow-hidden bg-secondary shrink-0">
                              {item.imageUrl
                                ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center text-muted-foreground text-2xl">🍔</div>
                              }
                            </div>

                            <div className="flex-1 flex flex-col justify-between">
                              <div>
                                <h4 className="font-semibold text-foreground line-clamp-1">{item.name}</h4>
                                <p className="text-sm text-primary font-medium">${item.price.toFixed(2)}</p>
                              </div>
                              <div className="flex items-center bg-secondary rounded-lg border border-white/5 w-fit">
                                <button
                                  onClick={() => updateQuantity(item.id, item.cartQuantity - 1)}
                                  className="w-8 h-8 flex items-center justify-center hover:text-primary transition"
                                >
                                  −
                                </button>
                                <span className="w-6 text-center text-sm font-medium">{item.cartQuantity}</span>
                                <button
                                  onClick={() => updateQuantity(item.id, item.cartQuantity + 1)}
                                  className="w-8 h-8 flex items-center justify-center hover:text-primary transition"
                                >
                                  +
                                </button>
                              </div>
                            </div>

                            <div className="font-semibold text-right text-sm">
                              ${(item.price * item.cartQuantity).toFixed(2)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  {cartItems.length > 0 && (
                    <div className="p-6 bg-card border-t border-white/5">
                      <div className="space-y-3 mb-6">
                        <div className="flex justify-between text-muted-foreground text-sm">
                          <span>Subtotal</span>
                          <span>${cartTotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground text-sm">
                          <span>Delivery Fee</span>
                          <span>$4.99</span>
                        </div>
                        <div className="border-t border-white/10 pt-3 flex justify-between font-bold text-xl">
                          <span>Total</span>
                          <span>${(cartTotal + 4.99).toFixed(2)}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => { setCartOpen(false); setLocation("/customer/checkout"); }}
                        className="w-full h-12 text-base font-bold bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-white rounded-xl shadow-lg shadow-primary/25 transition"
                      >
                        Proceed to Checkout
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </header>
  );
}
