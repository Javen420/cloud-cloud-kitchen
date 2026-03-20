import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ShoppingCart, Plus, Minus } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { useCartStore } from "@/store/cartStore";
import { getMenu } from "@/api/menuService";

export default function Menu() {
  const [, setLocation] = useLocation();
  const [activeCategory, setActiveCategory] = useState("All");
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { items: cartItems, addItem, updateQuantity, getCount } = useCartStore();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const items = await getMenu();
        if (!cancelled) setMenuItems(items);
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load menu");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(() => {
    const cats = new Set(menuItems.map((i) => i.category).filter(Boolean));
    return ["All", ...Array.from(cats)];
  }, [menuItems]);

  const filtered = useMemo(() => {
    return activeCategory === "All"
      ? menuItems
      : menuItems.filter((i) => i.category === activeCategory);
  }, [activeCategory, menuItems]);

  const getCartQuantity = (id) =>
    cartItems.find(i => i.id === id)?.cartQuantity || 0;

  return (
    <div className="min-h-screen bg-background pb-24">
      <Navbar role="customer" />

      <div className="container mx-auto px-4 py-10 max-w-5xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-4xl font-bold mb-2">Our Menu</h1>
          <p className="text-muted-foreground mb-8">Fresh, made-to-order meals delivered to your door.</p>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Category Tabs */}
          <div className="flex gap-2 mb-8 flex-wrap">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                  activeCategory === cat
                    ? "bg-primary text-[#A8D8FF] font-[700]"
                    : "bg-white text-muted-background hover:text-foreground"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Menu Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {loading && (
              <div className="col-span-full text-muted-foreground text-sm">
                Loading menu...
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="col-span-full text-muted-foreground text-sm">
                No items found.
              </div>
            )}
            {filtered.map(item => {
              const qty = getCartQuantity(item.id);
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-5 bg-card border border-white/5 rounded-xl shadow-lg flex justify-between items-center gap-4"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-20 h-20 rounded-xl overflow-hidden bg-secondary/50 border border-white/10 shrink-0">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground text-2xl">
                          🍔
                        </div>
                      )}
                    </div>

                    <h3 className="font-bold text-foreground">{item.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                    <p className="text-primary font-bold mt-2">${Number(item.price || 0).toFixed(2)}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {qty === 0 ? (
                      <button
                        onClick={() => addItem(item)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition"
                      >
                        <Plus className="w-4 h-4" /> Add
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateQuantity(item.id, qty - 1)}
                          className="w-8 h-8 rounded-full bg-secondary/50 hover:bg-secondary flex items-center justify-center transition"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-5 text-center font-bold text-sm">{qty}</span>
                        <button
                          onClick={() => addItem(item)}
                          className="w-8 h-8 rounded-full bg-primary hover:bg-primary/90 text-white flex items-center justify-center transition"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </div>

      {/* Floating Checkout Button */}
      {getCount() > 0 && (
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="fixed bottom-6 left-0 right-0 flex justify-center px-4 z-50"
        >
          <button
            onClick={() => setLocation("/customer/checkout")}
            className="flex items-center gap-3 px-8 py-4 bg-primary hover:bg-primary/90 text-white font-bold rounded-2xl shadow-2xl shadow-primary/30 transition"
          >
            <ShoppingCart className="w-5 h-5" />
            Checkout ({getCount()} items)
          </button>
        </motion.div>
      )}
    </div>
  );
}
