import { AutocompleteRepository } from "../repositories/AutocompleteRepository";
import { 
  getAddresses, getPositions, getInstitutions,
  addAddress, updateAddress, deleteAddress,
  addPosition, updatePosition, deletePosition,
  addInstitution, updateInstitution, deleteInstitution,
  AddressSuggestion, PositionSuggestion, InstitutionSuggestion
} from "./suggestionsDb";

export class SqliteAutocompleteRepository implements AutocompleteRepository {
  async getAddresses(_workspaceId: string): Promise<AddressSuggestion[]> {
    return getAddresses();
  }
  async getPositions(_workspaceId: string): Promise<PositionSuggestion[]> {
    return getPositions();
  }
  async getInstitutions(_workspaceId: string): Promise<InstitutionSuggestion[]> {
    return getInstitutions();
  }
  async addAddress(_workspaceId: string, label: string): Promise<AddressSuggestion> {
    return addAddress(label);
  }
  async updateAddress(id: string, label: string): Promise<void> {
    updateAddress(id, label);
  }
  async deleteAddress(id: string): Promise<void> {
    deleteAddress(id);
  }
  async addPosition(_workspaceId: string, label: string, defaultSalary: number): Promise<PositionSuggestion> {
    return addPosition(label, defaultSalary);
  }
  async updatePosition(id: string, label: string, defaultSalary: number): Promise<void> {
    updatePosition(id, label, defaultSalary);
  }
  async deletePosition(id: string): Promise<void> {
    deletePosition(id);
  }
  async addInstitution(_workspaceId: string, label: string, addressKeywords: string[]): Promise<InstitutionSuggestion> {
    return addInstitution(label, addressKeywords);
  }
  async updateInstitution(id: string, label: string, addressKeywords: string[]): Promise<void> {
    updateInstitution(id, label, addressKeywords);
  }
  async deleteInstitution(id: string): Promise<void> {
    deleteInstitution(id);
  }
}
