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
import { GeneralSettingsPage } from "../features/settings/GeneralSettingsPage";
import { IdentificationPage } from "../features/identification/IdentificationPage";
import { RequirePermission } from "../features/auth/RequirePermission";
import { AuditPage } from "../features/audit/AuditPage";
import { QualityPage } from "../features/quality/QualityPage";

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
        <Route path="contrats/nouveau" element={<RequirePermission permission="contracts.create"><ContractNewPage /></RequirePermission>} />
        <Route path="contrats/preview" element={<RequirePermission permission="contracts.create"><ContractPreviewPage /></RequirePermission>} />
        <Route path="contrats/:contractId/modifier" element={<RequirePermission permission="contracts.edit"><ContractEditPage /></RequirePermission>} />
        <Route path="contrats/:contractId" element={<ContractDetailPage />} />
        <Route path="contrats/print" element={<RequirePermission permission="contracts.print"><ContractsPrintPage /></RequirePermission>} />
        <Route path="statistiques" element={<RequirePermission permission="statistics.view"><StatisticsPage /></RequirePermission>} />
        <Route path="audit" element={<RequirePermission permission="audit.view"><AuditPage /></RequirePermission>} />
        <Route path="controle-qualite" element={<RequirePermission permission="quality.view"><QualityPage /></RequirePermission>} />
        <Route path="identification" element={<RequirePermission permission="identification.manage"><IdentificationPage /></RequirePermission>} />
        <Route path="parametres" element={<RequirePermission permission="settings.manage"><SettingsPage /></RequirePermission>} />
        <Route path="parametres/draft-html" element={<RequirePermission permission="settings.manage"><DraftHtmlPage /></RequirePermission>} />
        <Route path="parametres/suggestions" element={<RequirePermission permission="settings.manage"><SuggestionsSettingsPage /></RequirePermission>} />
        <Route path="parametres/backup-sql" element={<RequirePermission permission="settings.manage"><BackupSqlPage /></RequirePermission>} />
        <Route path="parametres/utilisateurs" element={<RequirePermission permission="users.manage"><UserManagementPage /></RequirePermission>} />
        <Route path="parametres/affichage" element={<RequirePermission permission="settings.manage"><DisplaySettingsPage /></RequirePermission>} />
        <Route path="parametres/general" element={<RequirePermission permission="settings.manage"><GeneralSettingsPage /></RequirePermission>} />
      </Route>
      <Route path="*" element={<Navigate to="/app/contrats" replace />} />
    </Routes>
  );
}
