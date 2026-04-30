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
  async updateAddress(id: string, label: string, prefix?: string | null, labelFeminine?: string | null): Promise<void> {
    updateAddress(id, label, prefix, labelFeminine);
  }
  async deleteAddress(id: string): Promise<void> {
    deleteAddress(id);
  }
  async addPosition(_workspaceId: string, label: string, salaries: number[]): Promise<PositionSuggestion> {
    return addPosition(label, salaries);
  }
  async updatePosition(
    id: string,
    label: string,
    salaries: number[],
    prefix?: string | null,
    labelFeminine?: string | null
  ): Promise<void> {
    updatePosition(id, label, salaries, prefix, labelFeminine);
  }
  async deletePosition(id: string): Promise<void> {
    deletePosition(id);
  }
  async addInstitution(_workspaceId: string, label: string, addressKeywords: string[]): Promise<InstitutionSuggestion> {
    return addInstitution(label, addressKeywords);
  }
  async updateInstitution(
    id: string,
    label: string,
    addressKeywords: string[],
    prefix?: string | null,
    labelFeminine?: string | null
  ): Promise<void> {
    updateInstitution(id, label, addressKeywords, prefix, labelFeminine);
  }
  async deleteInstitution(id: string): Promise<void> {
    deleteInstitution(id);
  }
}
