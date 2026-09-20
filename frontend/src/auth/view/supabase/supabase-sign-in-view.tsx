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
import { RouterLink } from 'src/routes/components';
import { useRouter, useSearchParams } from 'src/routes/hooks';

import { Iconify } from 'src/components/iconify';
import { Form, Field, schemaUtils } from 'src/components/hook-form';

import { useAuthContext } from '../../hooks';
import { getErrorMessage } from '../../utils';
import { FormHead } from '../../components/form-head';
import { signInWithPassword } from '../../context/supabase';

// ----------------------------------------------------------------------

const SignInSchema = z.object({
  email: schemaUtils.email(),
  password: z.string().min(1, { message: 'Password is required!' }),
});

type SignInSchemaType = z.infer<typeof SignInSchema>;

export function SupabaseSignInView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const showPassword = useBoolean();
  const { checkUserSession } = useAuthContext();
  const [errorMessage, setErrorMessage] = useState<string | null>(searchParams.get('error'));

  const methods = useForm<SignInSchemaType>({
    resolver: zodResolver(SignInSchema),
    defaultValues: { email: '', password: '' },
  });

  const {
    handleSubmit,
    formState: { isSubmitting },
  } = methods;

  const onSubmit = handleSubmit(async (data) => {
    try {
      setErrorMessage(null);
      await signInWithPassword(data);
      await checkUserSession?.();
      router.refresh();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  });

  return (
    <>
      <FormHead
        title="Sign in to your account"
        description={
          <>
            Don&apos;t have an account?{' '}
            <Link component={RouterLink} href={paths.auth.supabase.signUp} variant="subtitle2">
              Create one
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

      <Form methods={methods} onSubmit={onSubmit}>
        <Box sx={{ gap: 3, display: 'flex', flexDirection: 'column' }}>
          <Field.Text
            name="email"
            label="Email address"
            slotProps={{ inputLabel: { shrink: true } }}
          />

          <Box sx={{ gap: 1.5, display: 'flex', flexDirection: 'column' }}>
            <Link
              component={RouterLink}
              href={paths.auth.supabase.resetPassword}
              variant="body2"
              color="inherit"
              sx={{ alignSelf: 'flex-end' }}
            >
              Forgot password?
            </Link>

            <Field.Text
              name="password"
              label="Password"
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
          </Box>

          <Button
            fullWidth
            color="inherit"
            size="large"
            type="submit"
            variant="contained"
            loading={isSubmitting}
            loadingIndicator="Sign in..."
          >
            Sign in
          </Button>
        </Box>
      </Form>
    </>
  );
}
