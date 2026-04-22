// CS 438 / CS 657 - Assignment 2 shader (WebGPU).
// Space convention:
// - u_modelview transforms object-space -> view-space.
// - Lighting in this shader is evaluated in view-space.
// Shading mode contract (u_mode.y):
// -3 wireframe, -2 coordinate frame, -1 light bulb, 0 Gouraud, 1 Phong, 2 Flat.

struct Globals {
    u_proj : mat4x4<f32>,       // Projection matrix (OpenGL-style clip convention).
    u_modelview : mat4x4<f32>,  // Object -> view transform.
    u_mode : vec4<f32>,         // x: bulb flag, y: shading mode selector.
    u_color : vec4<f32>,        // Constant color used by wire/bulb helper passes.
    u_lightpos : vec4<f32>,     // Light position in view-space.
    u_lightcol : vec4<f32>,     // Light intensity/color.
    u_ka : vec4<f32>,           // Ambient material coefficient.
    u_kd : vec4<f32>,           // Diffuse material coefficient.
    u_ks : vec4<f32>,           // Specular material coefficient.
    u_qs : vec4<f32>,           // x: shininess exponent.
    u_normalmat : mat4x4<f32>,  // Transpose-inverse of model-view.
};

@group(0) @binding(0) var<uniform> g : Globals;

struct VsIn {
    @location(0) a_position : vec3<f32>,
    @location(1) a_color : vec3<f32>,
    @location(2) a_normal : vec3<f32>,
    @location(3) a_tex : vec2<f32>,
};

struct VsFrameIn {
    @location(0) a_position : vec3<f32>,
    @location(1) a_color : vec3<f32>,
};

struct VsOut {
    @builtin(position) position : vec4<f32>,
    @location(0) color : vec3<f32>,
    @location(1) normal : vec3<f32>,
    @location(2) pos : vec3<f32>,
};

fn toWebGPUClip(clipPos : vec4<f32>) -> vec4<f32> {
    // WebGL-style projection gives clip z in [-w, +w].
    // WebGPU expects clip z in [0, +w], so remap z only.
    return vec4<f32>(
        clipPos.x,
        clipPos.y,
        0.5 * (clipPos.z + clipPos.w),
        clipPos.w
    );
}

fn phongLighting(V : vec3<f32>, N : vec3<f32>, L : vec3<f32>, r : f32) -> vec3<f32> {
    // *** TODO_A2 *** Task 2b
    // Implement the Phong reflection model here:
    // diffuse + specular + ambient, using V/N/L/r and material/light uniforms.

    // *** begin code, replace the code below          

    // ambient is the base lighting that exists everywhere, regardless of direction.
    // it's just the material's ambient color scaled by the light color.
    let ambient = g.u_ka.xyz * g.u_lightcol.xyz;

    // diffuse depends on the angle between the surface normal and the light direction.
    // dot(N, L) gives us that and if the surface faces the light its 1, if its perpendicular its 0,
    // and we clamp negatives to 0 so backfaces don't subtract light.
    let diff    = max(dot(N, L), 0.0);
    let diffuse = g.u_kd.xyz * g.u_lightcol.xyz * diff;

    // specular is the shiny highlight. we reflect the light vector over the normal to get R,
    // then check how closely R aligns with V (the direction to the viewer).
    // the shininess exponent (u_qs.x) controls how tight/wide that highlight is.
    let R       = reflect(-L, N);
    let spec    = pow(max(dot(R, V), 0.0), g.u_qs.x);
    let specular = g.u_ks.xyz * g.u_lightcol.xyz * spec;

    return ambient + diffuse + specular;

    // *** end code
}

