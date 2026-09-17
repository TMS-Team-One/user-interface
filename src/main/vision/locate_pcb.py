#!/usr/bin/env python3
"""Locate a PCB in a camera image and give its CAD features in image and printer coordinates.

    python3 -m src.scripts.locate_pcb IMAGE --cad CAD_DIR [--bed bed_calibration.json]
                          [--min-radius PX] [--max-radius PX] [--threshold Q]

1. detect circles in the image (detect_holes.detect)
2. read the visible CAD features (cad_features.load): mounting holes and round pads
3. assign the large detected circles to the CAD mounting holes: every permutation is
   scored against a similarity transform, the asymmetric hole pattern makes one win
4. homography board mm -> image px from that assignment; project all CAD features and
   match each to the nearest detected circle of plausible radius
5. RANSAC homography over all matches, least-squares refit on the inliers
6. with --bed, compose with the image -> printer homography: every CAD feature gets a
   printer XY, and the board pose on the bed (origin, angle, scale) is reported

Writes <stem>_located.json and <stem>_located.jpg. Exit 0 if the fit passes, 1 otherwise.
"""
import argparse
import itertools
import json
import sys
from pathlib import Path

import cv2
import numpy as np

from src.main.vision import cad_features
from src.main.vision.detect_holes import THRESHOLD, default_radii, detect

MATCH_TOL_MM = 1.0         # projected CAD feature must land within this of a detected circle
RADIUS_RATIO = (0.5, 2.5)  # detected radius / CAD radius; rings and pads can look bigger
RANSAC_MM = 0.3            # reprojection error beyond which a match counts as wrong
MIN_INLIERS = 4
MAX_RMS_MM = 0.2           # acceptance threshold for the fit
COARSE_RMS_MM = 3.0        # a hole assignment whose similarity fit is worse than this is not the board
HOLE_TOL_MM = 4.0          # a mounting hole predicted from two others must have a circle within this
MOUNT_RADIUS_RATIO = (0.6, 2.0)  # detected radius / mounting hole radius for a circle to count as that hole (its copper ring is up to twice as wide)
MOUNT_RADIUS_SPREAD = 2.0  # largest / smallest radius, relative to the hole's, among the circles taken as mounting holes
                           # (a hole is found at its copper ring's radius as often as at its own)
SECOND_THRESHOLD = 0.5     # circles the first pass missed are picked up at this lower circle quality
OUTLINE_STEP_MM = 1.0      # spacing of the samples taken along the board outline
OUTLINE_PROBE_MM = 0.6     # how far inside and outside the rim the colours are compared
OUTLINE_CONTRAST_MIN = 25  # Lab colour distance between inside and outside that counts as the rim
OUTLINE_SUPPORT_MIN = 0.55 # share of outline samples showing the rim for the pose to be believed
OUTLINE_CONSISTENCY_MIN = 0.5  # share of samples whose colour just inside the rim is the board's usual one
MAX_MOUNT_HOLES = 6        # biggest holes of at least cad_features.MIN_MOUNT_DIA_MM tried as mounting holes
MAX_CANDIDATE_CIRCLES = 24 # biggest confidently detected circles tried as three of the mounting holes
MAX_HYPOTHESES = 500       # best-ranked hole assignments verified against all features


class LocateError(LookupError):
    """The board was not found; carries what the detector saw for the operator."""

    def __init__(self, message, detected):
        super().__init__(message)
        self.detected = detected


def fit_similarity(src, dst):
    """Least-squares scale+rotation+translation src -> dst: returns (a, b, tx, ty), rms."""
    n = len(src)
    A = np.zeros((2 * n, 4))
    A[0::2] = np.c_[src[:, 0], -src[:, 1], np.ones(n), np.zeros(n)]
    A[1::2] = np.c_[src[:, 1], src[:, 0], np.zeros(n), np.ones(n)]
    p, *_ = np.linalg.lstsq(A, dst.reshape(-1), rcond=None)
    rms = np.sqrt(((A @ p - dst.reshape(-1)) ** 2).reshape(-1, 2).sum(axis=1).mean())
    return p, rms


