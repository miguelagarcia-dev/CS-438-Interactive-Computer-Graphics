// --- globals / camera / transforms ---
struct Globals {
    u_modelview : mat4x4<f32>,
    u_proj : mat4x4<f32>,
    u_normalmat : mat4x4<f32>,
    u_lightpos : vec4<f32>,
    u_lightcol : vec4<f32>,
    u_ka : vec4<f32>,
    u_kd : vec4<f32>,
    u_ks : vec4<f32>,
    u_qs : vec4<f32>,
    u_mode : vec4<f32>
};

@group(0) @binding(0) var<uniform> g : Globals;
@group(0) @binding(1) var u_kdSampler : sampler;
@group(0) @binding(2) var u_kdTexture : texture_2d<f32>;
@group(0) @binding(3) var u_nmSampler : sampler;
@group(0) @binding(4) var u_nmTexture : texture_2d<f32>;

// --- geometry attributes ---
struct VSIn {
    @location(0) a_position : vec3<f32>,
    @location(1) a_color : vec3<f32>,
    @location(2) a_normal : vec3<f32>,
    @location(3) a_tex : vec2<f32>,
    @location(4) a_tangent : vec3<f32>
};

struct FrameVSIn {
    @location(0) a_position : vec3<f32>,
    @location(1) a_color : vec3<f32>
};

struct VSOut {
    @builtin(position) position : vec4<f32>,
    @location(0) posVS : vec3<f32>,
    @location(1) normalVS : vec3<f32>,
    @location(2) uv : vec2<f32>,
    @location(3) color : vec3<f32>,
    @location(4) normalMS : vec3<f32>,
    @location(5) tangentMS : vec3<f32>,
    @location(6) posMS : vec3<f32>,
    @location(7) lightTS : vec3<f32>,
    @location(8) eyeTS : vec3<f32>
};

fn toWebGPUClip(clipPos: vec4<f32>) -> vec4<f32> {
    return vec4<f32>(clipPos.xy, 0.5 * (clipPos.z + clipPos.w), clipPos.w);
}

@vertex
fn vs_main(input : VSIn) -> VSOut {
    var out : VSOut;
    let localPos = select(input.a_position, 0.09 * normalize(input.a_position), g.u_mode.x < -0.5);
    let viewPos = g.u_modelview * vec4<f32>(localPos, 1.0);
    let normalVS = normalize((g.u_normalmat * vec4<f32>(input.a_normal, 0.0)).xyz);

    out.position = toWebGPUClip(g.u_proj * viewPos);
    out.posVS = viewPos.xyz;
    out.normalVS = normalVS;
    out.uv = input.a_tex;
    out.color = input.a_color;
    out.normalMS = normalize(input.a_normal);
    out.tangentMS = normalize(input.a_tangent);
    out.posMS = normalize(input.a_position);

    // ************************************************************************
    // *** TODO_A3 : Task 3a: Transform to Tangent Space in VS ***
    //
    // Implement transformation to tangents-space for normal mapping.
    // Using the supplied tangent attribute (a_tangent) and normal attribute (a_normal)
    // construct the TBN matrix.
    // Hint: you need to compute the bitangent. Also be careful, since the order/direction matters!
    // Also note: a_tangent and a_normal are in model-space.
    // Next, transform the light vector (u_lightpos) and the view vector (posVS) from view-space
    // into tangent-space in order to compute lighting in the tangent-space.
    // Note that u_lightpos and posVS are both in view-space.
    // Hint: use out.lightTS and out.eyeTS to pass the values to the fragment shader.
    //
    // *** Begin code.

    // transform tangent from model-space to view-space using the normal matrix which is same as normals, w=0 for direction
    let tangentVS = normalize((g.u_normalmat * vec4<f32>(input.a_tangent, 0.0)).xyz);

    // compute bitangent as cross(N, T) in view-space to complete the TBN frame
    // normalVS is already computed above as the view-space normal
    let bitangentVS = normalize(cross(normalVS, tangentVS));

    // to go from view-space into tangent-space, we multiply by TBN^T (its transpose).
    // since TBN is orthonormal its inverse IS its transpose, so we just project each
    // view-space vector onto T, B, and N with dot products.
    let lightDir = g.u_lightpos.xyz - out.posVS;
    out.lightTS = vec3<f32>(dot(lightDir, tangentVS), dot(lightDir, bitangentVS), dot(lightDir, normalVS));

    // eye/view direction: from fragment to camera (camera sits at origin in view-space)
    let eyeDir = -out.posVS;
    out.eyeTS = vec3<f32>(dot(eyeDir, tangentVS), dot(eyeDir, bitangentVS), dot(eyeDir, normalVS));

    // *** End code.
    // ************************************************************************
    return out;
}

@vertex
fn vs_frame(input : FrameVSIn) -> VSOut {
    var out : VSOut;
    let viewPos = g.u_modelview * vec4<f32>(input.a_position, 1.0);
    out.position = toWebGPUClip(g.u_proj * viewPos);
    out.posVS = viewPos.xyz;
    out.normalVS = vec3<f32>(0.0, 0.0, 1.0);
    out.uv = vec2<f32>(0.0, 0.0);
    out.color = input.a_color;
    out.normalMS = vec3<f32>(0.0, 0.0, 1.0);
    out.tangentMS = vec3<f32>(1.0, 0.0, 0.0);
    out.posMS = input.a_position;
    out.lightTS = vec3<f32>(0.0, 0.0, 1.0);
    out.eyeTS = vec3<f32>(0.0, 0.0, 1.0);
    return out;
}