@vertex
fn vs_main(in : VsIn) -> VsOut {
    var out : VsOut;
    // mode is stored as float in uniform; round for stable integer-like dispatch.
    let mode = i32(round(g.u_mode.y));
    let isBulb = g.u_mode.x > 0.5;

    // Light bulb helper pass reuses mesh vertices but shrinks to a tiny sphere.
    let localPos = select(in.a_position, 0.09 * normalize(in.a_position), isBulb);

    // *** TODO_A2 *** Task 2a
    // Transform vertex position and normal into view space and assign
    // out.pos / out.normal (used by Gouraud/Phong/Flat shading).

    // *** begin code, replace the code below    
                                                                                                         
    // transform the vertex position from object space into view space using the model-view matrix.
    // w=1 because it's a point, not a direction.
    let posVS4 = g.u_modelview * vec4<f32>(localPos, 1.0);

    // normals need a different transform, we use the transpose-inverse of model-view (u_normalmat)
    // so that the normals stay perpendicular to the surface even after non-uniform scaling.
    // w=0 here because same thing as before .
    let normalVS = (g.u_normalmat * vec4<f32>(in.a_normal, 0.0)).xyz;

    // *** end code

    // out.position: clip-space position for rasterization (with WebGPU z-remap).
    // out.pos/out.normal: view-space values for lighting in fragment stage.
    out.position = toWebGPUClip(g.u_proj * posVS4);
    out.pos = posVS4.xyz;
    out.normal = normalVS;

    var vertexColor = in.a_color;
    
    switch (mode) {
        case 0: {
            // Gouraud mode: compute lighting here per-vertex and interpolate color.
            let lvec = g.u_lightpos.xyz - out.pos;
            vertexColor = phongLighting(-normalize(out.pos), normalize(out.normal), normalize(lvec), length(lvec));
        }
        case -2: {
            // Coordinate frame pass: use input line color directly.
            vertexColor = in.a_color;
        }
        case -1: {
            // Bulb pass: emissive color from light uniform.
            vertexColor = g.u_lightcol.xyz;
        }
        default: {
            // Phong/Flat paths compute final lighting in fragment stage.
            vertexColor = in.a_color;
        }
    }
    out.color = vertexColor;

    return out;
}

@vertex
fn vs_frame(in : VsFrameIn) -> VsOut {
    var out : VsOut;
    // Frame/axes pass: transform positions, forward color, lighting data unused.
    let posVS4 = g.u_modelview * vec4<f32>(in.a_position, 1.0);
    out.position = toWebGPUClip(g.u_proj * posVS4);
    out.color = in.a_color;
    out.normal = vec3<f32>(0.0, 0.0, 1.0);
    out.pos = posVS4.xyz;
    return out;
}

@fragment
fn fs_main(in : VsOut) -> @location(0) vec4<f32> {
    // Mode map:
    //  0 = Gouraud color passthrough
    //  1 = Phong per-fragment
    //  2 = Flat via derivatives
    // -3 = Wire constant color
    // -1 = Bulb emissive color
    // else = fallback interpolated color
    let mode = i32(round(g.u_mode.y));
    let lvec = g.u_lightpos.xyz - in.pos;

    var fragColor = in.color;

    switch (mode) {
        case 0: {
            // Gouraud: color was already computed in vertex stage.
            fragColor = in.color;
        }
        case 1: {
            // Phong: evaluate lighting at each fragment using interpolated normal/position.
            fragColor = phongLighting(-normalize(in.pos), normalize(in.normal), normalize(lvec), length(lvec));
        }
        case 2: {
            // Flat shading: derive one face normal from screen-space derivatives.
            let U = dpdx(in.pos);
            // WebGPU framebuffer-space Y derivative direction differs from the old WebGL reference orientation.
            let Vd = -dpdy(in.pos);
            let N = normalize(cross(U, Vd));
            fragColor = phongLighting(-normalize(in.pos), normalize(N), normalize(lvec), length(lvec));
        }
        case -3: {
            // Wireframe overlay: constant dark line color from u_color.
            fragColor = g.u_color.xyz;
        }
        case -1: {
            // Bulb helper object: emissive light color.
            fragColor = g.u_lightcol.xyz;
        }
        default: {
            // Fallback path (e.g., coordinate frame pass).
            fragColor = in.color;
        }
    }

    return vec4<f32>(fragColor, 1.0);
}
