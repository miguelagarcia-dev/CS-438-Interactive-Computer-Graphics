// =============================================================================
// A5 — Cornell-box compute ray tracer (student)
// =============================================================================
// Graded path:
//   1. Primary ray (Task 1, worked example).
//   2. Sphere intersection (Task 2b; plane in Task 2a is worked).
//   3. Lambert + Phong direct shading (Task 3) — the same shading model from
//      the rasterization assignments. Called once per non-emissive hit to
//      turn the incoming light into outgoing radiance.
//   4. Metal reflection for the indirect bounce (Task 4) — diffuse surfaces
//      scatter randomly (Lambertian); the metal sphere reflects via the
//      WGSL `reflect()` builtin. Throughput attenuates by albedo each bounce.
//
// Direct lighting at every diffuse hit uses next-event estimation (NEE):
// pick a random point on the area light, cast a shadow ray, accumulate the
// contribution. The on-page NEE checkbox can turn this off to see the noisy
// indirect-only render that motivates NEE in the first place.
//
// Bonus / Self-Study extensions (search this file for `BONUS_A5`):
//   • B1 — box intersection (slab method)
//   • B2 — direct lighting via NEE (study how the framework's
//          `sampleDirectLight` works)
//   • B3 — multi-frame progressive accumulation (study how `cs_main`'s
//          accumulation branch works)
//   • B4 — cosine-weighted hemisphere sampling for indirect bounces
//
// A fullscreen blit pass samples the accumulator, applies Reinhard tone
// mapping, gamma-corrects, and writes the canvas.
//
// Banner format. Each `TODO_A5` (or `BONUS_A5`) block looks like:
//     // ******************...
//     // *** TODO_A5 : Task X ***
//     //   teaching prose
//     // *** Begin code.
//         ...your implementation...
//     // *** End code.
//     // ******************...
// Only the lines between Begin/End are yours to change. Banner heads
// suffixed `(worked example)` are reference patterns whose bodies are
// filled in; read them, don't edit.
// =============================================================================

const PI : f32 = 3.14159265358979;
const T_EPS : f32 = 1.0e-4;
const T_INF : f32 = 1.0e30;
const PRIM_COUNT : i32 = 8;    // matches scene.js PRIM_COUNT; bonus B1 bumps both to 9
const LIGHT_INDEX : i32 = 5;   // index of the ceiling area light in u_scene
const SPP : i32 = 8;           // samples per pixel per frame (antialiasing)
// Max bounce depth comes from the bounces slider via i32(u_frame.maxBounces).

// --- compute pass bindings ---
@group(0) @binding(0) var outTex : texture_storage_2d<rgba16float, write>;

struct Camera {
    origin   : vec4<f32>,   // .xyz = eye position in world space
    forward  : vec4<f32>,   // .xyz = view direction (unit)
    right    : vec4<f32>,   // .xyz = right axis, pre-scaled by tan(fov/2)*aspect
    up       : vec4<f32>,   // .xyz = up axis,    pre-scaled by tan(fov/2)
}
@group(0) @binding(3) var<uniform> u_camera : Camera;

struct Primitive {
    typeAndPad : vec4<f32>, // .x = 0 plane / 1 sphere / 2 box
    a          : vec4<f32>, // plane origin / sphere center / box min
    b          : vec4<f32>, // plane edge u / box max
    c          : vec4<f32>, // plane edge v
    normal     : vec4<f32>, // plane normal (pre-computed)
    albedo     : vec4<f32>,
    emission   : vec4<f32>,
    extra      : vec4<f32>, // .x = sphere radius, .y = metal flag (0 or 1)
}
@group(0) @binding(4) var<uniform> u_scene : array<Primitive, 8>;

struct FrameUniform {
    sampleCount  : f32, // 1 on the first frame after a reset
    frameIndex   : f32, // monotonic; PRNG seed
    maxBounces   : f32, // path-tracer depth cap (1..8 from the slider)
    neeEnabled   : f32, // 1.0 = NEE direct lighting on (default)
    accumEnabled : f32, // 1.0 = multi-frame accumulation on (default)
    pad0         : f32,
    pad1         : f32,
    pad2         : f32,
}
@group(0) @binding(5) var<uniform> u_frame : FrameUniform;

@group(0) @binding(6) var accumPrev : texture_2d<f32>;

