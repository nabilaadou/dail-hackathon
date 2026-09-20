import type { VehicleDamage, DamageSeverity } from './vehicle-damage-viewer';

export type ParsedDamage = {
  zone?: string;
  source_label?: string | null;
  damage_types?: string[];
  severity?: string;
  evidence?: string | null;
};

export type ParsedCase = {
  case_id?: number | null;
  vehicle?: {
    manufacturer?: string | null;
    model?: string | null;
    model_type?: string | null;
    mileage?: number | null;
  };
  case_type?: string;
  case_kind?: string | null;
  lifecycle?: string;
  overall_severity?: string;
  damages?: ParsedDamage[];
};

export type ParseResponse = {
  parsed?: ParsedCase;
  source_fields?: Record<string, string>;
  diagnostics?: {
    mode?: string;
    llm_used?: boolean;
    warnings?: string[];
  };
  review?: {
    status: 'reviewed';
    updated_at: string;
  };
};

export type CsvParseResponse = {
  total_rows: number;
  processed_rows: number;
  truncated: boolean;
  results: ParseResponse[];
  errors: Array<{ row_number: number; source_id?: string | null; message: string }>;
};

type ParserResponseBody = Partial<CsvParseResponse> & {
  detail?: unknown;
  error?: string;
};

const ZONE_LABELS: Record<string, string> = {
  body: 'Vehicle body',
  hood: 'Hood',
  tailgate: 'Tailgate',
  windshield: 'Windshield',
  front_bumper: 'Front bumper',
  rear_bumper: 'Rear bumper',
  front_left_door: 'Front-left door',
  front_right_door: 'Front-right door',
  rear_left_door: 'Rear-left door',
  rear_right_door: 'Rear-right door',
  front_left_fender: 'Front-left fender',
  front_right_fender: 'Front-right fender',
  rear_left_fender: 'Rear-left fender',
  rear_right_fender: 'Rear-right fender',
  left_side_mirror: 'Left side mirror',
  right_side_mirror: 'Right side mirror',
  left_rocker_panel: 'Left rocker panel',
  right_rocker_panel: 'Right rocker panel',
  roof: 'Roof',
};

function normalizeViewerZone(zone: string) {
  if (zone === 'tailgate') return 'trunk';
  if (zone.includes('front_') && zone.endsWith('_bumper')) return 'front_bumper';
  if (zone.includes('rear_') && zone.endsWith('_bumper')) return 'rear_bumper';
  if (
    [
      'roof',
      'rear_left_fender',
      'rear_right_fender',
      'left_rocker_panel',
      'right_rocker_panel',
    ].includes(zone)
  ) {
    return 'body';
  }
  return zone;
}

export function toVehicleDamages(damages: ParsedDamage[] = []): VehicleDamage[] {
  return damages
    .filter((damage): damage is ParsedDamage & { zone: string } => Boolean(damage.zone))
    .map((damage, index) => ({
      id: `damage-${damage.zone}-${index}`,
      componentId: normalizeViewerZone(damage.zone),
      componentLabel: damage.source_label || ZONE_LABELS[damage.zone] || damage.zone,
      severity: ['minor', 'moderate', 'severe'].includes(damage.severity ?? '')
        ? (damage.severity as DamageSeverity)
        : 'unknown',
      reason:
        damage.evidence ||
        (damage.damage_types?.length
          ? `Detected damage: ${damage.damage_types.join(', ')}.`
          : 'Damage detected in the service notes.'),
    }));
}

export function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export async function readParserResponse(response: Response): Promise<ParserResponseBody> {
  const text = await response.text();

  if (!text.trim()) {
    return { error: `The parser returned an empty response (HTTP ${response.status}).` };
  }

  try {
    return JSON.parse(text) as ParserResponseBody;
  } catch {
    return {
      error: response.ok
        ? 'The parser returned an invalid response.'
        : `The parser failed (HTTP ${response.status}): ${text.trim().slice(0, 500)}`,
    };
  }
}
