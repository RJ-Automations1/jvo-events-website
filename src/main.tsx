import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        theme="dark"
        position="top-center"
        toastOptions={{
          style: {
            background: "#111111",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "#ffffff",
            fontFamily: "'Lato', sans-serif",
          },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>
);
