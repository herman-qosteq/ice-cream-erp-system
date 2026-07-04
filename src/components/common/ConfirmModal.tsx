import React from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { LucideIcon, X } from 'lucide-react-native';

interface ConfirmModalProps {
  visible: boolean;
  onClose: () => void;
  icon?: LucideIcon;
  iconBg?: string;
  iconColor?: string;
  title: string;
  message: string;
  confirmLabel: string;
  confirmColor?: string;
  onConfirm: () => void;
  cancelLabel?: string;
}

export default function ConfirmModal({
  visible, onClose, icon: Icon, iconBg = 'bg-rose-50', iconColor = '#f43f5e',
  title, message, confirmLabel, confirmColor = 'bg-rose-500', onConfirm, cancelLabel = 'Cancel',
}: ConfirmModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-slate-900/60 items-center justify-center p-4">
        <View className="bg-white w-full max-w-sm rounded-3xl p-6 relative">
          <Pressable onPress={onClose} className="absolute top-4 right-4 p-1 rounded-full z-10" hitSlop={8}>
            <X size={16} color="#94a3b8" />
          </Pressable>

          <View className="items-center mt-2">
            {Icon && (
              <View className={`w-14 h-14 ${iconBg} rounded-full items-center justify-center mb-4`}>
                <Icon size={24} color={iconColor} />
              </View>
            )}
            <Text className="text-base font-black text-slate-800 tracking-tight text-center">{title}</Text>
            <Text className="text-xs text-slate-500 font-semibold mt-1.5 text-center leading-relaxed">{message}</Text>

            <View className="w-full mt-6 gap-2">
              <Pressable onPress={onConfirm} className={`w-full py-2.5 ${confirmColor} rounded-xl items-center active:opacity-80`}>
                <Text className="text-white font-black text-xs">{confirmLabel}</Text>
              </Pressable>
              <Pressable onPress={onClose} className="w-full py-2.5 bg-slate-100 rounded-xl items-center active:bg-slate-200">
                <Text className="text-slate-700 font-extrabold text-xs">{cancelLabel}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
