// Entry point for the single-file snapshot (npm run export). No server, no network calls.
import { createRoot } from "react-dom/client";
import { Dashboard } from "@/components/Dashboard";
import type { Dataset } from "@/lib/types";

const data = (window as unknown as { __DATA__: Dataset }).__DATA__;
createRoot(document.getElementById("root")!).render(<Dashboard snapshot={data} />);
