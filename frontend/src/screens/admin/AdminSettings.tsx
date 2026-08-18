import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, Image } from 'react-native';
import { Building2, QrCode, AlertTriangle } from 'lucide-react-native';
import { ERPData } from '../../storage';
import { useAppContext } from '../../context/AppContext';
import { settingsApi } from '../../api/endpoints';
import { pickImageAsDataUri } from '../../utils/imagePicker';
import ConfirmModal from '../../components/common/ConfirmModal';

interface AdminSettingsProps {
  data: ERPData;
  setData: (updater: ERPData | ((prev: ERPData) => ERPData)) => void;
  showAlert: (opts: any) => void;
}

const inputClass = "w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs text-slate-800";

// Business Details - the company name/GSTIN/phone/email printed on every
// PDF and Excel export this app generates (order invoices, dashboard
// reports, GRNs, purchase orders, ...). Editing here updates the single
// CompanyProfile row in the DB; every export reads it via pdfTemplate.ts's
// getBrandName()/getBrandGstin()/getBrandPhone()/getBrandEmail(), refreshed
// on every data load - see storage.ts's loadAllData() and
// configureBrandProfile()'s own comment for why that indirection exists.
export default function AdminSettings({ data, setData, showAlert }: AdminSettingsProps) {
  const { refreshData } = useAppContext();
  const [form, setForm] = useState(data.companyProfile);
  const [saving, setSaving] = useState(false);

  const isDirty =
    form.name !== data.companyProfile.name ||
    form.gstin !== data.companyProfile.gstin ||
    form.phone !== data.companyProfile.phone ||
    form.email !== data.companyProfile.email;

  const handleSave = async () => {
    if (!form.name.trim() || !form.gstin.trim() || !form.phone.trim() || !form.email.trim()) {
      showAlert('All business details fields are required.');
      return;
    }
    setSaving(true);
    try {
      const updated = await settingsApi.updateCompanyProfile(form);
      setData(prev => ({ ...prev, companyProfile: updated }));
      await refreshData();
      showAlert('Business details updated. Every new invoice, report, and export will now use these details.');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to update business details.');
    } finally {
      setSaving(false);
    }
  };

  // Moved here from Payments & UPI QR (see AdminSales.tsx) - this is a
  // business/system setting like the profile above, not a per-payment
  // action, and now lives alongside it. Reads/writes data.qrCodeSettings
  // directly (no separate local mirror) so any other screen reading it
  // (order/pre-booking bill generation) sees the change immediately via the
  // normal setData/refreshData flow, without needing to also stay in sync
  // with a second copy of the same settings object.
  const [removeQrConfirmVisible, setRemoveQrConfirmVisible] = useState(false);
  const qrSettings = data.qrCodeSettings;

  const handleUploadQRImage = async () => {
    const uri = await pickImageAsDataUri(showAlert);
    if (!uri) return;
    try {
      const updated = await settingsApi.updateQr({ image_url: uri });
      setData(prev => ({ ...prev, qrCodeSettings: updated }));
      await refreshData();
      showAlert('Custom QR code image uploaded successfully.');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to upload QR code image.');
    }
  };

  const handleRemoveQRImage = async () => {
    setRemoveQrConfirmVisible(false);
    try {
      const updated = await settingsApi.updateQr({ image_url: '' });
      setData(prev => ({ ...prev, qrCodeSettings: updated }));
      await refreshData();
      showAlert('QR code image removed.');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to remove QR code image.');
    }
  };

  const handleToggleQR = async () => {
    try {
      const updated = await settingsApi.updateQr({ is_enabled: !qrSettings.is_enabled });
      setData(prev => ({ ...prev, qrCodeSettings: updated }));
      await refreshData();
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to update QR settings.');
    }
  };

  return (
    <View className="gap-4">
      <View className="bg-white p-4 lg:p-6 rounded-2xl border border-slate-200 gap-4 w-full lg:max-w-2xl lg:self-center">
        <View className="flex-row items-center gap-2 border-b border-slate-100 pb-2">
          <View className="w-8 h-8 bg-indigo-50 border border-indigo-100 rounded-xl items-center justify-center">
            <Building2 size={16} color="#6366f1" />
          </View>
          <View>
            <Text className="font-extrabold text-slate-800 text-sm">Business Details</Text>
            <Text className="text-[9px] text-slate-400">Shown on every invoice, report, and export</Text>
          </View>
        </View>

        <View className="gap-3">
          <View>
            <Text className="font-bold text-slate-500 mb-1 text-xs">Business / Company Name</Text>
            <TextInput
              value={form.name}
              onChangeText={v => setForm({ ...form, name: v })}
              placeholder="e.g. Mayben Traders"
              placeholderTextColor="#94a3b8"
              className={inputClass}
            />
          </View>

          <View>
            <Text className="font-bold text-slate-500 mb-1 text-xs">GSTIN</Text>
            <TextInput
              value={form.gstin}
              onChangeText={v => setForm({ ...form, gstin: v.toUpperCase() })}
              placeholder="e.g. 27AAAAA1111A1Z1"
              placeholderTextColor="#94a3b8"
              autoCapitalize="characters"
              className={inputClass}
            />
          </View>

          <View className="flex-row gap-2">
            <View className="flex-1">
              <Text className="font-bold text-slate-500 mb-1 text-xs">Phone</Text>
              <TextInput
                value={form.phone}
                onChangeText={v => setForm({ ...form, phone: v })}
                placeholder="e.g. +91 73736 74757"
                placeholderTextColor="#94a3b8"
                keyboardType="phone-pad"
                className={inputClass}
              />
            </View>
            <View className="flex-1">
              <Text className="font-bold text-slate-500 mb-1 text-xs">Email</Text>
              <TextInput
                value={form.email}
                onChangeText={v => setForm({ ...form, email: v })}
                placeholder="e.g. support@maybentraders.in"
                placeholderTextColor="#94a3b8"
                keyboardType="email-address"
                autoCapitalize="none"
                className={inputClass}
              />
            </View>
          </View>
        </View>

        <Pressable
          onPress={handleSave}
          disabled={!isDirty || saving}
          className={`w-full py-2.5 rounded-xl items-center ${!isDirty || saving ? 'bg-slate-100' : 'bg-indigo-600 active:bg-indigo-700'}`}
        >
          <Text className={`font-bold text-xs ${!isDirty || saving ? 'text-slate-400' : 'text-white'}`}>
            {saving ? 'Saving...' : 'Save Business Details'}
          </Text>
        </Pressable>
      </View>

      <View className="bg-white p-4 lg:p-6 rounded-2xl border border-slate-200 gap-4 w-full lg:max-w-2xl lg:self-center">
        <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
          <View className="flex-row items-center gap-2">
            <View className="w-8 h-8 bg-emerald-50 border border-emerald-100 rounded-xl items-center justify-center">
              <QrCode size={16} color="#10b981" />
            </View>
            <View>
              <Text className="font-extrabold text-slate-800 text-sm">UPI QR Code Payments</Text>
              <Text className="text-[9px] text-slate-400">Scan-and-pay receiver setting</Text>
            </View>
          </View>
          <Pressable onPress={handleToggleQR} className={`py-1 px-2 rounded-lg ${qrSettings.is_enabled ? 'bg-emerald-500' : 'bg-slate-200'}`}>
            <Text className={`text-[9px] font-black ${qrSettings.is_enabled ? 'text-white' : 'text-slate-500'}`}>{qrSettings.is_enabled ? 'ENABLED' : 'DISABLED'}</Text>
          </Pressable>
        </View>

        <View className="items-center gap-3">
          {qrSettings.image_url ? (
            <Image source={{ uri: qrSettings.image_url }} className="w-32 h-32 rounded-2xl border border-slate-200" />
          ) : (
            <View className="w-32 h-32 rounded-2xl border border-dashed border-slate-300 bg-slate-50 items-center justify-center">
              <QrCode size={28} color="#94a3b8" />
              <Text className="text-[8px] font-bold text-slate-400 mt-1.5 text-center px-2">No QR Code Uploaded</Text>
            </View>
          )}
          <View className="w-full flex-row gap-2">
            <Pressable onPress={handleUploadQRImage} className="flex-1 py-2.5 bg-white border border-slate-200 rounded-xl items-center active:bg-slate-50"><Text className="text-[10px] font-bold text-slate-700">Upload QR Code</Text></Pressable>
            <Pressable onPress={() => setRemoveQrConfirmVisible(true)} className="flex-1 py-2.5 bg-rose-50 border border-rose-200 rounded-xl items-center active:bg-rose-100"><Text className="text-[10px] font-bold text-rose-600">Remove QR Code</Text></Pressable>
          </View>
        </View>
      </View>

      <ConfirmModal
        visible={removeQrConfirmVisible}
        onClose={() => setRemoveQrConfirmVisible(false)}
        icon={AlertTriangle}
        title="Remove QR Code Image?"
        message="Are you sure you want to remove the custom UPI QR code image? Store owners scanning to pay will no longer see it until a new one is uploaded."
        confirmLabel="Yes, Remove"
        cancelLabel="No, Keep"
        onConfirm={handleRemoveQRImage}
      />
    </View>
  );
}
