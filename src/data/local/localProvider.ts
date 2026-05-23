import { ApplicantRepository } from "../repositories/ApplicantRepository";
import { ContractRepository } from "../repositories/ContractRepository";
import { DossierRepository } from "../repositories/DossierRepository";
import { PrintJobRepository } from "../repositories/PrintJobRepository";
import { AutocompleteRepository } from "../repositories/AutocompleteRepository";
import { TagRepository } from "../repositories/TagRepository";
import { DataProvider } from "../dataProvider";
import { SqliteApplicantRepository } from "./sqliteApplicantRepository";
import { SqliteContractRepository } from "./sqliteContractRepository";
import { SqliteDossierRepository } from "./sqliteDossierRepository";
import { SqlitePrintJobRepository } from "./sqlitePrintJobRepository";
import { SqliteAutocompleteRepository } from "./sqliteAutocompleteRepository";
import { SqliteTagRepository } from "./sqliteTagRepository";

export function createLocalProvider(): DataProvider {
  const applicants: ApplicantRepository = new SqliteApplicantRepository();
  const dossiers: DossierRepository = new SqliteDossierRepository();
  const contracts: ContractRepository = new SqliteContractRepository();
  const printJobs: PrintJobRepository = new SqlitePrintJobRepository();
  const suggestions: AutocompleteRepository = new SqliteAutocompleteRepository();
  const tags: TagRepository = new SqliteTagRepository();

  return { applicants, dossiers, contracts, printJobs, suggestions, tags };
}
