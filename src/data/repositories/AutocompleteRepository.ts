import { AddressSuggestion, PositionSuggestion, InstitutionSuggestion } from "../local/suggestionsDb";

export interface AutocompleteRepository {
  getAddresses(workspaceId: string): Promise<AddressSuggestion[]>;
  getPositions(workspaceId: string): Promise<PositionSuggestion[]>;
  getInstitutions(workspaceId: string): Promise<InstitutionSuggestion[]>;
  
  addAddress(workspaceId: string, label: string, createdBy?: string): Promise<AddressSuggestion>;
  updateAddress(id: string, label: string, prefix?: string | null, labelFeminine?: string | null): Promise<void>;
  deleteAddress(id: string): Promise<void>;
  
  addPosition(workspaceId: string, label: string, salaries: number[], createdBy?: string): Promise<PositionSuggestion>;
  updatePosition(id: string, label: string, salaries: number[], prefix?: string | null, labelFeminine?: string | null): Promise<void>;
  deletePosition(id: string): Promise<void>;
  
  addInstitution(workspaceId: string, label: string, addressKeywords: string[], createdBy?: string): Promise<InstitutionSuggestion>;
  updateInstitution(id: string, label: string, addressKeywords: string[], prefix?: string | null, labelFeminine?: string | null): Promise<void>;
  deleteInstitution(id: string): Promise<void>;
}
