import { act, cleanup, fireEvent, render as renderView, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { OutboxItem } from "../../data/types";
import { IdentificationSpreadsheetView } from "./IdentificationSpreadsheetView";

const attachments = vi.hoisted(() => vi.fn(() => null));
vi.mock('../auth/auth', () => ({useAuth: () => ({user:null})}));
vi.mock('../attachments/PersonAttachmentsDialog', () => ({PersonAttachmentsDialog: attachments}));
function render(view: ReactElement) {
  return renderView(<QueryClientProvider client={new QueryClient()}>{view}</QueryClientProvider>);
}
const state = vi.hoisted(() => ({ pending: [] as OutboxItem[] }));
vi.mock("../../data/local/offlineStore", () => ({ getPendingOutbox: () => state.pending }));
vi.mock("../settings/suggestionsApi", () => ({ useAddresses: () => ({ data: [] }) }));
vi.mock("./identificationApi", () => ({
  useIdentificationList: () => ({ data: [{ id: "a", nif: "1234567890", nom: "Louis", prenom: "Jean", sexe: "Homme", adresse: "", workspace_id: "w" }] }),
  useCreateIdentification: () => ({}), useUpdateIdentification: () => ({}), useDeleteIdentification: () => ({})
}));
beforeEach(() => { vi.stubEnv("VITE_DATA_PROVIDER", "supabase"); state.pending = []; });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

it("updates the row from queued to failed to acknowledged without reloading", () => {
  state.pending = [{ id: "q", workspaceId: "w", type: "applicant.upsert", payload: { id: "a" }, createdAt: "now" }];
  render(<IdentificationSpreadsheetView workspaceId="w" userId="u" />);
  expect(screen.getByLabelText("En attente de synchronisation")).toHaveTextContent("cloud_upload");
  act(() => {
    state.pending = [{ ...state.pending[0], lastError: "Conflit NIF" }];
    window.dispatchEvent(new CustomEvent("contribution-offline-sync"));
  });
  expect(screen.getByLabelText("Conflit NIF")).toHaveTextContent("error");
  act(() => { state.pending = []; window.dispatchEvent(new CustomEvent("contribution-offline-sync")); });
  expect(screen.getByLabelText("Synchronisé sur le cloud")).toHaveTextContent("check_circle");
});

it("ignores pending changes from another workspace", () => {
  state.pending = [{ id: "q", workspaceId: "other", type: "applicant.upsert", payload: { id: "a" }, createdAt: "now", lastError: "Autre erreur" }];
  render(<IdentificationSpreadsheetView workspaceId="w" userId="u" />);
  expect(screen.getByLabelText("Synchronisé sur le cloud")).toBeInTheDocument();
});

it("does not claim cloud synchronization in local mode", () => {
  vi.stubEnv("VITE_DATA_PROVIDER", "local");
  render(<IdentificationSpreadsheetView workspaceId="w" userId="u" />);
  expect(screen.getByLabelText("Sur cet appareil")).toHaveTextContent("devices");
  expect(screen.queryByLabelText("Synchronisé sur le cloud")).not.toBeInTheDocument();
});

it("opens attachments directly from the identification without a contract", () => {
  render(<IdentificationSpreadsheetView workspaceId="w" userId="u" />);
  fireEvent.click(screen.getByRole('button', {name:'Pièces jointes'}));
  expect(attachments).toHaveBeenLastCalledWith(expect.objectContaining({person:{
    workspaceId:'w',applicantId:'a',nif:'1234567890',firstName:'Jean',lastName:'Louis'
  }}), expect.anything());
});
