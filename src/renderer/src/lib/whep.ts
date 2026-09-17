// Plays a WebRTC stream published by MediaMTX (or any WHEP server) into a video
// element. The signalling request is made by the main process, so the page's
// content-security policy stays untouched.

const ICE_GATHERING_TIMEOUT_MS = 2000

function gatherIce(connection: RTCPeerConnection): Promise<void> {
  return new Promise((resolve) => {
    if (connection.iceGatheringState === 'complete') return resolve()
    const timer = setTimeout(resolve, ICE_GATHERING_TIMEOUT_MS)
    connection.addEventListener('icegatheringstatechange', () => {
      if (connection.iceGatheringState === 'complete') {
        clearTimeout(timer)
        resolve()
      }
    })
  })
}

/**
 * Plays `url` in `video` until `abort` fires. A session that was aborted while
 * it was still being set up never touches the element, so a newer session
 * cannot be left with a dead track. `onEnded` is called once when the stream
 * stops on its own, e.g. because the camera or the server restarted.
 */
export async function playWhepStream(
  url: string,
  video: HTMLVideoElement,
  signal: (url: string, offerSdp: string) => Promise<string>,
  abort: AbortSignal,
  onEnded?: () => void
): Promise<void> {
  const connection = new RTCPeerConnection()
  let stream: MediaStream | null = null
  let over = false
  const stop = (): void => {
    if (over) return
    over = true
    connection.close()
    if (stream && video.srcObject === stream) video.srcObject = null
  }
  const ended = (): void => {
    if (over || abort.aborted) return
    stop()
    onEnded?.()
  }
  abort.addEventListener('abort', stop, { once: true })
  connection.ontrack = (event) => {
    if (abort.aborted) return
    stream = event.streams[0]
    video.srcObject = stream
    for (const track of stream.getVideoTracks()) track.onended = ended
  }
  connection.onconnectionstatechange = () => {
    if (connection.connectionState === 'failed' || connection.connectionState === 'disconnected') {
      ended()
    }
  }
  connection.addTransceiver('video', { direction: 'recvonly' })
  await connection.setLocalDescription(await connection.createOffer())
  await gatherIce(connection)
  if (abort.aborted) return
  const answer = await signal(url, connection.localDescription?.sdp ?? '')
  if (abort.aborted) return
  await connection.setRemoteDescription({ type: 'answer', sdp: answer })
}
