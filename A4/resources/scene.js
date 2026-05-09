"use strict";

// FRAMEWORK — Cornell-box geometry data; not part of the A5 assignment.
// Eight analytic primitives are defined below and packed into a uniform
// buffer at startup (see webgpu-task5.js). Students implement the ray
// tracer in webgpu-task5.wgsl; this file just provides the scene data.

// A5 Cornell-box scene definition (PBRT-style: +Y up, light on ceiling,
// camera outside the open front face looking down -Z).
//
// Box bounds: x in [-1, +1], y in [0, 2], z in [-1, +1].
//
// GPU layout per primitive (32 floats = 128 bytes, std140-friendly):
//   slot 0  [4f]: type (0=plane, 1=sphere, 2=box), pad, pad, pad
//   slot 1  [4f]: a    — plane origin / sphere center / box min
//   slot 2  [4f]: b    — plane edge u / box max / unused
//   slot 3  [4f]: c    — plane edge v / unused
//   slot 4  [4f]: normal (xyz, _)  — pre-computed for planes
//   slot 5  [4f]: albedo  (rgb, _)
//   slot 6  [4f]: emission (rgb, _)
//   slot 7  [4f]: extra (.x = sphere radius, .y = metal flag 0|1), pad, pad
//
// Eight primitives × 128 B = 1024 B (well within uniform-buffer budget).

const PRIM_TYPE_PLANE  = 0;
const PRIM_TYPE_SPHERE = 1;
const PRIM_TYPE_BOX    = 2;

const FLOATS_PER_PRIM  = 32;
const PRIM_COUNT       = 8;

const CORNELL_WHITE = [0.73, 0.73, 0.73];
const CORNELL_RED   = [0.65, 0.05, 0.05];
const CORNELL_GREEN = [0.12, 0.45, 0.15];
const LIGHT_EMISSION = [15.0, 15.0, 15.0];

function plane(origin, u, v, normal, albedo, emission) {
    return {
        type: PRIM_TYPE_PLANE,
        a: origin,
        b: u,
        c: v,
        normal: normal,
        albedo: albedo,
        emission: emission || [0, 0, 0],
        radius: 0
    };
}

function sphere(center, radius, albedo, emission, metal) {
    return {
        type: PRIM_TYPE_SPHERE,
        a: center,
        b: [0, 0, 0],
        c: [0, 0, 0],
        normal: [0, 0, 0],
        albedo: albedo,
        emission: emission || [0, 0, 0],
        radius: radius,
        metal: metal ? 1.0 : 0.0
    };
}

function box(min, max, albedo, emission) {
    return {
        type: PRIM_TYPE_BOX,
        a: min,
        b: max,
        c: [0, 0, 0],
        normal: [0, 0, 0],
        albedo: albedo,
        emission: emission || [0, 0, 0],
        radius: 0
    };
}

const CornellBox = [
    // Floor (y=0, normal up)
    plane([-1, 0, +1], [2, 0, 0], [0, 0, -2], [0, +1, 0], CORNELL_WHITE),
    // Ceiling (y=2, normal down)
    plane([-1, 2, -1], [2, 0, 0], [0, 0, +2], [0, -1, 0], CORNELL_WHITE),
    // Back wall (z=-1, normal +z)
    plane([-1, 0, -1], [2, 0, 0], [0, 2, 0], [0, 0, +1], CORNELL_WHITE),
    // Left wall (x=-1, normal +x, RED)
    plane([-1, 0, +1], [0, 0, -2], [0, 2, 0], [+1, 0, 0], CORNELL_RED),
    // Right wall (x=+1, normal -x, GREEN)
    plane([+1, 0, -1], [0, 0, +2], [0, 2, 0], [-1, 0, 0], CORNELL_GREEN),
    // Ceiling area light (small quad just below ceiling, normal down, emissive)
    plane([-0.25, 1.999, -0.25], [0.5, 0, 0], [0, 0, +0.5], [0, -1, 0], CORNELL_WHITE, LIGHT_EMISSION),
    // Diffuse sphere on the floor (white)
    sphere([0.4, 0.4, 0.3], 0.4, CORNELL_WHITE),
    // Metal sphere (T4 demo target). y-center 0.55 clears the floor by 0.05 to
    // avoid a visible "is the sphere clipping the floor?" artifact.
    sphere([-0.4, 0.55, -0.3], 0.5, CORNELL_WHITE, undefined, true)
];

function packForGPU(primitives) {
    const data = new Float32Array(FLOATS_PER_PRIM * PRIM_COUNT);
    for (let i = 0; i < primitives.length && i < PRIM_COUNT; i++) {
        const p = primitives[i];
        const base = i * FLOATS_PER_PRIM;
        // slot 0: type, pad, pad, pad
        data[base + 0] = p.type;
        // slot 1: a (xyz, _)
        data[base + 4] = p.a[0]; data[base + 5] = p.a[1]; data[base + 6] = p.a[2];
        // slot 2: b
        data[base + 8] = p.b[0]; data[base + 9] = p.b[1]; data[base + 10] = p.b[2];
        // slot 3: c
        data[base + 12] = p.c[0]; data[base + 13] = p.c[1]; data[base + 14] = p.c[2];
        // slot 4: normal
        data[base + 16] = p.normal[0]; data[base + 17] = p.normal[1]; data[base + 18] = p.normal[2];
        // slot 5: albedo
        data[base + 20] = p.albedo[0]; data[base + 21] = p.albedo[1]; data[base + 22] = p.albedo[2];
        // slot 6: emission
        data[base + 24] = p.emission[0]; data[base + 25] = p.emission[1]; data[base + 26] = p.emission[2];
        // slot 7: extra (.x = radius for sphere, .y = metal flag 0|1)
        data[base + 28] = p.radius;
        data[base + 29] = p.metal || 0.0;
    }
    return data;
}
