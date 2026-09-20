'use client';

import * as z from 'zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useBoolean } from 'minimal-shared/hooks';
import { zodResolver } from '@hookform/resolvers/zod';

import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';
import { RouterLink } from 'src/routes/components';

import { Iconify } from 'src/components/iconify';
import { Form, Field, schemaUtils } from 'src/components/hook-form';

import { useAuthContext } from '../../hooks';
import { getErrorMessage } from '../../utils';
import { signUp } from '../../context/supabase';
import { FormHead } from '../../components/form-head';
import { SignUpTerms } from '../../components/sign-up-terms';

// ----------------------------------------------------------------------

const SignUpSchema = z.object({
  firstName: z.string().min(1, { message: 'First name is required!' }),
  lastName: z.string().min(1, { message: 'Last name is required!' }),
  email: schemaUtils.email(),
  password: z.string().min(8, { message: 'Password must be at least 8 characters!' }),
});

type SignUpSchemaType = z.infer<typeof SignUpSchema>;

export function SupabaseSignUpView() {
  const router = useRouter();
  const showPassword = useBoolean();
  const { checkUserSession } = useAuthContext();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const methods = useForm<SignUpSchemaType>({
    resolver: zodResolver(SignUpSchema),
    defaultValues: { firstName: '', lastName: '', email: '', password: '' },
  });

  const {
    handleSubmit,
    formState: { isSubmitting },
  } = methods;

  const onSubmit = handleSubmit(async (data) => {
    try {
      setErrorMessage(null);
      const result = await signUp(data);

      if (!result.session) {
        setSuccessMessage(
          'Account created. Check your email to confirm your address, then sign in.'
        );
        return;
      }

      await checkUserSession?.();
      router.refresh();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  });

  return (
    <>
      <FormHead
        title="Create your account"
        description={
          <>
            Already have an account?{' '}
            <Link component={RouterLink} href={paths.auth.supabase.signIn} variant="subtitle2">
              Sign in
            </Link>
          </>
        }
        sx={{ textAlign: { xs: 'center', md: 'left' } }}
      />

      {!!errorMessage && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {errorMessage}
        </Alert>
      )}
      {!!successMessage && (
        <Alert severity="success" sx={{ mb: 3 }}>
          {successMessage}
        </Alert>
      )}

      <Form methods={methods} onSubmit={onSubmit}>
        <Box sx={{ gap: 3, display: 'flex', flexDirection: 'column' }}>
          <Box
            sx={{
              display: 'flex',
              gap: { xs: 3, sm: 2 },
              flexDirection: { xs: 'column', sm: 'row' },
            }}
          >
            <Field.Text
              name="firstName"
              label="First name"
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <Field.Text
              name="lastName"
              label="Last name"
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Box>

          <Field.Text
            name="email"
            label="Email address"
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <Field.Text
            name="password"
            label="Password"
            placeholder="8+ characters"
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
            loadingIndicator="Create account..."
          >
            Create account
          </Button>
        </Box>
      </Form>

      <SignUpTerms />
    </>
  );
}
