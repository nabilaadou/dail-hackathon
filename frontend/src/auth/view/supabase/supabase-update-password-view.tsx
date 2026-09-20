'use client';

import * as z from 'zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useBoolean } from 'minimal-shared/hooks';
import { zodResolver } from '@hookform/resolvers/zod';

import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';

import { Iconify } from 'src/components/iconify';
import { Form, Field } from 'src/components/hook-form';

import { getErrorMessage } from '../../utils';
import { FormHead } from '../../components/form-head';
import { updatePassword } from '../../context/supabase';

const UpdateSchema = z.object({
  password: z.string().min(8, { message: 'Password must be at least 8 characters!' }),
});

export function SupabaseUpdatePasswordView() {
  const router = useRouter();
  const showPassword = useBoolean();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const methods = useForm({ resolver: zodResolver(UpdateSchema), defaultValues: { password: '' } });
  const {
    handleSubmit,
    formState: { isSubmitting },
  } = methods;

  const onSubmit = handleSubmit(async ({ password }) => {
    try {
      setErrorMessage(null);
      await updatePassword(password);
      router.replace(paths.dashboard.root);
      router.refresh();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  });

  return (
    <>
      <FormHead
        title="Set a new password"
        description="Choose a strong password you haven’t used before."
      />
      {!!errorMessage && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {errorMessage}
        </Alert>
      )}
      <Form methods={methods} onSubmit={onSubmit}>
        <Box sx={{ gap: 3, display: 'flex', flexDirection: 'column' }}>
          <Field.Text
            name="password"
            label="New password"
            type={showPassword.value ? 'text' : 'password'}
            slotProps={{
              inputLabel: { shrink: true },
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={showPassword.onToggle} edge="end">
                      <Iconify
                        icon={showPassword.value ? 'solar:eye-bold' : 'solar:eye-closed-bold'}
                      />
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
          <Button
            fullWidth
            color="inherit"
            size="large"
            type="submit"
            variant="contained"
            loading={isSubmitting}
          >
            Update password
          </Button>
        </Box>
      </Form>
    </>
  );
}
