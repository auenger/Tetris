import { createRoot } from "react-dom/client";
import { initDarkMode } from "@tetris/shared/dark-mode";
import "@tetris/theme/styles.css";
import "./styles.css";
import { installDevShim } from "./dev-shim";
import App from "./App";

// Install mock API when running outside Electron
installDevShim();
initDarkMode();

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
