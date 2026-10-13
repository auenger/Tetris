import { createRoot } from "react-dom/client";
import { initDarkMode } from "@tetris/shared/dark-mode";
import App from "./App";
import "@tetris/shared/styles/Theme.css";
import "./styles/App.css";
import "@tetris/components/WorkspaceGraph/WorkspaceGraph.css";

initDarkMode();

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