// --- blit pass bindings ---
@group(0) @binding(1) var blitTex  : texture_2d<f32>;
@group(0) @binding(2) var blitSamp : sampler;

// Closest-hit return type. Fields are filled by intersect* helpers.
struct Hit {
    hit    : bool,
    t      : f32,
    pos    : vec3<f32>,
    normal : vec3<f32>,
    primId : i32,
}

// Sentinel "no hit": t is +inf and primId is -1.
fn missHit() -> Hit {
    var h : Hit;
    h.hit = false;
    h.t = T_INF;
    h.pos = vec3<f32>(0.0);
    h.normal = vec3<f32>(0.0);
    h.primId = -1;
    return h;
}

// --- PRNG (per-pixel; seeded from pixel coordinate + frame index) ---

// Hash (pixel.xy, frameIndex) into a non-zero u32 PRNG seed.
fn seedRng(pixel : vec2<u32>, frame : u32) -> u32 {
    var s = pixel.x * 0x68e31da4u + pixel.y * 0xb5297a4du + frame * 0x1b56c4e9u;
    s = s ^ 0x9e3779b9u;
    s = s ^ (s >> 16u);
    s = s * 0x85ebca6bu;
    s = s ^ (s >> 13u);
    s = s * 0xc2b2ae35u;
    s = s ^ (s >> 16u);
    if (s == 0u) { s = 0x12345678u; }
    return s;
}

// Advance `state` and return a uniform random float in [0, 1).
fn rand1(state : ptr<function, u32>) -> f32 {
    var x = *state;
    x = x ^ (x << 13u);
    x = x ^ (x >> 17u);
    x = x ^ (x << 5u);
    *state = x;
    return f32(x) * (1.0 / 4294967296.0);
}

// Uniform random point inside the unit sphere (rejection sampling).
// Used by the Lambertian random-bounce scatter in the bounce loop.
fn randomInUnitSphere(state : ptr<function, u32>) -> vec3<f32> {
    loop {
        let p = vec3<f32>(rand1(state), rand1(state), rand1(state)) * 2.0 - vec3<f32>(1.0);
        if (dot(p, p) < 1.0) { return p; }
    }
}

// =============================================================================
// Closest-Hit Intersection — plane (worked) + sphere (graded). Box is bonus B1.
// =============================================================================

fn intersectPlane(rayOrigin : vec3<f32>, rayDir : vec3<f32>, prim : Primitive) -> Hit {
    // ************************************************************************
    // *** TODO_A5 : Task 2a: Plane intersection (worked example) ***
    //
    // The plane is a bounded parallelogram with corners
    //   prim.a              (origin)
    //   prim.a + prim.b     (origin + edge u)
    //   prim.a + prim.c     (origin + edge v)
    //   prim.a + prim.b + prim.c
    // and unit normal prim.normal.xyz (pre-computed).
    //
    // Steps:
    //   1. denom = dot(rayDir, n);  reject if |denom| < 1e-6 (ray parallel to plane).
    //   2. t = dot(prim.a - rayOrigin, n) / denom;  reject if t < T_EPS.
    //   3. p = rayOrigin + t * rayDir.
    //   4. Project (p - prim.a) onto u and v: s = local·u/(u·u), r = local·v/(v·v).
    //      Reject if s or r is outside [0, 1].
    //   5. Return Hit{ hit=true, t, pos=p, normal=n }.
    //
    // *** Begin code.
    var h = missHit();
    let n = prim.normal.xyz;
    let denom = dot(rayDir, n);
    if (abs(denom) < 1.0e-6) { return h; }
    let t = dot(prim.a.xyz - rayOrigin, n) / denom;
    if (t < T_EPS) { return h; }
    let p = rayOrigin + t * rayDir;
    let local = p - prim.a.xyz;
    let u = prim.b.xyz;
    let v = prim.c.xyz;
    let s = dot(local, u) / dot(u, u);
    let r = dot(local, v) / dot(v, v);
    if (s < 0.0 || s > 1.0 || r < 0.0 || r > 1.0) { return h; }
    h.hit = true;
    h.t = t;
    h.pos = p;
    h.normal = n;
    return h;

    // *** End code.
    // ************************************************************************
}

