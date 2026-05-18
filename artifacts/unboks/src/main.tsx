import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Clear the stale-bundle recovery marker from the current safety net
// so a future genuine bundle error isn't swallowed.
try {
  sessionStorage.removeItem("__unbuks_stale_bundle_reload_v3");
} catch {
  // sessionStorage unavailable
}

createRoot(document.getElementById("root")!).render(<App />);
