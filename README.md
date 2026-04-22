# CS 438 — Interactive Computer Graphics @ NJIT

WebGPU assignments from my Interactive Computer Graphics course at NJIT. Everything runs in the browser — no installs, no build step, just open an HTML file.

---

## Assignments

### A1 — WebGPU Basics
`A1/a1_student/`

First time touching WebGPU. Built four classic graphics demos:
- **Task 1** — 2D Sierpinski gasket via recursive triangle subdivision
- **Task 2** — Circle approximation using polygon fan geometry
- **Task 3** — 3D Sierpinski tetrahedron
- **Task 4** — Procedural UV sphere + solar system animation

The big thing I learned here was how data actually travels from CPU to GPU: you pack geometry into vertex buffers, describe a render pipeline, set up bind groups, then fire off a draw call. JavaScript sets everything up; WGSL shaders run on the GPU in parallel for every vertex and fragment. Once that mental model clicked, everything else made more sense.

---

### A2 — Phong Lighting
`A2/a2_student/`

Got into lighting. Implemented the Phong model (ambient + diffuse + specular) on 3D meshes with interactive controls for moving lights around. Learned why the dot product between a surface normal and the light direction gives you that soft gradient, and how the specular highlight works using the reflection vector. Also played with Blinn-Phong, which swaps the reflection vector for a halfway vector — cheaper to compute and honestly looks just as good.

---

### A3 — Texture & Normal Mapping
`A3/a3_student/`

Built on A2 by replacing flat colors with actual images (texture mapping) and then faking surface detail using normal maps. The texture sampling part was straightforward — UV coordinates per vertex, interpolate across the triangle, sample the image in the fragment shader. Normal mapping was harder. To make bump detail look correct from any angle, you need to compute a tangent space for every triangle, which means generating tangent and bitangent vectors from the UVs. More math than expected, but the visual difference between a flat mesh and a normal-mapped one is pretty striking.

---

## Stack

- **WebGPU** — browser-native GPU API (no WebGL)
- **WGSL** — WebGPU Shading Language for vertex + fragment shaders
- Vanilla JS, no frameworks

## Running

Open any `index.html` in a browser with WebGPU support (Chrome 113+ works). Each assignment is self-contained in its subfolder.
