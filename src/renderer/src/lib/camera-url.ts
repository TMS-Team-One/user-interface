// The tester's camera: a MediaMTX WebRTC stream on the Raspberry Pi. The last
// address used is kept in this browser's storage; the Live View plays it and
// the chat hands it to the agent's camera tool.
export const DEFAULT_CAMERA_URL = 'http://100.127.246.75:8889/pcb/'
const CAMERA_URL_KEY = 'cameraUrl'

export function loadCameraUrl(): string {
  try {
    return localStorage.getItem(CAMERA_URL_KEY) ?? DEFAULT_CAMERA_URL
  } catch {
    return DEFAULT_CAMERA_URL
  }
}

export function saveCameraUrl(url: string): void {
  try {
    localStorage.setItem(CAMERA_URL_KEY, url)
  } catch {
    // no storage: the address lasts for this window only
  }
}
