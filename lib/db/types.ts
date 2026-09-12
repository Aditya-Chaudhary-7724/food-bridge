export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserRole = 'donor' | 'ngo' | 'volunteer' | 'logistics' | 'admin'
export type OrganizationType = 'donor' | 'ngo' | 'logistics'
export type DonationStatus =
  | 'available'
  | 'matched'
  | 'claimed'
  | 'pickup_scheduled'
  | 'picked_up'
  | 'delivered'
  | 'expired'
  | 'cancelled'
export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical'
export type MatchStatus = 'pending' | 'accepted' | 'rejected' | 'expired'
export type PickupStatus =
  | 'scheduled'
  | 'driver_assigned'
  | 'in_transit'
  | 'completed'
  | 'cancelled'
  | 'failed'
export type LogisticsEventType =
  | 'created'
  | 'driver_assigned'
  | 'arrived_at_pickup'
  | 'picked_up'
  | 'in_transit'
  | 'arrived_at_destination'
  | 'delivered'
  | 'exception'
  | 'delayed'
export type NotificationType =
  | 'new_match'
  | 'donation_claimed'
  | 'pickup_scheduled'
  | 'delivery_completed'
  | 'system'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string
          email: string | null
          role: UserRole
          phone: string | null
          avatar_url: string | null
          organization_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name: string
          email?: string | null
          role?: UserRole
          phone?: string | null
          avatar_url?: string | null
          organization_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string
          email?: string | null
          role?: UserRole
          phone?: string | null
          avatar_url?: string | null
          organization_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          id: string
          name: string
          type: OrganizationType
          address: string
          location: unknown | null
          latitude: number | null
          longitude: number | null
          contact_email: string | null
          contact_phone: string | null
          description: string | null
          daily_capacity_kg: number
          dietary_preferences: string[]
          is_verified: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          type?: OrganizationType
          address: string
          location?: unknown | null
          latitude?: number | null
          longitude?: number | null
          contact_email?: string | null
          contact_phone?: string | null
          description?: string | null
          daily_capacity_kg?: number
          dietary_preferences?: string[]
          is_verified?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          type?: OrganizationType
          address?: string
          location?: unknown | null
          latitude?: number | null
          longitude?: number | null
          contact_email?: string | null
          contact_phone?: string | null
          description?: string | null
          daily_capacity_kg?: number
          dietary_preferences?: string[]
          is_verified?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      donations: {
        Row: {
          id: string
          donor_id: string
          organization_id: string | null
          title: string
          description: string | null
          food_category: string
          quantity: number
          unit: string
          prepared_at: string | null
          expires_at: string
          pickup_address: string
          pickup_location: unknown | null
          latitude: number | null
          longitude: number | null
          status: DonationStatus
          food_embedding: number[] | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          donor_id: string
          organization_id?: string | null
          title: string
          description?: string | null
          food_category: string
          quantity: number
          unit?: string
          prepared_at?: string | null
          expires_at: string
          pickup_address: string
          pickup_location?: unknown | null
          latitude?: number | null
          longitude?: number | null
          status?: DonationStatus
          food_embedding?: number[] | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          donor_id?: string
          organization_id?: string | null
          title?: string
          description?: string | null
          food_category?: string
          quantity?: number
          unit?: string
          prepared_at?: string | null
          expires_at?: string
          pickup_address?: string
          pickup_location?: unknown | null
          latitude?: number | null
          longitude?: number | null
          status?: DonationStatus
          food_embedding?: number[] | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      donation_items: {
        Row: {
          id: string
          donation_id: string
          name: string
          quantity: number
          unit: string
          food_category: string | null
          dietary_flags: string[]
          storage_requirement: string
          notes: string | null
          expiration_date: string | null
          created_at: string
        }
        Insert: {
          id?: string
          donation_id: string
          name: string
          quantity: number
          unit?: string
          food_category?: string | null
          dietary_flags?: string[]
          storage_requirement?: string
          notes?: string | null
          expiration_date?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          donation_id?: string
          name?: string
          quantity?: number
          unit?: string
          food_category?: string | null
          dietary_flags?: string[]
          storage_requirement?: string
          notes?: string | null
          expiration_date?: string | null
          created_at?: string
        }
        Relationships: []
      }
      ngo_requirements: {
        Row: {
          id: string
          organization_id: string
          food_categories: string[]
          daily_capacity_kg: number
          urgency_level: UrgencyLevel
          dietary_requirements: string[]
          preferred_quantity_min: number
          preferred_quantity_max: number | null
          requirement_embedding: number[] | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          food_categories?: string[]
          daily_capacity_kg?: number
          urgency_level?: UrgencyLevel
          dietary_requirements?: string[]
          preferred_quantity_min?: number
          preferred_quantity_max?: number | null
          requirement_embedding?: number[] | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          food_categories?: string[]
          daily_capacity_kg?: number
          urgency_level?: UrgencyLevel
          dietary_requirements?: string[]
          preferred_quantity_min?: number
          preferred_quantity_max?: number | null
          requirement_embedding?: number[] | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      match_recommendations: {
        Row: {
          id: string
          donation_id: string
          organization_id: string
          semantic_score: number
          distance_score: number
          capacity_score: number
          urgency_score: number
          final_score: number
          distance_km: number | null
          explanation: string
          status: MatchStatus
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          donation_id: string
          organization_id: string
          semantic_score?: number
          distance_score?: number
          capacity_score?: number
          urgency_score?: number
          final_score?: number
          distance_km?: number | null
          explanation: string
          status?: MatchStatus
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          donation_id?: string
          organization_id?: string
          semantic_score?: number
          distance_score?: number
          capacity_score?: number
          urgency_score?: number
          final_score?: number
          distance_km?: number | null
          explanation?: string
          status?: MatchStatus
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      pickups: {
        Row: {
          id: string
          donation_id: string
          organization_id: string
          logistics_user_id: string | null
          volunteer_id: string | null
          pickup_address: string
          pickup_location: unknown | null
          destination_address: string
          destination_location: unknown | null
          scheduled_at: string
          estimated_duration_minutes: number | null
          actual_pickup_at: string | null
          actual_delivery_at: string | null
          status: PickupStatus
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          donation_id: string
          organization_id: string
          logistics_user_id?: string | null
          volunteer_id?: string | null
          pickup_address: string
          pickup_location?: unknown | null
          destination_address?: string
          destination_location?: unknown | null
          scheduled_at?: string
          estimated_duration_minutes?: number | null
          actual_pickup_at?: string | null
          actual_delivery_at?: string | null
          status?: PickupStatus
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          donation_id?: string
          organization_id?: string
          logistics_user_id?: string | null
          volunteer_id?: string | null
          pickup_address?: string
          pickup_location?: unknown | null
          destination_address?: string
          destination_location?: unknown | null
          scheduled_at?: string
          estimated_duration_minutes?: number | null
          actual_pickup_at?: string | null
          actual_delivery_at?: string | null
          status?: PickupStatus
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      logistics_events: {
        Row: {
          id: string
          pickup_id: string
          recorded_by: string | null
          event_type: LogisticsEventType
          location: unknown | null
          notes: string | null
          metadata: Json
          recorded_at: string
        }
        Insert: {
          id?: string
          pickup_id: string
          recorded_by?: string | null
          event_type: LogisticsEventType
          location?: unknown | null
          notes?: string | null
          metadata?: Json
          recorded_at?: string
        }
        Update: {
          id?: string
          pickup_id?: string
          recorded_by?: string | null
          event_type?: LogisticsEventType
          location?: unknown | null
          notes?: string | null
          metadata?: Json
          recorded_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          title: string
          message: string
          type: NotificationType
          reference_id: string | null
          reference_type: string | null
          read: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          message: string
          type?: NotificationType
          reference_id?: string | null
          reference_type?: string | null
          read?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          message?: string
          type?: NotificationType
          reference_id?: string | null
          reference_type?: string | null
          read?: boolean
          created_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          id: string
          title: string
          category: string
          content: string
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          category: string
          content: string
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          category?: string
          content?: string
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      document_chunks: {
        Row: {
          id: string
          document_id: string
          chunk_index: number
          content: string
          embedding: number[] | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          document_id: string
          chunk_index: number
          content: string
          embedding?: number[] | null
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          document_id?: string
          chunk_index?: number
          content?: string
          embedding?: number[] | null
          metadata?: Json
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      claim_donation: {
        Args: {
          p_donation_id: string
          p_organization_id: string
        }
        Returns: Json
      }
      assign_pickup_to_logistics: {
        Args: {
          p_pickup_id: string
        }
        Returns: Json
      }
      assign_volunteer_to_pickup: {
        Args: {
          p_pickup_id: string
          p_volunteer_id: string
        }
        Returns: Json
      }
      list_available_volunteers: {
        Args: Record<string, never>
        Returns: { id: string; full_name: string }[]
      }
      create_organization_and_link_profile: {
        Args: {
          p_name: string
          p_address: string
          p_description?: string | null
          p_contact_email?: string | null
          p_contact_phone?: string | null
          p_daily_capacity_kg?: number | null
          p_latitude?: number | null
          p_longitude?: number | null
        }
        Returns: Json
      }
      generate_match_recommendations: {
        Args: {
          p_donation_id: string
        }
        Returns: Json
      }
    }
    Enums: Record<string, never>
  }
}
