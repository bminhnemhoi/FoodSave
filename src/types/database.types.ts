
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "allocations": {
                  Row: {
                    "assigned_at": string | null,"auto_confirmed": boolean,"bundle_id": string | null,"cancel_actor": string | null,"cancel_reason": string | null,"cancelled_by": string | null,"charity_org_id": string,"charity_site_id": string,"closed_at": string | null,"confirmed_at": string | null,"confirmed_by": string | null,"created_at": string,"delivered_at": string | null,"id": string,"kg_delivered": number | null,"need_id": string | null,"offer_id": string,"packed_at": string | null,"packed_by": string | null,"picked_at": string | null,"pickup_id": string | null,"proof_due_at": string | null,"qty_delivered": number,"qty_picked": number,"qty_released": number,"qty_reserved": number,"requested_at": string,"requested_by": string,"reserved_until": string | null,"shortfall_note": string | null,"shortfall_reason": Database["public"]['Enums']["shortfall_reason"] | null,"status": Database["public"]['Enums']["allocation_status"],"stop_id": string | null,"store_org_id": string,"store_site_id": string,"unit": Database["public"]['Enums']["unit_code"],"unit_weight_kg_snapshot": number,"updated_at": string
                  }
                  Insert: {
                    "assigned_at"?: string | null,"auto_confirmed"?: boolean,"bundle_id"?: string | null,"cancel_actor"?: string | null,"cancel_reason"?: string | null,"cancelled_by"?: string | null,"charity_org_id": string,"charity_site_id": string,"closed_at"?: string | null,"confirmed_at"?: string | null,"confirmed_by"?: string | null,"created_at"?: string,"delivered_at"?: string | null,"id"?: string,"kg_delivered"?: never,"need_id"?: string | null,"offer_id": string,"packed_at"?: string | null,"packed_by"?: string | null,"picked_at"?: string | null,"pickup_id"?: string | null,"proof_due_at"?: string | null,"qty_delivered"?: number,"qty_picked"?: number,"qty_released"?: number,"qty_reserved": number,"requested_at"?: string,"requested_by": string,"reserved_until"?: string | null,"shortfall_note"?: string | null,"shortfall_reason"?: Database["public"]['Enums']["shortfall_reason"] | null,"status"?: Database["public"]['Enums']["allocation_status"],"stop_id"?: string | null,"store_org_id": string,"store_site_id": string,"unit": Database["public"]['Enums']["unit_code"],"unit_weight_kg_snapshot": number,"updated_at"?: string
                  }
                  Update: {
                    "assigned_at"?: string | null,"auto_confirmed"?: boolean,"bundle_id"?: string | null,"cancel_actor"?: string | null,"cancel_reason"?: string | null,"cancelled_by"?: string | null,"charity_org_id"?: string,"charity_site_id"?: string,"closed_at"?: string | null,"confirmed_at"?: string | null,"confirmed_by"?: string | null,"created_at"?: string,"delivered_at"?: string | null,"id"?: string,"kg_delivered"?: never,"need_id"?: string | null,"offer_id"?: string,"packed_at"?: string | null,"packed_by"?: string | null,"picked_at"?: string | null,"pickup_id"?: string | null,"proof_due_at"?: string | null,"qty_delivered"?: number,"qty_picked"?: number,"qty_released"?: number,"qty_reserved"?: number,"requested_at"?: string,"requested_by"?: string,"reserved_until"?: string | null,"shortfall_note"?: string | null,"shortfall_reason"?: Database["public"]['Enums']["shortfall_reason"] | null,"status"?: Database["public"]['Enums']["allocation_status"],"stop_id"?: string | null,"store_org_id"?: string,"store_site_id"?: string,"unit"?: Database["public"]['Enums']["unit_code"],"unit_weight_kg_snapshot"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "allocations_bundle_id_fkey"
      columns: ["bundle_id"]
isOneToOne: false
      referencedRelation: "need_bundles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "allocations_cancelled_by_fkey"
      columns: ["cancelled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "allocations_charity_org_id_fkey"
      columns: ["charity_org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "allocations_charity_org_id_fkey"
      columns: ["charity_org_id"]
isOneToOne: false
      referencedRelation: "public_org_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "allocations_charity_site_id_fkey"
      columns: ["charity_site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "allocations_confirmed_by_fkey"
      columns: ["confirmed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "allocations_need_id_fkey"
      columns: ["need_id"]
isOneToOne: false
      referencedRelation: "needs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "allocations_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "offers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "allocations_packed_by_fkey"
      columns: ["packed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "allocations_pickup_id_fkey"
      columns: ["pickup_id"]
isOneToOne: false
      referencedRelation: "pickups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "allocations_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "allocations_stop_id_fkey"
      columns: ["stop_id"]
isOneToOne: false
      referencedRelation: "pickup_stops"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "allocations_store_org_id_fkey"
      columns: ["store_org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "allocations_store_org_id_fkey"
      columns: ["store_org_id"]
isOneToOne: false
      referencedRelation: "public_org_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "allocations_store_site_id_fkey"
      columns: ["store_site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    }
                  ]
                },"app_settings": {
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
                },"food_categories": {
                  Row: {
                    "code": string,"created_at": string,"default_unit": Database["public"]['Enums']["unit_code"],"default_unit_weight_kg": number,"icon": string,"is_active": boolean,"name_vi": string,"perishability": Database["public"]['Enums']["perishability"],"sort_order": number,"updated_at": string
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"default_unit": Database["public"]['Enums']["unit_code"],"default_unit_weight_kg": number,"icon": string,"is_active"?: boolean,"name_vi": string,"perishability": Database["public"]['Enums']["perishability"],"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"default_unit"?: Database["public"]['Enums']["unit_code"],"default_unit_weight_kg"?: number,"icon"?: string,"is_active"?: boolean,"name_vi"?: string,"perishability"?: Database["public"]['Enums']["perishability"],"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"handover_lines": {
                  Row: {
                    "allocation_id": string,"created_at": string,"expected_qty": number,"handover_id": string,"id": string,"note": string | null,"qty": number,"reason": Database["public"]['Enums']["shortfall_reason"] | null
                  }
                  Insert: {
                    "allocation_id": string,"created_at"?: string,"expected_qty": number,"handover_id": string,"id"?: string,"note"?: string | null,"qty": number,"reason"?: Database["public"]['Enums']["shortfall_reason"] | null
                  }
                  Update: {
                    "allocation_id"?: string,"created_at"?: string,"expected_qty"?: number,"handover_id"?: string,"id"?: string,"note"?: string | null,"qty"?: number,"reason"?: Database["public"]['Enums']["shortfall_reason"] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "handover_lines_allocation_id_fkey"
      columns: ["allocation_id"]
isOneToOne: false
      referencedRelation: "allocations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "handover_lines_handover_id_fkey"
      columns: ["handover_id"]
isOneToOne: false
      referencedRelation: "handovers"
      referencedColumns: ["id"]
    }
                  ]
                },"handovers": {
                  Row: {
                    "client_op_id": string | null,"code_hash": string | null,"consumed_at": string | null,"created_at": string,"failed_attempts": number,"id": string,"issued_at": string | null,"issued_by": string | null,"kind": Database["public"]['Enums']["handover_kind"],"method": Database["public"]['Enums']["handover_method"] | null,"pickup_id": string,"proposed_lines": NonNullable<Json>,"scanned_by": string | null,"stop_id": string,"token_expires_at": string | null,"token_hash": string | null,"updated_at": string
                  }
                  Insert: {
                    "client_op_id"?: string | null,"code_hash"?: string | null,"consumed_at"?: string | null,"created_at"?: string,"failed_attempts"?: number,"id"?: string,"issued_at"?: string | null,"issued_by"?: string | null,"kind": Database["public"]['Enums']["handover_kind"],"method"?: Database["public"]['Enums']["handover_method"] | null,"pickup_id": string,"proposed_lines"?: NonNullable<Json>,"scanned_by"?: string | null,"stop_id": string,"token_expires_at"?: string | null,"token_hash"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "client_op_id"?: string | null,"code_hash"?: string | null,"consumed_at"?: string | null,"created_at"?: string,"failed_attempts"?: number,"id"?: string,"issued_at"?: string | null,"issued_by"?: string | null,"kind"?: Database["public"]['Enums']["handover_kind"],"method"?: Database["public"]['Enums']["handover_method"] | null,"pickup_id"?: string,"proposed_lines"?: NonNullable<Json>,"scanned_by"?: string | null,"stop_id"?: string,"token_expires_at"?: string | null,"token_hash"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "handovers_issued_by_fkey"
      columns: ["issued_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "handovers_pickup_id_fkey"
      columns: ["pickup_id"]
isOneToOne: false
      referencedRelation: "pickups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "handovers_scanned_by_fkey"
      columns: ["scanned_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "handovers_stop_id_fkey"
      columns: ["stop_id"]
isOneToOne: true
      referencedRelation: "pickup_stops"
      referencedColumns: ["id"]
    }
                  ]
                },"impact_factors": {
                  Row: {
                    "approved_adr": string,"created_at": string,"derivation": string,"id": string,"metric": string,"source_page": string | null,"source_title": string,"source_url": string,"unit": string,"valid_from": string,"value": number,"version": string
                  }
                  Insert: {
                    "approved_adr": string,"created_at"?: string,"derivation": string,"id"?: string,"metric": string,"source_page"?: string | null,"source_title": string,"source_url": string,"unit": string,"valid_from": string,"value": number,"version": string
                  }
                  Update: {
                    "approved_adr"?: string,"created_at"?: string,"derivation"?: string,"id"?: string,"metric"?: string,"source_page"?: string | null,"source_title"?: string,"source_url"?: string,"unit"?: string,"valid_from"?: string,"value"?: number,"version"?: string
                  }
                  Relationships: [
                    
                  ]
                },"impact_ledger": {
                  Row: {
                    "allocation_id": string,"category_code": string,"charity_org_id": string,"co2e_kg": number,"created_at": string,"created_by": string | null,"entry_type": Database["public"]['Enums']["ledger_entry_type"],"factor_version": string,"handover_line_id": string,"id": number,"is_demo": boolean,"kg": number,"meals": number,"occurred_at": string,"offer_id": string,"reason": string | null,"reverses_entry_id": number | null,"store_org_id": string,"store_site_id": string,"water_l": number | null
                  }
                  Insert: {
                    "allocation_id": string,"category_code": string,"charity_org_id": string,"co2e_kg": number,"created_at"?: string,"created_by"?: string | null,"entry_type": Database["public"]['Enums']["ledger_entry_type"],"factor_version": string,"handover_line_id": string,"id"?: never,"is_demo": boolean,"kg": number,"meals": number,"occurred_at": string,"offer_id": string,"reason"?: string | null,"reverses_entry_id"?: number | null,"store_org_id": string,"store_site_id": string,"water_l"?: number | null
                  }
                  Update: {
                    "allocation_id"?: string,"category_code"?: string,"charity_org_id"?: string,"co2e_kg"?: number,"created_at"?: string,"created_by"?: string | null,"entry_type"?: Database["public"]['Enums']["ledger_entry_type"],"factor_version"?: string,"handover_line_id"?: string,"id"?: never,"is_demo"?: boolean,"kg"?: number,"meals"?: number,"occurred_at"?: string,"offer_id"?: string,"reason"?: string | null,"reverses_entry_id"?: number | null,"store_org_id"?: string,"store_site_id"?: string,"water_l"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "impact_ledger_allocation_id_fkey"
      columns: ["allocation_id"]
isOneToOne: false
      referencedRelation: "allocations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "impact_ledger_category_code_fkey"
      columns: ["category_code"]
isOneToOne: false
      referencedRelation: "food_categories"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "impact_ledger_charity_org_id_fkey"
      columns: ["charity_org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "impact_ledger_charity_org_id_fkey"
      columns: ["charity_org_id"]
isOneToOne: false
      referencedRelation: "public_org_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "impact_ledger_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "impact_ledger_handover_line_id_fkey"
      columns: ["handover_line_id"]
isOneToOne: false
      referencedRelation: "handover_lines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "impact_ledger_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "offers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "impact_ledger_reverses_entry_id_fkey"
      columns: ["reverses_entry_id"]
isOneToOne: false
      referencedRelation: "impact_ledger"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "impact_ledger_store_org_id_fkey"
      columns: ["store_org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "impact_ledger_store_org_id_fkey"
      columns: ["store_org_id"]
isOneToOne: false
      referencedRelation: "public_org_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "impact_ledger_store_site_id_fkey"
      columns: ["store_site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    }
                  ]
                },"impact_public_daily": {
                  Row: {
                    "cell_key": string,"co2e_kg": number,"day": string,"deliveries": number,"is_demo": boolean,"kg": number,"meals": number,"updated_at": string,"ward": string | null
                  }
                  Insert: {
                    "cell_key": string,"co2e_kg"?: number,"day": string,"deliveries"?: number,"is_demo": boolean,"kg"?: number,"meals"?: number,"updated_at"?: string,"ward"?: string | null
                  }
                  Update: {
                    "cell_key"?: string,"co2e_kg"?: number,"day"?: string,"deliveries"?: number,"is_demo"?: boolean,"kg"?: number,"meals"?: number,"updated_at"?: string,"ward"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"incidents": {
                  Row: {
                    "allocation_id": string | null,"created_at": string,"description": string,"handover_id": string | null,"id": string,"kind": Database["public"]['Enums']["incident_kind"],"offer_id": string | null,"pickup_id": string | null,"proof_id": string | null,"reported_by": string,"reporter_org_id": string | null,"resolution": string | null,"resolved_at": string | null,"resolved_by": string | null,"status": Database["public"]['Enums']["incident_status"],"subject_org_id": string | null,"updated_at": string
                  }
                  Insert: {
                    "allocation_id"?: string | null,"created_at"?: string,"description": string,"handover_id"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["incident_kind"],"offer_id"?: string | null,"pickup_id"?: string | null,"proof_id"?: string | null,"reported_by": string,"reporter_org_id"?: string | null,"resolution"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: Database["public"]['Enums']["incident_status"],"subject_org_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "allocation_id"?: string | null,"created_at"?: string,"description"?: string,"handover_id"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["incident_kind"],"offer_id"?: string | null,"pickup_id"?: string | null,"proof_id"?: string | null,"reported_by"?: string,"reporter_org_id"?: string | null,"resolution"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: Database["public"]['Enums']["incident_status"],"subject_org_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "incidents_allocation_id_fkey"
      columns: ["allocation_id"]
isOneToOne: false
      referencedRelation: "allocations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "incidents_handover_id_fkey"
      columns: ["handover_id"]
isOneToOne: false
      referencedRelation: "handovers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "incidents_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "offers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "incidents_pickup_id_fkey"
      columns: ["pickup_id"]
isOneToOne: false
      referencedRelation: "pickups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "incidents_reported_by_fkey"
      columns: ["reported_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "incidents_reporter_org_id_fkey"
      columns: ["reporter_org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "incidents_reporter_org_id_fkey"
      columns: ["reporter_org_id"]
isOneToOne: false
      referencedRelation: "public_org_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "incidents_resolved_by_fkey"
      columns: ["resolved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "incidents_subject_org_id_fkey"
      columns: ["subject_org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "incidents_subject_org_id_fkey"
      columns: ["subject_org_id"]
isOneToOne: false
      referencedRelation: "public_org_cards"
      referencedColumns: ["id"]
    }
                  ]
                },"label_rules": {
                  Row: {
                    "effective_from": string,"green_above": string,"note": string | null,"perishability": Database["public"]['Enums']["perishability"],"red_below": string,"version": number
                  }
                  Insert: {
                    "effective_from": string,"green_above": string,"note"?: string | null,"perishability": Database["public"]['Enums']["perishability"],"red_below": string,"version": number
                  }
                  Update: {
                    "effective_from"?: string,"green_above"?: string,"note"?: string | null,"perishability"?: Database["public"]['Enums']["perishability"],"red_below"?: string,"version"?: number
                  }
                  Relationships: [
                    
                  ]
                },"need_bundles": {
                  Row: {
                    "algorithm_version": string,"client_op_id": string,"created_at": string,"created_by": string,"est_distance_m": number,"est_duration_s": number,"id": string,"inputs_snapshot": NonNullable<Json>,"need_id": string,"option_rank": number,"qty_target": number,"rematch_of": string | null,"route": unknown,"route_provider": string | null,"score": number,"status": Database["public"]['Enums']["bundle_status"],"stop_count": number,"updated_at": string
                  }
                  Insert: {
                    "algorithm_version": string,"client_op_id": string,"created_at"?: string,"created_by": string,"est_distance_m": number,"est_duration_s": number,"id"?: string,"inputs_snapshot": NonNullable<Json>,"need_id": string,"option_rank": number,"qty_target": number,"rematch_of"?: string | null,"route"?: unknown,"route_provider"?: string | null,"score": number,"status"?: Database["public"]['Enums']["bundle_status"],"stop_count": number,"updated_at"?: string
                  }
                  Update: {
                    "algorithm_version"?: string,"client_op_id"?: string,"created_at"?: string,"created_by"?: string,"est_distance_m"?: number,"est_duration_s"?: number,"id"?: string,"inputs_snapshot"?: NonNullable<Json>,"need_id"?: string,"option_rank"?: number,"qty_target"?: number,"rematch_of"?: string | null,"route"?: unknown,"route_provider"?: string | null,"score"?: number,"status"?: Database["public"]['Enums']["bundle_status"],"stop_count"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "need_bundles_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "need_bundles_need_id_fkey"
      columns: ["need_id"]
isOneToOne: false
      referencedRelation: "needs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "need_bundles_rematch_of_fkey"
      columns: ["rematch_of"]
isOneToOne: false
      referencedRelation: "need_bundles"
      referencedColumns: ["id"]
    }
                  ]
                },"needs": {
                  Row: {
                    "cancel_reason": string | null,"category_codes": (string)[],"closed_at": string | null,"created_at": string,"created_by": string,"id": string,"needed_by": string,"note": string | null,"org_id": string,"people_to_serve": number | null,"qty_delivered": number,"qty_in_flight": number,"quantity": number,"site_id": string,"status": Database["public"]['Enums']["need_status"],"unit": Database["public"]['Enums']["unit_code"],"updated_at": string
                  }
                  Insert: {
                    "cancel_reason"?: string | null,"category_codes": (string)[],"closed_at"?: string | null,"created_at"?: string,"created_by": string,"id"?: string,"needed_by": string,"note"?: string | null,"org_id": string,"people_to_serve"?: number | null,"qty_delivered"?: number,"qty_in_flight"?: number,"quantity": number,"site_id": string,"status"?: Database["public"]['Enums']["need_status"],"unit": Database["public"]['Enums']["unit_code"],"updated_at"?: string
                  }
                  Update: {
                    "cancel_reason"?: string | null,"category_codes"?: (string)[],"closed_at"?: string | null,"created_at"?: string,"created_by"?: string,"id"?: string,"needed_by"?: string,"note"?: string | null,"org_id"?: string,"people_to_serve"?: number | null,"qty_delivered"?: number,"qty_in_flight"?: number,"quantity"?: number,"site_id"?: string,"status"?: Database["public"]['Enums']["need_status"],"unit"?: Database["public"]['Enums']["unit_code"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "needs_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "needs_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "needs_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "public_org_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "needs_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_deliveries": {
                  Row: {
                    "attempted_at": string,"attempts": number,"channel": Database["public"]['Enums']["notify_channel"],"error": string | null,"locked_until": string | null,"notification_id": string,"provider_message_id": string | null,"status": Database["public"]['Enums']["delivery_status"] | null,"target": string
                  }
                  Insert: {
                    "attempted_at"?: string,"attempts"?: number,"channel": Database["public"]['Enums']["notify_channel"],"error"?: string | null,"locked_until"?: string | null,"notification_id": string,"provider_message_id"?: string | null,"status"?: Database["public"]['Enums']["delivery_status"] | null,"target": string
                  }
                  Update: {
                    "attempted_at"?: string,"attempts"?: number,"channel"?: Database["public"]['Enums']["notify_channel"],"error"?: string | null,"locked_until"?: string | null,"notification_id"?: string,"provider_message_id"?: string | null,"status"?: Database["public"]['Enums']["delivery_status"] | null,"target"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_deliveries_notification_id_fkey"
      columns: ["notification_id"]
isOneToOne: false
      referencedRelation: "notifications"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_outbox": {
                  Row: {
                    "aggregate_id": string,"aggregate_type": string,"attempts": number,"created_at": string,"dedupe_key": string,"event": Database["public"]['Enums']["notification_event"],"id": string,"last_error": string | null,"locked_until": string | null,"next_attempt_at": string,"payload": NonNullable<Json>,"processed_at": string | null,"status": Database["public"]['Enums']["outbox_status"],"urgency": string
                  }
                  Insert: {
                    "aggregate_id": string,"aggregate_type": string,"attempts"?: number,"created_at"?: string,"dedupe_key": string,"event": Database["public"]['Enums']["notification_event"],"id"?: string,"last_error"?: string | null,"locked_until"?: string | null,"next_attempt_at"?: string,"payload"?: NonNullable<Json>,"processed_at"?: string | null,"status"?: Database["public"]['Enums']["outbox_status"],"urgency"?: string
                  }
                  Update: {
                    "aggregate_id"?: string,"aggregate_type"?: string,"attempts"?: number,"created_at"?: string,"dedupe_key"?: string,"event"?: Database["public"]['Enums']["notification_event"],"id"?: string,"last_error"?: string | null,"locked_until"?: string | null,"next_attempt_at"?: string,"payload"?: NonNullable<Json>,"processed_at"?: string | null,"status"?: Database["public"]['Enums']["outbox_status"],"urgency"?: string
                  }
                  Relationships: [
                    
                  ]
                },"notification_preferences": {
                  Row: {
                    "channel": Database["public"]['Enums']["notify_channel"],"enabled": boolean,"event": Database["public"]['Enums']["notification_event"],"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "channel": Database["public"]['Enums']["notify_channel"],"enabled": boolean,"event": Database["public"]['Enums']["notification_event"],"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "channel"?: Database["public"]['Enums']["notify_channel"],"enabled"?: boolean,"event"?: Database["public"]['Enums']["notification_event"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_preferences_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string,"channels": (Database["public"]['Enums']["notify_channel"])[],"created_at": string,"deliver_after": string,"event": Database["public"]['Enums']["notification_event"],"id": string,"link_path": string | null,"org_id": string | null,"outbox_id": string | null,"read_at": string | null,"title": string,"urgency": string,"user_id": string
                  }
                  Insert: {
                    "body"?: string,"channels"?: (Database["public"]['Enums']["notify_channel"])[],"created_at"?: string,"deliver_after"?: string,"event": Database["public"]['Enums']["notification_event"],"id"?: string,"link_path"?: string | null,"org_id"?: string | null,"outbox_id"?: string | null,"read_at"?: string | null,"title": string,"urgency"?: string,"user_id": string
                  }
                  Update: {
                    "body"?: string,"channels"?: (Database["public"]['Enums']["notify_channel"])[],"created_at"?: string,"deliver_after"?: string,"event"?: Database["public"]['Enums']["notification_event"],"id"?: string,"link_path"?: string | null,"org_id"?: string | null,"outbox_id"?: string | null,"read_at"?: string | null,"title"?: string,"urgency"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "public_org_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_outbox_id_fkey"
      columns: ["outbox_id"]
isOneToOne: false
      referencedRelation: "notification_outbox"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"offers": {
                  Row: {
                    "ai_assisted": boolean,"cancel_reason": string | null,"category_code": string,"closed_at": string | null,"created_at": string,"created_by": string,"description": string | null,"effective_deadline": string | null,"expires_at": string,"expiry_is_date_only": boolean,"id": string,"org_id": string,"photo_paths": (string)[],"pickup_window": unknown,"published_at": string | null,"qty_available": number | null,"qty_committed": number,"qty_unclaimed": number | null,"quantity": number,"red_notified_at": string | null,"safety_attested_at": string | null,"safety_attested_by": string | null,"site_id": string,"status": Database["public"]['Enums']["offer_status"],"title": string,"unit": Database["public"]['Enums']["unit_code"],"unit_weight_kg": number,"updated_at": string,"weight_source": Database["public"]['Enums']["weight_source"],"offer_label": Database["public"]['Enums']["freshness_label"] | null,"offer_label_rank": number | null,"offer_red_at": string | null
                  }
                  Insert: {
                    "ai_assisted"?: boolean,"cancel_reason"?: string | null,"category_code": string,"closed_at"?: string | null,"created_at"?: string,"created_by"?: string,"description"?: string | null,"effective_deadline"?: string | null,"expires_at": string,"expiry_is_date_only"?: boolean,"id"?: string,"org_id": string,"photo_paths"?: (string)[],"pickup_window": unknown,"published_at"?: string | null,"qty_available"?: never,"qty_committed"?: number,"qty_unclaimed"?: number | null,"quantity": number,"red_notified_at"?: string | null,"safety_attested_at"?: string | null,"safety_attested_by"?: string | null,"site_id": string,"status"?: Database["public"]['Enums']["offer_status"],"title": string,"unit": Database["public"]['Enums']["unit_code"],"unit_weight_kg": number,"updated_at"?: string,"weight_source": Database["public"]['Enums']["weight_source"]
                  }
                  Update: {
                    "ai_assisted"?: boolean,"cancel_reason"?: string | null,"category_code"?: string,"closed_at"?: string | null,"created_at"?: string,"created_by"?: string,"description"?: string | null,"effective_deadline"?: string | null,"expires_at"?: string,"expiry_is_date_only"?: boolean,"id"?: string,"org_id"?: string,"photo_paths"?: (string)[],"pickup_window"?: unknown,"published_at"?: string | null,"qty_available"?: never,"qty_committed"?: number,"qty_unclaimed"?: number | null,"quantity"?: number,"red_notified_at"?: string | null,"safety_attested_at"?: string | null,"safety_attested_by"?: string | null,"site_id"?: string,"status"?: Database["public"]['Enums']["offer_status"],"title"?: string,"unit"?: Database["public"]['Enums']["unit_code"],"unit_weight_kg"?: number,"updated_at"?: string,"weight_source"?: Database["public"]['Enums']["weight_source"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "offers_category_code_fkey"
      columns: ["category_code"]
isOneToOne: false
      referencedRelation: "food_categories"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "offers_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offers_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offers_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "public_org_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offers_safety_attested_by_fkey"
      columns: ["safety_attested_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offers_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
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
      foreignKeyName: "org_change_requests_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "public_org_cards"
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
                },"org_contacts": {
                  Row: {
                    "hotline_email": string | null,"hotline_phone": string | null,"org_id": string,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "hotline_email"?: string | null,"hotline_phone"?: string | null,"org_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "hotline_email"?: string | null,"hotline_phone"?: string | null,"org_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_contacts_org_id_fkey"
      columns: ["org_id"]
isOneToOne: true
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "org_contacts_org_id_fkey"
      columns: ["org_id"]
isOneToOne: true
      referencedRelation: "public_org_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "org_contacts_updated_by_fkey"
      columns: ["updated_by"]
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
      foreignKeyName: "org_documents_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "public_org_cards"
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
    },{
      foreignKeyName: "org_invitations_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "public_org_cards"
      referencedColumns: ["id"]
    }
                  ]
                },"org_members": {
                  Row: {
                    "created_at": string,"invited_by": string | null,"joined_at": string | null,"org_id": string,"paused_at": string | null,"paused_reason": string | null,"role": Database["public"]['Enums']["org_role"],"site_ids": (string)[] | null,"status": Database["public"]['Enums']["member_status"],"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"invited_by"?: string | null,"joined_at"?: string | null,"org_id": string,"paused_at"?: string | null,"paused_reason"?: string | null,"role": Database["public"]['Enums']["org_role"],"site_ids"?: (string)[] | null,"status"?: Database["public"]['Enums']["member_status"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"invited_by"?: string | null,"joined_at"?: string | null,"org_id"?: string,"paused_at"?: string | null,"paused_reason"?: string | null,"role"?: Database["public"]['Enums']["org_role"],"site_ids"?: (string)[] | null,"status"?: Database["public"]['Enums']["member_status"],"updated_at"?: string,"user_id"?: string
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
      foreignKeyName: "org_members_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "public_org_cards"
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
    },{
      foreignKeyName: "org_sensitive_org_id_fkey"
      columns: ["org_id"]
isOneToOne: true
      referencedRelation: "public_org_cards"
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
                },"pickup_stops": {
                  Row: {
                    "arrival_check": string | null,"arrival_note": string | null,"arrived_at": string | null,"completed_at": string | null,"created_at": string,"eta": string | null,"id": string,"kind": Database["public"]['Enums']["handover_kind"],"pickup_id": string,"seq": number,"site_id": string,"skip_reason": string | null,"status": Database["public"]['Enums']["stop_status"],"updated_at": string
                  }
                  Insert: {
                    "arrival_check"?: string | null,"arrival_note"?: string | null,"arrived_at"?: string | null,"completed_at"?: string | null,"created_at"?: string,"eta"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["handover_kind"],"pickup_id": string,"seq": number,"site_id": string,"skip_reason"?: string | null,"status"?: Database["public"]['Enums']["stop_status"],"updated_at"?: string
                  }
                  Update: {
                    "arrival_check"?: string | null,"arrival_note"?: string | null,"arrived_at"?: string | null,"completed_at"?: string | null,"created_at"?: string,"eta"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["handover_kind"],"pickup_id"?: string,"seq"?: number,"site_id"?: string,"skip_reason"?: string | null,"status"?: Database["public"]['Enums']["stop_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pickup_stops_pickup_id_fkey"
      columns: ["pickup_id"]
isOneToOne: false
      referencedRelation: "pickups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pickup_stops_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    }
                  ]
                },"pickups": {
                  Row: {
                    "accepted_at": string | null,"assignee_user_id": string | null,"cancel_reason": string | null,"cancelled_at": string | null,"charity_org_id": string,"charity_site_id": string,"completed_at": string | null,"created_at": string,"created_by": string,"id": string,"last_location": unknown,"last_location_accuracy_m": number | null,"last_location_at": string | null,"mode": Database["public"]['Enums']["pickup_mode"],"planned_start_at": string | null,"route": unknown,"route_computed_at": string | null,"route_distance_m": number | null,"route_duration_s": number | null,"route_provider": string | null,"started_at": string | null,"status": Database["public"]['Enums']["pickup_status"],"updated_at": string
                  }
                  Insert: {
                    "accepted_at"?: string | null,"assignee_user_id"?: string | null,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"charity_org_id": string,"charity_site_id": string,"completed_at"?: string | null,"created_at"?: string,"created_by": string,"id"?: string,"last_location"?: unknown,"last_location_accuracy_m"?: number | null,"last_location_at"?: string | null,"mode": Database["public"]['Enums']["pickup_mode"],"planned_start_at"?: string | null,"route"?: unknown,"route_computed_at"?: string | null,"route_distance_m"?: number | null,"route_duration_s"?: number | null,"route_provider"?: string | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["pickup_status"],"updated_at"?: string
                  }
                  Update: {
                    "accepted_at"?: string | null,"assignee_user_id"?: string | null,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"charity_org_id"?: string,"charity_site_id"?: string,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string,"id"?: string,"last_location"?: unknown,"last_location_accuracy_m"?: number | null,"last_location_at"?: string | null,"mode"?: Database["public"]['Enums']["pickup_mode"],"planned_start_at"?: string | null,"route"?: unknown,"route_computed_at"?: string | null,"route_distance_m"?: number | null,"route_duration_s"?: number | null,"route_provider"?: string | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["pickup_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pickups_assignee_user_id_fkey"
      columns: ["assignee_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pickups_charity_org_id_fkey"
      columns: ["charity_org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pickups_charity_org_id_fkey"
      columns: ["charity_org_id"]
isOneToOne: false
      referencedRelation: "public_org_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pickups_charity_site_id_fkey"
      columns: ["charity_site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pickups_created_by_fkey"
      columns: ["created_by"]
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
    },{
      foreignKeyName: "profiles_active_org_id_fkey"
      columns: ["active_org_id"]
isOneToOne: false
      referencedRelation: "public_org_cards"
      referencedColumns: ["id"]
    }
                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"disabled_at": string | null,"endpoint": string,"failed_count": number,"id": string,"last_success_at": string | null,"p256dh": string,"user_agent": string | null,"user_id": string
                  }
                  Insert: {
                    "auth": string,"created_at"?: string,"disabled_at"?: string | null,"endpoint": string,"failed_count"?: number,"id"?: string,"last_success_at"?: string | null,"p256dh": string,"user_agent"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"disabled_at"?: string | null,"endpoint"?: string,"failed_count"?: number,"id"?: string,"last_success_at"?: string | null,"p256dh"?: string,"user_agent"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_subscriptions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"rate_limits": {
                  Row: {
                    "count": number,"key": string,"window_start": string
                  }
                  Insert: {
                    "count"?: number,"key": string,"window_start": string
                  }
                  Update: {
                    "count"?: number,"key"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rpc_idempotency": {
                  Row: {
                    "actor_id": string,"client_op_id": string,"created_at": string,"request_hash": string,"response": Json | null,"rpc_name": string
                  }
                  Insert: {
                    "actor_id": string,"client_op_id": string,"created_at"?: string,"request_hash": string,"response"?: Json | null,"rpc_name": string
                  }
                  Update: {
                    "actor_id"?: string,"client_op_id"?: string,"created_at"?: string,"request_hash"?: string,"response"?: Json | null,"rpc_name"?: string
                  }
                  Relationships: [
                    
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
    },{
      foreignKeyName: "sites_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "public_org_cards"
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
    },{
      foreignKeyName: "trust_events_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "public_org_cards"
      referencedColumns: ["id"]
    }
                  ]
                },"volunteer_profiles": {
                  Row: {
                    "availability_note": string | null,"base_area": unknown,"base_area_label": string | null,"capacity_kg": number,"created_at": string,"updated_at": string,"user_id": string,"vehicle": Database["public"]['Enums']["vehicle_type"]
                  }
                  Insert: {
                    "availability_note"?: string | null,"base_area"?: unknown,"base_area_label"?: string | null,"capacity_kg"?: number,"created_at"?: string,"updated_at"?: string,"user_id"?: string,"vehicle"?: Database["public"]['Enums']["vehicle_type"]
                  }
                  Update: {
                    "availability_note"?: string | null,"base_area"?: unknown,"base_area_label"?: string | null,"capacity_kg"?: number,"created_at"?: string,"updated_at"?: string,"user_id"?: string,"vehicle"?: Database["public"]['Enums']["vehicle_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "volunteer_profiles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "public_impact_stats": {
                  Row: {
                    "co2e_kg_total": number | null,"deliveries_total": number | null,"demo_kg_total": number | null,"kg_30d": number | null,"kg_total": number | null,"meals_total": number | null,"updated_at": string | null
                  }
                  Relationships: [
                    
                  ]
                },"public_org_cards": {
                  Row: {
                    "id": string | null,"is_demo": boolean | null,"kind": Database["public"]['Enums']["org_kind"] | null,"logo_path": string | null,"name": string | null,"public_lat": number | null,"public_lng": number | null,"subtype": string | null,"ward": string | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "accept_invite":
{ Args: { "p_token": string }; Returns: string
                           },
"activate_impact_factors":
{ Args: { "p_version": string }; Returns: undefined
                           },
"assign_pickup":
{ Args: { "p_client_op_id": string,"p_plan": Json }; Returns: string
                           },
"cancel_allocation":
{ Args: { "p_allocation_id": string,"p_attribution"?: string,"p_client_op_id": string,"p_reason": string }; Returns: undefined
                           },
"cancel_need":
{ Args: { "p_client_op_id": string,"p_need_id": string,"p_reason": string }; Returns: undefined
                           },
"cancel_offer":
{ Args: { "p_client_op_id": string,"p_offer_id": string,"p_reason": string }; Returns: Json
                           },
"cancel_pickup":
{ Args: { "p_client_op_id": string,"p_pickup_id": string,"p_reason": string }; Returns: undefined
                           },
"check_in_stop":
{ Args: { "p_client_op_id": string,"p_lat": number,"p_lng": number,"p_reason"?: string,"p_stop_id": string }; Returns: Json
                           },
"claim_email_deliveries":
{ Args: { "p_limit"?: number }; Returns: {
              "attempts": number,"body": string,"email": string,"event": Database["public"]['Enums']["notification_event"],"full_name": string,"link_path": string,"notification_id": string,"org_name": string,"title": string,"urgency": string
            }[]
                           },
"claim_outbox_batch":
{ Args: { "p_events": (Database["public"]['Enums']["notification_event"])[],"p_limit": number }; Returns: {
              "aggregate_id": string,
"aggregate_type": string,
"attempts": number,
"created_at": string,
"dedupe_key": string,
"event": Database["public"]['Enums']["notification_event"],
"id": string,
"last_error": string | null,
"locked_until": string | null,
"next_attempt_at": string,
"payload": NonNullable<Json>,
"processed_at": string | null,
"status": Database["public"]['Enums']["outbox_status"],
"urgency": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "notification_outbox"
        isOneToOne: false
        isSetofReturn: true
      } },
"close_expired_offers":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"close_organization":
{ Args: { "p_client_op_id": string,"p_org_id": string }; Returns: undefined
                           },
"complete_email_delivery":
{ Args: { "p_error"?: string,"p_notification_id": string,"p_ok": boolean,"p_provider_message_id"?: string }; Returns: boolean
                           },
"complete_outbox":
{ Args: { "p_error"?: string,"p_id": string,"p_ok": boolean }; Returns: Database["public"]['Enums']["outbox_status"]
                           },
"confirm_allocation":
{ Args: { "p_allocation_id": string,"p_client_op_id": string }; Returns: undefined
                           },
"consume_handover_code":
{ Args: { "p_client_op_id": string,"p_code": string,"p_handover_id": string,"p_lines": Json }; Returns: Json
                           },
"consume_handover_token":
{ Args: { "p_client_op_id": string,"p_lines": Json,"p_token": string }; Returns: Json
                           },
"consume_rate_limit":
{ Args: { "p_key": string,"p_limit": number,"p_window": string }; Returns: boolean
                           },
"count_stores_within":
{ Args: { "p_radius_km": number,"p_site_id": string }; Returns: number
                           },
"create_offer":
{ Args: { "p_client_op_id": string,"p_payload": Json }; Returns: string
                           },
"create_organization":
{ Args: { "p_client_op_id": string,"p_kind": Database["public"]['Enums']["org_kind"],"p_name": string,"p_subtype": string }; Returns: string
                           },
"demo_approve_organization":
{ Args: { "p_org_id": string,"p_reviewer_id": string }; Returns: Json
                           },
"demo_reset":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"demo_seed_history":
{ Args: { "p_items": Json }; Returns: Json
                           },
"dispatch_outbox":
{ Args: { "p_limit"?: number }; Returns: Json
                           },
"expire_stale_requests":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"freshness_label":
{ Args: { "p_at": string,"p_deadline": string,"p_perishability": Database["public"]['Enums']["perishability"] }; Returns: Database["public"]['Enums']["freshness_label"]
                           },
"get_org_contact":
{ Args: { "p_org_id": string }; Returns: {
              "hotline_email": string,"hotline_phone": string,"org_id": string,"org_name": string
            }[]
                           },
"get_pickup_contacts":
{ Args: { "p_pickup_id": string }; Returns: {
              "display_name": string,"phone_masked": string,"role": string
            }[]
                           },
"get_representative_id_summary":
{ Args: { "p_org_id": string }; Returns: {
              "captured_at": string,"masked": string,"name_on_card": string,"source": string
            }[]
                           },
"get_site_location":
{ Args: { "p_site_id": string }; Returns: {
              "address_line": string,"lat": number,"lng": number
            }[]
                           },
"grant_consent":
{ Args: { "p_policy_version": string,"p_purpose": Database["public"]['Enums']["consent_purpose"],"p_source": string,"p_text_hash": string }; Returns: string
                           },
"grant_platform_admin":
{ Args: { "p_reason": string,"p_user_id": string }; Returns: undefined
                           },
"invite_member":
{ Args: { "p_email": string,"p_org_id": string,"p_role": Database["public"]['Enums']["org_role"],"p_site_ids": (string)[],"p_token_hash": string }; Returns: string
                           },
"issue_handover_token":
{ Args: { "p_client_op_id": string,"p_lines": Json,"p_stop_id": string }; Returns: {
              "code": string,"expires_at": string,"handover_id": string,"token": string
            }[]
                           },
"list_org_volunteers":
{ Args: { "p_org_id": string }; Returns: {
              "availability_note": string,"base_area_label": string,"base_lat": number,"base_lng": number,"capacity_kg": number,"full_name": string,"has_profile": boolean,"joined_at": string,"last_trip_at": string,"location_consent": boolean,"open_trips": number,"paused_at": string,"paused_reason": string,"phone_masked": string,"trips_completed": number,"trips_this_month": number,"user_id": string,"vehicle": Database["public"]['Enums']["vehicle_type"]
            }[]
                           },
"log_document_view":
{ Args: { "p_document_id": string }; Returns: undefined
                           },
"mark_allocation_packed":
{ Args: { "p_allocation_id": string,"p_client_op_id": string,"p_packed"?: boolean }; Returns: undefined
                           },
"mark_kyc_purged":
{ Args: { "p_document_id": string }; Returns: undefined
                           },
"mark_notifications_read":
{ Args: { "p_ids"?: (string)[] }; Returns: number
                           },
"marketplace_offers":
{ Args: { "p_category_codes"?: (string)[],"p_charity_site_id": string,"p_labels"?: (Database["public"]['Enums']["freshness_label"])[],"p_max_km"?: number,"p_max_travel_min"?: number }; Returns: {
              "category_code": string,"distance_km": number,"effective_deadline": string,"eta_pickup": string,"label": Database["public"]['Enums']["freshness_label"],"offer_id": string,"photo_path": string,"qty_available": number,"site_id": string,"site_is_approximate": boolean,"site_lat": number,"site_lng": number,"store_name": string,"store_org_id": string,"title": string,"travel_min": number,"trust_score": number,"unit": Database["public"]['Enums']["unit_code"],"unit_weight_kg": number
            }[]
                           },
"match_candidates":
{ Args: { "p_at"?: string,"p_exclude_site_ids"?: (string)[],"p_need_id": string,"p_remaining"?: number }; Returns: {
              "available_need_units": number,"category_code": string,"distance_km": number,"effective_deadline": string,"eta_dropoff": string,"eta_pickup": string,"label": Database["public"]['Enums']["freshness_label"],"offer_id": string,"perishability": Database["public"]['Enums']["perishability"],"pickup_window": unknown,"pre_score": number,"qty_available": number,"site_id": string,"site_lat": number,"site_lng": number,"store_org_id": string,"travel_min": number,"trust_score": number,"unit": Database["public"]['Enums']["unit_code"],"unit_weight_kg": number
            }[]
                           },
"needs_nearby":
{ Args: { "p_category_codes"?: (string)[],"p_store_site_id"?: string }; Returns: {
              "category_codes": (string)[],"charity_name": string,"charity_org_id": string,"charity_subtype": string,"distance_km": number,"need_id": string,"needed_by": string,"people_to_serve": number,"qty_delivered": number,"qty_in_flight": number,"qty_remaining": number,"quantity": number,"site_city": string,"site_lat": number,"site_lng": number,"site_visibility": Database["public"]['Enums']["site_visibility"],"site_ward": string,"status": Database["public"]['Enums']["need_status"],"store_site_id": string,"unit": Database["public"]['Enums']["unit_code"]
            }[]
                           },
"notify_turned_red":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"offer_label":
{ Args: { "": Database["public"]['Tables']["offers"]['Row'] }; Returns: { error: true } & "the function public.offer_label with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache"
                           },
"offer_label_rank":
{ Args: { "": Database["public"]['Tables']["offers"]['Row'] }; Returns: { error: true } & "the function public.offer_label_rank with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache"
                           },
"offer_red_at":
{ Args: { "": Database["public"]['Tables']["offers"]['Row'] }; Returns: { error: true } & "the function public.offer_red_at with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache"
                           },
"peek_handover_token":
{ Args: { "p_token": string }; Returns: Json
                           },
"publish_need":
{ Args: { "p_category_codes": (string)[],"p_client_op_id": string,"p_needed_by": string,"p_note": string,"p_people_to_serve": number,"p_quantity": number,"p_site_id": string,"p_unit": Database["public"]['Enums']["unit_code"] }; Returns: string
                           },
"publish_offer":
{ Args: { "p_client_op_id": string,"p_offer_id": string,"p_safety_attested": boolean }; Returns: Json
                           },
"purge_notifications":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"purge_retention":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"record_dropoff":
{ Args: { "p_client_op_id": string,"p_handover_id": string,"p_lines": Json,"p_secret": string }; Returns: Json
                           },
"reinstate_organization":
{ Args: { "p_client_op_id": string,"p_note": string,"p_org_id": string }; Returns: undefined
                           },
"reject_allocation":
{ Args: { "p_allocation_id": string,"p_client_op_id": string,"p_reason": string }; Returns: undefined
                           },
"remove_member":
{ Args: { "p_org_id": string,"p_user_id": string }; Returns: undefined
                           },
"report_incident":
{ Args: { "p_client_op_id": string,"p_description": string,"p_kind": Database["public"]['Enums']["incident_kind"],"p_refs": Json }; Returns: string
                           },
"request_offer":
{ Args: { "p_charity_site_id": string,"p_client_op_id": string,"p_offer_id": string,"p_qty": number }; Returns: Json
                           },
"reserve_bundle":
{ Args: { "p_client_op_id": string,"p_lines": Json,"p_meta"?: Json,"p_need_id": string }; Returns: Json
                           },
"resolve_incident":
{ Args: { "p_client_op_id": string,"p_incident_id": string,"p_resolution": string,"p_status": Database["public"]['Enums']["incident_status"] }; Returns: undefined
                           },
"resolve_recipients":
{ Args: { "p_outbox_id": string }; Returns: {
              "audience": string,"distance_m": number,"org_id": string,"user_id": string,"wave": number
            }[]
                           },
"respond_pickup":
{ Args: { "p_accept": boolean,"p_client_op_id": string,"p_pickup_id": string,"p_reason": string }; Returns: undefined
                           },
"reveal_representative_id":
{ Args: { "p_org_id": string }; Returns: string
                           },
"reveal_trip_contact":
{ Args: { "p_pickup_id": string }; Returns: {
              "phone": string,"volunteer_name": string
            }[]
                           },
"reverse_impact":
{ Args: { "p_client_op_id": string,"p_handover_line_id": string,"p_kg": number,"p_reason": string }; Returns: number
                           },
"review_org_change_request":
{ Args: { "p_client_op_id": string,"p_decision": string,"p_note": string,"p_request_id": string }; Returns: undefined
                           },
"review_organization":
{ Args: { "p_client_op_id": string,"p_decision": string,"p_org_id": string,"p_reason": string }; Returns: undefined
                           },
"revoke_invitation":
{ Args: { "p_invitation_id": string }; Returns: undefined
                           },
"revoke_platform_admin":
{ Args: { "p_reason": string,"p_user_id": string }; Returns: undefined
                           },
"set_org_paused":
{ Args: { "p_org_id": string,"p_paused": boolean,"p_reason": string }; Returns: undefined
                           },
"set_representative_id":
{ Args: { "p_id_number": string,"p_name_on_card"?: string,"p_org_id": string,"p_source": string }; Returns: Json
                           },
"set_site_hours":
{ Args: { "p_hours": Json,"p_site_id": string }; Returns: undefined
                           },
"set_volunteer_paused":
{ Args: { "p_org_id": string,"p_paused": boolean,"p_reason": string,"p_user_id": string }; Returns: undefined
                           },
"site_close_at":
{ Args: { "p_at": string,"p_site_id": string }; Returns: string
                           },
"skip_stop":
{ Args: { "p_client_op_id": string,"p_reason": string,"p_stop_id": string }; Returns: undefined
                           },
"start_pickup":
{ Args: { "p_client_op_id": string,"p_pickup_id": string }; Returns: undefined
                           },
"submit_org_change_request":
{ Args: { "p_changes": Json,"p_client_op_id": string,"p_org_id": string,"p_reason": string }; Returns: string
                           },
"submit_organization":
{ Args: { "p_client_op_id": string,"p_org_id": string }; Returns: undefined
                           },
"suspend_organization":
{ Args: { "p_client_op_id": string,"p_org_id": string,"p_reason": string }; Returns: undefined
                           },
"update_member":
{ Args: { "p_org_id": string,"p_role": Database["public"]['Enums']["org_role"],"p_site_ids": (string)[],"p_user_id": string }; Returns: undefined
                           },
"update_offer":
{ Args: { "p_client_op_id": string,"p_offer_id": string,"p_patch": Json }; Returns: undefined
                           },
"update_offer_quantity":
{ Args: { "p_client_op_id": string,"p_new_quantity": number,"p_offer_id": string,"p_reason": string }; Returns: undefined
                           },
"update_pickup_progress":
{ Args: { "p_accuracy_m": number,"p_lat": number,"p_lng": number,"p_pickup_id": string }; Returns: Json
                           },
"upsert_site":
{ Args: { "p_client_op_id": string,"p_org_id": string,"p_site": Json }; Returns: string
                           },
"upsert_volunteer_profile":
{ Args: { "p_payload": Json }; Returns: undefined
                           },
"verify_representative_id":
{ Args: { "p_last4": string,"p_method": string,"p_org_id": string }; Returns: undefined
                           },
"withdraw_consent":
{ Args: { "p_purpose": Database["public"]['Enums']["consent_purpose"] }; Returns: undefined
                           }
          }
          Enums: {
            "allocation_status": "requested"|"confirmed"|"assigned"|"picked_up"|"delivered"|"cancelled"|"rejected"|"expired","auto_accept_mode": "off"|"all"|"trusted","bundle_status": "proposed"|"partially_confirmed"|"confirmed"|"cancelled","consent_purpose": "terms"|"location_trip"|"proof_photo"|"marketing"|"trip_contact","delivery_status": "sent"|"failed"|"skipped","factor_status": "draft"|"active"|"retired","freshness_label": "green"|"yellow"|"red"|"expired","handover_kind": "pickup"|"dropoff","handover_method": "qr"|"code"|"auto","incident_kind": "quantity_dispute"|"quality"|"food_safety"|"no_show"|"conduct"|"privacy"|"other","incident_status": "open"|"in_review"|"resolved"|"dismissed","ledger_entry_type": "credit"|"reversal","location_source": "pin"|"geocode"|"gps","member_status": "invited"|"active"|"removed","need_status": "open"|"partially_matched"|"matched"|"fulfilled"|"closed_partial"|"expired"|"cancelled","notification_event": "offer_published"|"offer_turned_red"|"need_published"|"allocation_requested"|"allocation_confirmed"|"allocation_rejected"|"allocation_cancelled"|"allocation_expired"|"bundle_options_ready"|"bundle_confirmed"|"bundle_shortfall"|"need_responded"|"need_closed"|"offer_expired"|"member_invited"|"pickup_assigned"|"pickup_cancelled"|"pickup_started"|"pickup_handover_done"|"delivery_completed"|"proof_due_soon"|"proof_overdue"|"proof_submitted"|"proof_reviewed"|"org_submitted"|"org_reviewed"|"org_suspended"|"org_reinstated"|"org_change_submitted"|"org_change_reviewed"|"allocation_packed"|"volunteer_accepted"|"volunteer_declined"|"volunteer_checked_in"|"thank_you_received"|"incident_opened"|"monthly_report_ready"|"kyc_purge","notify_channel": "in_app"|"push"|"email","offer_status": "draft"|"open"|"fully_allocated"|"completed"|"expired"|"cancelled","org_change_status": "pending"|"approved"|"rejected","org_doc_type": "business_license"|"food_safety_cert"|"establishment_decision"|"operating_license"|"other","org_kind": "store"|"charity","org_role": "owner"|"manager"|"staff"|"volunteer","org_status": "draft"|"submitted"|"needs_changes"|"approved"|"rejected"|"suspended"|"closed","outbox_status": "pending"|"processing"|"done"|"dead","perishability": "cooked"|"fresh"|"packaged","pickup_mode": "volunteer"|"self","pickup_status": "planned"|"assigned"|"in_progress"|"completed"|"cancelled","platform_role": "user"|"admin","proof_status": "draft"|"submitted"|"approved"|"needs_changes"|"rejected","shortfall_reason": "store_short"|"quality_reject"|"capacity"|"no_show","site_visibility": "public"|"approximate"|"hidden","stop_status": "pending"|"arrived"|"done"|"skipped","unit_code": "piece"|"loaf"|"box"|"portion"|"bottle"|"bag"|"kg"|"liter","vehicle_type": "motorbike"|"bicycle"|"car"|"on_foot","weight_source": "declared"|"category_default"
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
            "allocation_status": ["requested", "confirmed", "assigned", "picked_up", "delivered", "cancelled", "rejected", "expired"],"auto_accept_mode": ["off", "all", "trusted"],"bundle_status": ["proposed", "partially_confirmed", "confirmed", "cancelled"],"consent_purpose": ["terms", "location_trip", "proof_photo", "marketing", "trip_contact"],"delivery_status": ["sent", "failed", "skipped"],"factor_status": ["draft", "active", "retired"],"freshness_label": ["green", "yellow", "red", "expired"],"handover_kind": ["pickup", "dropoff"],"handover_method": ["qr", "code", "auto"],"incident_kind": ["quantity_dispute", "quality", "food_safety", "no_show", "conduct", "privacy", "other"],"incident_status": ["open", "in_review", "resolved", "dismissed"],"ledger_entry_type": ["credit", "reversal"],"location_source": ["pin", "geocode", "gps"],"member_status": ["invited", "active", "removed"],"need_status": ["open", "partially_matched", "matched", "fulfilled", "closed_partial", "expired", "cancelled"],"notification_event": ["offer_published", "offer_turned_red", "need_published", "allocation_requested", "allocation_confirmed", "allocation_rejected", "allocation_cancelled", "allocation_expired", "bundle_options_ready", "bundle_confirmed", "bundle_shortfall", "need_responded", "need_closed", "offer_expired", "member_invited", "pickup_assigned", "pickup_cancelled", "pickup_started", "pickup_handover_done", "delivery_completed", "proof_due_soon", "proof_overdue", "proof_submitted", "proof_reviewed", "org_submitted", "org_reviewed", "org_suspended", "org_reinstated", "org_change_submitted", "org_change_reviewed", "allocation_packed", "volunteer_accepted", "volunteer_declined", "volunteer_checked_in", "thank_you_received", "incident_opened", "monthly_report_ready", "kyc_purge"],"notify_channel": ["in_app", "push", "email"],"offer_status": ["draft", "open", "fully_allocated", "completed", "expired", "cancelled"],"org_change_status": ["pending", "approved", "rejected"],"org_doc_type": ["business_license", "food_safety_cert", "establishment_decision", "operating_license", "other"],"org_kind": ["store", "charity"],"org_role": ["owner", "manager", "staff", "volunteer"],"org_status": ["draft", "submitted", "needs_changes", "approved", "rejected", "suspended", "closed"],"outbox_status": ["pending", "processing", "done", "dead"],"perishability": ["cooked", "fresh", "packaged"],"pickup_mode": ["volunteer", "self"],"pickup_status": ["planned", "assigned", "in_progress", "completed", "cancelled"],"platform_role": ["user", "admin"],"proof_status": ["draft", "submitted", "approved", "needs_changes", "rejected"],"shortfall_reason": ["store_short", "quality_reject", "capacity", "no_show"],"site_visibility": ["public", "approximate", "hidden"],"stop_status": ["pending", "arrived", "done", "skipped"],"unit_code": ["piece", "loaf", "box", "portion", "bottle", "bag", "kg", "liter"],"vehicle_type": ["motorbike", "bicycle", "car", "on_foot"],"weight_source": ["declared", "category_default"]
          }
        }
} as const
