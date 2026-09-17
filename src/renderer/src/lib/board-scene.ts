import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import type { PackedMesh } from '@shared/mesh-pack'
import type { BoardRender } from '@shared/types'

// Gerber files carry no board thickness; 1.6 mm is the usual default.
const BOARD_THICKNESS_MM = 1.6
// Resolution of the face textures, capped so large boards stay within GPU limits.
const TEXTURE_PX_PER_MM = 24
const TEXTURE_MAX_PX = 4096
const FR4_COLOR = 0x666666
const EDGE_COLOR = 0x1f5a2a
// A P75-style pogo pin: brass barrel, steel plunger and tip. Nothing supplies a
// probe position yet, so it hovers above the centre of the board.
const PROBE_BARREL_RADIUS_MM = 0.5
const PROBE_BARREL_LENGTH_MM = 14
const PROBE_PLUNGER_RADIUS_MM = 0.37
const PROBE_PLUNGER_LENGTH_MM = 3
const PROBE_TIP_LENGTH_MM = 0.8
const PROBE_CLEARANCE_MM = 2
const BRASS_COLOR = 0xc9a227
const STEEL_COLOR = 0xb8b8b8
// The ring drawn around the pad under test, just above the board so it is not hidden by it.
const TARGET_RING_INNER_MM = 0.9
const TARGET_RING_OUTER_MM = 1.3
const TARGET_RING_LIFT_MM = 0.05
const TARGET_COLOR = 0xf97316

type ViewBox = [x: number, y: number, width: number, height: number]

export interface ProbePosition {
  x: number
  y: number
  z: number
}

export interface BoardScene {
  setProbeVisible: (visible: boolean) => void
  /** Glides the probe tip to a board-frame position (mm, z above the top face) or back to rest. */
  moveProbeTo: (position: ProbePosition | null, durationMs: number) => void
  /** Marks the pad under test on the board, or clears the mark. */
  setTarget: (target: { x: number; y: number } | null) => void
  dispose: () => void
}

/**
 * Shows a board render as a solid slab: the outline of the top view extruded
 * to board thickness, with the top and bottom renders as face textures, the
 * components of the STEP model when there is one, and a probe above it. Board
 * geometry is built in the SVG's units (Gerber units x 1000) and scaled to
 * millimetres; the model and the probe are in millimetres.
 */
