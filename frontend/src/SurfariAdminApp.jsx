import React, { useState } from "react";
import AccessGate from "./components/AccessGate";
import Sidebar from "./components/Sidebar";
import HomeScreen from "./components/HomeScreen";
import Activity from "./components/Activity";
import Moderation from "./components/Moderation";
import Orders from "./components/Orders";
import Team from "./components/Team";
import Sessions from "./components/Sessions";

export default function SurfariAdminApp() {
  const [activeTab, setActiveTab] = useState("home");

  return (
    <AccessGate>
      <div className="flex">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        <main className="flex-1 p-6">
          {activeTab === "home" && <HomeScreen />}
          {activeTab === "activity" && <Activity />}
          {activeTab === "moderation" && <Moderation />}
          {activeTab === "orders" && <Orders />}
          {activeTab === "team" && <Team />}
           {activeTab === "sessions" && <Sessions />}
        </main>
      </div>
    </AccessGate>
  );
}
