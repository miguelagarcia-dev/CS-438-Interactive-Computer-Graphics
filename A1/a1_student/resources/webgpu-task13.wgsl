struct VsOut {
    @builtin(position) position : vec4f,
    @location(0) color : vec3f
};

@group(0) @binding(0) var<uniform> u_params : vec4f;

@vertex
fn vs_main(@location(0) a_pos : vec3f, @location(1) a_col : vec3f) -> VsOut {
    var out : VsOut;
    // *** TODO_A1 : Task 3b
    // Extend the vertex stage to process 3D positions for the tetra geometry.
    // Hint: change the position input to vec3f and propagate z to clip-space.
    // WebGPU clip-space z is in [0, 1], unlike legacy WebGL [-1, 1].
    // --- begin code ---

    // The model vertices have z values roughly in the range [-1, +1].
    // WebGPU’s NDC space expects z in [0, 1], where 0 is the near plane
    // and 1 is the far plane. so by remaping it using (z + 1.0) * 0.5, 
    // which converts [-1, 1] → [0, 1] without applying any perspective.
    //   z = -1 becomes 0 (closest to the camera)
    //   z = +1 becomes 1 (farthest from the camera)
    //
    out.position = vec4f(a_pos.x, a_pos.y, (a_pos.z + 1.0) * 0.5, 1.0);

    // --- end code ---
    out.color = a_col;
    return out;
}

@fragment
fn fs_main(@location(0) color : vec3f) -> @location(0) vec4f {
    let alpha = u_params.x;
    return vec4f(color, alpha);
}
