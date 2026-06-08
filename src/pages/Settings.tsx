import React, { useState, useEffect } from 'react';
import {
  UserIcon,
  BellIcon,
  LockIcon,
  Building2Icon,
  PaletteIcon,
  GlobeIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  LoaderIcon,
  EyeIcon,
  EyeOffIcon,
} from 'lucide-react';

import {
  getUserById,
  updateUser,
  changeUserPassword,
  getOrgSettings,
  saveOrgSettings,
  getUserPreferences,
  saveUserPreferences,
  type FlowableUser,
  type OrgSettings,
  type UserPreferences,
} from '../pages/services/flowableApi';

// ─────────────────────────────────────────────────────────────
// The currently logged-in user ID — in a real app this comes
// from your auth context / JWT / session. For now it reads from
// sessionStorage (set at login) and falls back to 'admin'.
// ─────────────────────────────────────────────────────────────
const CURRENT_USER_ID =
  sessionStorage.getItem('currentUserId') || 'admin';

// ─────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────
type SaveStatus = 'idle' | 'saving' | 'success' | 'error';

function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative w-11 h-6 rounded-full transition-colors ${
        value ? 'bg-blue-600' : 'bg-gray-300'
      }`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
          value ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function SaveBar({
  status,
  onSave,
  onCancel,
}: {
  status: SaveStatus;
  onSave: () => void;
  onCancel?: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-3 mt-6 pt-6 border-t border-gray-100">
      {status === 'success' && (
        <span className="flex items-center gap-1 text-green-600 text-sm">
          <CheckCircleIcon className="w-4 h-4" /> Saved successfully
        </span>
      )}
      {status === 'error' && (
        <span className="flex items-center gap-1 text-red-500 text-sm">
          <AlertCircleIcon className="w-4 h-4" /> Save failed — try again
        </span>
      )}
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-sm"
        >
          Cancel
        </button>
      )}
      <button
        type="button"
        onClick={onSave}
        disabled={status === 'saving'}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 text-sm"
      >
        {status === 'saving' && (
          <LoaderIcon className="w-4 h-4 animate-spin" />
        )}
        {status === 'saving' ? 'Saving…' : 'Save Changes'}
      </button>
    </div>
  );
}

function SectionLoader() {
  return (
    <div className="flex items-center justify-center h-48">
      <LoaderIcon className="w-6 h-6 animate-spin text-blue-500" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TAB: Profile
// Reads + updates /identity/users/{id}
// ─────────────────────────────────────────────────────────────
function ProfileTab() {
  const [user, setUser] = useState<FlowableUser | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  useEffect(() => {
    getUserById(CURRENT_USER_ID)
      .then((u) => {
        setUser(u);
        setFirstName(u.firstName || '');
        setLastName(u.lastName || '');
        setEmail(u.email || '');
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!user) return;
    setSaveStatus('saving');
    try {
      const updated = await updateUser(user.id, { firstName, lastName, email });
      setUser(updated);
      setSaveStatus('success');
    } catch (err) {
      console.error(err);
      setSaveStatus('error');
    }
    setTimeout(() => setSaveStatus('idle'), 3000);
  };

  const handleCancel = () => {
    if (!user) return;
    setFirstName(user.firstName || '');
    setLastName(user.lastName || '');
    setEmail(user.email || '');
    setSaveStatus('idle');
  };

  if (loading) return <SectionLoader />;

  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || user?.id?.charAt(0).toUpperCase() || 'U';

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Profile Information</h2>
      <p className="text-sm text-gray-500 mb-6">Update your personal details</p>

      <div className="flex items-center gap-4 mb-6 pb-6 border-b border-gray-100">
        <div className="w-16 h-16 bg-purple-500 rounded-full flex items-center justify-center text-white font-bold text-xl">
          {initials}
        </div>
        <div>
          <p className="text-sm text-gray-600">
            User ID: <span className="font-mono font-medium text-gray-800">{user?.id}</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Avatar is auto-generated from your initials
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <SaveBar status={saveStatus} onSave={handleSave} onCancel={handleCancel} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TAB: Organization
// Reads + updates orgSettingsWorkflow process variables
// ─────────────────────────────────────────────────────────────
function OrganizationTab() {
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [address, setAddress] = useState('');
  const [gstin, setGstin] = useState('');
  const [cin, setCin] = useState('');
  const [fiscalYear, setFiscalYear] = useState('');
  const [timezone, setTimezone] = useState('');

  useEffect(() => {
    getOrgSettings()
      .then((org) => {
        if (org) {
          setCompanyName(org.companyName);
          setIndustry(org.industry);
          setAddress(org.address);
          setGstin(org.gstin);
          setCin(org.cin);
          setFiscalYear(org.fiscalYear);
          setTimezone(org.timezone);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      await saveOrgSettings({
        companyName,
        industry,
        address,
        gstin,
        cin,
        fiscalYear,
        timezone,
      });
      setSaveStatus('success');
    } catch (err) {
      console.error(err);
      setSaveStatus('error');
    }
    setTimeout(() => setSaveStatus('idle'), 3000);
  };

  if (loading) return <SectionLoader />;

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Organization Details</h2>
      <p className="text-sm text-gray-500 mb-6">Manage organization-wide settings</p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="e.g. JK Copier (JK Paper Ltd)"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
          <input
            type="text"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="e.g. Paper Manufacturing"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Registered Address</label>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={3}
            placeholder="Full registered address"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">GSTIN</label>
            <input
              type="text"
              value={gstin}
              onChange={(e) => setGstin(e.target.value)}
              placeholder="e.g. 21AABCJ1234A1Z5"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CIN</label>
            <input
              type="text"
              value={cin}
              onChange={(e) => setCin(e.target.value)}
              placeholder="e.g. L21010KA2000PLC123456"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fiscal Year</label>
            <select
              value={fiscalYear}
              onChange={(e) => setFiscalYear(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select fiscal year start</option>
              <option value="April - March">April – March (India)</option>
              <option value="January - December">January – December</option>
              <option value="July - June">July – June</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Time Zone</label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select timezone</option>
              <option value="Asia/Kolkata">Asia/Kolkata (IST, UTC+5:30)</option>
              <option value="UTC">UTC</option>
              <option value="America/New_York">America/New_York (EST)</option>
              <option value="Europe/London">Europe/London (GMT)</option>
            </select>
          </div>
        </div>
      </div>

      <SaveBar status={saveStatus} onSave={handleSave} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TAB: Notifications
// Reads + updates userPreferencesWorkflow (emailNotif, pushNotif, reminderNotif)
// ─────────────────────────────────────────────────────────────
function NotificationsTab() {
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);

  const [emailNotif, setEmailNotif] = useState(true);
  const [pushNotif, setPushNotif] = useState(false);
  const [reminderNotif, setReminderNotif] = useState(true);

  useEffect(() => {
    getUserPreferences(CURRENT_USER_ID)
      .then((p) => {
        if (p) {
          setPrefs(p);
          setEmailNotif(p.emailNotif);
          setPushNotif(p.pushNotif);
          setReminderNotif(p.reminderNotif);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      await saveUserPreferences({
        userId: CURRENT_USER_ID,
        emailNotif,
        pushNotif,
        reminderNotif,
        language:   prefs?.language   || 'English (India)',
        currency:   prefs?.currency   || 'INR (₹)',
        dateFormat: prefs?.dateFormat || 'DD-MMM-YYYY',
        theme:      prefs?.theme      || 'light',
      });
      setSaveStatus('success');
    } catch (err) {
      console.error(err);
      setSaveStatus('error');
    }
    setTimeout(() => setSaveStatus('idle'), 3000);
  };

  if (loading) return <SectionLoader />;

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Notification Preferences</h2>
      <p className="text-sm text-gray-500 mb-6">Choose how you want to be notified</p>

      <div className="space-y-0">
        {[
          {
            label: 'Email Notifications',
            desc: 'Receive task and audit updates via email',
            value: emailNotif,
            onChange: setEmailNotif,
          },
          {
            label: 'Push Notifications',
            desc: 'Browser push for critical events',
            value: pushNotif,
            onChange: setPushNotif,
          },
          {
            label: 'Task Reminders',
            desc: 'Reminder emails before task due dates',
            value: reminderNotif,
            onChange: setReminderNotif,
          },
        ].map((item, i, arr) => (
          <div
            key={item.label}
            className={`flex items-center justify-between py-4 ${
              i < arr.length - 1 ? 'border-b border-gray-100' : ''
            }`}
          >
            <div>
              <div className="text-sm font-medium text-gray-900">{item.label}</div>
              <div className="text-xs text-gray-500">{item.desc}</div>
            </div>
            <Toggle value={item.value} onChange={item.onChange} />
          </div>
        ))}
      </div>

      <SaveBar status={saveStatus} onSave={handleSave} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TAB: Security
// Change password via PUT /identity/users/{id}
// ─────────────────────────────────────────────────────────────
function SecurityTab() {
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [validationError, setValidationError] = useState('');

  const handleChangePassword = async () => {
    setValidationError('');
    if (!currentPassword) {
      setValidationError('Please enter your current password.');
      return;
    }
    if (newPassword.length < 8) {
      setValidationError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setValidationError('New password and confirm password do not match.');
      return;
    }

    setSaveStatus('saving');
    try {
      await changeUserPassword(CURRENT_USER_ID, newPassword);
      setSaveStatus('success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setSaveStatus('idle');
        setShowChangePassword(false);
      }, 2000);
    } catch (err) {
      console.error(err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Security</h2>
      <p className="text-sm text-gray-500 mb-6">Manage password and authentication</p>

      <div className="space-y-3">
        {/* Change Password */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setShowChangePassword(!showChangePassword)}
            className="w-full text-left p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-900">Change Password</div>
                <div className="text-xs text-gray-500">
                  Update your account password
                </div>
              </div>
              <ChevronRightIcon
                className={`w-4 h-4 text-gray-400 transition-transform ${
                  showChangePassword ? 'rotate-90' : ''
                }`}
              />
            </div>
          </button>

          {showChangePassword && (
            <div className="px-4 pb-4 border-t border-gray-100 pt-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    {showNew ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    {showConfirm ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {validationError && (
                <p className="text-sm text-red-500 flex items-center gap-1">
                  <AlertCircleIcon className="w-4 h-4" /> {validationError}
                </p>
              )}
              {saveStatus === 'success' && (
                <p className="text-sm text-green-600 flex items-center gap-1">
                  <CheckCircleIcon className="w-4 h-4" /> Password changed successfully
                </p>
              )}
              {saveStatus === 'error' && (
                <p className="text-sm text-red-500 flex items-center gap-1">
                  <AlertCircleIcon className="w-4 h-4" /> Failed to change password. Try again.
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowChangePassword(false);
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                    setValidationError('');
                    setSaveStatus('idle');
                  }}
                  className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleChangePassword}
                  disabled={saveStatus === 'saving'}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 text-sm"
                >
                  {saveStatus === 'saving' && (
                    <LoaderIcon className="w-4 h-4 animate-spin" />
                  )}
                  {saveStatus === 'saving' ? 'Updating…' : 'Update Password'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Active Sessions — informational, Flowable doesn't expose a sessions API */}
        <div className="p-4 border border-gray-200 rounded-lg bg-gray-50">
          <div className="text-sm font-medium text-gray-900">Active Sessions</div>
          <div className="text-xs text-gray-500 mt-0.5">
            Session management is handled by your Flowable server. Log out and log back in to reset all sessions.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TAB: Appearance
// Reads + updates userPreferencesWorkflow (theme)
// ─────────────────────────────────────────────────────────────
function AppearanceTab() {
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    getUserPreferences(CURRENT_USER_ID)
      .then((p) => {
        if (p) {
          setPrefs(p);
          setTheme(p.theme || 'light');
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      await saveUserPreferences({
        userId:        CURRENT_USER_ID,
        emailNotif:    prefs?.emailNotif    ?? true,
        pushNotif:     prefs?.pushNotif     ?? false,
        reminderNotif: prefs?.reminderNotif ?? true,
        language:      prefs?.language      || 'English (India)',
        currency:      prefs?.currency      || 'INR (₹)',
        dateFormat:    prefs?.dateFormat    || 'DD-MMM-YYYY',
        theme,
      });
      setSaveStatus('success');
    } catch (err) {
      console.error(err);
      setSaveStatus('error');
    }
    setTimeout(() => setSaveStatus('idle'), 3000);
  };

  if (loading) return <SectionLoader />;

  const themes = [
    {
      id: 'light',
      label: 'Light',
      preview: <div className="w-full h-16 bg-white border border-gray-200 rounded mb-2" />,
    },
    {
      id: 'dark',
      label: 'Dark',
      preview: <div className="w-full h-16 bg-gray-900 rounded mb-2" />,
    },
    {
      id: 'system',
      label: 'System',
      preview: (
        <div className="w-full h-16 bg-gradient-to-r from-white to-gray-900 rounded mb-2" />
      ),
    },
  ];

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Appearance</h2>
      <p className="text-sm text-gray-500 mb-6">Customize how the app looks</p>

      <div className="grid grid-cols-3 gap-3">
        {themes.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTheme(t.id)}
            className={`p-4 rounded-lg border-2 transition-colors ${
              theme === t.id
                ? 'border-blue-600 bg-blue-50'
                : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t.preview}
            <div className="text-sm font-medium text-gray-900">{t.label}</div>
          </button>
        ))}
      </div>

      <SaveBar status={saveStatus} onSave={handleSave} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TAB: Regional
