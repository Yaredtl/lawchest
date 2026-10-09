import { File, FileArchive, FileAudio, FileCode, FileImage, FileSpreadsheet, FileText, FileVideo, Folder, Mail, Presentation } from 'lucide-react'

const GROUPS: { exts: string[]; Icon: typeof File; color: string; bg: string }[] = [
  { exts: ['pdf'], Icon: FileText, color: 'text-red-600', bg: 'bg-red-50' },
  { exts: ['doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'pages'], Icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
  { exts: ['xls', 'xlsx', 'xlsm', 'csv', 'ods', 'numbers'], Icon: FileSpreadsheet, color: 'text-green-700', bg: 'bg-green-50' },
  { exts: ['ppt', 'pptx', 'odp', 'key'], Icon: Presentation, color: 'text-orange-600', bg: 'bg-orange-50' },
  { exts: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'heic', 'tif', 'tiff', 'svg'], Icon: FileImage, color: 'text-purple-600', bg: 'bg-purple-50' },
  { exts: ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'webm'], Icon: FileVideo, color: 'text-pink-600', bg: 'bg-pink-50' },
  { exts: ['mp3', 'wav', 'm4a', 'ogg', 'aac', 'opus'], Icon: FileAudio, color: 'text-teal-600', bg: 'bg-teal-50' },
  { exts: ['zip', 'rar', '7z', 'tar', 'gz'], Icon: FileArchive, color: 'text-amber-700', bg: 'bg-amber-50' },
  { exts: ['eml', 'msg'], Icon: Mail, color: 'text-sky-600', bg: 'bg-sky-50' },
  { exts: ['html', 'xml', 'json', 'js'], Icon: FileCode, color: 'text-stone-600', bg: 'bg-stone-100' }
]

export function fileStyle(ext: string, isDir: boolean): { Icon: typeof File; color: string; bg: string } {
  if (isDir) return { Icon: Folder, color: 'text-brand-600', bg: 'bg-brand-50' }
  return GROUPS.find((g) => g.exts.includes(ext)) ?? { Icon: File, color: 'text-stone-500', bg: 'bg-stone-100' }
}

export function FileIcon({ ext, isDir, className = 'size-6' }: { ext: string; isDir: boolean; className?: string }) {
  const { Icon, color } = fileStyle(ext, isDir)
  return <Icon className={`${className} ${color}`} fill={isDir ? 'currentColor' : 'none'} fillOpacity={isDir ? 0.18 : 0} />
}
