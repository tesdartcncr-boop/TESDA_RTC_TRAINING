import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Eye, EyeOff, KeyRound, Lock, Mail, ShieldCheck, User } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import ModalShell from '../components/ModalShell'

const USERNAME_PATTERN = /^[A-Za-z0-9._-]+$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const OTP_PATTERN = /^\d{6}$/
const PASSWORD_COMPLEXITY_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/

const usernameRules = {
  required: 'Username is required',
  minLength: { value: 3, message: 'Username must be at least 3 characters.' },
  maxLength: { value: 50, message: 'Username must be 50 characters or fewer.' },
  pattern: {
    value: USERNAME_PATTERN,
    message: 'Use only letters, numbers, periods, underscores, or hyphens.',
  },
  validate: (value) => value.trim() === value || 'Remove extra spaces before or after your username.',
}

const passwordRules = {
  required: 'Password is required',
  minLength: { value: 6, message: 'Password must be at least 6 characters.' },
  maxLength: { value: 128, message: 'Password must be 128 characters or fewer.' },
}

const emailRules = {
  required: 'Email is required',
  maxLength: { value: 120, message: 'Email must be 120 characters or fewer.' },
  pattern: { value: EMAIL_PATTERN, message: 'Enter a valid email address.' },
  validate: (value) => value.trim() === value || 'Remove extra spaces before or after your email.',
}

const otpRules = {
  required: 'OTP is required',
  pattern: { value: OTP_PATTERN, message: 'Enter the 6-digit OTP code.' },
}

const newPasswordRules = {
  required: 'New password is required',
  pattern: {
    value: PASSWORD_COMPLEXITY_PATTERN,
    message: 'Use at least 8 characters with at least one letter and one number.',
  },
}