fn intersectSphere(rayOrigin : vec3<f32>, rayDir : vec3<f32>, prim : Primitive) -> Hit {
    // ************************************************************************
    // *** TODO_A5 : Task 2b: Sphere intersection ***
    //
    // Sphere: center = prim.a.xyz, radius = prim.extra.x.
    //
    // Solve ‖rayOrigin + t·rayDir − center‖² = r² for t. Assuming
    // |rayDir| = 1, the simplified quadratic is t² + 2bt + c = 0 with
    //   b = dot(rayOrigin - center, rayDir)
    //   c = dot(rayOrigin - center, rayOrigin - center) - r²
    // so t = -b ± sqrt(b² - c).
    //
    // Steps:
    //   1. oc = rayOrigin - center;  b = dot(oc, rayDir);  c = dot(oc, oc) - r².
    //   2. disc = b*b - c;  return missHit() if disc < 0.
    //   3. Pick the nearest root in front of the ray:
    //        t = -b - sqrt(disc);  if t < eps, fall back to -b + sqrt(disc).
    //      If still < eps, miss.
    //   4. p = rayOrigin + t * rayDir;  outward normal = normalize(p - center).
    //
    // *** Begin code.
    var h = missHit();
    let center = prim.a.xyz;
    let r = prim.extra.x;
    let oc = rayOrigin - center;
    let b = dot(oc, rayDir);
    let c = dot(oc, oc) - r * r;
    let disc = b * b - c;
    if (disc < 0.0) { return h; }
    let sqrtDisc = sqrt(disc);
    var t = -b - sqrtDisc;
    if (t < T_EPS) { t = -b + sqrtDisc; }
    if (t < T_EPS) { return h; }
    let p = rayOrigin + t * rayDir;
    h.hit = true;
    h.t = t;
    h.pos = p;
    h.normal = normalize(p - center);
    return h;

    // *** End code.
    // ************************************************************************
}

fn intersectBox(rayOrigin : vec3<f32>, rayDir : vec3<f32>, prim : Primitive) -> Hit {
    // ************************************************************************
    // *** BONUS_A5 : B1: Box intersection (slab method) ***
    //
    // The Cornell scene ships with no axis-aligned box, so this function is
    // never hit by the graded code. To exercise B1, add a box back into the
    // scene:
    //   • scene.js:  bump `PRIM_COUNT` from 8 to 9 and append a
    //                `box(min, max, albedo)` primitive at index 8.
    //   • this file: bump `const PRIM_COUNT : i32 = 8;` to 9 AND change
    //                `array<Primitive, 8>` to `array<Primitive, 9>` (WGSL
    //                requires a literal array length).
    //
    // Axis-aligned box: prim.a.xyz is the smaller corner (min), prim.b.xyz
    // is the larger corner (max).
    //
    // Slab method: for each axis k ∈ {x, y, z}, the box's two parallel faces
    // give two t values where the ray hits axis-aligned planes:
    //   t0 = (min - rayOrigin) / rayDir
    //   t1 = (max - rayOrigin) / rayDir
    // (component-wise vec3 division). The valid t range is the intersection
    // of all three slabs:
    //   tEnter = max( min(t0, t1) over all axes )
    //   tExit  = min( max(t0, t1) over all axes )
    // The ray misses if tEnter > tExit or tExit < eps.
    //
    // Pick t = tEnter (the first crossing). The entry-face normal lies on
    // the axis whose tmin equals tEnter, with sign opposite rayDir on that
    // axis (so the normal faces the ray).
    //
    // Reference: Tavian Barnes, "Fast, Branchless Ray/Bounding Box
    // Intersections" — https://tavianator.com/2011/ray_box.html.
    //
    // *** Begin code.
    return missHit();

    // *** End code.
    // ************************************************************************
}

// Driver: returns the nearest hit across the scene primitives.
fn traceClosest(rayOrigin : vec3<f32>, rayDir : vec3<f32>) -> Hit {
    var best = missHit();
    for (var i : i32 = 0; i < PRIM_COUNT; i = i + 1) {
        let prim = u_scene[i];
        let primType = i32(prim.typeAndPad.x);
        var h : Hit;
        if (primType == 0) {
            h = intersectPlane(rayOrigin, rayDir, prim);
        } else if (primType == 1) {
            h = intersectSphere(rayOrigin, rayDir, prim);
        } else {
            h = intersectBox(rayOrigin, rayDir, prim);
        }
        if (h.hit && h.t < best.t) {
            best = h;
            best.primId = i;
        }
    }
    return best;
}