def project(H, pts):
    return cv2.perspectiveTransform(np.float64(pts).reshape(-1, 1, 2), H).reshape(-1, 2)


def assign_mounting(circles, mount, faint=()):
    """Candidate assignments of detected circles to the CAD mounting holes, best first by
    hole count and then by residual. Each candidate is (rms_mm, pairs, similarity or None);
    a circle index at or beyond len(circles) refers to `faint`.

    Every ordered triple of circles is tried as three of the holes: the affine map that
    sends those holes onto the circles (exact for three points, and good enough under
    perspective where a similarity is not) predicts where the fourth hole must be, and a
    circle of plausible radius there completes the assignment; the faint circles of the
    second detection pass may complete it but never start one, which keeps a busy scene
    from breeding hypotheses. When no four-hole assignment exists, pairs of circles are
    tried as pairs of holes with a similarity instead, which tolerates a hidden hole but
    only a mild viewing angle."""
    pts = np.float64([c[:2] for c in list(circles) + list(faint)])
    rad = np.float64([c[2] for c in list(circles) + list(faint)])
    mxy = np.float64([[m["x"], m["y"]] for m in mount])
    hole_r = np.float64([m["dia"] / 2 for m in mount])
    n = len(circles)
    scale_min = rad[:n].min() / hole_r.max() / MOUNT_RADIUS_RATIO[1]
    scale_max = rad[:n].max() / hole_r.min() / MOUNT_RADIUS_RATIO[0]
    candidates = {}

    if len(mount) >= 4 and n >= 4:
        I, J, K = np.meshgrid(np.arange(n), np.arange(n), np.arange(n), indexing="ij")
        I, J, K = I.ravel(), J.ravel(), K.ravel()
        keep = (I != J) & (I != K) & (J != K)
        I, J, K = I[keep], J[keep], K[keep]
        # Every ordered circle triple is tried, so the order of the hole triple is redundant.
        for (a, b, c), d in ((triple, d) for triple in itertools.combinations(range(len(mount)), 3)
                             for d in range(len(mount)) if d not in triple):
            basis_inv = np.linalg.inv(np.c_[mxy[b] - mxy[a], mxy[c] - mxy[a]])
            image_basis = np.stack([pts[J] - pts[I], pts[K] - pts[I]], axis=2)  # (T, 2, 2), columns
            M = image_basis @ basis_inv                                         # (T, 2, 2)
            scale = np.sqrt(np.abs(np.linalg.det(M)))
            ok = (scale >= scale_min) & (scale <= scale_max)  # also drops collinear triples (scale 0)
            with np.errstate(divide="ignore", invalid="ignore"):
                for hole, circle in ((a, I), (b, J), (c, K)):
                    ratio = rad[circle] / (hole_r[hole] * scale)
                    ok &= (ratio >= MOUNT_RADIUS_RATIO[0]) & (ratio <= MOUNT_RADIUS_RATIO[1])
            if not ok.any():
                continue
            T = np.flatnonzero(ok)
            offset = pts[I[T]] - np.einsum("tij,j->ti", M[T], mxy[a])
            predicted = np.einsum("tij,j->ti", M[T], mxy[d]) + offset       # (t, 2)
            dist = np.linalg.norm(predicted[:, None, :] - pts[None, :, :], axis=2)  # (t, all circles)
            ratio = rad[None, :] / (hole_r[d] * scale[T])[:, None]
            found = (dist <= HOLE_TOL_MM * scale[T][:, None]) & (ratio >= MOUNT_RADIUS_RATIO[0]) & (ratio <= MOUNT_RADIUS_RATIO[1])
            for t, l in zip(*np.nonzero(found)):
                i, j, k = I[T[t]], J[T[t]], K[T[t]]
                if l in (i, j, k):
                    continue
                pairs = [(a, int(i)), (b, int(j)), (c, int(k)), (d, int(l))]
                key = tuple(sorted(pairs))
                if key in candidates:
                    continue
                # The circles must be as alike as the holes they stand for.
                radii = rad[[i, j, k, l]] / hole_r[[a, b, c, d]]
                if radii.max() / radii.min() > MOUNT_RADIUS_SPREAD:
                    continue
                src = mxy[[m for m, _ in pairs]]
                dst = pts[[q for _, q in pairs]]
                A = np.zeros((8, 6))
                A[0::2, 0:3] = np.c_[src, np.ones(4)]
                A[1::2, 3:6] = np.c_[src, np.ones(4)]
                q, *_ = np.linalg.lstsq(A, dst.reshape(-1), rcond=None)
                rms = np.sqrt(((A @ q - dst.reshape(-1)) ** 2).reshape(-1, 2).sum(axis=1).mean())
                candidates[key] = (rms / scale[T[t]], pairs, None)
    if candidates:
        # Assignments made of confident circles alone come first; a faint completion
        # is the exception, and the refined hypotheses are capped.
        return sorted(candidates.values(), key=lambda c: (any(j >= n for _, j in c[1]), c[0]))

    # Fallback: pairs of circles as pairs of holes under a similarity (Y negated: image y is down).
    src = np.c_[mxy[:, 0], -mxy[:, 1]]
    for a, b in itertools.permutations(range(len(mount)), 2):
        base = complex(*(src[b] - src[a]))
        for i in range(n):
            for j in range(n):
                if i == j:
                    continue
                k = complex(*(pts[j] - pts[i])) / base
                scale = abs(k)
                if not scale_min <= scale <= scale_max:
                    continue
                if not all(MOUNT_RADIUS_RATIO[0] <= rad[q] / (hole_r[m] * scale) <= MOUNT_RADIUS_RATIO[1] for m, q in ((a, i), (b, j))):
                    continue
                offset = complex(*pts[i]) - k * complex(*src[a])
                pairs = [(a, i), (b, j)]
                for m in range(len(mount)):
                    if m in (a, b):
                        continue
                    z = k * complex(*src[m]) + offset
                    dist = np.hypot(pts[:, 0] - z.real, pts[:, 1] - z.imag)
                    ok = (dist <= HOLE_TOL_MM * scale) & (rad >= MOUNT_RADIUS_RATIO[0] * hole_r[m] * scale) \
                        & (rad <= MOUNT_RADIUS_RATIO[1] * hole_r[m] * scale)
                    ok[[i, j]] = False
                    if ok.any():
                        pairs.append((m, int(np.argmin(np.where(ok, dist, np.inf)))))
                if len(pairs) < 3:
                    continue
                key = tuple(sorted(pairs))
                if key in candidates:
                    continue
                p, rms = fit_similarity(src[[m for m, _ in pairs]], pts[[q for _, q in pairs]])
                candidates[key] = (rms / np.hypot(p[0], p[1]), pairs, p)
    return sorted(candidates.values(), key=lambda c: (-len(c[1]), c[0]))


