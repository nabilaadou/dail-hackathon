'use client';

/* eslint-disable react/no-unknown-property -- React Three Fiber elements use Three.js props. */

import type { Material, Object3D } from 'three';
import type { ThreeEvent } from '@react-three/fiber';

import { Canvas } from '@react-three/fiber';
import { Mesh, Color, MeshStandardMaterial } from 'three';
import { useMemo, Suspense, useState, useEffect } from 'react';
import { Html, Center, useGLTF, useCursor, OrbitControls } from '@react-three/drei';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';

const MODEL_URL = '/assets/generic_sedan_car.glb';

export type DamageSeverity = 'minor' | 'moderate' | 'severe' | 'unknown';

export type VehicleDamage = {
  id: string;
  reason: string;
  severity: DamageSeverity;
  componentId: string;
  componentLabel: string;
};

type VehicleDamageViewerProps = {
  damages: VehicleDamage[];
};

const SEVERITY_STYLE: Record<DamageSeverity, { color: string; label: string }> = {
  minor: { color: '#FFB566', label: 'Minor' },
  moderate: { color: '#FF7900', label: 'Moderate' },
  severe: { color: '#F04438', label: 'Severe' },
  unknown: { color: '#94A3B8', label: 'Unrated' },
};

// Stable application identifiers mapped to the object names exported by the car model.
const COMPONENT_NODE_NAMES: Record<string, string[]> = {
  body: ['sedan-unibody_65'],
  hood: ['hood_60'],
  trunk: ['trunk_99'],
  front_bumper: ['bumper-front_8'],
  rear_bumper: ['bumper-rear_10'],
  front_left_door: ['door-front-l_16'],
  front_right_door: ['door-front-r_17'],
  rear_left_door: ['door-rear-l_22'],
  rear_right_door: ['door-rear-r_23'],
  front_left_fender: ['fender-front-l_32'],
  front_right_fender: ['fender-front-r_33'],
  left_side_mirror: ['side-mirror-l_70'],
  right_side_mirror: ['side-mirror-r_71'],
  windshield: ['windshield_102'],
  rear_window: ['glass-rear_42'],
  front_left_headlight: [
    'headlight-projector-l_43',
    'headlight-projector-trim-l_45',
    'headlights-cover-l_47',
    'headlights-drl-l_50',
    'headlights-frame-l_52',
    'headlights-led-l_54',
    'headlights-led-trim-l_56',
  ],
  front_right_headlight: [
    'headlight-projector-r_44',
    'headlight-projector-trim-r_46',
    'headlights-cover-r_48',
    'headlights-drl.001_51',
    'headlights-frame-r_53',
    'headlights-led-r_55',
    'headlights-led-trim-r_57',
  ],
};

function findComponentId(object: Object3D | null) {
  let current = object;

  while (current) {
    const match = Object.entries(COMPONENT_NODE_NAMES).find(([, names]) =>
      names.includes(current?.name ?? '')
    );

    if (match) return match[0];
    current = current.parent;
  }

  return null;
}

function cloneMaterial(material: Material | Material[]) {
  if (Array.isArray(material)) return material.map((item) => item.clone());
  return material.clone();
}

function CarModel({
  damages,
  hoveredId,
  selectedId,
  onHover,
  onSelect,
}: {
  damages: VehicleDamage[];
  hoveredId: string | null;
  selectedId: string | null;
  onHover: (damageId: string | null) => void;
  onSelect: (damageId: string) => void;
}) {
  const { scene } = useGLTF(MODEL_URL);
  const model = useMemo(() => {
    const clonedScene = scene.clone(true);

    clonedScene.traverse((object) => {
      if (!(object instanceof Mesh)) return;

      object.material = cloneMaterial(object.material);
      const materials = Array.isArray(object.material) ? object.material : [object.material];

      materials.forEach((material) => {
        if (!(material instanceof MeshStandardMaterial)) return;
        material.userData.originalColor = material.color.clone();
        material.userData.originalEmissive = material.emissive.clone();
      });
    });

    return clonedScene;
  }, [scene]);

  const damageByComponent = useMemo(
    () => new Map(damages.map((damage) => [damage.componentId, damage])),
    [damages]
  );

  useEffect(() => {
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return;

      const componentId = findComponentId(object);
      const damage = componentId ? damageByComponent.get(componentId) : undefined;
      const active = damage?.id === hoveredId || damage?.id === selectedId;
      const materials = Array.isArray(object.material) ? object.material : [object.material];

      materials.forEach((material) => {
        if (!(material instanceof MeshStandardMaterial)) return;

        const originalColor = material.userData.originalColor as Color | undefined;
        const originalEmissive = material.userData.originalEmissive as Color | undefined;

        if (!damage) {
          if (originalColor) material.color.copy(originalColor);
          if (originalEmissive) material.emissive.copy(originalEmissive);
          material.emissiveIntensity = 1;
          return;
        }

        const highlight = new Color(SEVERITY_STYLE[damage.severity].color);
        material.color.copy(highlight);
        material.emissive.copy(highlight);
        material.emissiveIntensity = active ? 0.65 : 0.25;
      });
    });
  }, [damageByComponent, hoveredId, model, selectedId]);

  useCursor(Boolean(hoveredId));

  const getDamageFromEvent = (event: ThreeEvent<PointerEvent>) => {
    const componentId = findComponentId(event.object);
    return componentId ? damageByComponent.get(componentId) : undefined;
  };

  return (
    <primitive
      object={model}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        const componentId = findComponentId(event.object);
        const damage = componentId ? damageByComponent.get(componentId) : undefined;

        if (!damage) return;
        event.stopPropagation();
        onSelect(damage.id);
      }}
      onPointerOut={() => onHover(null)}
      onPointerOver={(event: ThreeEvent<PointerEvent>) => {
        const damage = getDamageFromEvent(event);

        if (!damage) return;
        event.stopPropagation();
        onHover(damage.id);
      }}
    />
  );
}