// Shadow-ray test: returns true if any non-ignored primitive is hit closer
// than maxT. Used by the NEE evaluator to mask occluded light samples.
fn traceAny(rayOrigin : vec3<f32>, rayDir : vec3<f32>, maxT : f32, ignorePrim : i32) -> bool {
    for (var i : i32 = 0; i < PRIM_COUNT; i = i + 1) {
        if (i == ignorePrim) { continue; }
        let prim = u_scene[i];
        let primType = i32(prim.typeAndPad.x);
        var h : Hit;
        if (primType == 0) {
            h = intersectPlane(rayOrigin, rayDir, prim);
        } else if (primType == 1) {
            h = intersectSphere(rayOrigin, rayDir, prim);
        } else {
            h = intersectBox(rayOrigin, rayDir, prim);
        }
        if (h.hit && h.t < maxT) { return true; }
    }
    return false;
}

// =============================================================================
// Direct Lighting via Next-Event Estimation
// `sampleDirectLight` is called once per non-emissive hit to add direct
// light from the ceiling area light. The math is described in the BONUS_A5
// : B2 prose at the bottom of this file.
// =============================================================================

// Area of a parallelogram light: ‖b × c‖.
fn lightArea(prim : Primitive) -> f32 {
    return length(cross(prim.b.xyz, prim.c.xyz));
}

// Uniform random point on a parallelogram light: a + s·b + t·c with s,t ∈ [0,1).
fn sampleAreaLight(prim : Primitive, rng : ptr<function, u32>) -> vec3<f32> {
    let s = rand1(rng);
    let t = rand1(rng);
    return prim.a.xyz + s * prim.b.xyz + t * prim.c.xyz;
}

// LightSample: the unit direction L from the shading point toward a random
// point on the area light, plus the irradiance arriving at the shading
// point from that sample (visibility, distance² falloff, area pdf, and the
// cosine on the light side already folded in). The cosine on the surface
// side (cos θ_i = dot(N, L)) is NOT included here — it lives inside
// `shadeLambertPhong`'s Lambert term.
struct LightSample {
    dir        : vec3<f32>,
    irradiance : vec3<f32>,
}

// Pick a uniform random point on the ceiling area light, cast a shadow ray,
// and return the direction + irradiance arriving at the shading point.
// Returns zero irradiance when the sample is occluded or back-facing.
fn sampleDirectLight(hitPos : vec3<f32>, hitNormal : vec3<f32>, rng : ptr<function, u32>) -> LightSample {
    var ls : LightSample;
    ls.dir = vec3<f32>(0.0, 1.0, 0.0);
    ls.irradiance = vec3<f32>(0.0);

    let lightPrim = u_scene[LIGHT_INDEX];
    let samplePt = sampleAreaLight(lightPrim, rng);
    let toLight = samplePt - hitPos;
    let distSq = dot(toLight, toLight);
    let dist = sqrt(distSq);
    let wi = toLight / dist;

    // Reject if the surface points away from the light, or if the light's
    // emissive face points away from the shading point.
    if (dot(hitNormal, wi) <= 0.0) { return ls; }
    let cosL = dot(lightPrim.normal.xyz, -wi);
    if (cosL <= 0.0) { return ls; }

    // Shadow test: anything closer than the light blocks the connection.
    let shadowOrigin = hitPos + hitNormal * 1.0e-3;
    if (traceAny(shadowOrigin, wi, dist - 1.0e-3, LIGHT_INDEX)) { return ls; }

    // Irradiance = Le · cosL · A / d². The surface cosine cos θ_i is left
    // for `shadeLambertPhong` to apply.
    let area = lightArea(lightPrim);
    ls.dir = wi;
    ls.irradiance = lightPrim.emission.xyz * cosL * area / distSq;
    return ls;
}

// ************************************************************************
// *** BONUS_A5 : B2: Direct lighting via Next-Event Estimation ***
//
// Already implemented (see `sampleDirectLight` above) — no edit slot,
// study task only.
//
// At each non-emissive hit, instead of relying on the random indirect
// bounce to eventually wander into the small ceiling area light (high
// variance in an enclosed Cornell box), draw a uniform random sample y on
// the light surface and form the connection x → y. The contribution that
// connection adds to the surface's outgoing radiance is
//
//     L_e(y) · cos(θ_i) · cos(θ_l) · V(x,y) · A / |x − y|²
//
// where θ_i is the angle at the surface, θ_l is the angle on the light's
// emissive face, V is visibility (0 or 1, set by the shadow ray), and A is
// the light's surface area (the area-pdf factor). The surface BRDF (here:
// Lambert + Phong) is applied separately. cos θ_i is part of the BRDF (it
// lives in the `max(N·L, 0)` term of Lambert), so `sampleDirectLight`
// returns the other factors and lets the shading evaluator close the loop.
//
// Reference: *Ray Tracing in One Weekend: The Rest of Your Life*, chapter
// on light sampling.
// ************************************************************************

