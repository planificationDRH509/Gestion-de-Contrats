import { ApplicantRepository } from "./repositories/ApplicantRepository";
import { ContractRepository } from "./repositories/ContractRepository";
import { DossierRepository } from "./repositories/DossierRepository";
import { PrintJobRepository } from "./repositories/PrintJobRepository";
import { AutocompleteRepository } from "./repositories/AutocompleteRepository";
import { TagRepository } from "./repositories/TagRepository";
import { createLocalProvider } from "./local/localProvider";
import { createSupabaseProvider } from "./supabase/supabaseProvider";

export type DataProvider = {
  applicants: ApplicantRepository;
  dossiers: DossierRepository;
  contracts: ContractRepository;
  printJobs: PrintJobRepository;
  suggestions: AutocompleteRepository;
  tags: TagRepository;
};

export function getDataProvider(): DataProvider {
  const provider = import.meta.env.VITE_DATA_PROVIDER ?? "local";
  if (provider === "supabase") {
    return createSupabaseProvider();
  }
  return createLocalProvider();
}
