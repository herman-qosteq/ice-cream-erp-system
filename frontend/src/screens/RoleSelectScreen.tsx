import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, Image, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { LogIn, Lock, Phone, Eye, EyeOff } from 'lucide-react-native';
import { User } from '../types';
import BrandLogo from '../components/common/BrandLogo';

interface RoleSelectProps {
  login: (identifier: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  setCurrentUser: (user: User | null) => void;
}

export default function RoleSelectScreen({ login, setCurrentUser }: RoleSelectProps) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<'Admin' | 'Salesperson' | 'Warehouse'>('Admin');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async () => {
    setError('');

    const trimmedPhone = phone.trim();
    const trimmedPassword = password.trim();

    if (!trimmedPhone || !trimmedPassword) {
      setError('Please enter both your Phone/Username and Password.');
      return;
    }

    setSubmitting(true);
    const result = await login(trimmedPhone, trimmedPassword);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error ?? 'Invalid credentials. Please verify your phone/name and password.');
    }
  };

  const roles = ['Admin', 'Salesperson', 'Warehouse'] as const;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-sky-50"
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingVertical: 32, justifyContent: 'center' }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="w-full md:max-w-md md:self-center md:bg-white md:rounded-3xl md:border md:border-white/60 md:shadow-2xl md:p-10 md:justify-center">
        {/* Top Brand Logo */}
        <View className="items-center mt-4 md:mt-0">
          <View className="w-20 h-20 bg-white rounded-full items-center justify-center relative border border-white/50 mb-4 md:shadow-sm">
            <BrandLogo className="text-4xl" size={56} />
            <View className="absolute -bottom-1 -right-1 bg-blue-100 px-2 py-0.5 rounded-full border border-white shadow-sm">
              <Text className="text-blue-700 font-bold text-[9px]">ERP</Text>
            </View>
          </View>
          <Text className="text-2xl font-black text-slate-800 tracking-tight">FrostyFlow ERP</Text>
          <Text className="text-xs text-slate-500 mt-1.5 text-center max-w-[220px] font-medium leading-relaxed">
            Ice Cream Distribution Logistics & Supply Chain Management
          </Text>
        </View>

        {/* Main Login Form */}
        <View className="mt-4">
          {/* Role Selector Tabs */}
          {/* <View className="mb-4">
            <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              Select Your Role
            </Text>
            <View className="flex-row bg-white border border-white/50 p-1 rounded-xl">
              {roles.map(role => (
                <Pressable
                  key={role}
                  onPress={() => setSelectedRole(role)}
                  className={`flex-1 py-2 rounded-lg items-center ${selectedRole === role ? 'bg-blue-600' : ''}`}
                >
                  <Text className={`text-xs font-bold ${selectedRole === role ? 'text-white' : 'text-slate-600'}`}>
                    {role === 'Salesperson' ? 'Driver' : role}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View> */}

          {/* Input Fields */}
          <View className="gap-3">
            <View>
              <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                Phone Number or Name
              </Text>
              <View className="relative justify-center">
                <View className="absolute left-3 z-10">
                  <Phone size={16} color="#94a3b8" />
                </View>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="e.g. Rohit Verma or Admin"
                  placeholderTextColor="#94a3b8"
                  className="w-full pl-9 pr-4 py-2.5 bg-white border border-white/50 rounded-xl text-xs text-slate-800 font-medium"
                />
              </View>
            </View>

            <View>
              <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                Password
              </Text>
              <View className="relative justify-center">
                <View className="absolute left-3 z-10">
                  <Lock size={16} color="#94a3b8" />
                </View>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry={!showPassword}
                  className="w-full pl-9 pr-10 py-2.5 bg-white border border-white/50 rounded-xl text-xs text-slate-800"
                />
                <Pressable
                  onPress={() => setShowPassword(!showPassword)}
                  className="absolute right-3"
                  hitSlop={8}
                >
                  {showPassword ? <EyeOff size={16} color="#94a3b8" /> : <Eye size={16} color="#94a3b8" />}
                </Pressable>
              </View>
            </View>
          </View>

          {/* Error text */}
          {!!error && (
            <View className="mt-2 bg-rose-50/70 p-2 rounded-lg border border-rose-200/50">
              <Text className="text-[11px] text-rose-600 font-bold">{error}</Text>
            </View>
          )}

          {/* Submit Button */}
          <Pressable
            onPress={handleLogin}
            disabled={submitting}
            className={`w-full mt-4 bg-blue-600 py-2.5 px-4 rounded-xl flex-row items-center justify-center gap-2 active:bg-blue-700 ${submitting ? 'opacity-60' : ''}`}
          >
            <LogIn size={16} color="#fff" />
            <Text className="text-white font-bold text-xs">{submitting ? 'Signing In...' : 'Unlock ERP Panel'}</Text>
          </Pressable>
        </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