// True if the primitive has any positive emission component.
fn isEmissive(prim : Primitive) -> bool {
    return any(prim.emission.xyz > vec3<f32>(0.0));
}

// =============================================================================
// Bonus B4 helper — Cosine-weighted hemisphere sampling
// Variance-reduced indirect-bounce sampler. The graded path uses the simpler
// `normalize(N + randomInUnitSphere())`. Swapping it for
// `cosineWeightedHemisphere(N, rng)` cuts variance — implement the body
// below to enable B4.
// =============================================================================

fn cosineWeightedHemisphere(normal : vec3<f32>, rng : ptr<function, u32>) -> vec3<f32> {
    // ************************************************************************
    // *** BONUS_A5 : B4: Cosine-weighted hemisphere sampling (Malley's method) ***
    //
    // For a Lambertian BRDF, sampling proportional to cos(θ) gives a pdf of
    // cos(θ)/π. The BRDF·cos/pdf factor then collapses to `albedo`, which
    // matches what throughput already does — so swapping in this sampler
    // cuts variance without changing the throughput update.
    //
    // Malley's method: sample a disk uniformly and project up onto the
    // hemisphere — equivalent to drawing cos θ from sqrt(1 − r₂).
    //
    // Reference: *Ray Tracing in One Weekend: The Rest of Your Life*.
    //
    // *** Begin code.
    return normal;

    // *** End code.
    // ************************************************************************
}

// =============================================================================
// Task 3 — Lambert + Phong direct shading
// =============================================================================

fn shadeLambertPhong(
    N : vec3<f32>,
    L : vec3<f32>,
    V : vec3<f32>,
    albedo : vec3<f32>,
    ks : f32,
    shininess : f32,
) -> vec3<f32> {
    // ************************************************************************
    // *** TODO_A5 : Task 3: Lambert + Phong direct shading ***
    //
    // Evaluate the local shading at a surface point lit by a single light
    // sample with direction L (unit vector from the surface toward the
    // light). Inputs:
    //   N           surface normal (unit)
    //   L           direction to the light sample (unit)
    //   V           direction toward the viewer (unit)
    //   albedo      diffuse reflectance (rgb in [0,1])
    //   ks          specular coefficient (scalar)
    //   shininess   Phong exponent (higher = tighter highlight)
    //
    // Compute the Lambert diffuse term plus the Phong specular term:
    //
    //   diffuse  = albedo · max(0, N·L)
    //   R        = reflect(-L, N)              (mirror direction of L about N)
    //   specular = ks · max(0, R·V)^shininess
    //
    // Return diffuse + vec3(specular). Distance falloff, shadows, and area
    // sampling are handled outside this function — you only evaluate the
    // local shading.
    //
    // Reference: the Lambert + Phong shading model from the rasterization
    // assignments.
    //
    // *** Begin code.
    let diffuse = albedo * max(0.0, dot(N, L));
    let R = reflect(-L, N);
    let specular = ks * pow(max(0.0, dot(R, V)), shininess);
    return diffuse + vec3<f32>(specular);

    // *** End code.
    // ************************************************************************
}

