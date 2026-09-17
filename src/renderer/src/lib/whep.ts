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

/** Starts playing `url` in `video`; returns a function that stops it. */
export async function playWhepStream(
  url: string,
  video: HTMLVideoElement,
  signal: (url: string, offerSdp: string) => Promise<string>
): Promise<() => void> {
  const connection = new RTCPeerConnection()
  connection.addTransceiver('video', { direction: 'recvonly' })
  connection.ontrack = (event) => {
    video.srcObject = event.streams[0]
  }
  await connection.setLocalDescription(await connection.createOffer())
  await gatherIce(connection)
  const answer = await signal(url, connection.localDescription?.sdp ?? '')
  await connection.setRemoteDescription({ type: 'answer', sdp: answer })
  return () => connection.close()
}
