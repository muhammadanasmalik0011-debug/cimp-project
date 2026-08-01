import React from "react";
import { Icon } from "./Icons.jsx";

export default function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.tone || "info"}`} role="status">
      <span className="toast-icon"><Icon name={toast.tone === "error" ? "info" : "check"} size={16} /></span>
      <span>{toast.message}</span>
      <button onClick={onClose} aria-label="Close notification"><Icon name="close" size={14} /></button>
    </div>
  );
}
