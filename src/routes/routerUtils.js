export function isActivePath(currentPath, targetPath) {
  if (targetPath === '/') {
    return currentPath === targetPath
  }

  return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`)
}