export function mountBoardScene(
  container: HTMLElement,
  render: BoardRender,
  model: PackedMesh[] | null
): BoardScene {
  const unitsToMm = (render.units === 'mm' ? 1 : 25.4) / 1000
  const viewBox = parseViewBox(render.topSvg)
  const [x, y, width, height] = viewBox
  const shapes = outlineShapes(render.topSvg, viewBox)
  const thickness = BOARD_THICKNESS_MM / unitsToMm
  const centre = new THREE.Vector3(-(x + width / 2), -(y + height / 2), 0)

  const topMaterial = new THREE.MeshStandardMaterial({
    color: FR4_COLOR,
    roughness: 0.6,
    alphaTest: 0.5
  })
  const bottomMaterial = new THREE.MeshStandardMaterial({
    color: FR4_COLOR,
    roughness: 0.6,
    alphaTest: 0.5,
    side: THREE.BackSide
  })
  const edgeMaterial = new THREE.MeshStandardMaterial({ color: EDGE_COLOR, roughness: 0.8 })
  const hiddenCaps = new THREE.MeshBasicMaterial({ visible: false })

  const top = new THREE.Mesh(new THREE.ShapeGeometry(shapes), topMaterial)
  top.position.copy(centre).setZ(thickness)
  const bottom = new THREE.Mesh(new THREE.ShapeGeometry(shapes), bottomMaterial)
  bottom.position.copy(centre)
  // Only the side walls of the extrusion are drawn; its caps are the two textured faces above.
  const sides = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shapes, { depth: thickness, bevelEnabled: false }),
    [hiddenCaps, edgeMaterial]
  )
  sides.position.copy(centre)

  const board = new THREE.Group()
  board.scale.setScalar(unitsToMm)
  board.add(top, bottom, sides)

  const probe = buildProbe()
  const restPosition = new THREE.Vector3(0, 0, BOARD_THICKNESS_MM + PROBE_CLEARANCE_MM)
  probe.position.copy(restPosition)
  const toWorld = (position: ProbePosition): THREE.Vector3 =>
    new THREE.Vector3(
      position.x + centre.x * unitsToMm,
      position.y + centre.y * unitsToMm,
      BOARD_THICKNESS_MM + position.z
    )

  const targetRing = new THREE.Mesh(
    new THREE.RingGeometry(TARGET_RING_INNER_MM, TARGET_RING_OUTER_MM, 32),
    new THREE.MeshBasicMaterial({ color: TARGET_COLOR, side: THREE.DoubleSide })
  )
  targetRing.visible = false

  // The STEP model shares the Gerber origin, with the board's top face at z = 0.
  const components = buildComponents(model ?? [], width * unitsToMm, height * unitsToMm)
  components.position.set(centre.x * unitsToMm, centre.y * unitsToMm, BOARD_THICKNESS_MM)

  const scene = new THREE.Scene()
  scene.add(board, components, probe, targetRing, new THREE.AmbientLight(0xffffff, 1.2))
  const sun = new THREE.DirectionalLight(0xffffff, 2)
  sun.position.set(30, -40, 80)
  const underside = new THREE.DirectionalLight(0xffffff, 1)
  underside.position.set(-30, 40, -80)
  scene.add(sun, underside)

  const sizeMm = Math.max(width, height) * unitsToMm
  const camera = new THREE.PerspectiveCamera(35, 1, sizeMm / 100, sizeMm * 20)
  camera.up.set(0, 0, 1)
  camera.position.set(-0.6 * sizeMm, -1.0 * sizeMm, 0.9 * sizeMm)
  camera.lookAt(0, 0, 0)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  container.appendChild(renderer.domElement)
  const draw = (): void => renderer.render(scene, camera)

  // Frames are drawn on demand, except while the probe glides or a pad is marked.
  let tween: { from: THREE.Vector3; to: THREE.Vector3; start: number; duration: number } | null =
    null
  const animate = (time: number): void => {
    if (tween) {
      const t = Math.min(1, (time - tween.start) / Math.max(tween.duration, 1))
      probe.position.lerpVectors(tween.from, tween.to, t)
      if (t === 1) tween = null
    }
    if (targetRing.visible) {
      targetRing.scale.setScalar(1 + 0.15 * Math.sin(time / 150))
    }
    draw()
    if (!tween && !targetRing.visible) renderer.setAnimationLoop(null)
  }
  const startAnimating = (): void => renderer.setAnimationLoop(animate)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.addEventListener('change', draw)

  const resize = (): void => {
    const { clientWidth, clientHeight } = container
    renderer.setSize(clientWidth, clientHeight)
    camera.aspect = clientWidth / Math.max(clientHeight, 1)
    camera.updateProjectionMatrix()
    draw()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(container)
  resize()

  let disposed = false
  const pxPerMm = Math.min(TEXTURE_PX_PER_MM, TEXTURE_MAX_PX / sizeMm)
  const texturePx: [number, number] = [
    Math.round(width * unitsToMm * pxPerMm),
    Math.round(height * unitsToMm * pxPerMm)
  ]
  Promise.all([rasterise(render.topSvg, texturePx), rasterise(render.bottomSvg, texturePx)])
    .then(([topTexture, bottomTexture]) => {
      if (disposed) return
      // ShapeGeometry uses the raw vertex coordinates as UVs, so the viewBox is mapped
      // onto the image. The bottom view is drawn as seen from below, hence mirrored.
      topTexture.repeat.set(1 / width, 1 / height)
      topTexture.offset.set(-x / width, -y / height)
      bottomTexture.repeat.set(-1 / width, 1 / height)
      bottomTexture.offset.set(1 + x / width, -y / height)
      for (const [material, texture] of [
        [topMaterial, topTexture],
        [bottomMaterial, bottomTexture]
      ] as const) {
        material.map = texture
        material.color.set(0xffffff)
        material.needsUpdate = true
      }
      draw()
    })
    .catch((err) => console.error('Could not texture the 3D board', err))

  return {
    setProbeVisible: (visible) => {
      probe.visible = visible
      draw()
    },
    moveProbeTo: (position, durationMs) => {
      tween = {
        from: probe.position.clone(),
        to: position ? toWorld(position) : restPosition.clone(),
        start: performance.now(),
        duration: durationMs
      }
      startAnimating()
    },
    setTarget: (target) => {
      targetRing.visible = target !== null
      if (target) targetRing.position.copy(toWorld({ ...target, z: TARGET_RING_LIFT_MM }))
      startAnimating()
    },
    dispose: () => {
      disposed = true
      observer.disconnect()
      controls.dispose()
      for (const mesh of [top, bottom, sides]) mesh.geometry.dispose()
      for (const material of [topMaterial, bottomMaterial, edgeMaterial, hiddenCaps]) {
        material.map?.dispose()
        material.dispose()
      }
      renderer.setAnimationLoop(null)
      for (const group of [components, probe, targetRing]) {
        group.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose()
            ;(object.material as THREE.Material).dispose()
          }
        })
      }
      renderer.dispose()
      renderer.domElement.remove()
    }
  }
}

