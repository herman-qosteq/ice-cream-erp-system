#pragma once

#include "pch.h"
#include "NativeModules.h"

namespace winrt::IceCreamErp {

// Windows has no equivalent of expo-file-system/expo-sharing (see
// src/utils/reportExport.ts, excelExport.ts, documentPicker.ts), so PDF/
// Excel/bill exports had no way to reach disk on this platform. This module
// writes base64 content straight to the user's Documents\FrostyFlow Exports
// folder and returns the path, which the JS side then shows in an alert -
// no native "Save As" picker, just a real file the user can go open.
REACT_MODULE(FileSaveModule, L"FileSaveModule")
struct FileSaveModule {
  // fileName: desired file name (collisions get a generated suffix, never overwritten).
  // base64Content: raw base64 payload (no "data:...;base64," prefix - strip that on the JS side).
  // Resolves with the full saved path, or rejects with an error message.
  REACT_METHOD(SaveFile, L"saveFile")
  winrt::fire_and_forget SaveFile(
      std::wstring fileName,
      std::wstring base64Content,
      winrt::Microsoft::ReactNative::ReactPromise<std::wstring> promise) noexcept;
};

} // namespace winrt::IceCreamErp
