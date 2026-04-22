"use strict"

var a1Task13WgslSourcePromise = null;
function a1LoadTask13WgslSource() {
    if (!a1Task13WgslSourcePromise) {
        a1Task13WgslSourcePromise = fetch("./resources/webgpu-task13.wgsl", { cache: "no-store" })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error("Unable to load ./resources/webgpu-task13.wgsl (" + response.status + ")");
                }
                return response.text();
            })
            .catch(function (error) {
                a1Task13WgslSourcePromise = null;
                throw error;
            });
    }
    return a1Task13WgslSourcePromise;
}

// ----------------------------------------------------------------------------
//*** TODO_A1 : Insert your credentials below ***
var lastname = 'Garcia';
var firstname = 'Miguel';
// ----------------------------------------------------------------------------


// ----------------------------------------------------------------------------
// Minimal WebGPU helpers inlined for Task 3 (DL.v6).
function a1WgpuSetStatus(statusElem, message, level) {
    if (!statusElem) {
        return;
    }
    statusElem.textContent = message;
    statusElem.className = "statusline";
    if (level === "ok") {
        statusElem.classList.add("ok");
    } else if (level === "warn") {
        statusElem.classList.add("warn");
    } else if (level === "err") {
        statusElem.classList.add("err");
    }
}

function a1WgpuClamp01(value) {
    return Math.max(0.0, Math.min(1.0, Number(value)));
}

function a1WgpuToFloat32Array(data) {
    if (data instanceof Float32Array) {
        return data;
    }
    return new Float32Array(data);
}

function a1WgpuCreateUniformBuffer(device, label, initialData) {
    var data = a1WgpuToFloat32Array(initialData);
    var buffer = device.createBuffer({
        label: label,
        size: data.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    device.queue.writeBuffer(buffer, 0, data);
    return {
        buffer: buffer,
        data: data
    };
}

function a1WgpuBlendTarget(format) {
    return {
        format: format,
        blend: {
            color: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha",
                operation: "add"
            },
            alpha: {
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
                operation: "add"
            }
        }
    };
}

async function a1WgpuInitCanvasContext(canvas, statusElem, labelPrefix) {
    if (!canvas) {
        a1WgpuSetStatus(statusElem, labelPrefix + ": preview canvas element not found.", "err");
        return null;
    }

    if (!("gpu" in navigator)) {
        a1WgpuSetStatus(statusElem, labelPrefix + ": navigator.gpu is not available in this browser.", "warn");
        return null;
    }

    try {
        a1WgpuSetStatus(statusElem, labelPrefix + ": requesting adapter/device...", "warn");

        var adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            a1WgpuSetStatus(statusElem, labelPrefix + ": adapter request returned null.", "err");
            return null;
        }

        var device = await adapter.requestDevice();
        var context = canvas.getContext("webgpu");
        if (!context) {
            a1WgpuSetStatus(statusElem, labelPrefix + ": failed to acquire webgpu context from preview canvas.", "err");
            return null;
        }

        var format = navigator.gpu.getPreferredCanvasFormat();
        context.configure({
            device: device,
            format: format,
            alphaMode: "premultiplied"
        });

        var adapterName = (adapter.info && adapter.info.description)
            ? adapter.info.description
            : "Unknown Adapter";
        console.log("[" + labelPrefix + "] Adapter:", adapterName);
        console.log("[" + labelPrefix + "] Canvas Format:", format);
        console.log("[" + labelPrefix + "] Device acquired.");

        return {
            adapter: adapter,
            device: device,
            context: context,
            format: format
        };
    } catch (error) {
        a1WgpuSetStatus(statusElem, labelPrefix + " failed: " + error.message, "err");
        return null;
    }
}


// ----------------------------------------------------------------------------



