import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipLayer } from "/src/app/ui/TooltipLayer";
import { ContractSyncIndicator } from "/src/features/contracts/ContractSyncIndicator";
import { ChartTooltipOverlay } from "/src/app/ui/ChartTooltipOverlay";
import { BarChart, Bar, Tooltip } from "recharts";
import "/src/styles/global.css";

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <TooltipLayer />
    <div className="contracts-page" style={{ position: "absolute", top: 80, left: 280, width: 350, height: 65, overflow: "hidden", transform: "translateZ(0)", isolation: "isolate" }}>
      <button id="contract" className="badge has-tooltip" data-tooltip="Sexe: Femme · Durée: 6 mois" aria-describedby="existing-description">Marie Jean</button>
      <ContractSyncIndicator contract={{ id: "fixture", workspaceId: "fixture", nif: "123", tags: [] } as any} pending={[]} online cloudEnabled={false} onRetry={async () => {}} />
    </div>
    <p id="existing-description" hidden>Description existante</p>
    <div id="cover" style={{ position: "fixed", top: 116, left: 270, width: 370, height: 180, zIndex: 9999, background: "#eee" }} />
    <aside className="sidebar collapsed" style={{ width: 90 }}>
      <nav className="sidebar-nav">
        <a id="nav" className="nav-item" href="#" data-tooltip="Identification" data-tooltip-placement="right" data-tooltip-desktop="true">Menu</a>
      </nav>
    </aside>
    <button id="edge" className="has-tooltip" style={{ position: "fixed", bottom: 8, right: 8 }} data-tooltip={"Un texte très long ".repeat(15)}>Bord</button>
    <div id="chart" style={{ position: "absolute", top: 350, left: 500, width: 320, height: 160, overflow: "hidden", transform: "translateZ(0)" }}>
      <BarChart width={320} height={160} data={[{ name: "A", count: 20 }, { name: "B", count: 10 }]}>
        <Bar dataKey="count" isAnimationActive={false} />
        <Tooltip isAnimationActive={false} content={({ active, payload, coordinate }) => active && payload?.length ?
          <ChartTooltipOverlay coordinate={coordinate}><div style={{ background: "#0f172a", color: "white", padding: 16, width: 210, height: 100 }}>Graphique : {payload[0].value}</div></ChartTooltipOverlay> : null} />
      </BarChart>
    </div>
    <dialog id="modal">
      <button id="modal-trigger" className="has-tooltip" data-tooltip="Infobulle de la fenêtre">Survol</button>
    </dialog>
  </QueryClientProvider>
);
