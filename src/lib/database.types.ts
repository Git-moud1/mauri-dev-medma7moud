// Generated from the live schema — do not edit by hand.
//
// Regenerate after any migration, with the Supabase MCP server
// (`generate_typescript_types`) or:
//   npx supabase gen types typescript --project-id eglcgjliyrvymelhawjn
//
// The generator's `Tables<>` / `TablesInsert<>` / `Enums<>` helper generics are
// omitted: nothing here uses them, and the row shapes are reached directly.
//
// This is what makes every query in src/lib typed rather than `any`. Without
// it, `.select('*')` returns `any`, every field access is unchecked, and a
// column rename becomes a runtime failure on a prerendered page instead of a
// build error — which is the class of bug this whole migration is about.

export type Json =
  string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.15';
  };
  public: {
    Tables: {
      auth_attempts: {
        Row: {
          count: number;
          first_at: string;
          ip: string;
          locked_until: string | null;
        };
        Insert: {
          count?: number;
          first_at?: string;
          ip: string;
          locked_until?: string | null;
        };
        Update: {
          count?: number;
          first_at?: string;
          ip?: string;
          locked_until?: string | null;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          blur_data_url: string | null;
          category: string;
          cover: string;
          created_at: string;
          description: Json;
          frame: string;
          id: string;
          images: Json;
          link: string | null;
          position: number;
          title: Json;
          updated_at: string;
        };
        Insert: {
          blur_data_url?: string | null;
          category: string;
          cover: string;
          created_at?: string;
          description: Json;
          frame?: string;
          id: string;
          images?: Json;
          link?: string | null;
          position: number;
          title: Json;
          updated_at?: string;
        };
        Update: {
          blur_data_url?: string | null;
          category?: string;
          cover?: string;
          created_at?: string;
          description?: Json;
          frame?: string;
          id?: string;
          images?: Json;
          link?: string | null;
          position?: number;
          title?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      site_settings: {
        Row: {
          available_for_work: boolean;
          email: string | null;
          hero_stats: Json;
          id: number;
          socials: Json;
          updated_at: string;
          whatsapp_number: string | null;
        };
        Insert: {
          available_for_work?: boolean;
          email?: string | null;
          hero_stats: Json;
          id?: number;
          socials?: Json;
          updated_at?: string;
          whatsapp_number?: string | null;
        };
        Update: {
          available_for_work?: boolean;
          email?: string | null;
          hero_stats?: Json;
          id?: number;
          socials?: Json;
          updated_at?: string;
          whatsapp_number?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      replace_projects: { Args: { payload: Json }; Returns: undefined };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
