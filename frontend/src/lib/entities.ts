export type FieldType =
  | "text"
  | "textarea"
  | "select"
  | "boolean"
  | "date"
  | "number"
  | "tags";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

export interface EntityConfig {
  slug: string;
  label: string;
  labelPlural: string;
  apiPath: string;
  tableColumns: string[];
  fields: FieldDef[];
}

const VERIFICATION_FIELD: FieldDef = {
  key: "verification_tier",
  label: "Verification Tier",
  type: "select",
  required: true,
  options: [
    { value: "verified", label: "Verified" },
    { value: "probable", label: "Probable" },
    { value: "unverified", label: "Unverified" },
  ],
};

export const ENTITY_CONFIGS: Record<string, EntityConfig> = {
  companies: {
    slug: "companies",
    label: "Company",
    labelPlural: "Companies",
    apiPath: "/api/v1/companies",
    tableColumns: ["name", "jurisdiction", "entity_subtype", "verification_tier"],
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "jurisdiction", label: "Jurisdiction", type: "text", placeholder: "e.g. Russia, UAE, Hong Kong" },
      { key: "registration_id", label: "Registration ID", type: "text" },
      {
        key: "entity_subtype",
        label: "Subtype",
        type: "select",
        options: [
          { value: "exchange", label: "Exchange" },
          { value: "processor", label: "Processor" },
          { value: "issuer", label: "Issuer" },
          { value: "shell", label: "Shell Company" },
        ],
      },
      { key: "status", label: "Status", type: "text", placeholder: "e.g. Active, Sanctioned, Defunct" },
      { key: "website", label: "Website", type: "text", placeholder: "https://" },
      { key: "telegram_handle", label: "Telegram Handle", type: "text", placeholder: "@handle" },
      { key: "description", label: "Description", type: "textarea" },
      VERIFICATION_FIELD,
    ],
  },

  people: {
    slug: "people",
    label: "Person",
    labelPlural: "People",
    apiPath: "/api/v1/people",
    tableColumns: ["name", "nationality", "role_title", "verification_tier"],
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "aliases", label: "Aliases", type: "tags", placeholder: "Press Enter after each alias" },
      { key: "nationality", label: "Nationality", type: "text" },
      { key: "role_title", label: "Role / Title", type: "text" },
      { key: "sanctions_status", label: "Sanctioned", type: "boolean" },
      { key: "pep_status", label: "Politically Exposed Person", type: "boolean" },
      { key: "description", label: "Description", type: "textarea" },
      VERIFICATION_FIELD,
    ],
  },

  wallets: {
    slug: "wallets",
    label: "Wallet",
    labelPlural: "Wallets",
    apiPath: "/api/v1/wallets",
    tableColumns: ["address", "blockchain", "label", "verification_tier"],
    fields: [
      { key: "address", label: "Address", type: "text", required: true, placeholder: "0x..." },
      { key: "blockchain", label: "Blockchain", type: "text", required: true, placeholder: "e.g. Ethereum, Tron, Bitcoin" },
      { key: "label", label: "Label", type: "text", placeholder: "e.g. Garantex Hot Wallet" },
      { key: "cluster_id", label: "Cluster ID", type: "text" },
      { key: "first_seen", label: "First Seen", type: "date" },
      { key: "last_seen", label: "Last Seen", type: "date" },
      { key: "total_volume", label: "Total Volume", type: "number" },
      { key: "description", label: "Description", type: "textarea" },
      VERIFICATION_FIELD,
    ],
  },

  banks: {
    slug: "banks",
    label: "Bank",
    labelPlural: "Banks",
    apiPath: "/api/v1/banks",
    tableColumns: ["name", "swift_code", "jurisdiction", "verification_tier"],
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "swift_code", label: "SWIFT Code", type: "text" },
      { key: "jurisdiction", label: "Jurisdiction", type: "text" },
      { key: "sanctions_status", label: "Sanctioned", type: "boolean" },
      { key: "role", label: "Role", type: "text", placeholder: "e.g. Fiat Bridge, Correspondent" },
      { key: "description", label: "Description", type: "textarea" },
      VERIFICATION_FIELD,
    ],
  },

  violations: {
    slug: "violations",
    label: "Violation",
    labelPlural: "Violations",
    apiPath: "/api/v1/violations",
    tableColumns: ["violation_type", "issuing_authority", "violation_date", "verification_tier"],
    fields: [
      {
        key: "violation_type",
        label: "Type",
        type: "select",
        required: true,
        options: [
          { value: "sanction", label: "Sanction" },
          { value: "seizure", label: "Seizure" },
          { value: "criminal_case", label: "Criminal Case" },
          { value: "regulatory_action", label: "Regulatory Action" },
        ],
      },
      { key: "issuing_authority", label: "Issuing Authority", type: "text", placeholder: "e.g. OFAC, EU Council, DOJ" },
      { key: "violation_date", label: "Date", type: "date" },
      { key: "description", label: "Description", type: "textarea" },
      VERIFICATION_FIELD,
    ],
  },
};

export const ENTITY_SLUGS = Object.keys(ENTITY_CONFIGS);
