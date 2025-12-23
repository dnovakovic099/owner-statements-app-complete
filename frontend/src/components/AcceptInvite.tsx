import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Key, AlertCircle, Check, RefreshCw, Shield, Edit3, Eye } from 'lucide-react';
import { authAPI } from '../services/api';

interface AcceptInviteProps {
  onSuccess: () => void;
}

const AcceptInvite: React.FC<AcceptInviteProps> = ({ onSuccess }) => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [userData, setUserData] = useState<{
    username: string;
    email: string;
    role: string;
  } | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    validateToken();
  }, [token]);

  const validateToken = async () => {
    if (!token) {
      setError('No invite token provided');
      setLoading(false);
      setValidating(false);
      return;
    }

    try {
      const response = await authAPI.validateInvite(token);
      if (response.success && response.user) {
        setUserData(response.user);
      } else {
        setError(response.message || 'Invalid or expired invite link');
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to validate invite');
    } finally {
      setLoading(false);
      setValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');

    // Validate password
    if (password.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    try {
      setSubmitting(true);
      const response = await authAPI.acceptInvite(token, password);
      if (response.success) {
        setSuccess(true);
        setTimeout(() => {
          onSuccess();
        }, 2000);
      } else {
        setPasswordError(response.message || 'Failed to set password');
      }
    } catch (err: any) {
      setPasswordError(err?.response?.data?.message || 'Failed to activate account');
    } finally {
      setSubmitting(false);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
        return <Shield className="w-5 h-5 text-purple-600" />;
      case 'editor':
        return <Edit3 className="w-5 h-5 text-blue-600" />;
      case 'viewer':
        return <Eye className="w-5 h-5 text-gray-600" />;
      default:
        return null;
    }
  };

  const getRoleDescription = (role: string) => {
    switch (role) {
      case 'admin':
        return 'Full administrative access including user management';
      case 'editor':
        return 'Create, edit, and send owner statements';
      case 'viewer':
        return 'View-only access to statements and listings';
      default:
        return '';
    }
  };

  if (loading || validating) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
          <RefreshCw className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Validating your invite...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Invalid Invite</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={onSuccess}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Account Activated!</h2>
          <p className="text-gray-600 mb-4">
            Your account has been set up successfully. Redirecting to login...
          </p>
          <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Key className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Welcome!</h2>
          <p className="text-gray-600 mt-1">Set up your account password</p>
        </div>

        {userData && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="mb-3">
              <span className="text-xs text-gray-500 uppercase tracking-wider">Username</span>
              <p className="font-medium text-gray-900">{userData.username}</p>
            </div>
            <div className="mb-3">
              <span className="text-xs text-gray-500 uppercase tracking-wider">Email</span>
              <p className="text-gray-900">{userData.email}</p>
            </div>
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wider">Role</span>
              <div className="flex items-center mt-1">
                {getRoleIcon(userData.role)}
                <span className="ml-2 font-medium text-gray-900 capitalize">{userData.role}</span>
              </div>
              <p className="text-sm text-gray-500 mt-1">{getRoleDescription(userData.role)}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your password"
              required
              minLength={6}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Confirm your password"
              required
              minLength={6}
            />
          </div>

          {passwordError && (
            <div className="flex items-center text-red-600 text-sm">
              <AlertCircle className="w-4 h-4 mr-1" />
              {passwordError}
            </div>
          )}

          <p className="text-xs text-gray-500">
            Password must be at least 6 characters long.
          </p>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-md hover:from-blue-700 hover:to-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center font-medium"
          >
            {submitting ? (
              <>
                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                Activating...
              </>
            ) : (
              <>
                <Check className="w-5 h-5 mr-2" />
                Activate Account
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AcceptInvite;
