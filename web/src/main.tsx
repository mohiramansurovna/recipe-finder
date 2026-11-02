import { createRoot } from "react-dom/client";

import App from "./app/App.js";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing application root element.");

createRoot(rootElement).render(<App />);
