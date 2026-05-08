import type { FileFolder } from './dexieDb'
import { FilesRepository } from './repositories/FilesRepository'

export function resolveNextFolderName(inputName: string, folders: FileFolder[]): string {
  const trimmed = inputName.trim()
  let finalName = trimmed
  let counter = 2

  while (folders.some((folder) => folder.name.trim().toLowerCase() === finalName.toLowerCase())) {
    finalName = `${trimmed} (${counter})`
    counter += 1
  }

  return finalName
}

export async function createManagedFolder(
  inputName: string,
  folders: FileFolder[]
): Promise<string> {
  const finalName = resolveNextFolderName(inputName, folders)
  return FilesRepository.addFolder(finalName)
}

export async function deleteManagedFolder(folderId: string): Promise<void> {
  await FilesRepository.deleteFolder(folderId)
}
