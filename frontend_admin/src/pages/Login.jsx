import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../contexts/AuthContext'
import { Mail, Send, Shield, CheckCircle } from 'lucide-react'

const Login = () => {
  const { sendOTP, verifyOTP } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [currentStep, setCurrentStep] = useState('email') // email, verify
  const [email, setEmail] = useState('')
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
    clearErrors,
    watch
  } = useForm()

  const watchedEmail = watch('email')

  const onSendOTP = async () => {
    if (!watchedEmail) {
      setError('email', { message: 'Email is required' })
      return
    }

    setIsLoading(true)
    try {
      const result = await sendOTP(watchedEmail)
      if (result.success) {
        setEmail(watchedEmail)
        setCurrentStep('verify')
      } else {
        setError('root', { message: result.error })
      }
    } finally {
      setIsLoading(false)
    }
  }

  const onVerifyOTP = async (data) => {
    setIsLoading(true)
    try {
      const result = await verifyOTP(email, data.otp_code)
      if (!result.success) {
        setError('otp_code', { message: result.error })
      }
    } finally {
      setIsLoading(false)
    }
  }

  const onResendOTP = async () => {
    if (!email) {
      setCurrentStep('email')
      return
    }

    clearErrors('otp_code')
    setIsLoading(true)
    try {
      const result = await sendOTP(email)
      if (!result.success) {
        setError('otp_code', { message: result.error })
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 px-4 py-12 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/3 h-72 w-72 rounded-full bg-indigo-500/25 blur-3xl" />
        <div className="absolute right-8 top-1/3 h-64 w-64 rounded-full bg-amber-400/20 blur-3xl" />
        <div className="absolute -bottom-20 left-10 h-80 w-80 rounded-full bg-sky-500/20 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-5xl items-center justify-center">
        <div className="w-full max-w-md rounded-3xl border border-white/20 bg-white/95 p-8 shadow-2xl backdrop-blur-sm sm:p-10">
          <div>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-sky-600 shadow-lg shadow-indigo-700/30">
              <Shield className="h-7 w-7 text-white" />
            </div>
            <p className="mt-5 text-center text-xs font-semibold uppercase tracking-[0.22em] text-indigo-700">
              TESDA RTC NCR
            </p>
            <h2 className="mt-2 text-center text-4xl font-black tracking-tight text-slate-900">
              Admin Login
            </h2>
            <p className="mt-2 text-center text-sm text-slate-600">
              Secure access to trainer management portal
            </p>
          </div>

          {/* Progress Steps */}
          <div className="mt-6 flex items-center justify-center space-x-4">
            <div className={`flex items-center ${currentStep === 'email' ? 'text-indigo-700' : 'text-slate-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                currentStep === 'email' ? 'bg-indigo-600 text-white' : 'bg-slate-200'
              }`}>
                1
              </div>
              <span className="ml-2 text-sm">Email</span>
            </div>
            <div className="w-8 h-0.5 bg-slate-300"></div>
            <div className={`flex items-center ${currentStep === 'verify' ? 'text-indigo-700' : 'text-slate-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                currentStep === 'verify' ? 'bg-indigo-600 text-white' : 'bg-slate-200'
              }`}>
                2
              </div>
              <span className="ml-2 text-sm">Verify</span>
            </div>
          </div>

          {currentStep === 'email' && (
            <div className="mt-8 space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-slate-700">
                  Verified Email Address
                </label>
                <div className="relative mt-2">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    {...register('email', {
                      required: 'Email is required',
                      pattern: {
                        value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                        message: 'Please enter a valid email address'
                      }
                    })}
                    id="email"
                    type="email"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pl-10 text-slate-900 shadow-sm outline-none transition-all focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                    placeholder="your-email@example.com"
                  />
                </div>
                {errors.email && (
                  <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
                )}
              </div>

              <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <Send className="h-5 w-5 text-indigo-500" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-semibold text-indigo-800">Email Verification</h3>
                    <div className="mt-2 text-sm text-indigo-700">
                      <p>We'll send a 6-digit OTP code to your verified email address for admin access.</p>
                    </div>
                  </div>
                </div>
              </div>

              {errors.root && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="text-sm text-red-800">{errors.root.message}</p>
                </div>
              )}

              <button
                onClick={onSendOTP}
                disabled={isLoading}
                className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 px-4 py-3 text-base font-semibold text-white shadow-lg shadow-indigo-700/30 transition hover:from-indigo-500 hover:to-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <div className="mr-2 h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
                    Sending OTP...
                  </div>
                ) : (
                  'Send OTP'
                )}
              </button>
            </div>
          )}

          {currentStep === 'verify' && (
            <form className="mt-8 space-y-6" onSubmit={handleSubmit(onVerifyOTP)}>
              <div>
                <label htmlFor="otp_code" className="block text-sm font-semibold text-slate-700">
                  OTP Code
                </label>
                <input
                  {...register('otp_code', {
                    required: 'OTP code is required',
                    pattern: {
                      value: /^\d{6}$/,
                      message: 'OTP must be 6 digits'
                    }
                  })}
                  id="otp_code"
                  type="text"
                  maxLength={6}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-center font-mono text-lg tracking-[0.35em] text-slate-900 shadow-sm outline-none transition-all focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                  placeholder="000000"
                />
                {errors.otp_code && (
                  <p className="mt-1 text-sm text-red-600">{errors.otp_code.message}</p>
                )}
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <CheckCircle className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-semibold text-emerald-800">OTP Sent</h3>
                    <div className="mt-2 text-sm text-emerald-700">
                      <p>OTP has been sent to {email}</p>
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 px-4 py-3 text-base font-semibold text-white shadow-lg shadow-indigo-700/30 transition hover:from-indigo-500 hover:to-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <div className="mr-2 h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
                    Verifying...
                  </div>
                ) : (
                  'Verify OTP'
                )}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={onResendOTP}
                  disabled={isLoading}
                  className="text-sm font-semibold text-indigo-700 transition hover:text-indigo-900"
                >
                  Resend OTP
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default Login