// Reads + updates userPreferencesWorkflow (language, currency, dateFormat)
// ─────────────────────────────────────────────────────────────
function RegionalTab() {
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);

  const [language, setLanguage] = useState('English (India)');
  const [currency, setCurrency] = useState('INR (₹)');
  const [dateFormat, setDateFormat] = useState('DD-MMM-YYYY');

  useEffect(() => {
    getUserPreferences(CURRENT_USER_ID)
      .then((p) => {
        if (p) {
          setPrefs(p);
          setLanguage(p.language || 'English (India)');
          setCurrency(p.currency || 'INR (₹)');
          setDateFormat(p.dateFormat || 'DD-MMM-YYYY');
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      await saveUserPreferences({
        userId:        CURRENT_USER_ID,
        emailNotif:    prefs?.emailNotif    ?? true,
        pushNotif:     prefs?.pushNotif     ?? false,
        reminderNotif: prefs?.reminderNotif ?? true,
        language,
        currency,
        dateFormat,
        theme: prefs?.theme || 'light',
      });
      setSaveStatus('success');
    } catch (err) {
      console.error(err);
      setSaveStatus('error');
    }
    setTimeout(() => setSaveStatus('idle'), 3000);
  };

  if (loading) return <SectionLoader />;

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Regional Settings</h2>
      <p className="text-sm text-gray-500 mb-6">Language, currency, and date format</p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="English (India)">English (India)</option>
            <option value="Hindi">Hindi</option>
            <option value="English (US)">English (US)</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="INR (₹)">INR (₹)</option>
            <option value="USD ($)">USD ($)</option>
            <option value="EUR (€)">EUR (€)</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date Format</label>
          <select
            value={dateFormat}
            onChange={(e) => setDateFormat(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="DD-MMM-YYYY">DD-MMM-YYYY (25-May-2024)</option>
            <option value="DD/MM/YYYY">DD/MM/YYYY</option>
            <option value="MM/DD/YYYY">MM/DD/YYYY</option>
            <option value="YYYY-MM-DD">YYYY-MM-DD (ISO)</option>
          </select>
        </div>
      </div>

      <SaveBar status={saveStatus} onSave={handleSave} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN Settings component
// ─────────────────────────────────────────────────────────────
export function Settings() {
  const [activeTab, setActiveTab] = useState('profile');

  const sections = [
    { id: 'profile',       label: 'Profile',       icon: UserIcon },
    { id: 'organization',  label: 'Organization',  icon: Building2Icon },
    { id: 'notifications', label: 'Notifications', icon: BellIcon },
    { id: 'security',      label: 'Security',       icon: LockIcon },
    { id: 'appearance',    label: 'Appearance',     icon: PaletteIcon },
    { id: 'regional',      label: 'Regional',       icon: GlobeIcon },
  ];

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your account and organization preferences
        </p>
      </div>

      <div className="grid grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="col-span-1">
          <nav className="bg-white rounded-lg shadow-sm border border-gray-200 p-2">
            {sections.map((section) => {
              const Icon = section.icon;
              const isActive = activeTab === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveTab(section.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4" />
                    <span>{section.label}</span>
                  </div>
                  {isActive && <ChevronRightIcon className="w-4 h-4" />}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="col-span-3">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            {activeTab === 'profile'       && <ProfileTab />}
            {activeTab === 'organization'  && <OrganizationTab />}
            {activeTab === 'notifications' && <NotificationsTab />}
            {activeTab === 'security'      && <SecurityTab />}
            {activeTab === 'appearance'    && <AppearanceTab />}
            {activeTab === 'regional'      && <RegionalTab />}
          </div>
        </div>
      </div>
    </div>
  );
}