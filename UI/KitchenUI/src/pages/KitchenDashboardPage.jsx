import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChefHat, RefreshCw, Wifi, WifiOff, Clock, Package } from "lucide-react";
import {
  fetchCoordinateHealth,
  fetchOrdersByStatuses,
  updateOrderStatus,
} from "../api/coordinateApi";

const STATUSES = ["pending", "cooking", "finished_cooking", "driver_assigned"];

const TABS = [
  { id: "all", label: "All" },
  { id: "pending", label: "New" },
  { id: "cooking", label: "Preparing" },
  { id: "finished_cooking", label: "Ready" },
  { id: "driver_assigned", label: "Picked Up" },
];

const FALLBACK_KITCHEN_ID = import.meta.env.VITE_KITCHEN_ID || null;

function filterAssignedPending(orders) {
  return orders.filter((o) => o.kitchen_id);
}

function filterByKitchenId(orders, kitchenId) {
  if (!kitchenId) return orders;
  return orders.filter((o) => o.kitchen_id === kitchenId);
}

function collectKitchenOptions(data) {
  const seen = new Map();
  for (const status of STATUSES) {
    for (const order of data[status] || []) {
      if (!order.kitchen_id || seen.has(order.kitchen_id)) continue;
      seen.set(order.kitchen_id, {
        id: order.kitchen_id,
        label: order.kitchen_address || order.kitchen_name || order.kitchen_id,
      });
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function numericOrderId(id) {
  if (typeof id !== "string") return Number.NEGATIVE_INFINITY;
  const parsed = Number.parseInt(id, 10);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function formatItems(items) {
  if (!Array.isArray(items)) return "-";
  const line = items
    .map(
      (i) =>
        `${i.Name || i.name || "Item"} x${i.Quantity || i.quantity || i.qty || 1}`,
    )
    .join(", ");
  return line.length > 90 ? `${line.slice(0, 87)}...` : line;
}

function displayOrderId(id) {
  if (!id || typeof id !== "string") return "#ORD----";
  const compact = id.replace(/-/g, "");
  const tail = compact.slice(-4).toUpperCase();
  return `#ORD-${tail}`;
}

function shortCustomer(userId) {
  if (!userId) return "Customer";
  const part = userId.split("-")[0];
  return part ? `${part.slice(0, 1).toUpperCase()}${part.slice(1, 8)}...` : "Customer";
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

function badgeForStatus(status) {
  switch (status) {
    case "pending":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "cooking":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "finished_cooking":
      return "border-sky-200 bg-sky-50 text-sky-700";
    default:
      return "border-[hsl(214_24%_88%)] bg-[hsl(214_32%_96%)] text-[hsl(215_16%_42%)]";
  }
}

function labelForStatus(status) {
  switch (status) {
    case "pending":
      return "New";
    case "cooking":
      return "Preparing";
    case "finished_cooking":
      return "Ready";
    default:
      return status;
  }
}

export default function KitchenDashboardPage() {
  const [tab, setTab] = useState("all");
  const [bucket, setBucket] = useState({
    pending: [],
    cooking: [],
    finished_cooking: [],
    driver_assigned: [],
  });
  const [kitchenId, setKitchenId] = useState(null);
  const [kitchenOptions, setKitchenOptions] = useState([]);
  const [online, setOnline] = useState(true);
  const [lastSynced, setLastSynced] = useState(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const prevNewCount = useRef(0);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setStatusMsg("Syncing...");
    try {
      const [health, firstPass] = await Promise.all([
        fetchCoordinateHealth(),
        fetchOrdersByStatuses(STATUSES),
      ]);
      setOnline(health);

      const options = collectKitchenOptions(firstPass);
      setKitchenOptions(options);

      const selectedKitchenId =
        kitchenId ||
        FALLBACK_KITCHEN_ID ||
        options[0]?.id ||
        null;

      const data = selectedKitchenId
        ? await fetchOrdersByStatuses(STATUSES, selectedKitchenId)
        : firstPass;

      const pending = sortByRecent(
        filterAssignedPending(filterByKitchenId(data.pending || [], selectedKitchenId)),
      );
      const cooking = sortByRecent(
        filterByKitchenId(data.cooking || [], selectedKitchenId),
      );
      const ready = sortByRecent(
        filterByKitchenId(data.finished_cooking || [], selectedKitchenId),
      );
      const pickedUp = sortByRecent(
        filterByKitchenId(data.driver_assigned || [], selectedKitchenId),
      );

      setBucket({
        pending,
        cooking,
        finished_cooking: ready,
        driver_assigned: pickedUp,
      });
      setKitchenId(selectedKitchenId);

      prevNewCount.current = pending.length;
      setLastSynced(new Date());
      setStatusMsg(
        health
          ? `Last synced ${new Date().toLocaleTimeString()}`
          : "Service unreachable - showing last data",
      );
    } catch (e) {
      setStatusMsg(e.message || "Could not load orders");
      setOnline(false);
    } finally {
      setLoading(false);
    }
  }, [kitchenId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const timer = window.setInterval(loadAll, 15000);
    return () => window.clearInterval(timer);
  }, [loadAll]);

  const stats = useMemo(
    () => ({
      new: bucket.pending.length,
      preparing: bucket.cooking.length,
      ready: bucket.finished_cooking.length,
      pickedUp: bucket.driver_assigned.length,
    }),
    [bucket],
  );

  const displayOrders = useMemo(() => {
    const merged = [...bucket.pending, ...bucket.cooking, ...bucket.finished_cooking, ...bucket.driver_assigned];
    const sorted = sortByRecent(merged);
    if (tab === "all") return sorted;
    if (tab === "pending") return sortByRecent(bucket.pending);
    if (tab === "cooking") return sortByRecent(bucket.cooking);
    if (tab === "finished_cooking") return sortByRecent(bucket.finished_cooking);
    if (tab === "driver_assigned") return sortByRecent(bucket.driver_assigned);
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
    <div className="min-h-full bg-[hsl(214_32%_97%)] text-[hsl(222_47%_14%)]">
      <main className="mx-auto max-w-6xl px-6 py-10 sm:px-8 lg:px-10">
        <header className="mb-8">
          <p className="mb-2 text-sm font-bold uppercase tracking-[0.14em] text-[hsl(217_91%_48%)]">
            Kitchen UI
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-[hsl(222_47%_14%)]">
            Kitchen Orders
          </h1>
          <p className="mt-3 max-w-3xl text-lg text-[hsl(215_16%_42%)]">
            Review orders assigned to a selected kitchen and move them through preparation.
          </p>
        </header>

        <section className="mb-8 rounded-[1.75rem] bg-[linear-gradient(135deg,hsl(222_47%_22%),hsl(222_47%_30%))] px-7 py-6 text-white shadow-[0_20px_40px_rgba(37,57,108,0.22)]">
          <div className="grid gap-4 md:grid-cols-[1.25fr_1fr_auto] md:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/65">
                Current status
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {online ? "Online and ready to accept jobs" : "Offline / degraded"}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/80">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${online ? "bg-emerald-400 shadow-[0_0_10px_rgba(34,197,94,0.35)]" : "bg-red-400"}`}
                    aria-hidden
                  />
                  {online ? "Kitchen online" : "Offline / degraded"}
                </span>
                <span className="text-white/35">·</span>
                <span>{lastSyncedLabel}</span>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/65">
                Available jobs
              </p>
              <p className="mt-2 text-4xl font-bold tabular-nums text-white">{stats.new}</p>
            </div>

            <button
              type="button"
              onClick={() => loadAll()}
              disabled={loading}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white text-sm font-semibold text-[hsl(222_47%_22%)] px-6 shadow-[0_10px_24px_rgba(15,23,42,0.08)] transition hover:bg-[hsl(214_32%_96%)] disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
              Refresh
            </button>
          </div>
        </section>

        <section className="mb-6">
          {kitchenOptions.length > 0 && (
            <div className="max-w-lg">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[hsl(215_16%_42%)]">
                Active Kitchen
              </label>
              <select
                value={kitchenId || ""}
                onChange={(e) => setKitchenId(e.target.value || null)}
                className="w-full rounded-2xl border border-[hsl(214_24%_88%)] bg-white px-4 py-3 text-sm font-medium text-[hsl(222_47%_18%)] outline-none shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition focus:border-[hsl(217_91%_48%)]"
              >
                {kitchenOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </section>

        <section>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-[hsl(222_47%_14%)]">
                Incoming orders
              </h2>
              <p className="mt-1 text-base text-[hsl(215_16%_42%)]">
                Orders assigned to your kitchen · <span className="text-[hsl(222_47%_22%)]">{statusMsg}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter orders">
              {TABS.map((t) => {
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(t.id)}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                      active
                        ? "border-[hsl(217_91%_48%)] bg-[hsl(217_91%_48%/0.08)] text-[hsl(222_47%_22%)]"
                        : "border-[hsl(214_24%_88%)] bg-white text-[hsl(215_16%_42%)] hover:border-[hsl(217_91%_48%/0.35)] hover:text-[hsl(222_47%_22%)]"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {loading && displayOrders.length === 0 ? (
            <div className="rounded-[1.75rem] border border-[hsl(214_24%_88%)] bg-white py-16 text-center text-[hsl(215_16%_42%)] shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
              Loading orders...
            </div>
          ) : displayOrders.length === 0 ? (
            <div className="rounded-[1.75rem] border-2 border-dashed border-[hsl(214_24%_88%)] bg-white py-16 text-center shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
              <Package className="mx-auto h-10 w-10 text-[hsl(214_24%_78%)]" aria-hidden />
              <p className="mt-3 text-sm text-[hsl(215_16%_42%)]">
                No orders in this view.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-5">
              {displayOrders.map((order) => {
                const status = order.status;
                const busy = updatingId === order.id;
                const addr = order.delivery_address || order.dropoff_address || "-";
                const when = relativeAge(order.updated_at || order.created_at);
                const total = ((order.total_amount || 0) / 100).toFixed(2);

                return (
                  <li
                    key={order.id}
                    className="rounded-[1.75rem] border border-[hsl(214_24%_88%)] bg-white p-6 shadow-[0_14px_36px_rgba(15,23,42,0.06)] transition hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)]"
                  >
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-base font-semibold text-[hsl(222_47%_14%)]">
                            {displayOrderId(order.id)}
                          </span>
                          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeForStatus(status)}`}>
                            {labelForStatus(status)}
                          </span>
                        </div>
                        <p className="mt-4 text-2xl font-semibold leading-tight text-[hsl(222_47%_18%)]">
                          {formatItems(order.items)}
                        </p>
                        <p className="mt-2 text-base text-[hsl(215_16%_42%)]">
                          {shortCustomer(order.user_id)} · {addr}
                          {when ? ` · ${when}` : ""}
                        </p>
                        <p className="mt-2 text-base font-medium text-[hsl(215_16%_42%)]">
                          Total ${total}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-3 lg:justify-end">
                        {status === "pending" && (
                          <button
                            type="button"
                            disabled={busy || !order.kitchen_id}
                            onClick={() => onAdvance(order.id, "cooking")}
                            title={!order.kitchen_id ? "Wait for kitchen assignment" : "Start preparing"}
                            className="inline-flex min-h-[48px] min-w-[150px] items-center justify-center rounded-2xl bg-[hsl(222_47%_22%)] px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(37,57,108,0.22)] transition hover:bg-[hsl(222_47%_28%)] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Accept
                          </button>
                        )}

                        {status === "cooking" && (
                          <>
                            <button
                              type="button"
                              disabled
                              className="inline-flex items-center gap-1.5 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700"
                            >
                              <Clock className="h-3.5 w-3.5" aria-hidden />
                              Preparing
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => onAdvance(order.id, "finished_cooking")}
                              className="inline-flex min-h-[48px] min-w-[150px] items-center justify-center rounded-2xl bg-[hsl(222_47%_22%)] px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(37,57,108,0.22)] transition hover:bg-[hsl(222_47%_28%)] disabled:opacity-50"
                            >
                              Ready
                            </button>
                          </>
                        )}

                        {status === "finished_cooking" && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onAdvance(order.id, "out_for_delivery")}
                            className="inline-flex min-h-[48px] min-w-[170px] items-center justify-center rounded-2xl bg-[hsl(217_91%_48%)] px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(37,57,108,0.22)] transition hover:bg-[hsl(217_91%_60%)] disabled:opacity-50"
                          >
                            Mark Picked Up
                          </button>
                        )}

                        {status === "out_for_delivery" && (
                          <button
                            type="button"
                            disabled
                            className="inline-flex min-h-[48px] min-w-[170px] cursor-default items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-5 text-sm font-medium text-emerald-700"
                          >
                            Picked Up
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="mt-10 flex items-center justify-center gap-2 text-center text-xs text-[hsl(215_16%_42%)]">
            {online ? (
              <Wifi className="h-3.5 w-3.5 text-[hsl(217_91%_48%)]" aria-hidden />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-amber-500" aria-hidden />
            )}
            Coordinate fulfilment · orders sync every 15s
          </p>
        </section>
      </main>
    </div>
  );
}
