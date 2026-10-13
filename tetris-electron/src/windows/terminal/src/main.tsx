import React from "react";
import ReactDOM from "react-dom/client";
import { initDarkMode } from "@tetris/shared/dark-mode";
import "@tetris/shared/styles/Theme.css";
import App from "./App";
import { AnalyticsProvider } from "../../shared/PostHogProvider";

initDarkMode();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AnalyticsProvider>
      <App />
    </AnalyticsProvider>
  </React.StrictMode>,
);
