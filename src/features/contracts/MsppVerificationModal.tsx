import React, { useEffect, useState } from "react";

interface MsppVerificationModalProps {
  nif: string;
  onClose: () => void;
}

export const MsppVerificationModal: React.FC<MsppVerificationModalProps> = ({ nif, onClose }) => {
  const [isVisible, setIsVisible] = useState(false);
  const rawNif = nif.replace(/\D/g, "");

  useEffect(() => {
    // Trigger animation on mount
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300); // Wait for animation to finish
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        backgroundColor: "rgba(15, 23, 42, 0.4)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        opacity: isVisible ? 1 : 0,
        transition: "opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <style>{`
        @keyframes modal-pop-in {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
      <div
        style={{
          background: "var(--panel)",
          borderRadius: "var(--radius)",
          width: "100%",
          maxWidth: "600px",
          height: "80vh",
          maxHeight: "700px",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--shadow-premium)",
          border: "1px solid var(--border)",
          overflow: "hidden",
          animation: isVisible ? "modal-pop-in 0.4s var(--premium-ease) forwards" : "none",
          transform: isVisible ? "scale(1) translateY(0)" : "scale(0.95) translateY(10px)",
          opacity: isVisible ? 1 : 0,
          transition: "all 0.4s var(--premium-ease)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 24px",
            borderBottom: "1px solid var(--border)",
            background: "var(--panel-muted)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                backgroundColor: "var(--accent-soft)",
                color: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span className="material-symbols-rounded" style={{ fontSize: "22px" }}>
                verified_user
              </span>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--ink)" }}>
                Vérification MSPP
              </h3>
              <p style={{ margin: 0, fontSize: "12px", color: "var(--ink-muted)" }}>
                Ministère de la Santé Publique et de la Population
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="sidebar-toggle-hamburger" // Reuse existing styling if available
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--ink-muted)",
              transition: "all 0.2s ease",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = "var(--danger-soft)";
              e.currentTarget.style.color = "var(--danger)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--ink-muted)";
            }}
          >
            <span className="material-symbols-rounded" style={{ fontSize: "20px" }}>
              close
            </span>
          </button>
        </div>

        {/* Content/Iframe Container */}
        <div style={{ flex: 1, position: "relative", backgroundColor: "#f8fafc" }}>
          <iframe
            src={`/api/local/mspp/verify?nif=${rawNif}`}
            title="MSPP Verification Site"
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              display: "block",
            }}
          />
        </div>

        {/* Footer/Info Bar */}
        <div
          style={{
            padding: "12px 24px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--panel-muted)",
            fontSize: "12px",
            color: "var(--ink-muted)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span className="material-symbols-rounded" style={{ fontSize: "16px" }}>
              info
            </span>
            <span>Données en temps réel (mspp.gouv.ht)</span>
          </div>
          <div style={{ fontWeight: 600 }}>NIF: {nif}</div>
        </div>
      </div>
    </div>
  );
};
