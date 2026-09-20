'use client';

import type { ParsedCase, CsvParseResponse } from './case-parser';

import { useMemo, useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Pagination from '@mui/material/Pagination';
import Typography from '@mui/material/Typography';
import InputAdornment from '@mui/material/InputAdornment';
import CircularProgress from '@mui/material/CircularProgress';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';

import { Iconify } from 'src/components/iconify';

import { useAuthContext } from 'src/auth/hooks';
import { signOut } from 'src/auth/context/supabase';

import { useCsvJob } from './use-csv-job';
import { CaseReviewEditor } from './case-review-editor';
import { formatJson, toVehicleDamages } from './case-parser';
import { VehicleDamageViewer } from './vehicle-damage-viewer';

const BRAND = {
  ink: '#0E1E1D',
  inkSoft: '#263434',
  orange: '#FF7900',
  peach: '#FFB566',
  paper: '#F5F4EF',
  grey: '#DBDBDB',
};

const RESULTS_PER_PAGE = 10;

export function CarCaseWorkspace() {
  const router = useRouter();
  const { user } = useAuthContext();
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [batch, setBatch] = useState<CsvParseResponse | null>(null);
  const [selectedResultIndex, setSelectedResultIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [rowMode, setRowMode] = useState('all');
  const [rowLimit, setRowLimit] = useState('100');
  const csvJob = useCsvJob(user?.id ? `wolfsight-csv-job:${user.id}` : null);
  const { isSubmitting } = csvJob;
  const validRowLimit =
    /^\d+$/.test(rowLimit) && Number.isSafeInteger(Number(rowLimit)) && Number(rowLimit) > 0;
  const [isReviewing, setIsReviewing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [resultsPage, setResultsPage] = useState(1);
  const result = batch?.results[selectedResultIndex] ?? null;
  const vehicleDamages = toVehicleDamages(result?.parsed?.damages);
  const searchableFields = useMemo(
    () =>
      Array.from(
        new Set(batch?.results.flatMap((item) => Object.keys(item.source_fields ?? {})) ?? [])
      ).sort((left, right) =>
        left === 'id' ? -1 : right === 'id' ? 1 : left.localeCompare(right)
      ),
    [batch]
  );
  const filteredResults = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    const results = batch?.results ?? [];

    return results
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => {
        if (!query) return true;
        const values = [item.parsed?.case_id, ...Object.values(item.source_fields ?? {})];
        return values.some((value) =>
          String(value ?? '')
            .toLocaleLowerCase()
            .includes(query)
        );
      });
  }, [batch, searchQuery]);
  const pageCount = Math.max(1, Math.ceil(filteredResults.length / RESULTS_PER_PAGE));
  const visibleResults = filteredResults.slice(
    (resultsPage - 1) * RESULTS_PER_PAGE,
    resultsPage * RESULTS_PER_PAGE
  );

  useEffect(() => {
    if (!csvJob.completedBatch) return;
    setBatch(csvJob.completedBatch);
    setSelectedResultIndex(0);
    setSearchQuery('');
    setResultsPage(1);
    setIsReviewing(false);
  }, [csvJob.completedBatch]);

  const handleSignOut = async () => {
    await signOut();
    router.replace(paths.auth.supabase.signIn);
    router.refresh();
  };

  const handleReset = () => {
    setFile(null);
    setFileInputKey((current) => current + 1);
    setBatch(null);
    setSelectedResultIndex(0);
    setIsReviewing(false);
    setSearchQuery('');
    setResultsPage(1);
    setError(null);
  };

  const handleSelectResult = (index: number) => {
    setSelectedResultIndex(index);
    setIsReviewing(false);
  };

  const handleSaveReview = (reviewedCase: ParsedCase) => {
    setBatch((current) => {
      if (!current) return current;

      return {
        ...current,
        results: current.results.map((item, index) =>
          index === selectedResultIndex
            ? {
                ...item,
                parsed: reviewedCase,
                review: { status: 'reviewed', updated_at: new Date().toISOString() },
              }
            : item
        ),
      };
    });
    setIsReviewing(false);
  };

  const handleTryAnother = () => {
    handleReset();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFileSelected = (candidate: File | null) => {
    setError(null);

    if (!candidate) return;
    if (!candidate.name.toLowerCase().endsWith('.csv')) {
      setError('Please choose a .csv file.');
      return;
    }

    setFile(candidate);
  };

  const handleParse = async () => {
    setError(null);

    if (!file) {
      setError('Choose a CSV file before starting the analysis.');
      return;
    }

    if (rowMode === 'custom' && !validRowLimit) {
      setError('Enter a whole number of rows greater than zero.');
      return;
    }
    setBatch(null);
    await csvJob.start(file, rowMode === 'all' ? null : Number(rowLimit));
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: BRAND.paper, color: BRAND.ink }}>
      <Box
        component="header"
        sx={{
          px: { xs: 2, md: 5 },
          height: 76,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: 'white',
          borderBottom: '1px solid rgba(255,255,255,0.10)',
          bgcolor: 'rgba(14,30,29,0.96)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 0.5,
              display: 'grid',
              placeItems: 'center',
              bgcolor: BRAND.orange,
              color: 'white',
            }}
          >
            <Iconify icon="solar:monitor-bold" width={21} />
          </Box>
          <Box>
            <Typography variant="subtitle1" sx={{ lineHeight: 1, fontWeight: 800 }}>
              WolfSight
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.58)' }}>
              DAIL · Wolf Day · Track B
            </Typography>
          </Box>
        </Stack>

        <Stack direction="row" spacing={1.5} alignItems="center">
          <Avatar
            sx={{ width: 34, height: 34, bgcolor: BRAND.peach, color: BRAND.ink, fontSize: 14 }}
          >
            {user?.displayName?.charAt(0).toUpperCase() ?? 'U'}
          </Avatar>
          <Button
            color="inherit"
            size="small"
            variant="outlined"
            onClick={handleSignOut}
            sx={{ borderColor: 'rgba(255,255,255,.28)' }}
          >
            Sign out
          </Button>
        </Stack>
      </Box>

      <Box component="main" sx={{ maxWidth: 1480, mx: 'auto', p: { xs: 2, md: 5 } }}>
        {isSubmitting ? (
          <Card
            sx={{
              minHeight: 'calc(100vh - 152px)',
              display: 'grid',
              placeItems: 'center',
              overflow: 'hidden',
              color: 'white',
              bgcolor: BRAND.ink,
              border: '1px solid rgba(20, 33, 26, 0.10)',
              backgroundImage:
                'radial-gradient(circle at 50% 44%, rgba(255,121,0,0.16), transparent 30%), linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
              backgroundSize: 'auto, 42px 42px, 42px 42px',
            }}
          >
            <Stack spacing={3} alignItems="center" sx={{ px: 3, textAlign: 'center' }}>
              <Box sx={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
                <CircularProgress size={84} thickness={2} sx={{ color: 'rgba(255,121,0,0.24)' }} />
                <CircularProgress
                  size={84}
                  thickness={2}
                  variant={csvJob.progress?.selected_rows ? 'determinate' : 'indeterminate'}
                  value={
                    csvJob.progress?.selected_rows
                      ? (csvJob.progress.completed_rows / csvJob.progress.selected_rows) * 100
                      : 0
                  }
                  sx={{ position: 'absolute', color: BRAND.orange }}
                />
                <Iconify
                  icon="solar:monitor-bold"
                  width={32}
                  sx={{ position: 'absolute', color: BRAND.orange }}
                />
              </Box>
              <Box>
                <Typography variant="overline" sx={{ color: BRAND.peach, letterSpacing: 1.8 }}>
                  WolfSight intelligence pipeline
                </Typography>
                <Typography variant="h4" sx={{ mt: 0.5 }}>
                  Turning workshop notes into visual evidence
                </Typography>
                <Typography sx={{ mt: 1, color: 'rgba(255,255,255,0.56)' }}>
                  {csvJob.progress?.selected_rows
                    ? `${csvJob.progress.completed_rows} of ${csvJob.progress.selected_rows} selected rows processed`
                    : csvJob.progress
                      ? 'Validating your CSV and preparing the selected rows…'
                      : 'Uploading your CSV…'}
                </Typography>
                <Typography variant="body2" sx={{ mt: 1, color: 'rgba(255,255,255,0.56)' }}>
                  Analysis runs in the background. You can refresh this tab and reconnect to its
                  progress.
                </Typography>
                {!!csvJob.progress?.error_count && (
                  <Typography variant="body2" sx={{ mt: 1, color: BRAND.peach }}>
                    {csvJob.progress.error_count} row errors; other rows are still being processed.
                  </Typography>
                )}
              </Box>
              {csvJob.error && <Alert severity="warning">{csvJob.error}</Alert>}
              {csvJob.canRetry && (
                <Button variant="contained" onClick={csvJob.retry}>
                  Reconnect to analysis
                </Button>
              )}
              <Stack direction="row" spacing={1}>
                {['01 Validate', '02 Extract', '03 Enrich', '04 Visualize'].map((label) => (
                  <Chip
                    key={label}
                    label={label}
                    size="small"
                    sx={{ color: 'rgba(255,255,255,0.66)', bgcolor: 'rgba(255,255,255,0.06)' }}
                  />
                ))}
              </Stack>
            </Stack>
          </Card>
        ) : result ? (
          <Stack spacing={3}>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              justifyContent="space-between"
              alignItems={{ md: 'flex-end' }}
              spacing={2}
            >
              <Box>
                <Typography variant="overline" sx={{ color: '#B65300', letterSpacing: 1.5 }}>
                  Analysis complete · Track B
                </Typography>
                <Typography
                  variant="h3"
                  sx={{ mt: 0.5, fontSize: { xs: 30, md: 42 }, letterSpacing: -1.4 }}
                >
                  Case intelligence report
                </Typography>
                <Typography sx={{ mt: 1, color: 'text.secondary' }}>
                  Case {result.parsed?.case_id ?? '—'} · Result {selectedResultIndex + 1} of{' '}
                  {batch?.results.length ?? 0} from {batch?.total_rows ?? 0} CSV rows.
                </Typography>
              </Box>
              <Button
                size="large"
                color="inherit"
                variant="outlined"
                onClick={handleTryAnother}
                startIcon={<Iconify icon="solar:restart-bold" />}
                sx={{ alignSelf: { xs: 'flex-start', md: 'auto' } }}
              >
                Analyze another case
              </Button>
            </Stack>

            <Card variant="outlined" sx={{ p: { xs: 2, md: 2.5 } }}>
              <Stack spacing={2}>
                <TextField
                  fullWidth
                  value={searchQuery}
                  placeholder="Search by ID or another unique field"
                  onChange={(event) => {
                    const query = event.target.value;
                    setSearchQuery(query);
                    setResultsPage(1);

                    const normalized = query.trim().toLocaleLowerCase();
                    if (normalized) {
                      const firstMatch = (batch?.results ?? []).findIndex((item) =>
                        [item.parsed?.case_id, ...Object.values(item.source_fields ?? {})].some(
                          (value) =>
                            String(value ?? '')
                              .toLocaleLowerCase()
                              .includes(normalized)
                        )
                      );
                      if (firstMatch >= 0) handleSelectResult(firstMatch);
                    }
                  }}
                  helperText={
                    searchableFields.length
                      ? `Searching: ${searchableFields.join(', ')}`
                      : 'Searchable identifiers are detected from the uploaded CSV.'
                  }
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <Iconify icon="eva:search-fill" width={20} />
                        </InputAdornment>
                      ),
                    },
                  }}
                />

                {filteredResults.length ? (
                  <>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {visibleResults.map(({ item, index }) => {
                        const vehicle = item.parsed?.vehicle;
                        const label =
                          [vehicle?.manufacturer, vehicle?.model].filter(Boolean).join(' ') ||
                          `Case ${item.parsed?.case_id ?? index + 1}`;

                        return (
                          <Button
                            key={`${item.parsed?.case_id ?? 'case'}-${index}`}
                            size="small"
                            variant={selectedResultIndex === index ? 'contained' : 'outlined'}
                            color="inherit"
                            onClick={() => handleSelectResult(index)}
                            sx={
                              selectedResultIndex === index
                                ? {
                                    bgcolor: BRAND.ink,
                                    color: 'white',
                                    '&:hover': { bgcolor: BRAND.inkSoft },
                                  }
                                : undefined
                            }
                          >
                            {index + 1}. {label}
                          </Button>
                        );
                      })}
                    </Stack>
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      alignItems={{ sm: 'center' }}
                      justifyContent="space-between"
                      spacing={1.5}
                    >
                      <Typography variant="body2" color="text.secondary">
                        {filteredResults.length} result{filteredResults.length === 1 ? '' : 's'}
                        {searchQuery ? ` matching “${searchQuery}”` : ''}
                      </Typography>
                      {pageCount > 1 && (
                        <Pagination
                          page={Math.min(resultsPage, pageCount)}
                          count={pageCount}
                          onChange={(_, page) => {
                            setResultsPage(page);
                            const firstOnPage = filteredResults[(page - 1) * RESULTS_PER_PAGE];
                            if (firstOnPage) handleSelectResult(firstOnPage.index);
                          }}
                          color="primary"
                          shape="rounded"
                        />
                      )}
                    </Stack>
                  </>
                ) : (
                  <Alert severity="info">No cases match “{searchQuery}”.</Alert>
                )}
              </Stack>
            </Card>

            {!!batch?.errors.length && (
              <Alert severity="warning">
                {batch.errors.length} row{batch.errors.length === 1 ? '' : 's'} could not be parsed.
                Open the raw batch response for details.
              </Alert>
            )}

            <Card
              sx={{
                overflow: 'hidden',
                border: '1px solid rgba(14,30,29,0.12)',
                boxShadow: '0 22px 70px rgba(20, 33, 26, 0.10)',
              }}
            >
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                alignItems={{ sm: 'center' }}
                spacing={2}
                sx={{ p: { xs: 2, md: 3 } }}
              >
                <Box>
                  <Typography variant="h6">
                    {[result.parsed?.vehicle?.manufacturer, result.parsed?.vehicle?.model]
                      .filter(Boolean)
                      .join(' ') || 'Parsed vehicle case'}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary' }}>
                    {result.parsed?.case_kind?.replaceAll('_', ' ') || 'Backend assessment'} mapped
                    to the interactive model
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {result.review?.status === 'reviewed' && (
                    <Chip label="Human reviewed" size="small" color="primary" />
                  )}
                  <Chip label={result.parsed?.case_type ?? 'unknown'} size="small" />
                  <Chip
                    label={result.parsed?.lifecycle ?? 'unknown'}
                    size="small"
                    color="success"
                  />
                  <Chip
                    label={`${result.parsed?.overall_severity ?? 'unknown'} severity`}
                    size="small"
                    variant="outlined"
                  />
                  <Chip
                    label={`${result.parsed?.damages?.length ?? 0} damage zones`}
                    size="small"
                    variant="outlined"
                  />
                  <Button
                    size="small"
                    color="inherit"
                    variant={isReviewing ? 'contained' : 'outlined'}
                    onClick={() => setIsReviewing((current) => !current)}
                    startIcon={<Iconify icon="solar:pen-bold" />}
                  >
                    {isReviewing ? 'Close review' : 'Review result'}
                  </Button>
                </Stack>
              </Stack>
              <Divider />

              {isReviewing && result.parsed && (
                <CaseReviewEditor
                  value={result.parsed}
                  onCancel={() => setIsReviewing(false)}
                  onSave={handleSaveReview}
                />
              )}

              {vehicleDamages.length > 0 ? (
                <VehicleDamageViewer damages={vehicleDamages} />
              ) : (
                <Box sx={{ p: 5, bgcolor: BRAND.ink }}>
                  <Alert severity="info">
                    {result.parsed?.case_type === 'service'
                      ? 'This is a service case, so no damage zone is expected.'
                      : result.parsed?.case_type === 'damage'
                        ? 'This appears to be a damage case, but the parser could not identify a damage zone. Inspect the raw response below.'
                        : 'No damage zone was identified for this record. It may be a non-damage case; inspect the raw response below.'}
                  </Alert>
                </Box>
              )}

              <Box
                component="details"
                sx={{
                  color: BRAND.grey,
                  bgcolor: BRAND.ink,
                  borderTop: '1px solid rgba(255,255,255,0.10)',
                }}
              >
                <Box
                  component="summary"
                  sx={{ p: 2.5, cursor: 'pointer', fontWeight: 700, userSelect: 'none' }}
                >
                  View raw parser response
                </Box>
                <Box
                  component="pre"
                  sx={{
                    m: 0,
                    p: 3,
                    maxHeight: 420,
                    overflow: 'auto',
                    bgcolor: '#081312',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: 13,
                    lineHeight: 1.65,
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {formatJson({ selected_result: result, batch_summary: batch })}
                </Box>
              </Box>
            </Card>
          </Stack>
        ) : (
          <Box sx={{ pt: { xs: 1, md: 3 } }}>
            <Box
              sx={{
                mb: { xs: 4, md: 6 },
                display: 'grid',
                gap: { xs: 3, md: 6 },
                alignItems: 'end',
                gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.4fr) minmax(280px, .6fr)' },
              }}
            >
              <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                  <Box sx={{ width: 36, height: 2, bgcolor: BRAND.orange }} />
                  <Typography variant="overline" sx={{ color: '#B65300', letterSpacing: 1.8 }}>
                    Prototype to production · Wolf Day
                  </Typography>
                </Stack>
                <Typography
                  component="h1"
                  sx={{
                    maxWidth: 820,
                    fontFamily: 'Barlow',
                    fontWeight: 500,
                    fontSize: { xs: 44, sm: 60, md: 76 },
                    lineHeight: 0.98,
                    letterSpacing: { xs: -1.8, md: -3.2 },
                  }}
                >
                  Workshop notes,
                  <Box component="span" sx={{ display: 'block', color: BRAND.orange }}>
                    made visible.
                  </Box>
                </Typography>
              </Box>
              <Box sx={{ pb: { md: 0.75 } }}>
                <Typography sx={{ color: '#53615E', lineHeight: 1.7 }}>
                  WolfSight turns German workshop exports into a structured, evidence-backed damage
                  map—ready to inspect on an interactive 3D vehicle.
                </Typography>
                <Stack direction="row" spacing={2.5} sx={{ mt: 2.5 }}>
                  {[
                    ['Hybrid', 'Rules + LLM'],
                    ['Grounded', 'Source evidence'],
                    ['Resilient', 'Rules fallback'],
                  ].map(([title, detail]) => (
                    <Box key={title}>
                      <Typography variant="subtitle2" sx={{ color: BRAND.ink }}>
                        {title}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#7C8985' }}>
                        {detail}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </Box>
            </Box>

            <Box
              sx={{
                mb: 3,
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
                borderTop: '1px solid rgba(14,30,29,.14)',
                borderBottom: '1px solid rgba(14,30,29,.14)',
              }}
            >
              {[
                ['01', 'Upload', 'A UTF-8 dealer export'],
                ['02', 'Analyze', 'Rules, context and AI'],
                ['03', 'Inspect', '3D evidence by component'],
              ].map(([step, title, detail], index) => (
                <Stack
                  key={step}
                  direction="row"
                  spacing={2}
                  sx={{
                    py: 2.25,
                    px: { xs: 0, sm: 2.5 },
                    borderLeft: { sm: index ? '1px solid rgba(14,30,29,.14)' : 0 },
                  }}
                >
                  <Typography variant="overline" sx={{ color: BRAND.orange }}>
                    {step}
                  </Typography>
                  <Box>
                    <Typography variant="subtitle2">{title}</Typography>
                    <Typography variant="caption" sx={{ color: '#7C8985' }}>
                      {detail}
                    </Typography>
                  </Box>
                </Stack>
              ))}
            </Box>

            <Card
              sx={{
                maxWidth: 1040,
                mx: 'auto',
                overflow: 'hidden',
                borderRadius: 0.75,
                border: '1px solid rgba(14,30,29,0.14)',
                boxShadow: '0 28px 90px rgba(14,30,29,0.09)',
              }}
            >
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ px: { xs: 2, md: 3 }, py: 2.5 }}
              >
                <Box>
                  <Typography variant="h6">Start a new assessment</Typography>
                  <Typography variant="body2" sx={{ mt: 0.25, color: 'text.secondary' }}>
                    UTF-8 CSV with a header row and one or more vehicle cases
                  </Typography>
                </Box>
                <Chip
                  label={rowMode === 'all' ? 'FULL DATASET' : 'SELECTED ROWS'}
                  size="small"
                  variant="outlined"
                  sx={{ color: '#B65300', borderColor: 'rgba(255,121,0,.35)', letterSpacing: 0.6 }}
                />
              </Stack>
              <Divider />

              <Stack spacing={2.5} sx={{ p: { xs: 2, md: 3 } }}>
                <Box
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    handleFileSelected(event.dataTransfer.files[0] ?? null);
                  }}
                  sx={{
                    minHeight: 300,
                    px: 3,
                    display: 'grid',
                    placeItems: 'center',
                    textAlign: 'center',
                    borderRadius: 0.75,
                    border: '1.5px dashed',
                    borderColor: file ? BRAND.orange : 'rgba(14,30,29,0.22)',
                    bgcolor: file ? 'rgba(255,121,0,0.045)' : '#FAFAF7',
                    transition: '160ms ease',
                  }}
                >
                  <Stack spacing={2} alignItems="center">
                    <Box
                      sx={{
                        width: 72,
                        height: 72,
                        borderRadius: 0.75,
                        display: 'grid',
                        placeItems: 'center',
                        color: file ? '#B65300' : BRAND.ink,
                        bgcolor: file ? 'rgba(255,121,0,0.14)' : 'rgba(14,30,29,0.06)',
                      }}
                    >
                      <Iconify
                        icon={file ? 'solar:file-check-bold-duotone' : 'solar:import-bold'}
                        width={36}
                      />
                    </Box>

                    {file ? (
                      <Box>
                        <Typography variant="h6">{file.name}</Typography>
                        <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary' }}>
                          {(file.size / 1024).toFixed(1)} KB · Ready to analyze
                        </Typography>
                      </Box>
                    ) : (
                      <Box>
                        <Typography variant="h6">Drop your CSV here</Typography>
                        <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary' }}>
                          or choose a file from your computer
                        </Typography>
                      </Box>
                    )}

                    <Button
                      component="label"
                      variant={file ? 'outlined' : 'contained'}
                      color="inherit"
                    >
                      {file ? 'Replace CSV' : 'Choose CSV file'}
                      <input
                        key={fileInputKey}
                        hidden
                        type="file"
                        accept=".csv,text/csv"
                        onChange={(event) => handleFileSelected(event.target.files?.[0] ?? null)}
                      />
                    </Button>
                  </Stack>
                </Box>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField
                    select
                    label="Rows to process"
                    value={rowMode}
                    onChange={(event) => setRowMode(event.target.value)}
                    sx={{ minWidth: 220 }}
                  >
                    <MenuItem value="all">All rows</MenuItem>
                    <MenuItem value="custom">Choose a row limit</MenuItem>
                  </TextField>
                  {rowMode === 'custom' && (
                    <TextField
                      label="Maximum rows"
                      type="number"
                      value={rowLimit}
                      onChange={(event) => setRowLimit(event.target.value)}
                      error={!validRowLimit}
                      helperText={
                        validRowLimit
                          ? 'Processes the first valid rows in CSV order.'
                          : 'Enter a positive whole number.'
                      }
                      slotProps={{ htmlInput: { min: 1, step: 1 } }}
                    />
                  )}
                </Stack>

                <Box
                  sx={{
                    p: 2,
                    bgcolor: 'rgba(14,30,29,.045)',
                    borderLeft: `3px solid ${BRAND.orange}`,
                  }}
                >
                  <Typography variant="subtitle2">Background analysis</Typography>
                  <Typography variant="body2" sx={{ mt: 0.5, color: '#53615E' }}>
                    Choose all rows or a smaller batch. WolfSight processes rows in parallel and
                    shows live progress, then organizes the results into searchable pages.
                  </Typography>
                </Box>

                {(error || csvJob.error) && <Alert severity="error">{error || csvJob.error}</Alert>}

                <Stack
                  direction={{ xs: 'column-reverse', sm: 'row' }}
                  justifyContent="space-between"
                  spacing={1.5}
                >
                  <Button size="large" color="inherit" onClick={handleReset} disabled={!file}>
                    Clear file
                  </Button>
                  <Button
                    size="large"
                    variant="contained"
                    onClick={handleParse}
                    disabled={!file || (rowMode === 'custom' && !validRowLimit)}
                    endIcon={<Iconify icon="solar:play-circle-bold" />}
                    sx={{
                      bgcolor: BRAND.orange,
                      color: 'white',
                      px: 3.5,
                      '&:hover': { bgcolor: '#D96800' },
                    }}
                  >
                    Run WolfSight analysis
                  </Button>
                </Stack>
              </Stack>
            </Card>
          </Box>
        )}
      </Box>
    </Box>
  );
}