def first_guess(mount, circles, pairs, p):
    """Board mm -> image px from an assignment: a homography with four holes, otherwise
    the similarity with the Y flip folded in."""
    if p is None or len(pairs) >= 4:
        src = np.float64([[mount[i]["x"], mount[i]["y"]] for i, _ in pairs])
        dst = np.float64([circles[j][:2] for _, j in pairs])
        H0, _ = cv2.findHomography(src, dst, 0)
        return H0
    a, b, tx, ty = p
    return np.array([[a, b, tx], [b, -a, ty], [0, 0, 1.0]])


def refine(H0, cad_xy, match, detected):
    """RANSAC homography over the matched features and a least-squares refit on the
    inliers; None when fewer than MIN_INLIERS agree."""
    scale = np.sqrt(abs(np.linalg.det(H0[:2, :2])))
    src = cad_xy[list(match)]
    dst = np.float64([detected[j][:2] for j in match.values()])
    cv2.setRNGSeed(0)
    H, mask = cv2.findHomography(src, dst, cv2.RANSAC, RANSAC_MM * scale)
    if H is None:
        return None
    inlier = mask.ravel().astype(bool)
    if inlier.sum() < MIN_INLIERS:
        return None
    H, _ = cv2.findHomography(src[inlier], dst[inlier], 0)
    return H, inlier


