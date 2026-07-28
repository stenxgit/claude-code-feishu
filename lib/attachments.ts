/**
 * Attachment filename handling.
 *
 * Both `file_key` and `file_name` arrive inside the message body, i.e. they
 * are fully attacker-controlled by whoever sends the bot a file. They used to
 * be interpolated straight into an inbox path, so a file named
 * `x.../../../.bashrc` produced an extension of `.../../../.bashrc` and let a
 * sender write outside the inbox. Everything that reaches the filesystem now
 * goes through here.
 */

/** Characters that are never allowed in a generated attachment name. */
const UNSAFE_CHARS = /[^A-Za-z0-9._-]/g

/** Extensions are conservative on purpose: short, alphanumeric, single dot. */
const SAFE_EXTENSION = /^\.[A-Za-z0-9]{1,12}$/

/**
 * Extract a safe extension from a user-supplied file name, or null when the
 * name has none we're willing to trust.
 */
export function safeExtension(fileName?: string): string | null {
  if (!fileName) return null
  // Take the basename first so `a/b.png` can't smuggle a separator through.
  const base = fileName.split(/[\\/]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return null
  const ext = base.slice(dot).toLowerCase()
  return SAFE_EXTENSION.test(ext) ? ext : null
}

/**
 * Build the on-disk name for a downloaded attachment. The result is always a
 * plain basename — no separators, no `..`, no leading dot.
 */
export function attachmentFileName(
  timestamp: number,
  fileKey: string,
  type: 'file' | 'image',
  fileName?: string,
): string {
  const key = fileKey.replace(UNSAFE_CHARS, '_').replace(/^\.+/, '').slice(0, 64) || 'attachment'
  const ext = safeExtension(fileName) ?? (type === 'image' ? '.png' : '.bin')
  return `${timestamp}-${key}${ext}`
}

/** Strip characters that would break the `(name)` display form in tool output. */
export function safeFileName(name: string): string {
  return name.replace(/[\[\]\r\n;]/g, '_')
}