// ----------------------------------------------------------------------------
function createTetraGasketGeometry(recursions) {

    // First, initialize the vertices of our 3D gasket
    // Four vertices on unit circle
    // Intial tetrahedron with equal length sides

    var points = [];
    var colors = [];

    var vertices = [
        vec3(0.0000, 0.0000, -1.0000),
        vec3(0.0000, 0.9428, 0.3333),
        vec3(-0.8165, -0.4714, 0.3333),
        vec3(0.8165, -0.4714, 0.3333)
    ];
    divideTetra(vertices[0], vertices[1], vertices[2], vertices[3], recursions);

    // flatten array    
    return flattenArrays(points, colors);

    // ----------------------------------------------------------------------------
    function triangle(a, b, c, color) {

        // add colors and vertices for one triangle

        var baseColors = [
            vec3(0.80, 0.05, 0.05),   
            vec3(1.00, 0.84, 0.00),  
            vec3(0.72, 0.18, 0.00),   
            vec3(0.85, 0.55, 0.00)    
        ];

        colors.push(baseColors[color]);
        points.push(a);
        colors.push(baseColors[color]);
        points.push(b);
        colors.push(baseColors[color]);
        points.push(c);
    }

    // ----------------------------------------------------------------------------
    function tetra(a, b, c, d) {
        // tetrahedron with each side using
        // a different color

        triangle(a, c, b, 0);        
        triangle(a, b, d, 2);
        triangle(b, c, d, 3);  
        triangle(a, c, d, 1);                              
    }

    // ----------------------------------------------------------------------------
    function divideTetra(a, b, c, d, count) {
        // check for end of recursion

        if (count == 0) {
            tetra(a, b, c, d);
        }
        else {

            // *** TODO_A1 : Task 3a
            // Create a 3d Sierpinski Gasket geometry by calling this function recursively.
            // Use the argument 'recursions' to specify the depth of the recursion.
            //
            // Use the function mix(a, b, lambda) for both the vertex and color interpolation
            // with lambda = 0.5. What happens if you use a different value for lambda?

            // --- begin code ---

            // Compute the midpoint of every edge of the tetrahedron using mix with lambda=0.5.
            // mix(u, v, 0.5) returns (u + v) / 2, placing the new vertex exactly halfway
            // between the two endpoints. A tetrahedron has 6 edges (C(4,2) = 6), so we
            // get 6 midpoints: ab, ac, ad, bc, bd, cd.
            var ab = mix(a, b, 0.5);
            var ac = mix(a, c, 0.5);
            var ad = mix(a, d, 0.5);
            var bc = mix(b, c, 0.5);
            var bd = mix(b, d, 0.5);
            var cd = mix(c, d, 0.5);

            // Recursively subdivide into the 4 corner sub-tetrahedra, each one formed
            // by one original corner vertex and the three midpoints of its emanating edges.
            // The middle octahedron (formed by all 6 midpoints) is not rendereded to create that pattern we want             //
            // Corner at a: uses original vertex a and midpoints ab, ac, ad.
            divideTetra(a,  ab, ac, ad, count - 1);
            // Corner at b: uses original vertex b and midpoints ab, bc, bd.
            divideTetra(ab, b,  bc, bd, count - 1);
            // .... ac, bc, cd.
            divideTetra(ac, bc, c,  cd, count - 1);
            // .... ad, bd, cd.
            divideTetra(ad, bd, cd, d,  count - 1);

            // --- end code ---
        }
    }
}