// The model's own board body would fight with the slab, so any mesh spanning
// almost the whole board is left out; everything else is a component.
function buildComponents(
  meshes: PackedMesh[],
  boardWidth: number,
  boardHeight: number
): THREE.Group {
  const group = new THREE.Group()
  for (const mesh of meshes) {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3))
    if (mesh.normals) geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3))
    else geometry.computeVertexNormals()
    geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1))
    geometry.computeBoundingBox()
    const size = geometry.boundingBox!.getSize(new THREE.Vector3())
    if (size.x > 0.9 * boardWidth && size.y > 0.9 * boardHeight) {
      geometry.dispose()
      continue
    }
    const color = new THREE.Color(0x888888)
    if (mesh.color) color.setRGB(mesh.color[0], mesh.color[1], mesh.color[2], THREE.SRGBColorSpace)
    group.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.6 })))
  }
  return group
}

// The pin stands along +Z with its tip at the group's origin, pointing down.
function buildProbe(): THREE.Group {
  const brass = new THREE.MeshStandardMaterial({
    color: BRASS_COLOR,
    metalness: 0.8,
    roughness: 0.3
  })
  const steel = new THREE.MeshStandardMaterial({
    color: STEEL_COLOR,
    metalness: 0.9,
    roughness: 0.25
  })

  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(PROBE_PLUNGER_RADIUS_MM, PROBE_TIP_LENGTH_MM, 24),
    steel
  )
  tip.rotation.x = -Math.PI / 2
  tip.position.z = PROBE_TIP_LENGTH_MM / 2

  const plunger = new THREE.Mesh(
    new THREE.CylinderGeometry(
      PROBE_PLUNGER_RADIUS_MM,
      PROBE_PLUNGER_RADIUS_MM,
      PROBE_PLUNGER_LENGTH_MM,
      24
    ),
    steel
  )
  plunger.rotation.x = Math.PI / 2
  plunger.position.z = PROBE_TIP_LENGTH_MM + PROBE_PLUNGER_LENGTH_MM / 2

  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(
      PROBE_BARREL_RADIUS_MM,
      PROBE_BARREL_RADIUS_MM,
      PROBE_BARREL_LENGTH_MM,
      24
    ),
    brass
  )
  barrel.rotation.x = Math.PI / 2
  barrel.position.z = PROBE_TIP_LENGTH_MM + PROBE_PLUNGER_LENGTH_MM + PROBE_BARREL_LENGTH_MM / 2

  const probe = new THREE.Group()
  probe.add(tip, plunger, barrel)
  return probe
}

function parseViewBox(svg: string): ViewBox {
  const match = /viewBox="([^"]+)"/.exec(svg)
  if (!match) throw new Error('Board render has no viewBox')
  const [x, y, width, height] = match[1].split(' ').map(Number)
  return [x, y, width, height]
}

// pcb-stackup clips the render to the outline layer with a clipPath whose path is the
// board shape. Without an outline layer the board is its bounding rectangle.
function outlineShapes(svg: string, [x, y, width, height]: ViewBox): THREE.Shape[] {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const d = doc.querySelector('clipPath[id$="_outline"] path')?.getAttribute('d')
  if (!d) {
    const rectangle = new THREE.Shape()
    rectangle.moveTo(x, y)
    rectangle.lineTo(x + width, y)
    rectangle.lineTo(x + width, y + height)
    rectangle.lineTo(x, y + height)
    rectangle.closePath()
    return [rectangle]
  }
  const { paths } = new SVGLoader().parse(
    `<svg xmlns="http://www.w3.org/2000/svg"><path d="${d}"/></svg>`
  )
  return paths.flatMap((path) => path.toShapes())
}

function rasterise(svg: string, [width, height]: [number, number]): Promise<THREE.CanvasTexture> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')?.drawImage(image, 0, 0, width, height)
      const texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = 8
      resolve(texture)
    }
    image.onerror = () => reject(new Error('Board render could not be rasterised'))
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  })
}
