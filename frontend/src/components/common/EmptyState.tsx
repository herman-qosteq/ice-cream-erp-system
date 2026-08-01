import React from 'react';
import { View, Text } from 'react-native';

interface EmptyStateProps {
  message: string;
}

// Shared "no records" box for every primary list/grid across the app - the
// Central Alert Notifications Center's table+grid emptiness was the one
// screen that got this right everywhere else: flex-1 so that inside a
// fixed-height <ScrollableSection> (whose ScrollView content container is
// flexGrow:1) this centers within the FULL fixed height instead of sitting
// as a short block pinned to the top with dead space visibly unaccounted-for
// underneath it, and minHeight as the fallback for the (common) case of a
// list rendered directly in a plain, auto-height View with no such ancestor -
// without it the box collapses to a tiny stub instead of the footprint a
// real table/grid of records would occupy. See DataTable.tsx, which uses
// this same treatment for the table view of every list.
export default function EmptyState({ message }: EmptyStateProps) {
  return (
    <View className="flex-1 w-full items-center justify-center bg-white border border-slate-200 rounded-2xl py-8" style={{ minHeight: 240 }}>
      <Text className="text-center text-slate-400 italic text-xs">{message}</Text>
    </View>
  );
}
