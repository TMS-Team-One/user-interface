import { useState } from 'react'

// window.electron is injected by the preload script and only exists inside the
// real Electron shell, not when this page is opened in a plain browser tab.
const versionsFallback = { electron: 'n/a', chrome: 'n/a', node: 'n/a' }

function Versions(): React.JSX.Element {
  const [versions] = useState(window.electron?.process?.versions ?? versionsFallback)

  return (
    <ul className="versions">
      <li className="electron-version">Electron v{versions.electron}</li>
      <li className="chrome-version">Chromium v{versions.chrome}</li>
      <li className="node-version">Node v{versions.node}</li>
    </ul>
  )
}

export default Versions
