import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChefHat,
  RefreshCw,
  Wifi,
  WifiOff,
  Clock,
  Package,
  Sparkles,
} from "lucide-react";
import {
  fetchCoordinateHealth,
  fetchOrdersByStatuses,
  updateOrderStatus,
} from "../api/coordinateApi";

const STATUSES = ["pending", "cooking", "finished_cooking"];

const TABS = [
  { id: "all", label: "All" },
  { id: "pending", label: "New" },
  { id: "cooking", label: "Preparing" },
  { id: "finished_cooking", label: "Ready" },
];

function filterAssignedPending(orders) {
  return orders.filter((o) => o.kitchen_id);
}

function numericOrderId(id) {
  if (typeof id !== "string") return Number.NEGATIVE_INFINITY;
  const parsed = Number.parseInt(id, 10);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function formatItems(items) {
  if (!Array.isArray(items)) return "—";
  const line = items
    .map(
      (i) =>
        `${i.Name || i.name || "Item"} ×${i.Quantity || i.quantity || i.qty || 1}`,
    )
    .join(", ");
  return line.length > 80 ? `${line.slice(0, 77)}…` : line;
}

function displayOrderId(id) {
  if (!id || typeof id !== "string") return "#ORD-—";
  const compact = id.replace(/-/g, "");
  const tail = compact.slice(-4).toUpperCase();
  return `#ORD-${tail}`;
}

function shortCustomer(userId) {
  if (!userId) return "Customer";
  const part = userId.split("-")[0];
  return part ? `${part.slice(0, 1).toUpperCase()}${part.slice(1, 8)}…` : "Customer";
}

function relativeAge(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 10) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function sortByRecent(orders) {
  return [...orders].sort((a, b) => {
    const ta = new Date(a.updated_at || a.created_at || 0).getTime();
    const tb = new Date(b.updated_at || b.created_at || 0).getTime();
    if (ta !== tb) return tb - ta;

    return numericOrderId(b.id) - numericOrderId(a.id);
  });
}

function badgeForStatus(st) {
  switch (st) {
    case "pending":
      return "border-amber-500/40 bg-amber-950/50 text-amber-200";
    case "cooking":
      return "border-emerald-500/40 bg-emerald-950/50 text-emerald-200";
    case "finished_cooking":
      return "border-sky-500/40 bg-sky-950/50 text-sky-200";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function labelForStatus(st) {
  switch (st) {
    case "pending":
      return "New";
    case "cooking":
      return "Preparing";
    case "finished_cooking":
      return "Ready";
    default:
      return st;
  }
}

const FALLBACK_KITCHEN_ID = import.meta.env.VITE_KITCHEN_ID || null;

export default function KitchenDashboardPage() {
  const [tab, setTab] = useState("all");
  const [bucket, setBucket] = useState({
    pending: [],
    cooking: [],
    finished_cooking: [],
  });
  const [kitchenId, setKitchenId] = useState(null);
  const [online, setOnline] = useState(true);
  const [lastSynced, setLastSynced] = useState(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [newOrderPulse, setNewOrderPulse] = useState(false);
  const prevNewCount = useRef(0);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setStatusMsg("Syncing…");
    try {
      const [health, data] = await Promise.all([
        fetchCoordinateHealth(),
        fetchOrdersByStatuses(STATUSES),
      ]);
      setOnline(health);

      const pendingK = sortByRecent(filterAssignedPending(data.pending || []));
      const cooking = sortByRecent(data.cooking || []);
      const ready = sortByRecent(data.finished_cooking || []);

      setBucket({
        pending: pendingK,
        cooking,
        finished_cooking: ready,
      });

      const kid =
        pendingK[0]?.kitchen_id ||
        cooking[0]?.kitchen_id ||
        ready[0]?.kitchen_id ||
        FALLBACK_KITCHEN_ID ||
        null;
      setKitchenId(kid);

      const n = pendingK.length;
      if (n > prevNewCount.current && prevNewCount.current > 0) {
        setNewOrderPulse(true);
        window.setTimeout(() => setNewOrderPulse(false), 4000);
      }
      prevNewCount.current = n;

      setLastSynced(new Date());
      setStatusMsg(
        health
          ? `Last synced ${new Date().toLocaleTimeString()}`
          : "Service unreachable — showing last data",
      );
    } catch (e) {
      setStatusMsg(e.message || "Could not load orders");
      setOnline(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const t = window.setInterval(loadAll, 15000);
    return () => window.clearInterval(t);
  }, [loadAll]);

  const stats = useMemo(
    () => ({
      new: bucket.pending.length,
      preparing: bucket.cooking.length,
      ready: bucket.finished_cooking.length,
    }),
    [bucket],
  );

  const displayOrders = useMemo(() => {
    const pendingK = bucket.pending;
    const merged = [...pendingK, ...bucket.cooking, ...bucket.finished_cooking];
    const sorted = sortByRecent(merged);

    if (tab === "all") return sorted;
    if (tab === "pending") return sortByRecent(pendingK);
    if (tab === "cooking") return sortByRecent(bucket.cooking);
    if (tab === "finished_cooking") return sortByRecent(bucket.finished_cooking);
    return sorted;
  }, [bucket, tab]);

  const lastSyncedLabel = useMemo(() => {
    if (!lastSynced) return "Not synced yet";
    const s = relativeAge(lastSynced.toISOString());
    return s ? `Synced ${s}` : "Synced just now";
  }, [lastSynced]);

  const onAdvance = async (orderId, next) => {
    setUpdatingId(orderId);
    try {
      await updateOrderStatus(orderId, next);
      await loadAll();
    } catch (e) {
      setStatusMsg(e.message || "Update failed");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="min-h-full bg-[hsl(200_28%_5%)] text-[hsl(200_10%_93%)]">
      <header className="border-b border-white/10 bg-[hsl(200_25%_8%)]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[hsl(189_85%_44%/0.15)] text-[hsl(189_85%_50%)] ring-1 ring-[hsl(189_85%_44%/0.35)]">
                <ChefHat className="h-6 w-6" aria-hidden />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                    Kitchen
                  </h1>
                  {kitchenId ? (
                    <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 font-mono text-xs text-[hsl(200_8%_75%)]">
                      Kitchen{" "}
                      {kitchenId.length > 14
                        ? `${kitchenId.slice(0, 10)}…`
                        : kitchenId}
                    </span>
                  ) : (
                    <span className="rounded-full border border-amber-500/30 bg-amber-950/40 px-2.5 py-0.5 text-xs text-amber-200/90">
                      No kitchen id on orders yet
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[hsl(200_8%_62%)]">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={`h-2 w-2 rounded-full ${online ? "bg-emerald-400 shadow-[0_0_8px_hsl(142_76%_50%)]" : "bg-red-500"}`}
                      aria-hidden
                    />
                    {online ? "Kitchen online" : "Offline / degraded"}
                  </span>
                  <span className="text-white/25">·</span>
                  <span>{lastSyncedLabel}</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => loadAll()}
              disabled={loading}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-white/15 bg-white/5 px-5 text-sm font-medium text-white transition hover:bg-white/10 disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                aria-hidden
              />
              Refresh
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div
              className={`relative overflow-hidden rounded-2xl border border-white/10 bg-[hsl(200_22%_10%)] p-4 shadow-lg ${newOrderPulse ? "ring-2 ring-amber-400/50" : ""}`}
            >
              {stats.new > 0 && (
                <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                  <Sparkles className="h-3 w-3" aria-hidden />
                  New
                </span>
              )}
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(200_8%_55%)]">
                New orders
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-white">
                {stats.new}
              </p>
              <p className="mt-1 text-xs text-emerald-400/90">
                {stats.new > 0
                  ? `Assigned to your kitchen · needs action`
                  : "None waiting"}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[hsl(200_22%_10%)] p-4 shadow-lg">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(200_8%_55%)]">
                In progress
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-white">
                {stats.preparing}
              </p>
              <p className="mt-1 text-xs text-[hsl(200_8%_55%)]">
                {stats.ready > 0
                  ? `${stats.ready} ready for pickup`
                  : "Prep active orders below"}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Incoming orders
            </h2>
            <p className="text-sm text-[hsl(200_8%_55%)]">
              Orders assigned to your kitchen ·{" "}
              <span className="text-[hsl(200_8%_70%)]">{statusMsg}</span>
            </p>
          </div>
          <div
            className="flex flex-wrap gap-2"
            role="tablist"
            aria-label="Filter orders"
          >
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.id)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                    active
                      ? "border-[hsl(189_85%_44%/0.5)] bg-[hsl(189_85%_44%/0.2)] text-white shadow-inner"
                      : "border-white/15 bg-transparent text-[hsl(200_8%_62%)] hover:border-white/25 hover:text-white"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {loading && displayOrders.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-[hsl(200_22%_10%)] py-16 text-center text-[hsl(200_8%_55%)]">
            Loading orders…
          </div>
        ) : displayOrders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 bg-[hsl(200_22%_9%)] py-16 text-center">
            <Package className="mx-auto h-10 w-10 text-white/20" aria-hidden />
            <p className="mt-3 text-sm text-[hsl(200_8%_55%)]">
              No orders in this view.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {displayOrders.map((order) => {
              const st = order.status;
              const busy = updatingId === order.id;
              const addr =
                order.delivery_address || order.dropoff_address || "—";
              const when = relativeAge(
                order.updated_at || order.created_at,
              );
              const total = ((order.total_amount || 0) / 100).toFixed(2);

              return (
                <li
                  key={order.id}
                  className="rounded-2xl border border-white/10 bg-[hsl(200_22%_10%)] p-4 shadow-md transition hover:border-white/15"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-white">
                          {displayOrderId(order.id)}
                        </span>
                        <span
                          className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${badgeForStatus(st)}`}
                        >
                          {labelForStatus(st)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-medium text-white">
                        {formatItems(order.items)}
                      </p>
                      <p className="mt-1 text-xs text-[hsl(200_8%_55%)]">
                        {shortCustomer(order.user_id)} · {addr}
                        {when ? ` · ${when}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-[hsl(200_8%_45%)]">
                        Total ${total}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                      {st === "pending" && (
                        <button
                          type="button"
                          disabled={busy || !order.kitchen_id}
                          onClick={() => onAdvance(order.id, "cooking")}
                          title={
                            !order.kitchen_id
                              ? "Wait for kitchen assignment"
                              : "Start preparing"
                          }
                          className="inline-flex min-h-[40px] min-w-[120px] items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Accept
                        </button>
                      )}

                      {st === "cooking" && (
                        <>
                          <button
                            type="button"
                            disabled
                            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-600/50 bg-amber-950/40 px-3 py-2 text-xs font-medium text-amber-200/90"
                          >
                            <Clock className="h-3.5 w-3.5" aria-hidden />
                            Preparing
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              onAdvance(order.id, "finished_cooking")
                            }
                            className="inline-flex min-h-[40px] min-w-[120px] items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-500 disabled:opacity-50"
                          >
                            Ready
                          </button>
                        </>
                      )}

                      {st === "finished_cooking" && (
                        <button
                          type="button"
                          disabled
                          className="inline-flex min-h-[40px] min-w-[140px] cursor-default items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-[hsl(200_8%_55%)]"
                        >
                          Awaiting pickup
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-8 flex items-center justify-center gap-2 text-center text-[11px] text-[hsl(200_8%_40%)]">
          {online ? (
            <Wifi className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-amber-400" aria-hidden />
          )}
          Coordinate fulfilment · orders sync every 15s
        </p>
      </main>
    </div>
  );
}
