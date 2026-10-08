import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
  User as UserIcon,
  Lock,
  Moon,
  Sun,
  Trash2,
  AlertTriangle,
  Loader2,
  Save,
  ShieldAlert,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import * as settingsApi from '@/api/settingsApi';
import axios from 'axios';

export default function Settings() {
  const { user, login, logout } = useAuthStore();
  const navigate = useNavigate();

  // Profile Form State
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [profileSaving, setProfileSaving] = useState(false);

  // Password Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  // Dark Mode State
  const [isDark, setIsDark] = useState(() => {
    try {
      return document.documentElement.classList.contains('dark');
    } catch {
      return false;
    }
  });

  // Account Deletion Modal State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [confirmEmailInput, setConfirmEmailInput] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Toggle dark/light theme — Requirement 14.8, 14.9
  const handleToggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('docket-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('docket-theme', 'light');
    }
    toast.success(`Switched to ${nextDark ? 'Dark' : 'Light'} mode`);
  };

  // Update Profile — Requirement 14.2
  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      toast.error('Name and email cannot be empty.');
      return;
    }

    setProfileSaving(true);
    try {
      const res = await settingsApi.updateProfile({ name: name.trim(), email: email.trim() });
      const currentToken = useAuthStore.getState().token;
      if (currentToken) {
        login(currentToken, res.user);
      }
      toast.success('Profile updated successfully.');
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? (err.response?.data?.error || err.response?.data?.message) : null;
      toast.error(msg || 'Failed to update profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  // Update Password — Requirement 14.3, 14.4
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) {
      toast.error('Please enter both current and new passwords.');
      return;
    }

    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match.');
      return;
    }

    setPasswordSaving(true);
    try {
      await settingsApi.updatePassword({ currentPassword, newPassword });
      toast.success('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? (err.response?.data?.error || err.response?.data?.message) : null;
      toast.error(msg || 'Failed to update password.');
    } finally {
      setPasswordSaving(false);
    }
  };

  // Delete Account — Requirement 14.6, 14.7
  const handleDeleteAccount = async () => {
    if (confirmEmailInput.trim().toLowerCase() !== user?.email.toLowerCase()) {
      toast.error('Email confirmation does not match your account email.');
      return;
    }

    setDeleting(true);
    try {
      await settingsApi.deleteAccount();
      toast.success('Your account and all associated data have been deleted.');
      logout();
      navigate('/login', { replace: true });
    } catch {
      toast.error('Failed to delete account.');
      setDeleting(false);
    }
  };

  return (
    <div className="p-6 sm:p-8 space-y-8 max-w-4xl mx-auto">
      {/* Page Header */}
      <div className="border-b border-border pb-5">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your personal profile, security preferences, and account controls.
        </p>
      </div>

      {/* 1. Profile Information */}
      <section className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-sm">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <UserIcon className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">Profile Information</h2>
        </div>

        <form onSubmit={handleProfileSubmit} className="space-y-4 max-w-md">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <button
            type="submit"
            disabled={profileSaving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50"
          >
            {profileSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save Profile
          </button>
        </form>
      </section>

      {/* 2. Password Security */}
      <section className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-sm">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Lock className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">Change Password</h2>
        </div>

        <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-md">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <button
            type="submit"
            disabled={passwordSaving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50"
          >
            {passwordSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
            Update Password
          </button>
        </form>
      </section>

      {/* 3. Appearance Preference */}
      <section className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-sm">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          {isDark ? <Moon className="h-5 w-5 text-amber-400" /> : <Sun className="h-5 w-5 text-amber-500" />}
          <h2 className="text-lg font-bold text-foreground">Appearance Preference</h2>
        </div>

        <div className="flex items-center justify-between max-w-md">
          <div>
            <p className="text-sm font-semibold text-foreground">Theme Mode</p>
            <p className="text-xs text-muted-foreground">Toggle between Light and Dark interface modes.</p>
          </div>

          <button
            type="button"
            onClick={handleToggleTheme}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted/80 transition"
          >
            {isDark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-slate-700" />}
            {isDark ? 'Light Mode' : 'Dark Mode'}
          </button>
        </div>
      </section>

      {/* 4. Danger Zone */}
      <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 space-y-4 shadow-sm">
        <div className="flex items-center gap-2 border-b border-destructive/20 pb-3 text-destructive">
          <ShieldAlert className="h-5 w-5" />
          <h2 className="text-lg font-bold">Danger Zone</h2>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Delete Account</p>
            <p className="text-xs text-muted-foreground">
              Permanently delete your Docket account and remove all stored documents, notifications, and logs.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setDeleteModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90 transition"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Account
          </button>
        </div>
      </section>

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-6 w-6" />
              <h3 className="text-lg font-bold text-foreground">Delete Account Confirmation</h3>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              This action <strong className="text-destructive">cannot be undone</strong>. All your documents, extracted text, metadata, and notifications will be permanently erased.
            </p>

            <div className="space-y-1.5 pt-2">
              <label className="text-xs font-medium text-foreground">
                To confirm, type your email address <strong>{user?.email}</strong> below:
              </label>
              <input
                type="text"
                value={confirmEmailInput}
                onChange={(e) => setConfirmEmailInput(e.target.value)}
                placeholder={user?.email}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-destructive"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => {
                  setDeleteModalOpen(false);
                  setConfirmEmailInput('');
                }}
                className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting || confirmEmailInput.trim().toLowerCase() !== user?.email.toLowerCase()}
                onClick={handleDeleteAccount}
                className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Confirm Deletion
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
