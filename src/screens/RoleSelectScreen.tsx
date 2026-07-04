import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, Image, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { LogIn, Lock, Phone, HelpCircle, Eye, EyeOff } from 'lucide-react-native';
import { ERPData } from '../storage';
import { User } from '../types';

interface RoleSelectProps {
  data: ERPData;
  setCurrentUser: (user: User | null) => void;
}

export default function RoleSelectScreen({ data, setCurrentUser }: RoleSelectProps) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<'Admin' | 'Salesperson' | 'Warehouse'>('Admin');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = () => {
    setError('');

    const trimmedPhone = phone.trim();
    const trimmedPassword = password.trim();

    if (!trimmedPhone || !trimmedPassword) {
      setError('Please enter both your Phone/Username and Password.');
      return;
    }

    const cleanInputPhone = trimmedPhone.replace(/\D/g, '');

    const matchesUser = (u: User) => {
      const isPhoneMatch = u.phone === trimmedPhone ||
        (cleanInputPhone.length > 0 && u.phone.replace(/\D/g, '').includes(cleanInputPhone));

      const isNameMatch = u.name.toLowerCase().includes(trimmedPhone.toLowerCase()) ||
        trimmedPhone.toLowerCase().includes(u.name.toLowerCase());

      const isPasswordMatch = u.password_hash === trimmedPassword;

      return (isPhoneMatch || isNameMatch) && isPasswordMatch;
    };

    let foundUser = data.users.find(u => matchesUser(u) && u.role === selectedRole);

    if (!foundUser) {
      foundUser = data.users.find(u => matchesUser(u));
      if (foundUser) {
        setSelectedRole(foundUser.role);
      }
    }

    if (foundUser) {
      if (foundUser.status === 'Inactive') {
        setError('Your user account has been disabled. Please contact the administrator.');
        return;
      }
      setCurrentUser(foundUser);
    } else {
      setError('Invalid credentials. Please verify your phone/name and password, or use the fast-pass shortcuts below.');
    }
  };

  const handleShortcutLogin = (role: 'Admin' | 'Salesperson' | 'Warehouse') => {
    const matchedUser = data.users.find(u => u.role === role);
    if (matchedUser) {
      setCurrentUser(matchedUser);
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
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingVertical: 32, justifyContent: 'space-between' }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Top Brand Logo */}
        <View className="items-center mt-4">
          <View className="w-20 h-20 bg-white rounded-full items-center justify-center relative border border-white/50 mb-4">
            <Text className="text-4xl">🍦</Text>
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
          <View className="mb-4">
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
          </View>

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
                  placeholder="e.g. David Miller or Admin"
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
            className="w-full mt-4 bg-blue-600 py-2.5 px-4 rounded-xl flex-row items-center justify-center gap-2 active:bg-blue-700"
          >
            <LogIn size={16} color="#fff" />
            <Text className="text-white font-bold text-xs">Unlock ERP Panel</Text>
          </Pressable>
        </View>

        {/* Shortcuts evaluation helper */}
        <View className="mt-4 border-t border-white/30 pt-3">
          <View className="flex-row items-center gap-1 mb-1.5">
            <HelpCircle size={14} color="#94a3b8" />
            <Text className="text-[9px] uppercase font-bold tracking-wider text-slate-400">Fast-Pass Bypass Panel</Text>
          </View>
          <Text className="text-[9px] text-slate-400 mb-2 leading-relaxed font-medium">
            Instantly bypass credentials as pre-seeded roles:
          </Text>
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => handleShortcutLogin('Admin')}
              className="flex-1 py-1.5 px-2 bg-pink-100/60 rounded-lg border border-pink-200/50 items-center"
            >
              <Text className="text-pink-700 text-[9px] font-extrabold">Sarah (Admin)</Text>
            </Pressable>
            <Pressable
              onPress={() => handleShortcutLogin('Salesperson')}
              className="flex-1 py-1.5 px-2 bg-blue-100/60 rounded-lg border border-blue-200/50 items-center"
            >
              <Text className="text-blue-700 text-[9px] font-extrabold">David (Driver)</Text>
            </Pressable>
            <Pressable
              onPress={() => handleShortcutLogin('Warehouse')}
              className="flex-1 py-1.5 px-2 bg-emerald-100/60 rounded-lg border border-emerald-200/50 items-center"
            >
              <Text className="text-emerald-700 text-[9px] font-extrabold">Robert (WH)</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