def sample_outline(outline):
    """Points every OUTLINE_STEP_MM along a closed polygon given as [[x, y], ...] in mm,
    with the outward normal at each point."""
    pts = np.float64(outline)
    samples, normals = [], []
    for start, end in zip(pts, np.roll(pts, -1, axis=0)):
        length = np.linalg.norm(end - start)
        normal = np.array([end[1] - start[1], start[0] - end[0]]) / max(length, 1e-9)
        for t in np.arange(0, length, OUTLINE_STEP_MM) / max(length, 1e-9):
            samples.append(start + (end - start) * t)
            normals.append(normal)
    return np.float64(samples), np.float64(normals)


def rim_scores(H, outline, lab):
    """Two shares of the outline samples: those where the image just inside the board
    differs in colour from the image just outside (the board's rim against the bed), and
    those whose colour just inside is the board's usual colour there (the solder mask all
    the way round). A wrong pose puts most samples on uniform board or uniform bed and
    scores low on the first; one crossing bed, fixture and board scores low on the
    second, however many edges it happens to lie on."""
    samples, normals = outline
    proj = project(H, samples)
    scale = np.sqrt(abs(np.linalg.det(H[:2, :2])))
    step = max(3.0, OUTLINE_PROBE_MM * scale)
    direction = project(H, samples + normals * 0.5) - proj
    direction /= np.linalg.norm(direction, axis=1, keepdims=True) + 1e-9
    inside = np.rint(proj - direction * step).astype(int)
    outside = np.rint(proj + direction * step).astype(int)
    h, w = lab.shape[:2]
    ok = np.ones(len(proj), bool)
    for pts in (inside, outside):
        ok &= (pts[:, 0] >= 0) & (pts[:, 0] < w) & (pts[:, 1] >= 0) & (pts[:, 1] < h)
    if ok.mean() < 0.5:
        return 0.0, 0.0
    inner = lab[inside[ok, 1], inside[ok, 0]]
    diff = np.linalg.norm(inner - lab[outside[ok, 1], outside[ok, 0]], axis=1)
    usual = np.linalg.norm(inner - np.median(inner, axis=0), axis=1)
    return float((diff >= OUTLINE_CONTRAST_MIN).mean()), float((usual <= OUTLINE_CONTRAST_MIN).mean())


def match_features(H0, features, detected, allowed=None):
    """CAD feature index -> detected circle index, for features that project within
    MATCH_TOL_MM of a circle of plausible radius under H0; only circles in `allowed`
    when given."""
    cad_xy = np.float64([[f["x"], f["y"]] for f in features])
    proj = project(H0, cad_xy)
    scale = np.sqrt(abs(np.linalg.det(H0[:2, :2])))  # px per mm
    candidates = []
    for i, (px, py) in enumerate(proj):
        for j, (dx, dy, dr) in enumerate(detected):
            if allowed is not None and j not in allowed:
                continue
            dist = np.hypot(px - dx, py - dy)
            ratio = dr / (features[i]["dia"] / 2 * scale)
            if dist <= MATCH_TOL_MM * scale and RADIUS_RATIO[0] <= ratio <= RADIUS_RATIO[1]:
                candidates.append((dist, i, j))
    match = {}
    for dist, i, j in sorted(candidates):
        if i not in match and j not in match.values():
            match[i] = j
    return match


def rim_believable(inliers, support, consistency):
    """Whether the rim vouches for a pose: it must show as an edge, and when the pose
    rests on the mounting holes alone the colour inside it must be the board's usual one.
    A fifth feature beyond the holes is the independent check otherwise."""
    return support >= OUTLINE_SUPPORT_MIN and (inliers > MIN_INLIERS or consistency >= OUTLINE_CONSISTENCY_MIN)


