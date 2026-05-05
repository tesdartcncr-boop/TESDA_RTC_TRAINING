import React, { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../contexts/AuthContext'
import { User, Award, Save, Edit2, X } from 'lucide-react'

const Profile = () => {
  const { user, updateProfile } = useAuth()
  const [isEditing, setIsEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm()

  useEffect(() => {
    if (user) {
      reset({
        trainer_name: user.trainer_name || '',
        username: user.username || '',
        password: ''
      })
    }
  }, [user, reset])

  const onSubmit = async (data) => {
    setIsLoading(true)
    try {
      // Only allow updating trainer_name, username and password from trainer portal
      const payload = {
        trainer_name: data.trainer_name,
        username: data.username
      }
      if (data.password && data.password.trim() !== '') payload.password = data.password

      const result = await updateProfile(payload)
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
          {isEditing ? (
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
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              <Edit2 className="h-4 w-4 mr-2" />
              Edit Profile
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Basic Information */}
          <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900 flex items-center">
                  <User className="h-5 w-5 mr-2 text-gray-400" />
                  Account
                </h3>

                <div>
                  <label htmlFor="trainer_name" className="block text-sm font-medium text-gray-700 mb-1">Trainer Name</label>
                  {isEditing ? (
                    <input
                      id="trainer_name"
                      {...register('trainer_name', { required: 'Trainer name is required' })}
                      className="input-field"
                      placeholder="Enter trainer name"
                    />
                  ) : (
                    <p className="text-gray-900">{user?.trainer_name || 'Not set'}</p>
                  )}
                  {errors.trainer_name && <p className="mt-1 text-sm text-red-600">{errors.trainer_name.message}</p>}
                </div>

                <div>
                  <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                  {isEditing ? (
                    <input
                      id="username"
                      {...register('username', { required: 'Username is required' })}
                      className="input-field"
                      placeholder="Enter username"
                    />
                  ) : (
                    <p className="text-gray-900">{user?.username}</p>
                  )}
                  {errors.username && <p className="mt-1 text-sm text-red-600">{errors.username.message}</p>}
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  {isEditing ? (
                    <input
                      id="password"
                      {...register('password')}
                      type="password"
                      className="input-field"
                      placeholder="Leave blank to keep current password"
                    />
                  ) : (
                    <p className="text-gray-900">••••••••</p>
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
              <div className="text-sm font-medium text-gray-700 mb-1">TM Number</div>
              <p className="text-gray-900">{user?.tm_number || 'Not set'}</p>
            </div>

            <div>
              <div className="text-sm font-medium text-gray-700 mb-1">TM Expiration Date</div>
              <p className="text-gray-900">{formatDate(user?.tm_expiration)}</p>
            </div>

            <div>
              <div className="text-sm font-medium text-gray-700 mb-1">NTTC Number</div>
              <p className="text-gray-900">{user?.nttc_number || 'Not set'}</p>
            </div>

            <div>
              <div className="text-sm font-medium text-gray-700 mb-1">NTTC Expiration Date</div>
              <p className="text-gray-900">{formatDate(user?.nttc_expiration)}</p>
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
