#include "pch.h"
#include "FileSaveModule.h"

#include <winrt/Windows.Security.Cryptography.h>
#include <winrt/Windows.Storage.h>

using namespace winrt;
using namespace winrt::Windows::Storage;
using namespace winrt::Windows::Security::Cryptography;

namespace winrt::IceCreamErp {

winrt::fire_and_forget FileSaveModule::SaveFile(
    std::wstring fileName,
    std::wstring base64Content,
    winrt::Microsoft::ReactNative::ReactPromise<std::wstring> promise) noexcept {
  try {
    auto documentsFolder = KnownFolders::DocumentsLibrary();
    auto exportsFolder = co_await documentsFolder.CreateFolderAsync(
        L"FrostyFlow Exports", CreationCollisionOption::OpenIfExists);
    auto file = co_await exportsFolder.CreateFileAsync(
        hstring(fileName), CreationCollisionOption::GenerateUniqueName);

    auto buffer = CryptographicBuffer::DecodeFromBase64String(hstring(base64Content));
    co_await FileIO::WriteBufferAsync(file, buffer);

    promise.Resolve(std::wstring(file.Path()));
  } catch (winrt::hresult_error const &ex) {
    winrt::Microsoft::ReactNative::ReactError error;
    error.Code = "E_SAVE_FAILED";
    error.Message = winrt::to_string(ex.message());
    promise.Reject(error);
  } catch (...) {
    winrt::Microsoft::ReactNative::ReactError error;
    error.Code = "E_SAVE_FAILED";
    error.Message = "Failed to save the file.";
    promise.Reject(error);
  }
}

} // namespace winrt::IceCreamErp