def detect_generously(img, min_radius, max_radius, threshold):
    """The detector's circles, plus those a second pass at a lower quality finds
    elsewhere: a mounting hole in shadow or under a reflection is faint, and the
    matching against the CAD sorts out the extra circles."""
    detected, _ = detect(img, min_radius, max_radius, threshold)
    if SECOND_THRESHOLD < threshold:
        faint, _ = detect(img, min_radius, max_radius, SECOND_THRESHOLD)
        detected = detected + [c for c in faint
                               if all(np.hypot(c[0] - x, c[1] - y) >= 2 * min_radius for x, y, _ in detected)]
    return detected


def locate(img, features, min_radius, max_radius, threshold, outline=None):
    confident, _ = detect(img, min_radius, max_radius, threshold)
    detected = detect_generously(img, min_radius, max_radius, threshold)
    faint = detected[len(confident):]
    rim = lab = None
    if outline is not None:
        rim = sample_outline(outline)
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
    holes = [f for f in features if f["kind"] == "hole"]
    mount = sorted((f for f in holes if f["dia"] >= cad_features.MIN_MOUNT_DIA_MM), key=lambda f: -f["dia"])[:MAX_MOUNT_HOLES]
    circles = sorted(confident, key=lambda d: -d[2])[:MAX_CANDIDATE_CIRCLES]
    if len(mount) < 3 or len(circles) < 3:
        raise LocateError(f"need at least 3 mounting holes in the CAD ({len(mount)}) and in the image ({len(circles)})", detected)
    # Hypothesise the best-ranked assignments and refine each. With the outline known,
    # a pose whose rim shows in the image beats any other; among those, the one
    # consistent with the most CAD features wins. The similarity residual alone
    # misleads on an oblique camera, an assignment always explains the holes it was
    # built from, and a fifth feature can be a small pad matched by chance.
    cad_xy = np.float64([[f["x"], f["y"]] for f in features])
    best = None
    # Fine matching sees the confident circles and the faint one a hypothesis was
    # completed with, never the other faint circles: those are mostly not features.
    confident_indices = set(range(len(confident)))
    for coarse_rms, pairs, p in assign_mounting(circles, mount, faint)[:MAX_HYPOTHESES]:
        if coarse_rms > COARSE_RMS_MM:
            continue
        H0 = first_guess(mount, circles + faint, pairs, p)
        if H0 is None:
            continue
        allowed = confident_indices | {len(confident) + j - len(circles) for _, j in pairs if j >= len(circles)}
        match = match_features(H0, features, detected, allowed)
        if len(match) < MIN_INLIERS:
            continue
        refined = refine(H0, cad_xy, match, detected)
        if refined is None:
            continue
        H, inlier = refined
        support, consistency = rim_scores(H, rim, lab) if outline is not None else (None, None)
        rim_ok = support is None or rim_believable(int(inlier.sum()), support, consistency)
        score = (rim_ok, int(inlier.sum()), round(support or 0, 2), round(consistency or 0, 2), -coarse_rms)
        if best is None or score > best[0]:
            best = (score, coarse_rms, match, H, inlier, support, consistency)
    if best is None:
        raise LocateError("no arrangement of the detected circles matches the mounting holes and pads", detected)
    _, coarse_rms, match, H, inlier, support, consistency = best
    src = cad_xy[list(match)]
    dst = np.float64([detected[j][:2] for j in match.values()])
    resid_mm = np.hypot(*(project(np.linalg.inv(H), dst) - src).T)
    fit = {"detected": len(detected), "matched": len(match), "inliers": int(inlier.sum()),
           "coarse_rms_mm": round(float(coarse_rms), 3),
           "rms_mm": round(float(np.sqrt((resid_mm[inlier] ** 2).mean())), 4),
           "outline_support": None if support is None else round(support, 3),
           "outline_consistency": None if consistency is None else round(consistency, 3)}
    return detected, H, dict(zip(match, zip(match.values(), inlier, resid_mm))), fit