fn phongLighting(V: vec3<f32>, N: vec3<f32>, L: vec3<f32>, r: f32, kdColor: vec3<f32>) -> vec3<f32> {
    let light = 10.0 * g.u_lightcol.xyz / max(r * r, 1e-6);
    let NL = max(dot(N, L), 0.0);
    let R = reflect(-L, N);
    let S = max(dot(V, R), 0.0);
    let diffuse = kdColor * NL * light;
    let spec = g.u_ks.xyz * pow(S, g.u_qs.x) * light;
    let ambient = g.u_ka.xyz * g.u_lightcol.xyz;
    return diffuse + spec + ambient;
}

@fragment
fn fs_main(input : VSOut) -> @location(0) vec4<f32> {
    let shade = g.u_mode.y;
    if (g.u_mode.x < -0.5) {
        return vec4<f32>(g.u_lightcol.xyz, 1.0);
    }

    if (shade < -5.5) { // -6: positions
        return vec4<f32>((input.posMS + vec3<f32>(1.0)) * 0.5, 1.0);
    }
    if (shade < -4.5) { // -5: tangents
        return vec4<f32>((input.tangentMS + vec3<f32>(1.0)) * 0.5, 1.0);
    }
    if (shade < -3.5) { // -4: normals
        return vec4<f32>((input.normalMS + vec3<f32>(1.0)) * 0.5, 1.0);
    }
    if (shade < -2.5) { // -3: UV
        return vec4<f32>(input.uv, 1.0, 1.0);
    }
    if (shade < -1.5) { // -2: colors
        return vec4<f32>(input.color, 1.0);
    }
    if (shade < -0.5) { // -1: light dummy emissive
        return vec4<f32>(g.u_lightcol.xyz, 1.0);
    }

    // ************************************************************************
    // *** TODO_A3 : Task 1a: Sampling from a Diffuse Texture ***
    //
    // Implement sampling from the diffuse texture sampler.
    // Use u_mode.z to decide if the kd-value should be taken from the sampler or not.
    // If u_mode.z is 1.0, use the value from the texture as kd-coefficient.
    // If u_mode.z is 0.0, use the diffuse coefficient rgb-values u_kd.
    // NOTE: to get full points, avoid using an if-switch.
    //
    // *** Begin code.

    // sample the diffuse color from the texture at the fragment's uv coordinate
    let sampledKd = textureSample(u_kdTexture, u_kdSampler, input.uv).rgb;

    // blend between the material kd and the sampled texture value based on whether a texture is bound.
    // u_mode.z is 1.0 when a diffuse texture is active, 0.0 when not. Plus mix() lets us avoid the if-switch.
    let kdColor = mix(g.u_kd.xyz, sampledKd, g.u_mode.z);

    // *** End code.
    // ************************************************************************
    if (shade < 1.5) { // 1: Phong (view space)
        let L = g.u_lightpos.xyz - input.posVS;
        let V = -input.posVS;
        let N = input.normalVS;
        return vec4<f32>(
            phongLighting(normalize(V), normalize(N), normalize(L), length(L), kdColor),
            1.0
        );
    }
    if (shade < 2.5) { // 2: Phong in tangent space with optional normal-map sampling
        // ************************************************************************
        // *** TODO_A3 : Task 3b: Normal Sampling in FS ***
        //
        // Implement normal-mapping in tangent-space by appropriately sampling
        // the value of the normal vector (N) from the normal-map texture.
        // Also, set the value of light-direction and eye-direction appropriately.
        // Note to account for a solution if the sampler is not set:
        // in this case g.u_mode.w is equal to zero.
        // Similarly, maximum points are given if you avoid using an IF-switch.
        //
        // *** Begin code.

        // sample the normal map 
        // texture stores normals in [0,1], so remap to [-1,1] tangent-space
        let sampledNm = textureSample(u_nmTexture, u_nmSampler, input.uv).rgb;
        let sampledNTS = normalize(2.0 * sampledNm - vec3<f32>(1.0));

        // when no normal map is bound (u_mode.w == 0), we fall back to the canonical tangent-space normal (0,0,1).
        // (0,0,1) in tangent-space is equivalent to the interpolated vertex normal which gives the same
        // result as view-space Phong. mix() avoids using that if-switch here.
        let N = normalize(mix(vec3<f32>(0.0, 0.0, 1.0), sampledNTS, g.u_mode.w));

        // L and V are already in tangent-space passed from the vertex shader via lightTS/eyeTS.
        // length(L) preserves the view-space distance because TBN is orthonormal (no scaling).
        let L = input.lightTS;
        let V = input.eyeTS;

        // *** End code.
        // ************************************************************************
        return vec4<f32>(
            phongLighting(normalize(V), normalize(N), normalize(L), length(L), kdColor),
            1.0
        );
    }
    if (shade < 3.5) { // 3: Flat shading from screen-space derivatives
        let U = dpdx(input.posVS);
        // WebGPU's screen-space derivative direction for +Y is flipped here,
        // so dpdy is negated to keep the expected flat-shading orientation.
        let Vd = -dpdy(input.posVS);
        let N = cross(U, Vd);
        let L = g.u_lightpos.xyz - input.posVS;
        let V = -input.posVS;
        return vec4<f32>(
            phongLighting(normalize(V), normalize(N), normalize(L), length(L), kdColor),
            1.0
        );
    }

    let L = g.u_lightpos.xyz - input.posVS;
    let V = -input.posVS;
    let N = input.normalVS;
    return vec4<f32>(
        phongLighting(normalize(V), normalize(N), normalize(L), length(L), kdColor),
        1.0
    );
}
