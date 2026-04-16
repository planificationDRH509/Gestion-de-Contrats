import { AddressSuggestion, PositionSuggestion, InstitutionSuggestion } from "../local/suggestionsDb";

export interface AutocompleteRepository {
  getAddresses(workspaceId: string): Promise<AddressSuggestion[]>;
  getPositions(workspaceId: string): Promise<PositionSuggestion[]>;
  getInstitutions(workspaceId: string): Promise<InstitutionSuggestion[]>;
  
  addAddress(workspaceId: string, label: string): Promise<AddressSuggestion>;
  updateAddress(id: string, label: string): Promise<void>;
  deleteAddress(id: string): Promise<void>;
  
  addPosition(workspaceId: string, label: string, defaultSalary: number): Promise<PositionSuggestion>;
  updatePosition(id: string, label: string, defaultSalary: number): Promise<void>;
  deletePosition(id: string): Promise<void>;
  
  addInstitution(workspaceId: string, label: string, addressKeywords: string[]): Promise<InstitutionSuggestion>;
  updateInstitution(id: string, label: string, addressKeywords: string[]): Promise<void>;
  deleteInstitution(id: string): Promise<void>;
}
