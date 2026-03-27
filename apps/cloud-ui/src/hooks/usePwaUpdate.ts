/**
 * Hook to manage PWA update lifecycle.
 * TODO(cloud-pwa): Restore Workbox/PWA registration here if Cloud later needs
 * offline/installable behavior. For now Cloud keeps this hook as a no-op to
 * avoid service-worker cache/debugging complexity.
 */
export function usePwaUpdate() {
  return {
    needRefresh: false,
    updateServiceWorker: async (_reloadPage?: boolean) => {},
  }
}