// ----------------------------------------------------------------------------
// Task 3 WebGPU renderer (flattened into task13.js for DL.v5).
// *** TODO_A1 : Task 3b is implemented in:
// resources/webgpu-task13.wgsl (vs_main).
async function createTask13WebGPURenderer(canvas, statusElem) {
    var statusPrefix = "WebGPU Task 3";

    try {
        var init = await a1WgpuInitCanvasContext(canvas, statusElem, statusPrefix);
        if (!init) {
            return null;
        }

        var device = init.device;
        var context = init.context;
        var format = init.format;

        var uniformData = a1WgpuCreateUniformBuffer(
            device,
            "A1-Task13-UniformBuffer",
            [1.0, 0.0, 0.0, 0.0]
        );
        var params = uniformData.data;
        var uniformBuffer = uniformData.buffer;

        var shaderSource = null;
        try {
            shaderSource = await a1LoadTask13WgslSource();
        } catch (wgslLoadError) {
            a1WgpuSetStatus(statusElem, "WebGPU Task 3 shader load failed: " + wgslLoadError.message, "err");
            console.error("[WebGPU Task 3] WGSL load failed:", wgslLoadError);
            return null;
        }
        var shaderModule = device.createShaderModule({
            label: "A1-Task13-ShaderModule",
            code: shaderSource
        });
        if (typeof shaderModule.getCompilationInfo === "function") {
            var compilationInfo = await shaderModule.getCompilationInfo();
            var compileErrors = compilationInfo.messages.filter(function (msg) {
                return msg.type === "error";
            });
            if (compileErrors.length > 0) {
                var firstError = compileErrors[0] && compileErrors[0].message
                    ? compileErrors[0].message
                    : "Unknown WGSL compilation error.";
                a1WgpuSetStatus(statusElem, "WebGPU Task 3 shader compile failed: " + firstError, "err");
                console.error("[WebGPU Task 3] WGSL compile errors:", compileErrors);
                return null;
            }
        }

        var bindGroupLayout = device.createBindGroupLayout({
            label: "A1-Task13-BindGroupLayout",
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT,
                buffer: { type: "uniform" }
            }]
        });

        var pipelineLayout = device.createPipelineLayout({
            label: "A1-Task13-PipelineLayout",
            bindGroupLayouts: [bindGroupLayout]
        });

        var vertexState = {
            module: shaderModule,
            entryPoint: "vs_main",
            buffers: [{
                // *** TODO_A1 : Task 3c
                // Adjust the vertex buffer layout for 3D positions and colors
                // (size, stride, and offsets).
                //
                // flattenArrays(points, colors) interleaves each vec3 position immediately
                // followed by its vec3 color, producing this layout 
                //   [ x, y, z, r, g, b,   x, y, z, r, g, b,  etc ]
                //  so that is 6 floats per vertex 3 spared for the position and 3 for the color.
            
                arrayStride: 6 * Float32Array.BYTES_PER_ELEMENT,
                attributes: [
                    {
                        // Position attribute: 3 floats (x, y, z) starting at byte 0.
                        shaderLocation: 0,
                        offset: 0,
                        format: "float32x3"   // changed from float32x2 to handle z
                    },
                    {
                        // Color attribute: 3 floats (r, g, b) starting after the 3-float position.
                        shaderLocation: 1,
                        offset: 3 * Float32Array.BYTES_PER_ELEMENT,  // skip past x,y,z
                        format: "float32x3"
                    }
                ]
            }]
        };

        var fragmentState = {
            module: shaderModule,
            entryPoint: "fs_main",
            targets: [a1WgpuBlendTarget(format)]
        };

        var pipelineDepthOn = device.createRenderPipeline({
            label: "A1-Task13-PipelineDepthOn",
            layout: pipelineLayout,
            vertex: vertexState,
            fragment: fragmentState,
            primitive: {
                topology: "triangle-list"
            },
            depthStencil: {
                format: "depth24plus",
                depthWriteEnabled: true,
                depthCompare: "less"
            }
        });

        var pipelineDepthOff = device.createRenderPipeline({
            label: "A1-Task13-PipelineDepthOff",
            layout: pipelineLayout,
            vertex: vertexState,
            fragment: fragmentState,
            primitive: {
                topology: "triangle-list"
            }
        });

        var bindGroup = device.createBindGroup({
            label: "A1-Task13-BindGroup",
            layout: bindGroupLayout,
            entries: [{
                binding: 0,
                resource: { buffer: uniformBuffer }
            }]
        });

        var vertexBuffer = null;
        var vertexCount = 0;
        var depthEnabled = true;
        var depthTexture = null;
        var disposed = false;

        function ensureDepthTexture() {
            if (disposed) {
                return null;
            }
            if (!depthTexture) {
                depthTexture = device.createTexture({
                    label: "A1-Task13-DepthTexture",
                    size: [canvas.width, canvas.height, 1],
                    format: "depth24plus",
                    usage: GPUTextureUsage.RENDER_ATTACHMENT
                });
            }
            return depthTexture;
        }

        function renderFrame() {
            if (disposed || !vertexBuffer || vertexCount === 0) {
                return;
            }

            var encoder = device.createCommandEncoder({ label: "A1-Task13-Encoder" });
            var passDesc = {
                colorAttachments: [{
                    view: context.getCurrentTexture().createView(),
                    clearValue: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
                    loadOp: "clear",
                    storeOp: "store"
                }]
            };

            if (depthEnabled) {
                var depth = ensureDepthTexture();
                if (!depth) {
                    return;
                }
                passDesc.depthStencilAttachment = {
                    view: depth.createView(),
                    depthClearValue: 1.0,
                    depthLoadOp: "clear",
                    depthStoreOp: "store"
                };
            }

            var pass = encoder.beginRenderPass(passDesc);
            pass.setPipeline(depthEnabled ? pipelineDepthOn : pipelineDepthOff);
            pass.setBindGroup(0, bindGroup);
            pass.setVertexBuffer(0, vertexBuffer);
            pass.draw(vertexCount, 1, 0, 0);
            pass.end();

            device.queue.submit([encoder.finish()]);
        }

        function setGeometry(interleavedArray) {
            if (disposed || !interleavedArray || interleavedArray.length === 0) {
                return;
            }

            var vertices = a1WgpuToFloat32Array(interleavedArray);

            if (vertexBuffer) {
                vertexBuffer.destroy();
            }

            vertexBuffer = device.createBuffer({
                label: "A1-Task13-VertexBuffer",
                size: vertices.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
            });
            device.queue.writeBuffer(vertexBuffer, 0, vertices);
            // *** TODO_A1 : Task 3d
            // Adjust draw-count setup for the 3D vertex layout so the full tetra
            // geometry is rendered correctly.
            //
            // Each vertex is 6 floats [x, y, z, r, g, b], so dividing the total
            // float count by 6 gives the number of vertices to pass to pass.draw().
            vertexCount = Math.floor(vertices.length / 6);

            renderFrame();
        }

        function setAlpha(alpha) {
            if (disposed) {
                return;
            }
            params[0] = a1WgpuClamp01(alpha);
            device.queue.writeBuffer(uniformBuffer, 0, params);
            renderFrame();
        }

        function setDepthEnabled(enabled) {
            if (disposed) {
                return;
            }
            depthEnabled = !!enabled;
            renderFrame();
        }

        function destroyRenderer() {
            if (disposed) {
                return;
            }
            disposed = true;
            if (vertexBuffer) {
                vertexBuffer.destroy();
                vertexBuffer = null;
            }
            if (depthTexture) {
                depthTexture.destroy();
                depthTexture = null;
            }
        }

        a1WgpuSetStatus(statusElem, "WebGPU Task 3 ready: tetra geometry with alpha/depth controls is active.", "ok");
        return {
            setGeometry: setGeometry,
            setAlpha: setAlpha,
            setDepthEnabled: setDepthEnabled,
            destroy: destroyRenderer
        };
    } catch (error) {
        a1WgpuSetStatus(statusElem, "WebGPU Task 3 failed: " + error.message, "err");
        return null;
    }
}



