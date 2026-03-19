import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useCartStore = create(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) => {
        const existing = get().items.find(i => i.id === item.id);
        if (existing) {
          set(state => ({
            items: state.items.map(i =>
              i.id === item.id ? { ...i, cartQuantity: i.cartQuantity + 1 } : i
            ),
          }));
        } else {
          set(state => ({ items: [...state.items, { ...item, cartQuantity: 1 }] }));
        }
      },

      removeItem: (id) =>
        set(state => ({ items: state.items.filter(i => i.id !== id) })),

      updateQuantity: (id, quantity) => {
        if (quantity <= 0) {
          get().removeItem(id);
          return;
        }
        set(state => ({
          items: state.items.map(i =>
            i.id === id ? { ...i, cartQuantity: quantity } : i
          ),
        }));
      },

      clearCart: () => set({ items: [] }),

      getTotal: () =>
        get().items.reduce((sum, i) => sum + i.price * i.cartQuantity, 0),

      getCount: () =>
        get().items.reduce((sum, i) => sum + i.cartQuantity, 0),
    }),
    { name: "cloud-kitchen-cart" } // persists cart to localStorage
  )
);
