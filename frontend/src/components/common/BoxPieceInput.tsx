import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput } from 'react-native';
import { BoxPieceQty } from '../../types';
import { normalizeQty } from '../../utils/qty';

interface BoxPieceInputProps {
  value: BoxPieceQty;
  onChange: (next: BoxPieceQty) => void;
  piecesPerBox: number;
  disabled?: boolean;
  // Smaller sizing for tight table cells (vs. the default modal/form size).
  compact?: boolean;
}

// Two side-by-side number fields (boxes / loose pieces) used everywhere a
// stock quantity is entered - Receive Stock, Correction, Load/Dispatch,
// Truck Transfer, Return Stock, Order/Pre-booking item entry.
//
// The pieces field is typed as one continuous number (e.g. "100"), which may
// need to carry into extra boxes once it's finished (e.g. 100 pcs of a
// 10-pc box -> 10 boxes, 0 pcs). Carrying on every keystroke would normalize
// mid-number - the instant a partial value like "10" reaches piecesPerBox it
// would already snap down to "1 box, 0 pcs" and erase itself, making it
// impossible to type past the box size at all. So the on-screen text is
// tracked locally and the carry is only computed once, on blur (or Enter) -
// exactly when the user has finished typing the number, not before.
export default function BoxPieceInput({ value, onChange, piecesPerBox, disabled, compact }: BoxPieceInputProps) {
  const boxWidth = compact ? 'w-11' : 'w-14';
  const pieceWidth = compact ? 'w-11' : 'w-14';
  const textSize = compact ? 'text-[11px]' : 'text-xs';

  const [piecesText, setPiecesText] = useState(String(value.pieces));
  const piecesFocused = useRef(false);
  useEffect(() => {
    if (!piecesFocused.current) setPiecesText(String(value.pieces));
  }, [value.pieces]);

  const commitPieces = () => {
    const n = piecesText === '' ? 0 : Number(piecesText);
    onChange(normalizeQty({ boxes: value.boxes, pieces: n }, piecesPerBox));
  };

  return (
    <View className="flex-row items-center gap-1">
      <TextInput
        keyboardType="number-pad"
        editable={!disabled}
        value={String(value.boxes)}
        onChangeText={v => {
          const n = v.replace(/[^0-9]/g, '');
          onChange(normalizeQty({ boxes: n === '' ? 0 : Number(n), pieces: value.pieces }, piecesPerBox));
        }}
        className={`${boxWidth} bg-white border border-slate-200 rounded p-1 text-center font-bold ${textSize} text-slate-800`}
      />
      <Text className="text-[9px] text-slate-400 font-semibold">box</Text>
      <TextInput
        keyboardType="number-pad"
        editable={!disabled}
        value={piecesText}
        onFocus={() => { piecesFocused.current = true; }}
        onChangeText={v => {
          const digits = v.replace(/[^0-9]/g, '');
          setPiecesText(digits);
          // Propagate the raw (un-normalized) value immediately so anything
          // reading `value` right after a keystroke - e.g. a nearby button
          // pressed without first blurring this field - sees the typed
          // quantity instead of a stale 0. Left un-normalized on purpose:
          // normalizing here (carrying pieces >= piecesPerBox into boxes)
          // would snap a still-being-typed number like "10" -> "100" out
          // from under the user. commitPieces() below does that carry-over
          // once they've actually finished typing (blur/Enter).
          onChange({ boxes: value.boxes, pieces: digits === '' ? 0 : Number(digits) });
        }}
        onBlur={() => { piecesFocused.current = false; commitPieces(); }}
        onSubmitEditing={commitPieces}
        className={`${pieceWidth} bg-white border border-slate-200 rounded p-1 text-center font-bold ${textSize} text-slate-800`}
      />
      <Text className="text-[9px] text-slate-400 font-semibold">pcs</Text>
    </View>
  );
}
