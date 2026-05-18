import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// J3-N2-09: the bundle parsed and is executing, so any stale-bundle
// reload attempt from index.html's safety net was successful.
// Clear the one-shot marker so a real future bundle bug doesn't get
// silently swallowed by it.
try {
  sessionStorage.removeItem("__unboks_stale_bundle_reload");
} catch {
  // sessionStorage unavailable — nothing to clear.
}

createRoot(document.getElementById("root")!).render(<App />);
