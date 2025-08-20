import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css"; // ✅ Tailwind styles

import App from "./App"; // ✅ Routes

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);