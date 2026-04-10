export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      workspaces: {
        Row: {
          id: string;
          name: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      workspace_members: {
        Row: {
          id: string;
          workspace_id: string;
          user_id: string;
          role: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          user_id: string;
          role?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          user_id?: string;
          role?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      applicants: {
        Row: {
          id: string;
          workspace_id: string;
          gender: string;
          first_name: string;
          last_name: string;
          nif: string | null;
          ninu: string | null;
          address: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          gender: string;
          first_name: string;
          last_name: string;
          nif?: string | null;
          ninu?: string | null;
          address: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          gender?: string;
          first_name?: string;
          last_name?: string;
          nif?: string | null;
          ninu?: string | null;
          address?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      dossiers: {
        Row: {
          id: string;
          workspace_id: string;
          name: string;
          is_ephemeral: boolean;
          priority: string;
          accent_color: string;
          contract_target_count: number;
          comment: string | null;
          deadline_date: string | null;
          focal_point: string | null;
          roadmap_sheet_number: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          name: string;
          is_ephemeral?: boolean;
          priority?: string;
          accent_color?: string;
          contract_target_count?: number;
          comment?: string | null;
          deadline_date?: string | null;
          focal_point?: string | null;
          roadmap_sheet_number?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          name?: string;
          is_ephemeral?: boolean;
          priority?: string;
          accent_color?: string;
          contract_target_count?: number;
          comment?: string | null;
          deadline_date?: string | null;
          focal_point?: string | null;
          roadmap_sheet_number?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      contracts: {
        Row: {
          id: string;
          workspace_id: string;
          dossier_id: string | null;
          applicant_id: string | null;
          status: string;
          gender: string;
          first_name: string;
          last_name: string;
          nif: string | null;
          ninu: string | null;
          address: string;
          position: string;
          assignment: string;
          salary_number: number;
          salary_text: string;
          duration_months: number;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          dossier_id?: string | null;
          applicant_id?: string | null;
          status: string;
          gender: string;
          first_name: string;
          last_name: string;
          nif?: string | null;
          ninu?: string | null;
          address: string;
          position: string;
          assignment: string;
          salary_number: number;
          salary_text: string;
          duration_months?: number;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          dossier_id?: string | null;
          applicant_id?: string | null;
          status?: string;
          gender?: string;
          first_name?: string;
          last_name?: string;
          nif?: string | null;
          ninu?: string | null;
          address?: string;
          position?: string;
          assignment?: string;
          salary_number?: number;
          salary_text?: string;
          duration_months?: number;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      contract_print_jobs: {
        Row: {
          id: string;
          workspace_id: string;
          contract_ids: string[];
          created_at: string;
          printed_at: string | null;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          contract_ids: string[];
          created_at?: string;
          printed_at?: string | null;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          contract_ids?: string[];
          created_at?: string;
          printed_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
    CompositeTypes: {};
  };
};
