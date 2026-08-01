import { NativeModules, Platform } from 'react-native';

interface FileSaveModuleType {
  saveFile(fileName: string, base64Content: string): Promise<string>;
}

// Backed by windows/IceCreamErp/FileSaveModule.cpp - a small custom native
// module, since neither expo-file-system nor expo-sharing exist on Windows.
// Writes to Documents\FrostyFlow Exports and returns the saved path; there's
// no native "Save As" picker, callers show the returned path to the user.
const FileSaveModule = Platform.OS === 'windows' ? (NativeModules.FileSaveModule as FileSaveModuleType | undefined) : undefined;

function stripDataUriPrefix(value: string): string {
  const idx = value.indexOf('base64,');
  return idx === -1 ? value : value.slice(idx + 'base64,'.length);
}

export async function saveFileOnWindows(base64OrDataUri: string, fileName: string): Promise<string> {
  if (!FileSaveModule) {
    throw new Error('File saving is only available on Windows.');
  }
  return FileSaveModule.saveFile(fileName, stripDataUriPrefix(base64OrDataUri));
}