export default function Login() {
  const { login, requestPasswordReset, confirmPasswordReset } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [isSendingResetOtp, setIsSendingResetOtp] = useState(false)
  const [isResettingPassword, setIsResettingPassword] = useState(false)
  const [showResetPassword, setShowResetPassword] = useState(false)


  const loginForm = useForm({
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: {
      username: '',
      password: '',
      rememberMe: true,
    },
  })

  const resetForm = useForm({
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: {
      email: '',
      otp_code: '',
      new_password: '',
    },
  })

  const closeResetModal = () => {
    setShowResetModal(false)
    setResetEmail('')
    resetForm.reset()
    setShowResetPassword(false)
  }

  const handleLogin = async (values) => {
    loginForm.clearErrors('root')
    setIsLoading(true)

    try {
      const result = await login(
        {
          username: values.username.trim(),
          password: values.password,
        },
        values.rememberMe,
      )

      if (!result.success) {
        loginForm.setError('root', { message: result.error })
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleSendResetOtp = async () => {
    resetForm.clearErrors('root')
    setResetEmail('')

    const isEmailValid = await resetForm.trigger('email')
    if (!isEmailValid) return

    setIsSendingResetOtp(true)
    try {
      const normalizedEmail = resetForm.getValues('email').trim().toLowerCase()
      const result = await requestPasswordReset(normalizedEmail)
      if (!result.success) {
        resetForm.setError('root', { message: result.error })
        return
      }
      resetForm.setValue('email', normalizedEmail, { shouldValidate: true })
      setResetEmail(normalizedEmail)
    } finally {
      setIsSendingResetOtp(false)
    }
  }

  const handleResetPassword = async (values) => {
    resetForm.clearErrors('root')
    setIsResettingPassword(true)

    try {
      const result = await confirmPasswordReset(
        values.email.trim().toLowerCase(),
        values.otp_code.replace(/\D/g, ''),
        values.new_password,
      )

      if (!result.success) {
        resetForm.setError('root', { message: result.error })
        return
      }

      closeResetModal()
    } finally {
      setIsResettingPassword(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 px-4 py-12 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-10 left-1/3 h-72 w-72 rounded-full bg-sky-500/25 blur-3xl" />
        <div className="absolute right-0 top-1/4 h-80 w-80 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute bottom-0 left-10 h-80 w-80 rounded-full bg-emerald-400/15 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-6rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[2rem] border border-white/15 bg-white/95 shadow-[0_30px_100px_rgba(15,23,42,0.55)] lg:grid-cols-[1.15fr_0.85fr]">
          <div className="hidden bg-gradient-to-br from-slate-950 via-sky-900 to-cyan-700 p-10 text-white lg:block">
            <p className="text-sm font-bold uppercase tracking-[0.28em] text-sky-100">TESDA RTC - NCR</p>
            <h1 className="mt-6 text-5xl font-black leading-tight">Supervisor Portal</h1>
            <p className="mt-5 max-w-lg text-lg text-sky-50/90">
              Approve teaching load, monitor approval queues, and review portal statistics.
            </p>
            <div className="mt-10 grid gap-4">
              {[
                'Approve or reject teaching load submissions',
                'Monitor approval status at a glance',
                'OTP-based password recovery',
              ].map((item) => (
                <div key={item} className="flex items-center rounded-2xl border border-white/15 bg-white/10 px-4 py-4">
                  <ShieldCheck className="mr-3 h-5 w-5 text-cyan-200" />
                  <span className="font-medium">{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-8 sm:p-10">
            <div className="mx-auto max-w-md">
              <div className="mb-8 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-600 to-cyan-500 text-white shadow-lg shadow-sky-900/25">
                  <ShieldCheck className="h-7 w-7" />
                </div>
                <p className="mt-5 text-xs font-bold uppercase tracking-[0.24em] text-sky-700">TESDA RTC - NCR</p>
                <h2 className="mt-2 text-4xl font-black tracking-tight text-slate-900">Supervisor Sign In</h2>
                <p className="mt-2 text-sm text-slate-600">Use your supervisor account.</p>
              </div>

              <form className="space-y-5" onSubmit={loginForm.handleSubmit(handleLogin)} noValidate>
                <div>
                  <label htmlFor="management_username" className="block text-sm font-semibold text-slate-700">Username</label>
                  <div className="relative mt-2">
                    <User className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
                    <input
                      id="management_username"
                      autoComplete="username"
                      spellCheck={false}
                      maxLength={50}
                      {...loginForm.register('username', usernameRules)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pl-11 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                      placeholder="Enter your username"
                    />
                  </div>
                  {loginForm.formState.errors.username ? (
                    <p className="mt-1 text-sm text-rose-600">{loginForm.formState.errors.username.message}</p>
                  ) : null}
                </div>

                <div>
                  <label htmlFor="management_password" className="block text-sm font-semibold text-slate-700">Password</label>
                  <div className="relative mt-2">
                    <Lock className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
                    <input
                      id="management_password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      maxLength={128}
                      {...loginForm.register('password', passwordRules)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pl-11 pr-11 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                      placeholder="Enter your password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="absolute right-3 top-3 text-slate-400 transition hover:text-slate-700"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  {loginForm.formState.errors.password ? (
                    <p className="mt-1 text-sm text-rose-600">{loginForm.formState.errors.password.message}</p>
                  ) : null}
                </div>

                <div className="flex items-center justify-between gap-4">
                  <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                    <input type="checkbox" {...loginForm.register('rememberMe')} className="h-4 w-4 rounded border-slate-300 text-sky-600" />
                    <span>Remember me</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowResetModal(true)}
                    className="text-sm font-semibold text-sky-700 transition hover:text-sky-900"
                  >
                    Forgot password?
                  </button>
                </div>

                {loginForm.formState.errors.root ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {loginForm.formState.errors.root.message}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-3 text-base font-bold text-white shadow-lg shadow-sky-900/20 transition hover:from-sky-700 hover:to-cyan-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? 'Signing in...' : 'Sign in'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {showResetModal ? (
        <ModalShell title="Reset Password" maxWidth="max-w-lg" onClose={closeResetModal}>
          <form className="space-y-4" onSubmit={resetForm.handleSubmit(handleResetPassword)} noValidate>
            <div>
              <label htmlFor="reset_email" className="block text-sm font-semibold text-slate-700">Email Address</label>
              <div className="relative mt-2">
                <Mail className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
                <input
                  id="reset_email"
                  type="email"
                  autoComplete="email"
                  maxLength={120}
                  {...resetForm.register('email', emailRules)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 pl-11 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  placeholder="Enter your account email"
                />
              </div>
              {resetForm.formState.errors.email ? (
                <p className="mt-1 text-sm text-rose-600">{resetForm.formState.errors.email.message}</p>
              ) : null}
            </div>

            <button
              type="button"
              disabled={isSendingResetOtp || isResettingPassword}
              onClick={handleSendResetOtp}
              className="inline-flex items-center rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Mail className="mr-2 h-4 w-4" />
              {isSendingResetOtp ? 'Sending OTP...' : 'Send OTP'}
            </button>

            {resetEmail ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                OTP sent to {resetEmail}.
              </div>
            ) : null}

            <div>
              <label htmlFor="reset_otp" className="block text-sm font-semibold text-slate-700">OTP Code</label>
              <input
                id="reset_otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                {...resetForm.register('otp_code', otpRules)}
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-mono tracking-[0.35em] outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                placeholder="000000"
              />
              {resetForm.formState.errors.otp_code ? (
                <p className="mt-1 text-sm text-rose-600">{resetForm.formState.errors.otp_code.message}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="reset_password_new" className="block text-sm font-semibold text-slate-700">New Password</label>
              <div className="relative mt-2">
                <KeyRound className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
                <input
                  id="reset_password_new"
                  type={showResetPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  maxLength={128}
                  {...resetForm.register('new_password', newPasswordRules)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pl-11 pr-11 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  placeholder="Create a stronger password"
                />
                <button
                  type="button"
                  onClick={() => setShowResetPassword((current) => !current)}
                  className="absolute right-3 top-3 text-slate-400 transition hover:text-slate-700"
                >
                  {showResetPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {resetForm.formState.errors.new_password ? (
                <p className="mt-1 text-sm text-rose-600">{resetForm.formState.errors.new_password.message}</p>
              ) : null}
            </div>

            {resetForm.formState.errors.root ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {resetForm.formState.errors.root.message}
              </div>
            ) : null}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={closeResetModal} className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200">
                Cancel
              </button>
              <button
                type="submit"
                disabled={isResettingPassword || isSendingResetOtp}
                className="rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isResettingPassword ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}
    </div>
  )
}
