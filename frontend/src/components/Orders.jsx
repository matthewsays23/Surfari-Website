import React, { useMemo, useState } from "react";
import { Store, Filter, Calendar, Search, Download, CreditCard, Receipt, RotateCcw, DollarSign } from "lucide-react";

/* ---- Mock data (replace with API later) ---- */
const RAW_ORDERS = [
  { id: "1845", user: "Kai", items: 3, total: 8.50, status: "Paid", method: "Card", staff: "Jason", date: "2025-08-02 14:35" },
  { id: "1844", user: "Luna", items: 1, total: 3.00, status: "Paid", method: "Cash", staff: "Jason", date: "2025-08-02 13:58" },
  { id: "1843", user: "Milo", items: 2, total: 6.25, status: "Refunded", method: "Card", staff: "WaveMaster", date: "2025-08-02 13:15" },
  { id: "1842", user: "Jason", items: 4, total: 11.00, status: "Paid", method: "Card", staff: "CoachLuna", date: "2025-08-01 17:20" },
  { id: "1841", user: "Nori", items: 1, total: 2.75, status: "Pending", method: "Card", staff: "Jason", date: "2025-08-01 16:42" },
];

const STATUS_CHIP = {
  Paid:    "bg-emerald-100 text-emerald-700",
  Pending: "bg-yellow-100 text-yellow-700",
  Refunded:"bg-red-100 text-red-700",
};

export default function OrdersPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [range, setRange] = useState("Today"); // Today | 7 days | 30 days | All

  // Basic filter logic; swap with server-side later
  const filtered = useMemo(() => {
    return RAW_ORDERS.filter((o) => {
      const q = query.toLowerCase().trim();
      const matchQuery = !q || o.id.includes(q) || o.user.toLowerCase().includes(q) || o.staff.toLowerCase().includes(q);
      const matchStatus = status === "All" || o.status === status;
      // range shortcut (pretend all are "today" for demo)
      const matchRange = range === "All" || range === "Today" || range === "7 days" || range === "30 days";
      return matchQuery && matchStatus && matchRange;
    });
  }, [query, status, range]);

  // KPIs
  const metrics = useMemo(() => {
    const today = filtered; // if you track dates, narrow here for "Today"
    const orders = today.length;
    const sales = today.reduce((s, o) => s + o.total, 0);
    const refunds = today.filter((o) => o.status === "Refunded").reduce((s, o) => s + o.total, 0);
    const aov = orders ? sales / orders : 0;
    return {
      sales: sales.toFixed(2),
      orders,
      aov: aov.toFixed(2),
      refunds: refunds.toFixed(2),
    };
  }, [filtered]);

  const exportCSV = () => {
    const headers = ["OrderID,User,Items,Total,Status,Method,Staff,Date"];
    const rows = filtered.map((o) => `${o.id},${o.user},${o.items},${o.total},${o.status},${o.method},${o.staff},${o.date}`);
    const blob = new Blob([headers.concat(rows).join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      {/* Header + Filters */}
      <section className="rounded-xl border border-orange-100 bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <Store className="w-5 h-5 text-orange-600" />
              Orders
            </h1>
            <p className="text-sm text-gray-600">Register logs and sales overview.</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Select value={range}  onChange={setRange}  icon={<Calendar className="w-4 h-4" />} options={["Today", "7 days", "30 days", "All"]} />
            <Select value={status} onChange={setStatus} icon={<Filter className="w-4 h-4" />}   options={["All", "Paid", "Pending", "Refunded"]} />
            <SearchBox value={query} onChange={setQuery} placeholder="Search order, user, staff…" />
            <button
              onClick={exportCSV}
              className="inline-flex items-center gap-2 rounded-lg border border-orange-200 px-3 py-2 text-sm text-orange-700 hover:bg-orange-50"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>
      </section>

      {/* KPI Row */}
      <section className="grid gap-4 sm:gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <KPI icon={<DollarSign className="w-4 h-4" />} title="Today's Sales" value={`$${metrics.sales}`} />
        <KPI icon={<Receipt className="w-4 h-4" />}    title="Orders"        value={metrics.orders} />
        <KPI icon={<CreditCard className="w-4 h-4" />} title="AOV"           value={`$${metrics.aov}`} />
        <KPI icon={<RotateCcw className="w-4 h-4" />}  title="Refunds"       value={`$${metrics.refunds}`} tone={metrics.refunds > 0 ? "warn" : "ok"} />
      </section>

      {/* Table */}
      <section className="rounded-xl border border-orange-100 bg-white overflow-hidden">
        <div className="px-5 py-3 text-sm text-gray-600">
          Showing <strong>{filtered.length}</strong> order{filtered.length === 1 ? "" : "s"}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-orange-50 text-gray-700">
              <tr>
                <Th>Order #</Th>
                <Th>User</Th>
                <Th align="right">Items</Th>
                <Th align="right">Total</Th>
                <Th>Status</Th>
                <Th>Method</Th>
                <Th>Staff</Th>
                <Th>Date</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-orange-100">
              {filtered.map((o) => (
                <tr key={o.id} className="hover:bg-orange-50/40">
                  <Td>#{o.id}</Td>
                  <Td>{o.user}</Td>
                  <Td align="right">{o.items}</Td>
                  <Td align="right">${o.total.toFixed(2)}</Td>
                  <Td>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${STATUS_CHIP[o.status]}`}>{o.status}</span>
                  </Td>
                  <Td>{o.method}</Td>
                  <Td>{o.staff}</Td>
                  <Td>{o.date}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* ---- UI helpers ---- */
function KPI({ icon, title, value, tone }) {
  const chip =
    tone === "warn" ? "bg-yellow-100 text-yellow-700" :
    tone === "bad"  ? "bg-red-100 text-red-700" :
                      "bg-emerald-100 text-emerald-700";
  return (
    <div className="rounded-xl border border-orange-100 bg-white p-4">
      <div className="flex items-center gap-2 text-xs text-gray-500">{icon}{title}</div>
      <div className="mt-1 text-xl font-semibold text-gray-900">{value}</div>
      {tone && <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] ${chip}`}>{tone === "warn" ? "attention" : tone === "bad" ? "issue" : "good"}</span>}
    </div>
  );
}

function Th({ children, align = "left" }) {
  return <th className={`px-5 py-2.5 font-medium ${align === "right" ? "text-right" : "text-left"}`}>{children}</th>;
}
function Td({ children, align = "left" }) {
  return <td className={`px-5 py-3 ${align === "right" ? "text-right" : "text-left"} text-gray-800`}>{children}</td>;
}

function Select({ value, onChange, icon, options }) {
  return (
    <label className="inline-flex items-center gap-2 rounded-lg border border-orange-200 bg-white px-2.5 py-2 text-sm">
      {icon}
      <select className="outline-none bg-transparent" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((opt) => <option key={opt}>{opt}</option>)}
      </select>
    </label>
  );
}

function SearchBox({ value, onChange, placeholder = "Search…" }) {
  return (
    <label className="inline-flex items-center gap-2 rounded-lg border border-orange-200 bg-white px-2.5 py-2 text-sm">
      <Search className="w-4 h-4 text-orange-600" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-48 bg-transparent outline-none placeholder:text-gray-400"
      />
    </label>
  );
}
