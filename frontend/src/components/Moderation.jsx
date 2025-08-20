import React, { useState, useMemo } from "react";
import { Shield, Filter, Search, Download, AlertTriangle, UserX, UserMinus, Ban, FileText } from "lucide-react";

/* ----- Mock Data (swap with API later) ----- */
const RAW_LOGS = [
  { id: 1, user: "Kai", action: "Warning", staff: "Jason", reason: "Disrespectful behavior", date: "2025-08-02 14:22" },
  { id: 2, user: "Luna", action: "Mute", staff: "WaveMaster", reason: "Spamming in chat", date: "2025-08-01 19:10" },
  { id: 3, user: "Nori", action: "Kick", staff: "Jason", reason: "AFK during event", date: "2025-08-01 15:44" },
  { id: 4, user: "Milo", action: "Ban", staff: "CoachLuna", reason: "Exploiting", date: "2025-07-31 21:37" },
  { id: 5, user: "Kai", action: "Note", staff: "Jason", reason: "Improved performance this week", date: "2025-07-30 18:20" },
];

/* Action → icon mapping */
const actionIcons = {
  Warning: <AlertTriangle className="w-4 h-4 text-yellow-500" />,
  Mute: <UserMinus className="w-4 h-4 text-blue-500" />,
  Kick: <UserX className="w-4 h-4 text-orange-500" />,
  Ban: <Ban className="w-4 h-4 text-red-500" />,
  Note: <FileText className="w-4 h-4 text-gray-500" />,
};

export default function ModerationPage() {
  const [query, setQuery] = useState("");
  const [filterAction, setFilterAction] = useState("All");

  const filtered = useMemo(() => {
    return RAW_LOGS.filter((log) => {
      const matchQuery =
        log.user.toLowerCase().includes(query.toLowerCase()) ||
        log.staff.toLowerCase().includes(query.toLowerCase());
      const matchAction = filterAction === "All" || log.action === filterAction;
      return matchQuery && matchAction;
    });
  }, [query, filterAction]);

  const exportCSV = () => {
    const headers = ["User,Action,Staff,Reason,Date"];
    const rows = filtered.map((l) => `${l.user},${l.action},${l.staff},${l.reason},${l.date}`);
    const blob = new Blob([headers.concat(rows).join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `moderation_logs_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      {/* Header & Filters */}
      <section className="rounded-xl border border-orange-100 bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <Shield className="w-5 h-5 text-orange-600" />
              Moderation
            </h1>
            <p className="text-sm text-gray-600">Review and manage recent moderation actions.</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Select
              value={filterAction}
              onChange={setFilterAction}
              icon={<Filter className="w-4 h-4" />}
              options={["All", "Warning", "Mute", "Kick", "Ban", "Note"]}
            />
            <SearchBox value={query} onChange={setQuery} />
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

      {/* Table */}
      <section className="rounded-xl border border-orange-100 bg-white overflow-hidden">
        <div className="px-5 py-3 text-sm text-gray-600">
          Showing <strong>{filtered.length}</strong> result{filtered.length === 1 ? "" : "s"}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-orange-50 text-gray-700">
              <tr>
                <Th>User</Th>
                <Th>Action</Th>
                <Th>Staff</Th>
                <Th>Reason</Th>
                <Th>Date</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-orange-100">
              {filtered.map((log) => (
                <tr key={log.id} className="hover:bg-orange-50/40">
                  <Td>{log.user}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      {actionIcons[log.action]}
                      <span>{log.action}</span>
                    </div>
                  </Td>
                  <Td>{log.staff}</Td>
                  <Td className="max-w-md truncate" title={log.reason}>{log.reason}</Td>
                  <Td>{log.date}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* ---------- Subcomponents ---------- */
function Th({ children }) {
  return <th className="px-5 py-2.5 font-medium text-left">{children}</th>;
}
function Td({ children }) {
  return <td className="px-5 py-3 text-gray-800">{children}</td>;
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
function SearchBox({ value, onChange }) {
  return (
    <label className="inline-flex items-center gap-2 rounded-lg border border-orange-200 bg-white px-2.5 py-2 text-sm">
      <Search className="w-4 h-4 text-orange-600" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search user/staff…"
        className="w-40 bg-transparent outline-none placeholder:text-gray-400"
      />
    </label>

  )};