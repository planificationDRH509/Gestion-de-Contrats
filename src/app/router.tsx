import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import { LoginPage } from "../features/auth/LoginPage";
import { RequireAuth } from "../features/auth/RequireAuth";
import { ContractsListPage } from "../features/contracts/ContractsListPage";
import { ContractNewPage } from "../features/contracts/ContractNewPage";
import { ContractDetailPage } from "../features/contracts/ContractDetailPage";
import { ContractsPrintPage } from "../features/contracts/ContractsPrintPage";
import { ContractPreviewPage } from "../features/contracts/ContractPreviewPage";
import { ContractEditPage } from "../features/contracts/ContractEditPage";
import { StatisticsPage } from "../features/statistics/StatisticsPage";
import { DraftHtmlPage } from "../features/settings/DraftHtmlPage";
import { SuggestionsSettingsPage } from "../features/settings/SuggestionsSettingsPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { BackupSqlPage } from "../features/settings/BackupSqlPage";
import { UserManagementPage } from "../features/settings/UserManagementPage";
import { DisplaySettingsPage } from "../features/settings/DisplaySettingsPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Navigate to="/app/contrats" replace />} />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="contrats" element={<ContractsListPage />} />
        <Route path="dossiers" element={<Navigate to="/app/contrats" replace />} />
        <Route path="contrats/nouveau" element={<ContractNewPage />} />
        <Route path="contrats/preview" element={<ContractPreviewPage />} />
        <Route path="contrats/:contractId/modifier" element={<ContractEditPage />} />
        <Route path="contrats/:contractId" element={<ContractDetailPage />} />
        <Route path="contrats/print" element={<ContractsPrintPage />} />
        <Route path="statistiques" element={<StatisticsPage />} />
        <Route path="parametres" element={<SettingsPage />} />
        <Route path="parametres/draft-html" element={<DraftHtmlPage />} />
        <Route path="parametres/suggestions" element={<SuggestionsSettingsPage />} />
        <Route path="parametres/backup-sql" element={<BackupSqlPage />} />
        <Route path="parametres/utilisateurs" element={<UserManagementPage />} />
        <Route path="parametres/affichage" element={<DisplaySettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/app/contrats" replace />} />
    </Routes>
  );
}
