import React from "react";
import ReactDOM from "react-dom/client";
import { AuthGate } from "./auth/AuthGate";
import { JOIN_PARAM } from "./lib/registration";
import { Register } from "./pages/Register";
import "./index.css";

// A gym's public registration link (/?join=<token>) opens the form without any login.
const joinToken = new URLSearchParams(window.location.search).get(JOIN_PARAM);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {joinToken !== null ? <Register token={joinToken} /> : <AuthGate />}
  </React.StrictMode>,
);
