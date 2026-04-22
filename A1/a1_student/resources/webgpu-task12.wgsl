struct VsOut {
    @builtin(position) position : vec4f,
    @location(0) color : vec3f
};

@group(0) @binding(0) var<uniform> u_params : vec4f;

@vertex
fn vs_main(@location(0) a_pos : vec2f, @location(1) a_col : vec3f) -> VsOut {
    var out : VsOut;
    out.position = vec4f(a_pos, 0.0, 1.0);
    out.color = a_col;
    return out;
}

@fragment
fn fs_main(@location(0) color : vec3f) -> @location(0) vec4f {
    let alpha = u_params.x;
    return vec4f(color, alpha);
}