def locate_board(image_path, cad_dir, bed_path=None, min_radius=None, max_radius=None, threshold=THRESHOLD,
                 outline=None):
    """Locate the board in an image. Returns (result, annotated image); the result is the
    document main() writes: fit quality, board pose on the bed when a bed calibration is
    given, the homographies and every CAD feature with its image and printer coordinates.
    Hole radius limits default to values scaled from the image width. `outline`, the
    board's edge as [[x, y], ...] in board mm, lets the pose be checked against the
    board's rim in the image and is what makes a pose with only the mounting holes
    trustworthy. Raises FileNotFoundError or ValueError when it cannot."""
    img = cv2.imread(str(image_path))
    if img is None:
        raise FileNotFoundError(f"cannot read image {image_path}")
    default_min, default_max = default_radii(img.shape[1])
    min_radius = min_radius or default_min
    max_radius = max_radius or default_max
    features, files = cad_features.load(cad_dir)
    params = {"min_radius": min_radius, "max_radius": max_radius, "threshold": threshold,
              "match_tol_mm": MATCH_TOL_MM, "radius_ratio": list(RADIUS_RATIO), "ransac_mm": RANSAC_MM,
              "min_inliers": MIN_INLIERS, "max_rms_mm": MAX_RMS_MM, "coarse_rms_mm": COARSE_RMS_MM,
              "outline_support_min": OUTLINE_SUPPORT_MIN, "outline_consistency_min": OUTLINE_CONSISTENCY_MIN}
    try:
        detected, H, match, fit = locate(img, features, min_radius, max_radius, threshold, outline)
    except LocateError as error:
        t = max(1, round(img.shape[1] / 1000))
        for x, y, r in error.detected:
            cv2.circle(img, (int(round(x)), int(round(y))), int(round(r)), (0, 0, 255), t)
        result = {"source": Path(image_path).name, "image": {"width": img.shape[1], "height": img.shape[0]},
                  "cad": {"dir": str(cad_dir), **files}, "bed_calibration": str(bed_path) if bed_path else None,
                  "params": params, "error": str(error), "fit": None, "pose_on_bed": None,
                  "board_to_image": None, "board_to_printer": None,
                  "detected": [[round(float(v), 2) for v in circle] for circle in error.detected], "features": []}
        return result, img

    bed = Hbp = pose = None
    if bed_path:
        bed = json.load(open(bed_path))
        if [bed["image"]["width"], bed["image"]["height"]] != [img.shape[1], img.shape[0]]:
            raise ValueError(f"{bed_path} was made for a {bed['image']['width']}x{bed['image']['height']} image")
        Hbp = np.float64(bed["H_image_to_printer"]) @ H
    cad_xy = np.float64([[f["x"], f["y"]] for f in features])
    image_xy = project(H, cad_xy)
    if bed:
        printer_xy = project(Hbp, cad_xy)
        (a, b, tx, ty), rms = fit_similarity(cad_xy, printer_xy)
        pose = {"origin_xy": [round(float(tx), 3), round(float(ty), 3)],
                "angle_deg": round(float(np.degrees(np.arctan2(b, a))), 3),
                "scale": round(float(np.hypot(a, b)), 4), "rms_mm": round(float(rms), 3)}
    # Four inliers are the mounting holes the fit was built from, so an independent
    # check is needed: the board's rim lying on an image edge when the outline is
    # known (the pads are too small to see from the printer's camera), otherwise a
    # fifth feature.
    passed = fit["inliers"] >= MIN_INLIERS and fit["rms_mm"] <= MAX_RMS_MM
    if fit["outline_support"] is not None:
        passed = passed and rim_believable(fit["inliers"], fit["outline_support"], fit["outline_consistency"])
    else:
        passed = passed and fit["inliers"] > MIN_INLIERS

    rows = []
    for i, f in enumerate(features):
        row = {"id": i, "kind": f["kind"], "board_xy": [round(f["x"], 3), round(f["y"], 3)], "dia": round(f["dia"], 3),
               "image_xy": [round(float(v), 2) for v in image_xy[i]],
               "printer_xy": [round(float(v), 3) for v in printer_xy[i]] if bed else None,
               "detected_xyr": None, "inlier": None, "residual_mm": None}
        if i in match:
            j, inl, res = match[i]
            row.update(detected_xyr=[round(v, 2) for v in detected[j]], inlier=bool(inl), residual_mm=round(float(res), 4))
        rows.append(row)
    result = {"source": Path(image_path).name, "image": {"width": img.shape[1], "height": img.shape[0]},
              "cad": {"dir": str(cad_dir), **files}, "bed_calibration": str(bed_path) if bed_path else None,
              "params": params, "error": None,
              "fit": {**fit, "pass": passed}, "outline": outline, "pose_on_bed": pose,
              "board_to_image": H.tolist(), "board_to_printer": Hbp.tolist() if bed else None,
              "detected": [[round(float(v), 2) for v in circle] for circle in detected], "features": rows}

    # red: every detected circle; green: matched CAD feature; magenta: CAD feature not seen; cyan: outline
    t = max(1, round(img.shape[1] / 1000))
    scale = np.sqrt(abs(np.linalg.det(H[:2, :2])))
    if outline is not None:
        rim = project(H, np.float64(outline)).astype(np.int32).reshape(-1, 1, 2)
        cv2.polylines(img, [rim], True, (255, 255, 0), t)
    for x, y, r in detected:
        cv2.circle(img, (int(round(x)), int(round(y))), int(round(r)), (0, 0, 255), t)
    for i, f in enumerate(features):
        c = tuple(int(round(v)) for v in image_xy[i])
        rad = max(t, int(round(f["dia"] / 2 * scale)))
        color = (0, 255, 0) if i in match and match[i][1] else (255, 0, 255)
        cv2.circle(img, c, rad, color, t)
        cv2.putText(img, str(i), (c[0] + rad, c[1] - rad), cv2.FONT_HERSHEY_SIMPLEX, 0.7 * t, color, t)
    return result, img


