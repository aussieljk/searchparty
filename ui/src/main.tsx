import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { CrawlProvider } from "./hooks/CrawlProvider";
import "./index.css";

// Dark-first dashboard.
document.documentElement.classList.add("dark");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CrawlProvider>
      <App />
    </CrawlProvider>
  </StrictMode>,
);
