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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-purple-100">
            <Shield className="h-6 w-6 text-purple-600" />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Admin Login
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Secure access to trainer management portal
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center space-x-4">
          <div className={`flex items-center ${currentStep === 'email' ? 'text-purple-600' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              currentStep === 'email' ? 'bg-purple-600 text-white' : 'bg-gray-200'
            }`}>
              1
            </div>
            <span className="ml-2 text-sm">Email</span>
          </div>
          <div className="w-8 h-0.5 bg-gray-300"></div>
          <div className={`flex items-center ${currentStep === 'verify' ? 'text-purple-600' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              currentStep === 'verify' ? 'bg-purple-600 text-white' : 'bg-gray-200'
            }`}>
              2
            </div>
            <span className="ml-2 text-sm">Verify</span>
          </div>
        </div>

        {currentStep === 'email' && (
          <div className="mt-8 space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Verified Email Address
              </label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
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
                  className="input-field pl-10"
                  placeholder="your-email@example.com"
                />
              </div>
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <Send className="h-5 w-5 text-blue-400" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-blue-800">Email Verification</h3>
                  <div className="mt-2 text-sm text-blue-700">
                    <p>We'll send a 6-digit OTP code to your verified email address for admin access.</p>
                  </div>
                </div>
              </div>
            </div>

            {errors.root && (
              <div className="rounded-md bg-red-50 p-4">
                <p className="text-sm text-red-800">{errors.root.message}</p>
              </div>
            )}

            <button
              onClick={onSendOTP}
              disabled={isLoading}
              className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
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
              <label htmlFor="otp_code" className="block text-sm font-medium text-gray-700">
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
                className="input-field text-center text-lg font-mono"
                placeholder="000000"
              />
              {errors.otp_code && (
                <p className="mt-1 text-sm text-red-600">{errors.otp_code.message}</p>
              )}
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <CheckCircle className="h-5 w-5 text-green-400" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-green-800">OTP Sent</h3>
                  <div className="mt-2 text-sm text-green-700">
                    <p>OTP has been sent to {email}</p>
                  </div>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
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
                className="text-sm text-gray-600 hover:text-gray-800 font-medium"
              >
                Resend OTP
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default Login