@compute @workgroup_size(8, 8, 1)
fn cs_main(@builtin(global_invocation_id) gid : vec3<u32>) {
    let dims = textureDimensions(outTex);
    if (gid.x >= dims.x || gid.y >= dims.y) {
        return;
    }

    var rngState = seedRng(gid.xy, u32(u_frame.frameIndex));

    // ************************************************************************
    // *** TODO_A5 : Task 1: Primary Ray Generation (worked example) ***
    //
    // Build the world-space pinhole ray that goes from the camera origin
    // through the center of pixel (gid.x, gid.y).
    //
    // Inputs:
    //   gid.x, gid.y          pixel coordinate (0..dims.x, 0..dims.y)
    //   dims                  output texture size (vec2<u32>)
    //   u_camera.origin.xyz   eye position
    //   u_camera.forward.xyz  view direction (unit)
    //   u_camera.right.xyz    right axis, pre-scaled by tan(fov/2) * aspect
    //   u_camera.up.xyz       up    axis, pre-scaled by tan(fov/2)
    //
    // Steps:
    //   1. pixel = gid.xy + 0.5                    (sample the pixel center)
    //   2. ndc   = pixel / dims * 2 - 1            (map to [-1, 1]²)
    //   3. dir   = forward + ndc.x * right - ndc.y * up
    //   4. normalize(dir)
    //
    // Image-space y goes top→down; NDC y goes bottom→up — note the minus
    // sign on the `ndc.y * up` term.
    //
    // *** Begin code.
    let dimsF = vec2<f32>(f32(dims.x), f32(dims.y));
    let pixel = vec2<f32>(f32(gid.x), f32(gid.y)) + vec2<f32>(0.5);
    let ndc = pixel / dimsF * 2.0 - vec2<f32>(1.0);
    let primaryDir = normalize(
        u_camera.forward.xyz
        + ndc.x * u_camera.right.xyz
        - ndc.y * u_camera.up.xyz
    );
    let primaryOrigin = u_camera.origin.xyz;

    // *** End code.
    // ************************************************************************

    // -------------------------------------------------------------------------
    // Cornell-box bounce loop. Two student edit slots plug in here:
    //
    //   • Task 3 — `shadeLambertPhong` (defined above) is called inside the
    //     NEE block below to compute direct shading at each non-emissive hit.
    //
    //   • Task 4 — the indirect-bounce scatter site below carries its own
    //     narrow `TODO_A5 : Task 4` banner; the metal-vs-diffuse branch
    //     lives there.
    //
    // The NEE checkbox toggles `u_frame.neeEnabled` between 1.0 (default,
    // bright Cornell — direct light handled inline) and 0.0 (indirect-only
    // path tracer view, noisy because Cornell has no sky).
    // -------------------------------------------------------------------------
    let maxDepth = i32(u_frame.maxBounces);
    let neeOn = u_frame.neeEnabled > 0.5;
    var pixelColor = vec3<f32>(0.0);
    for (var s : i32 = 0; s < SPP; s = s + 1) {
        var throughput = vec3<f32>(1.0);
        var rayO = primaryOrigin;
        var rayD = primaryDir;
        var sampleColor = vec3<f32>(0.0);

        for (var b : i32 = 0; b < maxDepth; b = b + 1) {
            let hit = traceClosest(rayO, rayD);
            if (!hit.hit) { break; }
            let prim = u_scene[hit.primId];

            if (isEmissive(prim)) {
                // Direct emissive hit. With NEE on, only count it on bounce 0
                // — later bounces would double-count what NEE already added
                // at the previous diffuse hit. With NEE off, count emission
                // on any bounce so the indirect-only path tracer can still
                // reach the light.
                if (b == 0 || !neeOn) {
                    sampleColor = sampleColor + throughput * prim.emission.xyz;
                }
                break;
            }

            // Material params from the metal flag (extra.y).
            let isMetal = prim.extra.y > 0.5;
            let ks = select(0.0, 0.6, isMetal);
            let shininess = select(1.0, 64.0, isMetal);

            // Direct lighting via NEE. `sampleDirectLight` returns the light
            // direction and the irradiance arriving at the surface;
            // `shadeLambertPhong` turns that into outgoing radiance.
            if (neeOn) {
                let ls = sampleDirectLight(hit.pos, hit.normal, &rngState);
                let viewDir = -rayD;
                let shading = shadeLambertPhong(hit.normal, ls.dir, viewDir, prim.albedo.xyz, ks, shininess);
                sampleColor = sampleColor + throughput * shading * ls.irradiance;
            }

            // ************************************************************************
            // *** TODO_A5 : Task 4: Metal reflection ***
            //
            // Pick the indirect-bounce direction. The graded path branches on
            // the metal flag (`isMetal` above):
            //   • diffuse surface  → random Lambertian scatter,
            //     `normalize(hit.normal + randomInUnitSphere(rng))` (this is
            //     what the stub does unconditionally — wrong for metal).
            //   • metal surface    → perfect mirror reflection of the incoming
            //     ray about the surface normal. WGSL has a builtin for this;
            //     check the language reference for `reflect`. Pass the
            //     incoming ray direction and the hit normal — no Fresnel,
            //     no fuzz, just the mirror direction.
            //
            // Replace the stub with `if (isMetal) { … } else { … }` and pick
            // the appropriate scatter direction; assign it to `rayD`. The
            // throughput attenuation by albedo and the ray-origin offset on
            // the lines AFTER the End-code marker stay outside your branch.
            //
            // After T4 lands, the metal sphere reflects the room around it
            // on top of the Phong specular highlight that T3 already paints
            // from the area light.
            //
            // *** Begin code.
            if (isMetal) {
                rayD = reflect(rayD, hit.normal);
            } else {
                let scatterDir = hit.normal + randomInUnitSphere(&rngState);
                rayD = normalize(scatterDir);
            }

            // *** End code.
            // ************************************************************************

            throughput = throughput * prim.albedo.xyz;
            rayO = hit.pos + hit.normal * 1.0e-3;
        }
        pixelColor = pixelColor + sampleColor;
    }
    pixelColor = pixelColor / f32(SPP);

    // Multi-frame progressive accumulation, on/off via the *Multi-frame
    // accumulation* checkbox. With it on, blend the new frame into the
    // running average; with it off, write the frame directly. (Bonus B3
    // describes the math.)
    let pixelI = vec2<i32>(i32(gid.x), i32(gid.y));
    let prev = textureLoad(accumPrev, pixelI, 0).xyz;
    var output : vec3<f32>;
    if (u_frame.accumEnabled > 0.5) {
        let n = u_frame.sampleCount;
        if (n <= 1.0) {
            output = pixelColor;
        } else {
            output = (prev * (n - 1.0) + pixelColor) / n;
        }
    } else {
        output = pixelColor + 0.0 * prev;
    }
    textureStore(outTex, pixelI, vec4<f32>(output, 1.0));
}

