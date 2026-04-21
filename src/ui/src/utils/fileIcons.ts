import { File, FileText, FileImage, FileVideo, FileCode, Archive, Database, Folder } from 'lucide-react';

type IconDef = { icon: typeof File; color: string };

const EXT_MAP: Record<string, IconDef> = {
  // Images
  jpg:  { icon: FileImage, color: 'text-cyan-400' },
  jpeg: { icon: FileImage, color: 'text-cyan-400' },
  png:  { icon: FileImage, color: 'text-cyan-400' },
  gif:  { icon: FileImage, color: 'text-cyan-400' },
  svg:  { icon: FileImage, color: 'text-cyan-400' },
  webp: { icon: FileImage, color: 'text-cyan-400' },
  // Archives
  zip:  { icon: Archive, color: 'text-purple-400' },
  tar:  { icon: Archive, color: 'text-purple-400' },
  gz:   { icon: Archive, color: 'text-purple-400' },
  bz2:  { icon: Archive, color: 'text-purple-400' },
  rar:  { icon: Archive, color: 'text-purple-400' },
  '7z': { icon: Archive, color: 'text-purple-400' },
  // Code
  js:   { icon: FileCode, color: 'text-yellow-300' },
  jsx:  { icon: FileCode, color: 'text-yellow-300' },
  ts:   { icon: FileCode, color: 'text-blue-400' },
  tsx:  { icon: FileCode, color: 'text-blue-400' },
  py:   { icon: FileCode, color: 'text-green-400' },
  rb:   { icon: FileCode, color: 'text-red-400' },
  php:  { icon: FileCode, color: 'text-purple-300' },
  sh:   { icon: FileCode, color: 'text-green-300' },
  bash: { icon: FileCode, color: 'text-green-300' },
  css:  { icon: FileCode, color: 'text-blue-300' },
  html: { icon: FileCode, color: 'text-orange-400' },
  xml:  { icon: FileCode, color: 'text-orange-300' },
  json: { icon: FileCode, color: 'text-yellow-400' },
  yaml: { icon: FileCode, color: 'text-yellow-400' },
  yml:  { icon: FileCode, color: 'text-yellow-400' },
  // Documents
  txt:  { icon: FileText, color: 'text-gray-300' },
  md:   { icon: FileText, color: 'text-gray-300' },
  pdf:  { icon: FileText, color: 'text-red-400' },
  doc:  { icon: FileText, color: 'text-blue-400' },
  docx: { icon: FileText, color: 'text-blue-400' },
  csv:  { icon: FileText, color: 'text-green-300' },
  // Video
  mp4:  { icon: FileVideo, color: 'text-pink-400' },
  mkv:  { icon: FileVideo, color: 'text-pink-400' },
  avi:  { icon: FileVideo, color: 'text-pink-400' },
  mov:  { icon: FileVideo, color: 'text-pink-400' },
  // Database
  sql:  { icon: Database, color: 'text-orange-400' },
  db:   { icon: Database, color: 'text-orange-400' },
  sqlite: { icon: Database, color: 'text-orange-400' },
};

export const FOLDER_ICON: IconDef = { icon: Folder, color: 'text-yellow-400' };

export function getFileIcon(filename: string): IconDef {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MAP[ext] ?? { icon: File, color: 'text-gray-400' };
}
