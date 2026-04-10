import { z } from "zod";

export const contractFormSchema = z.object({
  gender: z
    .string()
    .refine((value) => value === "Homme" || value === "Femme", {
      message: "Le sexe est obligatoire."
    }),
  firstName: z.string().min(1, "Le prénom est obligatoire."),
  lastName: z.string().min(1, "Le nom est obligatoire."),
  nif: z
    .string()
    .min(1, "Le NIF est obligatoire.")
    .regex(/^\d{3}-\d{3}-\d{3}-\d$/, {
      message: "Le NIF doit être au format XXX-XXX-XXX-X."
    }),
  ninu: z
    .string()
    .optional()
    .refine((value) => !value || /^\d{10}$/.test(value), {
      message: "Le NINU doit comporter exactement 10 chiffres."
    }),
  salaryNumber: z
    .string()
    .min(1, "Le salaire est obligatoire.")
    .refine((value) => !Number.isNaN(Number.parseFloat(value.replace(/\s/g, "").replace(",", "."))), {
      message: "Le salaire doit être un nombre valide."
    }),
  salaryText: z.string().min(1, "Le salaire en lettre est obligatoire."),
  position: z.string().min(1, "Le poste est obligatoire."),
  assignment: z.string().min(1, "L'affectation est obligatoire."),
  address: z.string().min(1, "L'adresse est obligatoire."),
  dossierId: z.string().optional(),
  durationMonths: z.number().min(1).max(12)
});

export type ContractFormSchema = z.input<typeof contractFormSchema>;
