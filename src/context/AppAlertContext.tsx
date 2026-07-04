import React, { createContext, useContext, useState, useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { CheckCircle, XCircle, AlertTriangle, Info, X, Wifi } from 'lucide-react-native';

type AlertType = 'success' | 'error' | 'warning' | 'info' | 'offline';

interface AlertOptions {
  type?: AlertType;
  title?: string;
  message: string;
}

interface AlertState extends AlertOptions {
  visible: boolean;
}

interface AppAlertContextValue {
  showAlert: (opts: AlertOptions | string) => void;
}

const AppAlertContext = createContext<AppAlertContextValue>({ showAlert: () => {} });

export function useAppAlert() {
  return useContext(AppAlertContext);
}

function inferType(message: string): AlertType {
  const lower = message.toLowerCase();
  if (lower.includes('offline') || lower.includes('queued') || lower.includes('network')) return 'offline';
  if (
    lower.includes('error') || lower.includes('fail') || lower.includes('cannot') ||
    lower.includes('invalid') || lower.includes('insufficient') || lower.includes('required') ||
    lower.includes('limit exceeded') || lower.includes('empty')
  ) return 'error';
  if (
    lower.includes('success') || lower.includes('registered') || lower.includes('updated') ||
    lower.includes('confirmed') || lower.includes('completed') || lower.includes('recorded') ||
    lower.includes('scheduled') || lower.includes('cancelled') || lower.includes('downloaded') ||
    lower.includes('loaded') || lower.includes('saved') || lower.includes('toggled') || lower.includes('delivered')
  ) return 'success';
  if (lower.includes('warning') || lower.includes('are you sure')) return 'warning';
  return 'info';
}

const typeConfig: Record<AlertType, {
  icon: React.FC<{ size?: number; color?: string }>;
  iconBg: string;
  iconColor: string;
  titleColor: string;
  btnColor: string;
  accentColor: string;
  title: string;
}> = {
  success: {
    icon: CheckCircle,
    iconBg: 'bg-emerald-50 border-emerald-100',
    iconColor: '#10b981',
    titleColor: 'text-emerald-700',
    btnColor: 'bg-emerald-500',
    accentColor: '#10b981',
    title: 'Success',
  },
  error: {
    icon: XCircle,
    iconBg: 'bg-rose-50 border-rose-100',
    iconColor: '#f43f5e',
    titleColor: 'text-rose-700',
    btnColor: 'bg-rose-500',
    accentColor: '#f43f5e',
    title: 'Error',
  },
  warning: {
    icon: AlertTriangle,
    iconBg: 'bg-amber-50 border-amber-100',
    iconColor: '#f59e0b',
    titleColor: 'text-amber-700',
    btnColor: 'bg-amber-500',
    accentColor: '#f59e0b',
    title: 'Warning',
  },
  info: {
    icon: Info,
    iconBg: 'bg-blue-50 border-blue-100',
    iconColor: '#3b82f6',
    titleColor: 'text-blue-700',
    btnColor: 'bg-blue-500',
    accentColor: '#3b82f6',
    title: 'Notice',
  },
  offline: {
    icon: Wifi,
    iconBg: 'bg-slate-50 border-slate-200',
    iconColor: '#64748b',
    titleColor: 'text-slate-700',
    btnColor: 'bg-slate-600',
    accentColor: '#64748b',
    title: 'Offline Mode',
  },
};

export function AppAlertProvider({ children }: { children: React.ReactNode }) {
  const [alert, setAlert] = useState<AlertState>({ visible: false, message: '', type: 'info' });

  const showAlert = useCallback((opts: AlertOptions | string) => {
    if (typeof opts === 'string') {
      setAlert({ visible: true, message: opts, type: inferType(opts) });
    } else {
      setAlert({
        visible: true,
        message: opts.message,
        type: opts.type ?? inferType(opts.message),
        title: opts.title,
      });
    }
  }, []);

  const dismiss = useCallback(() => {
    setAlert(prev => ({ ...prev, visible: false }));
  }, []);

  const cfg = typeConfig[alert.type ?? 'info'];
  const Icon = cfg.icon;

  return (
    <AppAlertContext.Provider value={{ showAlert }}>
      {children}

      {alert.visible && (
        <Pressable
          onPress={dismiss}
          className="absolute inset-0 z-[9999] items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(15,23,42,0.55)' }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm bg-white rounded-3xl border border-white/70 overflow-hidden shadow-2xl"
          >
            <View className={`h-1 w-full ${cfg.btnColor}`} />

            <Pressable
              onPress={dismiss}
              className="absolute top-3 right-3 z-10 p-1.5 rounded-full"
              hitSlop={8}
            >
              <X size={16} color="#94a3b8" />
            </Pressable>

            <View className="items-center px-6 pt-6 pb-7">
              <View className={`relative w-14 h-14 ${cfg.iconBg} border rounded-full items-center justify-center mb-4`}>
                <Icon size={24} color={cfg.iconColor} />
              </View>

              <Text className={`text-sm font-black tracking-tight ${cfg.titleColor}`}>
                {alert.title ?? cfg.title}
              </Text>

              <Text className="text-xs text-slate-600 font-medium mt-2 leading-relaxed text-center max-w-[260px]">
                {alert.message}
              </Text>

              <Pressable
                onPress={dismiss}
                className={`mt-5 w-full py-2.5 ${cfg.btnColor} rounded-xl items-center active:opacity-80`}
              >
                <Text className="text-white text-xs font-black">OK, Got It</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      )}
    </AppAlertContext.Provider>
  );
}
