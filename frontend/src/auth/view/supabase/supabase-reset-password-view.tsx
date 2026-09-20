'use client';

import * as z from 'zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';

import { paths } from 'src/routes/paths';

import { Form, Field, schemaUtils } from 'src/components/hook-form';

import { getErrorMessage } from '../../utils';
import { FormHead } from '../../components/form-head';
import { resetPassword } from '../../context/supabase';
import { FormReturnLink } from '../../components/form-return-link';

const ResetSchema = z.object({ email: schemaUtils.email() });

export function SupabaseResetPasswordView() {
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const methods = useForm({ resolver: zodResolver(ResetSchema), defaultValues: { email: '' } });
  const {
    handleSubmit,
    formState: { isSubmitting },
  } = methods;

  const onSubmit = handleSubmit(async ({ email }) => {
    try {
      setErrorMessage(null);
      await resetPassword(email);
      setMessage('Check your email for a password reset link.');
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  });

  return (
    <>
      <FormHead
        title="Forgot your password?"
        description="Enter your email and we’ll send you a secure reset link."
      />
      {!!message && (
        <Alert severity="success" sx={{ mb: 3 }}>
          {message}
        </Alert>
      )}
      {!!errorMessage && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {errorMessage}
        </Alert>
      )}
      <Form methods={methods} onSubmit={onSubmit}>
        <Box sx={{ gap: 3, display: 'flex', flexDirection: 'column' }}>
          <Field.Text
            name="email"
            label="Email address"
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <Button
            fullWidth
            color="inherit"
            size="large"
            type="submit"
            variant="contained"
            loading={isSubmitting}
          >
            Send reset link
          </Button>
        </Box>
      </Form>
      <FormReturnLink href={paths.auth.supabase.signIn} />
    </>
  );
}
