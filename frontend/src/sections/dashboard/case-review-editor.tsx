'use client';

import type { ParsedCase, ParsedDamage } from './case-parser';

import { useState } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { Iconify } from 'src/components/iconify';

const CASE_TYPES = ['damage', 'service', 'unknown'];
const CASE_KINDS = [
  'parking_damage',
  'rear_end_collision',
  'hail_damage',
  'stone_chip',
  'vandalism',
  'wildlife_collision',
  'maneuvering_damage',
  'oil_change',
  'inspection',
  'roadworthiness_inspection',
  'wheels_and_tires',
  'brakes',
];
const LIFECYCLES = ['new', 'in_progress', 'ready', 'completed', 'cancelled', 'unknown'];
const SEVERITIES = ['minor', 'moderate', 'severe', 'unknown'];
const DAMAGE_ZONES = [
  'hood',
  'tailgate',
  'windshield',
  'roof',
  'front_bumper',
  'front_left_bumper',
  'front_right_bumper',
  'rear_bumper',
  'rear_left_bumper',
  'rear_right_bumper',
  'front_left_door',
  'front_right_door',
  'rear_left_door',
  'rear_right_door',
  'front_left_fender',
  'front_right_fender',
  'rear_left_fender',
  'rear_right_fender',
  'left_side_mirror',
  'right_side_mirror',
  'left_rocker_panel',
  'right_rocker_panel',
];

type CaseReviewEditorProps = {
  value: ParsedCase;
  onCancel: () => void;
  onSave: (value: ParsedCase) => void;
};

function displayLabel(value: string) {
  return value.replaceAll('_', ' ');
}

function createDraft(value: ParsedCase): ParsedCase {
  return {
    ...value,
    case_type: value.case_type ?? 'unknown',
    case_kind: value.case_kind ?? null,
    lifecycle: value.lifecycle ?? 'unknown',
    overall_severity: value.overall_severity ?? 'unknown',
    damages: (value.damages ?? []).map((damage) => ({ ...damage })),
  };
}

export function CaseReviewEditor({ value, onCancel, onSave }: CaseReviewEditorProps) {
  const [draft, setDraft] = useState(() => createDraft(value));

  const updateDamage = (index: number, update: Partial<ParsedDamage>) => {
    setDraft((current) => ({
      ...current,
      damages: (current.damages ?? []).map((damage, damageIndex) =>
        damageIndex === index ? { ...damage, ...update } : damage
      ),
    }));
  };

  const removeDamage = (index: number) => {
    setDraft((current) => ({
      ...current,
      damages: (current.damages ?? []).filter((_, damageIndex) => damageIndex !== index),
    }));
  };

  const addDamage = () => {
    setDraft((current) => ({
      ...current,
      damages: [
        ...(current.damages ?? []),
        { zone: 'hood', severity: 'unknown', damage_types: [], evidence: null },
      ],
    }));
  };

  return (
    <Card
      variant="outlined"
      sx={{ m: { xs: 2, md: 3 }, borderColor: 'rgba(14,30,29,0.18)', bgcolor: '#FAFAF7' }}
    >
      <Stack spacing={2.5} sx={{ p: { xs: 2, md: 3 } }}>
        <Box>
          <Typography variant="h6">Human review</Typography>
          <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary' }}>
            Correct the parser output below. Changes stay in this browser session only.
          </Typography>
        </Box>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            select
            fullWidth
            label="Case type"
            value={draft.case_type}
            onChange={(event) =>
              setDraft((current) => ({ ...current, case_type: event.target.value }))
            }
          >
            {CASE_TYPES.map((option) => (
              <MenuItem key={option} value={option}>
                {displayLabel(option)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            fullWidth
            label="Case kind"
            value={draft.case_kind ?? ''}
            onChange={(event) =>
              setDraft((current) => ({ ...current, case_kind: event.target.value || null }))
            }
          >
            <MenuItem value="">Not specified</MenuItem>
            {CASE_KINDS.map((option) => (
              <MenuItem key={option} value={option}>
                {displayLabel(option)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            fullWidth
            label="Lifecycle"
            value={draft.lifecycle}
            onChange={(event) =>
              setDraft((current) => ({ ...current, lifecycle: event.target.value }))
            }
          >
            {LIFECYCLES.map((option) => (
              <MenuItem key={option} value={option}>
                {displayLabel(option)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            fullWidth
            label="Overall severity"
            value={draft.overall_severity}
            onChange={(event) =>
              setDraft((current) => ({ ...current, overall_severity: event.target.value }))
            }
          >
            {SEVERITIES.map((option) => (
              <MenuItem key={option} value={option}>
                {displayLabel(option)}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        <Divider />

        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="subtitle1">Damage zones</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              These changes update the interactive vehicle immediately after saving.
            </Typography>
          </Box>
          <Button size="small" onClick={addDamage} startIcon={<Iconify icon="mingcute:add-line" />}>
            Add zone
          </Button>
        </Stack>

        {(draft.damages ?? []).map((damage, index) => (
          <Card key={`${damage.zone}-${index}`} variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={2}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  select
                  fullWidth
                  label="Vehicle zone"
                  value={damage.zone ?? ''}
                  onChange={(event) =>
                    updateDamage(index, { zone: event.target.value, source_label: null })
                  }
                >
                  {DAMAGE_ZONES.map((option) => (
                    <MenuItem key={option} value={option}>
                      {displayLabel(option)}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  fullWidth
                  label="Severity"
                  value={damage.severity ?? 'unknown'}
                  onChange={(event) => updateDamage(index, { severity: event.target.value })}
                >
                  {SEVERITIES.map((option) => (
                    <MenuItem key={option} value={option}>
                      {displayLabel(option)}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
              <TextField
                fullWidth
                label="Damage types"
                helperText="Comma-separated, for example: scratch, dent"
                value={(damage.damage_types ?? []).join(', ')}
                onChange={(event) =>
                  updateDamage(index, {
                    damage_types: event.target.value
                      .split(',')
                      .map((item) => item.trim())
                      .filter(Boolean),
                  })
                }
              />
              <TextField
                fullWidth
                multiline
                minRows={2}
                label="Evidence / reviewer note"
                value={damage.evidence ?? ''}
                onChange={(event) => updateDamage(index, { evidence: event.target.value || null })}
              />
              <Button
                size="small"
                color="error"
                onClick={() => removeDamage(index)}
                startIcon={<Iconify icon="solar:trash-bin-trash-bold" />}
                sx={{ alignSelf: 'flex-start' }}
              >
                Remove zone
              </Button>
            </Stack>
          </Card>
        ))}

        {!(draft.damages ?? []).length && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            No damage zones. Add one if the parser missed visible damage.
          </Typography>
        )}

        <Stack direction="row" justifyContent="flex-end" spacing={1.5}>
          <Button color="inherit" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => onSave(draft)}
            startIcon={<Iconify icon="solar:check-circle-bold" />}
            sx={{ bgcolor: '#FF7900', color: 'white', '&:hover': { bgcolor: '#D96800' } }}
          >
            Save review
          </Button>
        </Stack>
      </Stack>
    </Card>
  );
}
