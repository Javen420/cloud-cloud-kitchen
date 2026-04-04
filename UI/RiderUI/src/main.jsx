import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { RiderAuthProvider } from "./lib/authContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RiderAuthProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </RiderAuthProvider>
  </React.StrictMode>,
);
