/** Window settings, kept free of Electron imports so a unit test can pin the security-relevant ones. */
export function windowOptions(preloadPath: string) {
  return {
    width: 1280,
    height: 860,
    minWidth: 560,
    minHeight: 480,
    backgroundColor: '#121314',
    title: 'Plchldr',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // The timer must keep honest time while the window is covered or minimised.
      backgroundThrottling: false,
    },
  };
}
