export interface FrameworkStatus {
  nextjsDetected: boolean;
  reactDetected: boolean;
  hmrStatus: 'connected' | 'disconnected' | 'error' | 'unknown';
  hasErrorOverlay: boolean;
  errorOverlayMessage: string | null;
  hasReactErrorBoundary: boolean;
  hasBuildError: boolean;
}

let status: FrameworkStatus = {
  nextjsDetected: false,
  reactDetected: false,
  hmrStatus: 'unknown',
  hasErrorOverlay: false,
  errorOverlayMessage: null,
  hasReactErrorBoundary: false,
  hasBuildError: false,
};

let observer: MutationObserver | null = null;

export function getFrameworkStatus(): FrameworkStatus {
  // One-time detection
  if (!status.nextjsDetected) {
    status.nextjsDetected = !!(
      document.querySelector('script[src*="/_next/"]') ||
      document.getElementById('__next') ||
      (window as any).__NEXT_DATA__
    );
  }
  if (!status.reactDetected) {
    status.reactDetected = !!(
      document.querySelector('[data-reactroot]') ||
      document.getElementById('__next') ||
      document.getElementById('root')
    );
  }

  // Check for error overlays
  checkErrorOverlay();

  return { ...status };
}

function checkErrorOverlay() {
  // Next.js error overlay
  const nextOverlay = document.querySelector('nextjs-portal') ||
    document.querySelector('[data-nextjs-dialog]') ||
    document.querySelector('#nextjs__container_errors_');

  if (nextOverlay) {
    status.hasErrorOverlay = true;
    status.hasBuildError = true;
    const errorText = nextOverlay.textContent?.trim().slice(0, 1000) || null;
    status.errorOverlayMessage = errorText;
  } else {
    status.hasErrorOverlay = false;
    status.errorOverlayMessage = null;
    status.hasBuildError = false;
  }

  // React error boundary detection
  const errorBoundary = document.querySelector('[data-error-boundary]') ||
    document.querySelector('.error-boundary');
  status.hasReactErrorBoundary = !!errorBoundary;
}

export function classifyHmrLog(message: string): void {
  if (/\[HMR\] connected/i.test(message)) status.hmrStatus = 'connected';
  else if (/\[HMR\].*error/i.test(message)) status.hmrStatus = 'error';
  else if (/\[HMR\].*disconnected/i.test(message)) status.hmrStatus = 'disconnected';
  else if (/Fast Refresh.*done/i.test(message)) status.hmrStatus = 'connected';
  else if (/Fast Refresh.*failed/i.test(message)) status.hmrStatus = 'error';
  else if (/Failed to compile/i.test(message)) {
    status.hmrStatus = 'error';
    status.hasBuildError = true;
  }
}

export function startFrameworkDetection(): void {
  if (observer) return;
  observer = new MutationObserver(() => checkErrorOverlay());
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

export function stopFrameworkDetection(): void {
  observer?.disconnect();
  observer = null;
}
