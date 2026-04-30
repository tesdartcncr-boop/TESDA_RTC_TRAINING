import React, { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../contexts/AuthContext'
import { User, Mail, Calendar, Award, Save, Edit2, X } from 'lucide-react'

const Profile = () => {
  const { user, updateProfile } = useAuth()
  const [isEditing, setIsEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
    setValue
  } = useForm()

  useEffect(() => {
    if (user) {
      reset({
        trainer_name: user.trainer_name || '',
        qualifications: user.qualifications || '',
        tm_number: user.tm_number || '',
        tm_expiration: user.tm_expiration ? new Date(user.tm_expiration).toISOString().split('T')[0] : '',
        nttc_number: user.nttc_number || '',
        nttc_expiration: user.nttc_expiration ? new Date(user.nttc_expiration).toISOString().split('T')[0] : ''
      })
    }
  }, [user, reset])

  const onSubmit = async (data) => {
    setIsLoading(true)
    try {
      const result = await updateProfile(data)
      if (result.success) {
        setIsEditing(false)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    reset()
    setIsEditing(false)
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'Not set'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
        <p className="mt-1 text-sm text-gray-600">
          Manage your personal information and certifications
        </p>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <div className="h-12 w-12 rounded-full bg-blue-600 flex items-center justify-center">
              <span className="text-white text-lg font-medium">
                {user?.trainer_name?.charAt(0) || 'U'}
              </span>
            </div>
            <div className="ml-4">
              <h2 className="text-lg font-semibold text-gray-900">{user?.trainer_name}</h2>
              <p className="text-sm text-gray-500">Trainer Account</p>
            </div>
          </div>
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              <Edit2 className="h-4 w-4 mr-2" />
              Edit Profile
            </button>
          ) : (
            <div className="flex space-x-2">
              <button
                onClick={handleCancel}
                className="flex items-center px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </button>
              <button
                onClick={handleSubmit(onSubmit)}
                disabled={isLoading}
                className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4 mr-2" />
                {isLoading ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900 flex items-center">
              <User className="h-5 w-5 mr-2 text-gray-400" />
              Basic Information
            </h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Trainer Name
              </label>
              {isEditing ? (
                <input
                  {...register('trainer_name', { required: 'Trainer name is required' })}
                  className="input-field"
                  placeholder="Enter trainer name"
                />
              ) : (
                <p className="text-gray-900">{user?.trainer_name || 'Not set'}</p>
              )}
              {errors.trainer_name && (
                <p className="mt-1 text-sm text-red-600">{errors.trainer_name.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <p className="text-gray-900">{user?.username}</p>
              <p className="text-xs text-gray-500 mt-1">Username cannot be changed</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Qualifications
              </label>
              {isEditing ? (
                <textarea
                  {...register('qualifications')}
                  rows={3}
                  className="input-field"
                  placeholder="Enter your qualifications"
                />
              ) : (
                <p className="text-gray-900 whitespace-pre-wrap">
                  {user?.qualifications || 'No qualifications added'}
                </p>
              )}
            </div>
          </div>

          {/* Certifications */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900 flex items-center">
              <Award className="h-5 w-5 mr-2 text-gray-400" />
              Certifications
            </h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                TM Number
              </label>
              {isEditing ? (
                <input
                  {...register('tm_number')}
                  className="input-field"
                  placeholder="Enter TM number"
                />
              ) : (
                <p className="text-gray-900">{user?.tm_number || 'Not set'}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                TM Expiration Date
              </label>
              {isEditing ? (
                <input
                  {...register('tm_expiration')}
                  type="date"
                  className="input-field"
                />
              ) : (
                <p className="text-gray-900">{formatDate(user?.tm_expiration)}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                NTTC Number
              </label>
              {isEditing ? (
                <input
                  {...register('nttc_number')}
                  className="input-field"
                  placeholder="Enter NTTC number"
                />
              ) : (
                <p className="text-gray-900">{user?.nttc_number || 'Not set'}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                NTTC Expiration Date
              </label>
              {isEditing ? (
                <input
                  {...register('nttc_expiration')}
                  type="date"
                  className="input-field"
                />
              ) : (
                <p className="text-gray-900">{formatDate(user?.nttc_expiration)}</p>
              )}
            </div>
          </div>
        </div>

        {/* Account Information */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 flex items-center mb-4">
            <Mail className="h-5 w-5 mr-2 text-gray-400" />
            Account Information
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-gray-500">Account Type</p>
              <p className="text-gray-900">Trainer</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Account Created</p>
              <p className="text-gray-900">
                {user?.created_at ? formatDate(user.created_at) : 'Unknown'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Profile