function LoadingModel() {
  return (
    <Html center>
      <Stack spacing={1.5} alignItems="center" sx={{ color: 'white', whiteSpace: 'nowrap' }}>
        <CircularProgress size={28} sx={{ color: '#FF7900' }} />
        <Typography variant="caption">Loading vehicle…</Typography>
      </Stack>
    </Html>
  );
}

export function VehicleDamageViewer({ damages }: VehicleDamageViewerProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(damages[0]?.id ?? null);
  const hoveredDamage = damages.find((damage) => damage.id === hoveredId);
  const selectedDamage = damages.find((damage) => damage.id === selectedId) ?? damages[0];

  return (
    <Box
      sx={{
        display: 'grid',
        minHeight: { xs: 620, md: 640 },
        gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 320px' },
      }}
    >
      <Box
        sx={{
          minHeight: { xs: 420, md: 640 },
          position: 'relative',
          bgcolor: '#0E1E1D',
          backgroundImage:
            'radial-gradient(circle at 50% 45%, rgba(255,121,0,0.12), transparent 42%), linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
          backgroundSize: 'auto, 36px 36px, 36px 36px',
        }}
      >
        <Canvas camera={{ fov: 35, position: [6, 3.2, 7] }} dpr={[1, 1.75]}>
          <color attach="background" args={['#0E1E1D']} />
          <ambientLight intensity={1.7} />
          <directionalLight intensity={3.2} position={[5, 8, 6]} />
          <directionalLight intensity={1.2} position={[-5, 2, -4]} />
          <Suspense fallback={<LoadingModel />}>
            <Center>
              <CarModel
                damages={damages}
                hoveredId={hoveredId}
                selectedId={selectedId}
                onHover={setHoveredId}
                onSelect={setSelectedId}
              />
            </Center>
          </Suspense>
          <OrbitControls makeDefault enablePan={false} minDistance={3} maxDistance={16} />
        </Canvas>

        <Chip
          label="Drag to rotate · Scroll to zoom"
          size="small"
          sx={{
            left: 16,
            bottom: 16,
            position: 'absolute',
            color: 'rgba(255,255,255,0.82)',
            bgcolor: 'rgba(7, 15, 11, 0.72)',
            backdropFilter: 'blur(8px)',
          }}
        />

        {hoveredDamage && (
          <Box
            sx={{
              top: 16,
              left: 16,
              p: 1.5,
              maxWidth: 260,
              borderRadius: 1.5,
              position: 'absolute',
              color: 'white',
              bgcolor: 'rgba(7, 15, 11, 0.86)',
              border: '1px solid rgba(255,255,255,0.12)',
              pointerEvents: 'none',
              backdropFilter: 'blur(10px)',
            }}
          >
            <Typography variant="subtitle2">{hoveredDamage.componentLabel}</Typography>
            <Typography variant="caption" sx={{ mt: 0.25, display: 'block', opacity: 0.7 }}>
              {hoveredDamage.reason}
            </Typography>
          </Box>
        )}
      </Box>

      <Stack
        spacing={2.5}
        sx={{
          p: 2.5,
          color: 'white',
          bgcolor: '#081312',
          borderLeft: { md: '1px solid rgba(255,255,255,0.08)' },
          borderTop: { xs: '1px solid rgba(255,255,255,0.08)', md: 0 },
        }}
      >
        <Box>
          <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.45)' }}>
            Detected damage
          </Typography>
          <Typography variant="h6" sx={{ mt: 0.25 }}>
            {damages.length} affected components
          </Typography>
        </Box>

        <Stack spacing={1}>
          {damages.map((damage) => {
            const active = damage.id === selectedDamage?.id;
            const severity = SEVERITY_STYLE[damage.severity];

            return (
              <Box
                key={damage.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedId(damage.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') setSelectedId(damage.id);
                }}
                sx={{
                  p: 1.5,
                  cursor: 'pointer',
                  borderRadius: 1.5,
                  bgcolor: active ? 'rgba(255,255,255,0.09)' : 'transparent',
                  border: '1px solid',
                  borderColor: active ? severity.color : 'rgba(255,255,255,0.08)',
                  transition: '160ms ease',
                }}
              >
                <Stack direction="row" spacing={1.25} alignItems="flex-start">
                  <Box
                    sx={{
                      mt: 0.5,
                      width: 9,
                      height: 9,
                      flex: '0 0 auto',
                      borderRadius: '50%',
                      bgcolor: severity.color,
                      boxShadow: `0 0 12px ${severity.color}`,
                    }}
                  />
                  <Box>
                    <Typography variant="subtitle2">{damage.componentLabel}</Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.52)' }}>
                      {severity.label}
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            );
          })}
        </Stack>

        {selectedDamage && (
          <Box sx={{ mt: 'auto !important', pt: 2, borderTop: '1px solid rgba(255,255,255,0.10)' }}>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>
              Assessment
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.75, lineHeight: 1.65 }}>
              {selectedDamage.reason}
            </Typography>
          </Box>
        )}

        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.34)' }}>
          Generic Sedan Car by Márcio Meireles · CC BY 4.0
        </Typography>
      </Stack>
    </Box>
  );
}

useGLTF.preload(MODEL_URL);
