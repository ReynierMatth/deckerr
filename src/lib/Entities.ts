export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export type Database = {
    graphql_public: {
        Tables: {
            [_ in never]: never
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            graphql: {
                Args: {
                    operationName?: string
                    query?: string
                    variables?: Json
                    extensions?: Json
                }
                Returns: Json
            }
        }
        Enums: {
            [_ in never]: never
        }
        CompositeTypes: {
            [_ in never]: never
        }
    }
    public: {
        Tables: {
            collections: {
                Row: {
                    card_id: string
                    created_at: string | null
                    id: string
                    quantity: number | null
                    updated_at: string | null
                    user_id: string
                }
                Insert: {
                    card_id: string
                    created_at?: string | null
                    id?: string
                    quantity?: number | null
                    updated_at?: string | null
                    user_id: string
                }
                Update: {
                    card_id?: string
                    created_at?: string | null
                    id?: string
                    quantity?: number | null
                    updated_at?: string | null
                    user_id?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "collections_user_id_fkey"
                        columns: ["user_id"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                ]
            }
            deck_cards: {
                Row: {
                    card_id: string
                    deck_id: string
                    id: string
                    is_commander: boolean | null
                    is_sideboard: boolean
                    quantity: number | null
                }
                Insert: {
                    card_id: string
                    deck_id: string
                    id?: string
                    is_commander?: boolean | null
                    is_sideboard?: boolean
                    quantity?: number | null
                }
                Update: {
                    card_id?: string
                    deck_id?: string
                    id?: string
                    is_commander?: boolean | null
                    is_sideboard?: boolean
                    quantity?: number | null
                }
                Relationships: [
                    {
                        foreignKeyName: "deck_cards_deck_id_fkey"
                        columns: ["deck_id"]
                        isOneToOne: false
                        referencedRelation: "decks"
                        referencedColumns: ["id"]
                    },
                ]
            }
            decks: {
                Row: {
                    created_at: string | null
                    format: string
                    id: string
                    name: string
                    updated_at: string | null
                    user_id: string
                }
                Insert: {
                    created_at?: string | null
                    format: string
                    id?: string
                    name: string
                    updated_at?: string | null
                    user_id: string
                }
                Update: {
                    created_at?: string | null
                    format?: string
                    id?: string
                    name?: string
                    updated_at?: string | null
                    user_id?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "decks_user_id_fkey"
                        columns: ["user_id"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                ]
            }
            profiles: {
                Row: {
                    created_at: string | null
                    id: string
                    updated_at: string | null
                    username: string | null
                    display_name: string | null
                    handle: string | null
                    collection_visibility: 'public' | 'friends' | 'private' | null
                }
                Insert: {
                    created_at?: string | null
                    id: string
                    updated_at?: string | null
                    username?: string | null
                    display_name?: string | null
                    handle?: string | null
                    collection_visibility?: 'public' | 'friends' | 'private' | null
                }
                Update: {
                    created_at?: string | null
                    id?: string
                    updated_at?: string | null
                    username?: string | null
                    display_name?: string | null
                    handle?: string | null
                    collection_visibility?: 'public' | 'friends' | 'private' | null
                }
                Relationships: []
            }
            friendships: {
                Row: {
                    id: string
                    requester_id: string
                    addressee_id: string
                    status: 'pending' | 'accepted' | 'declined'
                    created_at: string | null
                    updated_at: string | null
                }
                Insert: {
                    id?: string
                    requester_id: string
                    addressee_id: string
                    status?: 'pending' | 'accepted' | 'declined'
                    created_at?: string | null
                    updated_at?: string | null
                }
                Update: {
                    id?: string
                    requester_id?: string
                    addressee_id?: string
                    status?: 'pending' | 'accepted' | 'declined'
                    created_at?: string | null
                    updated_at?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "friendships_requester_id_fkey"
                        columns: ["requester_id"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "friendships_addressee_id_fkey"
                        columns: ["addressee_id"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    }
                ]
            }
            trades: {
                Row: {
                    id: string
                    user1_id: string
                    user2_id: string
                    status: 'pending' | 'accepted' | 'declined' | 'cancelled'
                    message: string | null
                    created_at: string | null
                    updated_at: string | null
                    version: number
                    editor_id: string | null
                }
                Insert: {
                    id?: string
                    user1_id: string
                    user2_id: string
                    status?: 'pending' | 'accepted' | 'declined' | 'cancelled'
                    message?: string | null
                    created_at?: string | null
                    updated_at?: string | null
                    version?: number
                    editor_id?: string | null
                }
                Update: {
                    id?: string
                    user1_id?: string
                    user2_id?: string
                    status?: 'pending' | 'accepted' | 'declined' | 'cancelled'
                    message?: string | null
                    created_at?: string | null
                    updated_at?: string | null
                    version?: number
                    editor_id?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "trades_user1_id_fkey"
                        columns: ["user1_id"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "trades_user2_id_fkey"
                        columns: ["user2_id"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "trades_editor_id_fkey"
                        columns: ["editor_id"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    }
                ]
            }
            trade_items: {
                Row: {
                    id: string
                    trade_id: string
                    owner_id: string
                    card_id: string
                    quantity: number
                    created_at: string | null
                }
                Insert: {
                    id?: string
                    trade_id: string
                    owner_id: string
                    card_id: string
                    quantity?: number
                    created_at?: string | null
                }
                Update: {
                    id?: string
                    trade_id?: string
                    owner_id?: string
                    card_id?: string
                    quantity?: number
                    created_at?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "trade_items_trade_id_fkey"
                        columns: ["trade_id"]
                        isOneToOne: false
                        referencedRelation: "trades"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "trade_items_owner_id_fkey"
                        columns: ["owner_id"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    }
                ]
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

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
    PublicTableNameOrOptions extends
            | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
        | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
        ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
            Database[PublicTableNameOrOptions["schema"]]["Views"])
        : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
            Row: infer R
        }
        ? R
        : never
    : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
            PublicSchema["Views"])
        ? (PublicSchema["Tables"] &
            PublicSchema["Views"])[PublicTableNameOrOptions] extends {
                Row: infer R
            }
            ? R
            : never
        : never

export type TablesInsert<
    PublicTableNameOrOptions extends
            | keyof PublicSchema["Tables"]
        | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
        ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
        : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
            Insert: infer I
        }
        ? I
        : never
    : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
        ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
                Insert: infer I
            }
            ? I
            : never
        : never

export type TablesUpdate<
    PublicTableNameOrOptions extends
            | keyof PublicSchema["Tables"]
        | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
        ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
        : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
            Update: infer U
        }
        ? U
        : never
    : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
        ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
                Update: infer U
            }
            ? U
            : never
        : never

export type Enums<
    PublicEnumNameOrOptions extends
            | keyof PublicSchema["Enums"]
        | { schema: keyof Database },
    EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
        ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
        : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
    ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
    : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
        ? PublicSchema["Enums"][PublicEnumNameOrOptions]
        : never

export type CompositeTypes<
    PublicCompositeTypeNameOrOptions extends
            | keyof PublicSchema["CompositeTypes"]
        | { schema: keyof Database },
    CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
            schema: keyof Database
        }
        ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
        : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
    ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
    : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
        ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
        : never
