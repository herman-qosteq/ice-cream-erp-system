export interface AssetInput {
  name: string;
  code: string;
  asset_type: string;
  serial_number?: string;
  capacity?: string;
  notes?: string;
}

export interface AssignAssetInput {
  partner_id: string;
  notes?: string;
}
