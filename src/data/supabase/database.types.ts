export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_users: {
        Row: {
          created_at: string | null
          full_name: string
          id: string
          password: string
          updated_at: string | null
          username: string
          workspaces: string[]
        }
        Insert: {
          created_at?: string | null
          full_name: string
          id?: string
          password: string
          updated_at?: string | null
          username: string
          workspaces?: string[]
        }
        Update: {
          created_at?: string | null
          full_name?: string
          id?: string
          password?: string
          updated_at?: string | null
          username?: string
          workspaces?: string[]
        }
        Relationships: []
      }
      autocompletion: {
        Row: {
          address_keywords: string | null
          created_at: string
          default_salary: number | null
          id: string
          label: string
          order_index: number
          type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          address_keywords?: string | null
          created_at?: string
          default_salary?: number | null
          id: string
          label: string
          order_index?: number
          type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          address_keywords?: string | null
          created_at?: string
          default_salary?: number | null
          id?: string
          label?: string
          order_index?: number
          type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "autocompletion_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_print_jobs: {
        Row: {
          contract_ids_json: string
          created_at: string
          id: string
          printed_at: string | null
          workspace_id: string
        }
        Insert: {
          contract_ids_json: string
          created_at: string
          id: string
          printed_at?: string | null
          workspace_id: string
        }
        Update: {
          contract_ids_json?: string
          created_at?: string
          id?: string
          printed_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_print_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contrat: {
        Row: {
          annee_fiscale: string
          created_at: string
          deleted_at: string | null
          dossier_id: string | null
          duree_contrat: number
          historique_saisie: string | null
          id_contrat: string
          lieu_affectation: string
          nif: string
          salaire: string
          salaire_en_chiffre: number
          status: string
          titre: string
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          annee_fiscale: string
          created_at?: string
          deleted_at?: string | null
          dossier_id?: string | null
          duree_contrat?: number
          historique_saisie?: string | null
          id_contrat: string
          lieu_affectation: string
          nif: string
          salaire: string
          salaire_en_chiffre: number
          status?: string
          titre: string
          updated_at?: string | null
          workspace_id?: string
        }
        Update: {
          annee_fiscale?: string
          created_at?: string
          deleted_at?: string | null
          dossier_id?: string | null
          duree_contrat?: number
          historique_saisie?: string | null
          id_contrat?: string
          lieu_affectation?: string
          nif?: string
          salaire?: string
          salaire_en_chiffre?: number
          status?: string
          titre?: string
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contrat_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrat_nif_fkey"
            columns: ["nif"]
            isOneToOne: false
            referencedRelation: "identification"
            referencedColumns: ["nif"]
          },
          {
            foreignKeyName: "contrat_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      dossiers: {
        Row: {
          comment: string | null
          contract_target_count: number
          created_at: string
          deadline_date: string | null
          deleted_at: string | null
          focal_point: string | null
          id: string
          id_contrat: string[] | null
          is_ephemeral: boolean
          name: string
          priority: string
          roadmap_sheet_number: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          comment?: string | null
          contract_target_count?: number
          created_at?: string
          deadline_date?: string | null
          deleted_at?: string | null
          focal_point?: string | null
          id: string
          id_contrat?: string[] | null
          is_ephemeral?: boolean
          name: string
          priority?: string
          roadmap_sheet_number?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          comment?: string | null
          contract_target_count?: number
          created_at?: string
          deadline_date?: string | null
          deleted_at?: string | null
          focal_point?: string | null
          id?: string
          id_contrat?: string[] | null
          is_ephemeral?: boolean
          name?: string
          priority?: string
          roadmap_sheet_number?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dossiers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      identification: {
        Row: {
          adresse: string
          created_at: string
          deleted_at: string | null
          nif: string
          ninu: string | null
          nom: string
          prenom: string
          sexe: string | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          adresse: string
          created_at?: string
          deleted_at?: string | null
          nif: string
          ninu?: string | null
          nom: string
          prenom: string
          sexe?: string | null
          updated_at?: string | null
          workspace_id?: string
        }
        Update: {
          adresse?: string
          created_at?: string
          deleted_at?: string | null
          nif?: string
          ninu?: string | null
          nom?: string
          prenom?: string
          sexe?: string | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "identification_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at: string
          deleted_at?: string | null
          id: string
          name: string
          updated_at: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