struct VsOut {
    @builtin(position) pos : vec4<f32>,
    @location(0) uv : vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vid : u32) -> VsOut {
    let x = f32((vid << 1u) & 2u);
    let y = f32(vid & 2u);
    var out : VsOut;
    out.pos = vec4<f32>(x * 2.0 - 1.0, y * 2.0 - 1.0, 0.0, 1.0);
    out.uv = vec2<f32>(x, 1.0 - y);
    return out;
}

@fragment
fn fs_main(in : VsOut) -> @location(0) vec4<f32> {
    let raw = textureSample(blitTex, blitSamp, in.uv).rgb;
    let mapped = raw / (raw + vec3<f32>(1.0));      // Reinhard
    let gamma = pow(max(mapped, vec3<f32>(0.0)), vec3<f32>(1.0 / 2.2));
    return vec4<f32>(gamma, 1.0);
}

// ************************************************************************
// *** BONUS_A5 : B3: Multi-frame progressive accumulation ***
//
// Already implemented — no edit slot, study task only. Toggle on/off with
// the *Multi-frame accumulation* checkbox in the page's Controls panel.
//
// `cs_main` already integrates SPP samples per pixel per frame. With NEE,
// direct lighting is low-variance, but the indirect bounce (random scatter)
// is still stochastic — every frame produces an independent noisy estimate
// of the indirect light (Cornell color bleed especially). Multi-frame
// progressive accumulation blends each new frame into a running average:
//
//   if u_frame.sampleCount == 1: output = pixelColor   (first sample after reset)
//   else:                        output = (prev * (n - 1) + pixelColor) / n
//
// where `prev` is the previous frame's accumulated value and
// n = u_frame.sampleCount. Camera, FOV, bounces, NEE and accum toggles all
// reset n to 1 so the average restarts on any change.
//
// Variance drops by √n: ≈ 8× over 60 frames (~1 s at 60 fps), ≈ 17× over
// 300 frames (~5 s), ≈ 25× over 600 frames (~10 s). Stand still and the
// indirect noise integrates to clean.
//
// **Warning — accumulation masks bugs.** A buggy `shadeLambertPhong` (e.g.
// wrong sign on the reflected vector, missing `max(0, …)`, swapped L and
// V) averages to consistent-looking-but-wrong output. Toggle accumulation
// OFF while implementing or debugging T3 — the per-frame noise is your
// fast diagnostic; the running average will lie to you.
//
// Reference: *Ray Tracing in One Weekend: The Rest of Your Life*, chapter
// on Monte Carlo integration / running estimators.
// ************************************************************************