// ----------------------------------------------------------------------------
// Main function of the Task13 runtime.
// This task runs as WebGPU-only.
// It contains further functions as nested functions used for rendering.
// This avoids the usage of global variables: all variables can be
// defined in the main function.
function main() {
    // ----------------------------------------------------------------------------
    // Task13 runs as WebGPU-only.
    var recursions = Number(document.getElementById("rangeSlider").value);
    var alpha = Number(document.getElementById("alphaSlider").value);
    var depthEnabled = document.getElementById("depthCheck").checked;
    var geometry = createTetraGasketGeometry(recursions);

    var webgpuPreviewCanvas = document.getElementById("webgpuCanvas");
    var webgpuStatus = document.getElementById("webgpuStatus");
    var task13Renderer = null;

    async function startTask13Renderer() {
        if (!("gpu" in navigator)) {
            a1WgpuSetStatus(webgpuStatus, "WebGPU Task 3: navigator.gpu unavailable.", "err");
            return;
        }

        if (task13Renderer && typeof task13Renderer.destroy === "function") {
            task13Renderer.destroy();
        }
        task13Renderer = null;

        task13Renderer = await createTask13WebGPURenderer(webgpuPreviewCanvas, webgpuStatus);
        if (!task13Renderer) {
            return;
        }

        task13Renderer.setGeometry(geometry);
        task13Renderer.setAlpha(alpha);
        task13Renderer.setDepthEnabled(depthEnabled);
    }
    startTask13Renderer().catch(function (error) {
        console.error("WebGPU Task 3 startup failed:", error);
    });

    // ----------------------------------------------------------------------------
    // Register the event for update of recursion depth with the UI slider.
    document.getElementById("rangeSlider").oninput = function (event) {
        recursions = Number(event.target.value);
        geometry = createTetraGasketGeometry(recursions);

        // Keep WebGPU geometry in sync with the same control.
        if (task13Renderer) {
            task13Renderer.setGeometry(geometry);
        }
    }

    // Register the event for update of alpha with the UI slider.
    document.getElementById("alphaSlider").oninput = function (event) {
        alpha = Number(event.target.value);

        // Keep WebGPU preview alpha synchronized with the same control.
        if (task13Renderer) {
            task13Renderer.setAlpha(alpha);
        }
    }

    // Register the event for update of depth testing.
    document.getElementById("depthCheck").onchange = function () {
        depthEnabled = this.checked;

        // Keep WebGPU depth-test mode synchronized with the same control.
        if (task13Renderer) {
            task13Renderer.setDepthEnabled(depthEnabled);
        }
    }
}
