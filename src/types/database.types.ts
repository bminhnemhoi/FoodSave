
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "app_settings": {
                  Row: {
                    "description": string,"is_public": boolean,"key": string,"updated_at": string,"updated_by": string | null,"value": NonNullable<Json>
                  }
                  Insert: {
                    "description": string,"is_public"?: boolean,"key": string,"updated_at"?: string,"updated_by"?: string | null,"value": NonNullable<Json>
                  }
                  Update: {
                    "description"?: string,"is_public"?: boolean,"key"?: string,"updated_at"?: string,"updated_by"?: string | null,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "app_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_logs": {
                  Row: {
                    "action": string,"actor_id": string | null,"actor_kind": string,"actor_org_role": Database["public"]['Enums']["org_role"] | null,"after": Json | null,"at": string,"before": Json | null,"client_op_id": string | null,"entity_id": string | null,"entity_type": string,"id": number,"org_id": string | null,"reason": string | null,"request_id": string | null
                  }
                  Insert: {
                    "action": string,"actor_id"?: string | null,"actor_kind": string,"actor_org_role"?: Database["public"]['Enums']["org_role"] | null,"after"?: Json | null,"at"?: string,"before"?: Json | null,"client_op_id"?: string | null,"entity_id"?: string | null,"entity_type": string,"id"?: never,"org_id"?: string | null,"reason"?: string | null,"request_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"actor_kind"?: string,"actor_org_role"?: Database["public"]['Enums']["org_role"] | null,"after"?: Json | null,"at"?: string,"before"?: Json | null,"client_op_id"?: string | null,"entity_id"?: string | null,"entity_type"?: string,"id"?: never,"org_id"?: string | null,"reason"?: string | null,"request_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"consents": {
                  Row: {
                    "granted_at": string,"id": string,"ip_hash": string | null,"policy_version": string,"purpose": Database["public"]['Enums']["consent_purpose"],"source": string,"text_hash": string,"user_agent": string | null,"user_id": string,"withdrawn_at": string | null
                  }
                  Insert: {
                    "granted_at"?: string,"id"?: string,"ip_hash"?: string | null,"policy_version": string,"purpose": Database["public"]['Enums']["consent_purpose"],"source": string,"text_hash": string,"user_agent"?: string | null,"user_id": string,"withdrawn_at"?: string | null
                  }
                  Update: {
                    "granted_at"?: string,"id"?: string,"ip_hash"?: string | null,"policy_version"?: string,"purpose"?: Database["public"]['Enums']["consent_purpose"],"source"?: string,"text_hash"?: string,"user_agent"?: string | null,"user_id"?: string,"withdrawn_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "consents_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"org_change_requests": {
                  Row: {
                    "applied_at": string | null,"changes": NonNullable<Json>,"client_op_id": string,"created_at": string,"id": string,"org_id": string,"previous": NonNullable<Json>,"reason": string | null,"review_note": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"status": Database["public"]['Enums']["org_change_status"],"submitted_at": string,"submitted_by": string,"updated_at": string
                  }
                  Insert: {
                    "applied_at"?: string | null,"changes": NonNullable<Json>,"client_op_id": string,"created_at"?: string,"id"?: string,"org_id": string,"previous": NonNullable<Json>,"reason"?: string | null,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["org_change_status"],"submitted_at"?: string,"submitted_by": string,"updated_at"?: string
                  }
                  Update: {
                    "applied_at"?: string | null,"changes"?: NonNullable<Json>,"client_op_id"?: string,"created_at"?: string,"id"?: string,"org_id"?: string,"previous"?: NonNullable<Json>,"reason"?: string | null,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["org_change_status"],"submitted_at"?: string,"submitted_by"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_change_requests_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "org_change_requests_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "org_change_requests_submitted_by_fkey"
      columns: ["submitted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"org_documents": {
                  Row: {
                    "ai_extract": Json | null,"change_request_id": string | null,"doc_type": Database["public"]['Enums']["org_doc_type"],"file_deleted_at": string | null,"id": string,"mime_type": string,"org_id": string,"purge_after": string | null,"sha256": string,"size_bytes": number,"storage_path": string,"uploaded_at": string,"uploaded_by": string
                  }
                  Insert: {
                    "ai_extract"?: Json | null,"change_request_id"?: string | null,"doc_type": Database["public"]['Enums']["org_doc_type"],"file_deleted_at"?: string | null,"id"?: string,"mime_type": string,"org_id": string,"purge_after"?: string | null,"sha256": string,"size_bytes": number,"storage_path": string,"uploaded_at"?: string,"uploaded_by"?: string
                  }
                  Update: {
                    "ai_extract"?: Json | null,"change_request_id"?: string | null,"doc_type"?: Database["public"]['Enums']["org_doc_type"],"file_deleted_at"?: string | null,"id"?: string,"mime_type"?: string,"org_id"?: string,"purge_after"?: string | null,"sha256"?: string,"size_bytes"?: number,"storage_path"?: string,"uploaded_at"?: string,"uploaded_by"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_documents_change_request_id_fkey"
      columns: ["change_request_id"]
isOneToOne: false
      referencedRelation: "org_change_requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "org_documents_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "org_documents_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"org_invitations": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"created_at": string,"email": string,"expires_at": string,"id": string,"invited_by": string,"org_id": string,"revoked_at": string | null,"role": Database["public"]['Enums']["org_role"],"site_ids": (string)[] | null,"token_hash": string
                  }
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"email": string,"expires_at"?: string,"id"?: string,"invited_by": string,"org_id": string,"revoked_at"?: string | null,"role": Database["public"]['Enums']["org_role"],"site_ids"?: (string)[] | null,"token_hash": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"invited_by"?: string,"org_id"?: string,"revoked_at"?: string | null,"role"?: Database["public"]['Enums']["org_role"],"site_ids"?: (string)[] | null,"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_invitations_accepted_by_fkey"
      columns: ["accepted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "org_invitations_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "org_invitations_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"org_members": {
                  Row: {
                    "created_at": string,"invited_by": string | null,"joined_at": string | null,"org_id": string,"role": Database["public"]['Enums']["org_role"],"site_ids": (string)[] | null,"status": Database["public"]['Enums']["member_status"],"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"invited_by"?: string | null,"joined_at"?: string | null,"org_id": string,"role": Database["public"]['Enums']["org_role"],"site_ids"?: (string)[] | null,"status"?: Database["public"]['Enums']["member_status"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"invited_by"?: string | null,"joined_at"?: string | null,"org_id"?: string,"role"?: Database["public"]['Enums']["org_role"],"site_ids"?: (string)[] | null,"status"?: Database["public"]['Enums']["member_status"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_members_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "org_members_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "org_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"org_sensitive": {
                  Row: {
                    "contact_email": string | null,"contact_phone": string | null,"id_verification_method": string | null,"id_verified_at": string | null,"id_verified_by": string | null,"legal_name": string | null,"org_id": string,"registration_no": string | null,"representative_id_last4": string | null,"representative_name": string | null,"representative_title": string | null,"tax_code": string | null,"updated_at": string
                  }
                  Insert: {
                    "contact_email"?: string | null,"contact_phone"?: string | null,"id_verification_method"?: string | null,"id_verified_at"?: string | null,"id_verified_by"?: string | null,"legal_name"?: string | null,"org_id": string,"registration_no"?: string | null,"representative_id_last4"?: string | null,"representative_name"?: string | null,"representative_title"?: string | null,"tax_code"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "contact_email"?: string | null,"contact_phone"?: string | null,"id_verification_method"?: string | null,"id_verified_at"?: string | null,"id_verified_by"?: string | null,"legal_name"?: string | null,"org_id"?: string,"registration_no"?: string | null,"representative_id_last4"?: string | null,"representative_name"?: string | null,"representative_title"?: string | null,"tax_code"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_sensitive_id_verified_by_fkey"
      columns: ["id_verified_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "org_sensitive_org_id_fkey"
      columns: ["org_id"]
isOneToOne: true
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "closed_at": string | null,"cover_path": string | null,"created_at": string,"created_by": string,"declared_beneficiaries": number | null,"description": string | null,"founded_on": string | null,"id": string,"is_demo": boolean,"is_paused": boolean,"kind": Database["public"]['Enums']["org_kind"],"leaderboard_opt_in": boolean,"logo_path": string | null,"name": string,"paused_reason": string | null,"rejection_reason": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"slug": string,"status": Database["public"]['Enums']["org_status"],"submitted_at": string | null,"subtype": string,"trust_score": number,"updated_at": string,"website": string | null
                  }
                  Insert: {
                    "closed_at"?: string | null,"cover_path"?: string | null,"created_at"?: string,"created_by": string,"declared_beneficiaries"?: number | null,"description"?: string | null,"founded_on"?: string | null,"id"?: string,"is_demo"?: boolean,"is_paused"?: boolean,"kind": Database["public"]['Enums']["org_kind"],"leaderboard_opt_in"?: boolean,"logo_path"?: string | null,"name": string,"paused_reason"?: string | null,"rejection_reason"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"slug": string,"status"?: Database["public"]['Enums']["org_status"],"submitted_at"?: string | null,"subtype": string,"trust_score"?: number,"updated_at"?: string,"website"?: string | null
                  }
                  Update: {
                    "closed_at"?: string | null,"cover_path"?: string | null,"created_at"?: string,"created_by"?: string,"declared_beneficiaries"?: number | null,"description"?: string | null,"founded_on"?: string | null,"id"?: string,"is_demo"?: boolean,"is_paused"?: boolean,"kind"?: Database["public"]['Enums']["org_kind"],"leaderboard_opt_in"?: boolean,"logo_path"?: string | null,"name"?: string,"paused_reason"?: string | null,"rejection_reason"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"slug"?: string,"status"?: Database["public"]['Enums']["org_status"],"submitted_at"?: string | null,"subtype"?: string,"trust_score"?: number,"updated_at"?: string,"website"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "organizations_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organizations_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "active_org_id": string | null,"avatar_path": string | null,"created_at": string,"deleted_at": string | null,"email": string | null,"full_name": string,"id": string,"is_demo": boolean,"locale": string,"phone": string | null,"platform_role": Database["public"]['Enums']["platform_role"],"updated_at": string
                  }
                  Insert: {
                    "active_org_id"?: string | null,"avatar_path"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"email"?: string | null,"full_name"?: string,"id": string,"is_demo"?: boolean,"locale"?: string,"phone"?: string | null,"platform_role"?: Database["public"]['Enums']["platform_role"],"updated_at"?: string
                  }
                  Update: {
                    "active_org_id"?: string | null,"avatar_path"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"email"?: string | null,"full_name"?: string,"id"?: string,"is_demo"?: boolean,"locale"?: string,"phone"?: string | null,"platform_role"?: Database["public"]['Enums']["platform_role"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_active_org_id_fkey"
      columns: ["active_org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"site_closures": {
                  Row: {
                    "closed_on": string,"reason": string | null,"site_id": string
                  }
                  Insert: {
                    "closed_on": string,"reason"?: string | null,"site_id": string
                  }
                  Update: {
                    "closed_on"?: string,"reason"?: string | null,"site_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "site_closures_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    }
                  ]
                },"site_hours": {
                  Row: {
                    "closes": string,"closes_next_day": boolean,"dow": number,"id": string,"opens": string,"site_id": string
                  }
                  Insert: {
                    "closes": string,"closes_next_day"?: boolean,"dow": number,"id"?: string,"opens": string,"site_id": string
                  }
                  Update: {
                    "closes"?: string,"closes_next_day"?: boolean,"dow"?: number,"id"?: string,"opens"?: string,"site_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "site_hours_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    }
                  ]
                },"sites": {
                  Row: {
                    "accepted_categories": (string)[] | null,"address_line": string,"auto_accept_min_trust": number,"auto_accept_mode": Database["public"]['Enums']["auto_accept_mode"],"capacity_kg": number | null,"city": string,"created_at": string,"id": string,"is_active": boolean,"is_primary": boolean,"location": unknown,"location_accuracy_m": number | null,"location_source": Database["public"]['Enums']["location_source"],"name": string,"org_id": string,"public_address": string | null,"public_location": unknown,"radius_km": number,"updated_at": string,"visibility": Database["public"]['Enums']["site_visibility"],"ward": string | null
                  }
                  Insert: {
                    "accepted_categories"?: (string)[] | null,"address_line": string,"auto_accept_min_trust"?: number,"auto_accept_mode"?: Database["public"]['Enums']["auto_accept_mode"],"capacity_kg"?: number | null,"city"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"is_primary"?: boolean,"location": unknown,"location_accuracy_m"?: number | null,"location_source"?: Database["public"]['Enums']["location_source"],"name": string,"org_id": string,"public_address"?: never,"public_location"?: never,"radius_km"?: number,"updated_at"?: string,"visibility"?: Database["public"]['Enums']["site_visibility"],"ward"?: string | null
                  }
                  Update: {
                    "accepted_categories"?: (string)[] | null,"address_line"?: string,"auto_accept_min_trust"?: number,"auto_accept_mode"?: Database["public"]['Enums']["auto_accept_mode"],"capacity_kg"?: number | null,"city"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"is_primary"?: boolean,"location"?: unknown,"location_accuracy_m"?: number | null,"location_source"?: Database["public"]['Enums']["location_source"],"name"?: string,"org_id"?: string,"public_address"?: never,"public_location"?: never,"radius_km"?: number,"updated_at"?: string,"visibility"?: Database["public"]['Enums']["site_visibility"],"ward"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sites_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"trust_events": {
                  Row: {
                    "created_at": string,"delta": number,"id": number,"org_id": string,"reason": string,"ref_id": string | null,"ref_type": string | null,"rules_version": number
                  }
                  Insert: {
                    "created_at"?: string,"delta": number,"id"?: never,"org_id": string,"reason": string,"ref_id"?: string | null,"ref_type"?: string | null,"rules_version"?: number
                  }
                  Update: {
                    "created_at"?: string,"delta"?: number,"id"?: never,"org_id"?: string,"reason"?: string,"ref_id"?: string | null,"ref_type"?: string | null,"rules_version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "trust_events_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "grant_platform_admin":
{ Args: { "p_reason": string,"p_user_id": string }; Returns: undefined
                           },
"revoke_platform_admin":
{ Args: { "p_reason": string,"p_user_id": string }; Returns: undefined
                           },
"site_close_at":
{ Args: { "p_at": string,"p_site_id": string }; Returns: string
                           }
          }
          Enums: {
            "allocation_status": "requested"|"confirmed"|"assigned"|"picked_up"|"delivered"|"cancelled"|"rejected"|"expired","auto_accept_mode": "off"|"all"|"trusted","bundle_status": "proposed"|"partially_confirmed"|"confirmed"|"cancelled","consent_purpose": "terms"|"location_trip"|"proof_photo"|"marketing","delivery_status": "sent"|"failed"|"skipped","factor_status": "draft"|"active"|"retired","freshness_label": "green"|"yellow"|"red"|"expired","handover_kind": "pickup"|"dropoff","handover_method": "qr"|"code"|"auto","incident_kind": "quantity_dispute"|"quality"|"food_safety"|"no_show"|"conduct"|"privacy"|"other","incident_status": "open"|"in_review"|"resolved"|"dismissed","ledger_entry_type": "credit"|"reversal","location_source": "pin"|"geocode"|"gps","member_status": "invited"|"active"|"removed","need_status": "open"|"partially_matched"|"matched"|"fulfilled"|"closed_partial"|"expired"|"cancelled","notification_event": "offer_published"|"offer_turned_red"|"need_published"|"allocation_requested"|"allocation_confirmed"|"allocation_rejected"|"allocation_cancelled"|"allocation_expired"|"bundle_options_ready"|"bundle_confirmed"|"bundle_shortfall"|"need_responded"|"need_closed"|"offer_expired"|"member_invited"|"pickup_assigned"|"pickup_cancelled"|"pickup_started"|"pickup_handover_done"|"delivery_completed"|"proof_due_soon"|"proof_overdue"|"proof_submitted"|"proof_reviewed"|"org_submitted"|"org_reviewed"|"org_suspended"|"org_reinstated"|"org_change_submitted"|"org_change_reviewed"|"allocation_packed"|"volunteer_accepted"|"volunteer_declined"|"volunteer_checked_in"|"thank_you_received"|"incident_opened"|"monthly_report_ready"|"kyc_purge","notify_channel": "in_app"|"push"|"email","offer_status": "draft"|"open"|"fully_allocated"|"completed"|"expired"|"cancelled","org_change_status": "pending"|"approved"|"rejected","org_doc_type": "business_license"|"food_safety_cert"|"establishment_decision"|"operating_license"|"other","org_kind": "store"|"charity","org_role": "owner"|"manager"|"staff"|"volunteer","org_status": "draft"|"submitted"|"needs_changes"|"approved"|"rejected"|"suspended"|"closed","outbox_status": "pending"|"processing"|"done"|"dead","perishability": "cooked"|"fresh"|"packaged","pickup_mode": "volunteer"|"self","pickup_status": "planned"|"assigned"|"in_progress"|"completed"|"cancelled","platform_role": "user"|"admin","proof_status": "draft"|"submitted"|"approved"|"needs_changes"|"rejected","shortfall_reason": "store_short"|"quality_reject"|"capacity"|"no_show","site_visibility": "public"|"approximate"|"hidden","stop_status": "pending"|"arrived"|"done"|"skipped","unit_code": "piece"|"loaf"|"box"|"portion"|"bottle"|"bag"|"kg"|"liter","vehicle_type": "motorbike"|"bicycle"|"car"|"on_foot","weight_source": "declared"|"category_default"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "allocation_status": ["requested", "confirmed", "assigned", "picked_up", "delivered", "cancelled", "rejected", "expired"],"auto_accept_mode": ["off", "all", "trusted"],"bundle_status": ["proposed", "partially_confirmed", "confirmed", "cancelled"],"consent_purpose": ["terms", "location_trip", "proof_photo", "marketing"],"delivery_status": ["sent", "failed", "skipped"],"factor_status": ["draft", "active", "retired"],"freshness_label": ["green", "yellow", "red", "expired"],"handover_kind": ["pickup", "dropoff"],"handover_method": ["qr", "code", "auto"],"incident_kind": ["quantity_dispute", "quality", "food_safety", "no_show", "conduct", "privacy", "other"],"incident_status": ["open", "in_review", "resolved", "dismissed"],"ledger_entry_type": ["credit", "reversal"],"location_source": ["pin", "geocode", "gps"],"member_status": ["invited", "active", "removed"],"need_status": ["open", "partially_matched", "matched", "fulfilled", "closed_partial", "expired", "cancelled"],"notification_event": ["offer_published", "offer_turned_red", "need_published", "allocation_requested", "allocation_confirmed", "allocation_rejected", "allocation_cancelled", "allocation_expired", "bundle_options_ready", "bundle_confirmed", "bundle_shortfall", "need_responded", "need_closed", "offer_expired", "member_invited", "pickup_assigned", "pickup_cancelled", "pickup_started", "pickup_handover_done", "delivery_completed", "proof_due_soon", "proof_overdue", "proof_submitted", "proof_reviewed", "org_submitted", "org_reviewed", "org_suspended", "org_reinstated", "org_change_submitted", "org_change_reviewed", "allocation_packed", "volunteer_accepted", "volunteer_declined", "volunteer_checked_in", "thank_you_received", "incident_opened", "monthly_report_ready", "kyc_purge"],"notify_channel": ["in_app", "push", "email"],"offer_status": ["draft", "open", "fully_allocated", "completed", "expired", "cancelled"],"org_change_status": ["pending", "approved", "rejected"],"org_doc_type": ["business_license", "food_safety_cert", "establishment_decision", "operating_license", "other"],"org_kind": ["store", "charity"],"org_role": ["owner", "manager", "staff", "volunteer"],"org_status": ["draft", "submitted", "needs_changes", "approved", "rejected", "suspended", "closed"],"outbox_status": ["pending", "processing", "done", "dead"],"perishability": ["cooked", "fresh", "packaged"],"pickup_mode": ["volunteer", "self"],"pickup_status": ["planned", "assigned", "in_progress", "completed", "cancelled"],"platform_role": ["user", "admin"],"proof_status": ["draft", "submitted", "approved", "needs_changes", "rejected"],"shortfall_reason": ["store_short", "quality_reject", "capacity", "no_show"],"site_visibility": ["public", "approximate", "hidden"],"stop_status": ["pending", "arrived", "done", "skipped"],"unit_code": ["piece", "loaf", "box", "portion", "bottle", "bag", "kg", "liter"],"vehicle_type": ["motorbike", "bicycle", "car", "on_foot"],"weight_source": ["declared", "category_default"]
          }
        }
} as const