def main():
    ap = argparse.ArgumentParser(description="Locate a PCB in an image using its CAD files.")
    ap.add_argument("image")
    ap.add_argument("--cad", required=True, help="folder with the Excellon drill file and the top solder-mask Gerber")
    ap.add_argument("--bed", help="bed_calibration.json from calibrate_bed.py; adds printer coordinates")
    ap.add_argument("--min-radius", type=int, help="smallest hole radius in px (default: scaled from the image width)")
    ap.add_argument("--max-radius", type=int, help="largest hole radius in px (default: scaled from the image width)")
    ap.add_argument("--threshold", type=float, default=THRESHOLD,
                    help=f"circle quality 0-1, lower = more sensitive (default {THRESHOLD})")
    ap.add_argument("--outline", help="JSON file with the board outline as [[x, y], ...] in mm; checks the pose against the board's rim")
    args = ap.parse_args()

    outline = json.load(open(args.outline)) if args.outline else None
    try:
        result, img = locate_board(args.image, args.cad, args.bed, args.min_radius, args.max_radius, args.threshold, outline)
    except (FileNotFoundError, ValueError) as e:
        sys.exit(f"error: {e}")
    stem = Path(args.image).with_suffix("")
    with open(f"{stem}_located.json", "w") as f:
        json.dump(result, f, indent=2)
    cv2.imwrite(f"{stem}_located.jpg", img)
    if result["error"]:
        sys.exit(f"error: {result['error']}")

    fit, pose = result["fit"], result["pose_on_bed"]
    print(f"{fit['matched']}/{len(result['features'])} CAD features matched, {fit['inliers']} consistent, "
          f"RMS {fit['rms_mm']:.3f} mm -> {'PASS' if fit['pass'] else 'FAIL'}"
          + (f"; board origin at ({pose['origin_xy'][0]:.2f}, {pose['origin_xy'][1]:.2f}) mm, "
             f"rotated {pose['angle_deg']:.2f} deg, scale {pose['scale']:.4f}" if pose else ""))
    sys.exit(0 if fit["pass"] else 1)


if __name__ == "__main__":
    main()
