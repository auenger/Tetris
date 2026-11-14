import { createRoot } from "react-dom/client";
import { initDarkMode } from "@tetris/shared/dark-mode";
import "@tetris/theme/styles.css";
import "./styles.css";
import { installDevShim } from "./dev-shim";
import App from "./App";
import { SupervisorView } from './SupervisorView';
import { WorkerView } from './WorkerView';
import './supervisor.css';

// Install mock API when running outside Electron
installDevShim();
initDarkMode();

const root = document.getElementById("root");
if (root) {
  const params = new URLSearchParams(location.search);
  createRoot(root).render(params.get('mode') === 'worker'
    ? <WorkerView sessionId={params.get('sessionId') || ''} />
    : params.get('mode') === 'direct' ? <App /> : <SupervisorView />);
}
