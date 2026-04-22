"use strict"

var a1Task11WgslSourcePromise = null;
function a1LoadTask11WgslSource() {
    if (!a1Task11WgslSourcePromise) {
        a1Task11WgslSourcePromise = fetch("./resources/webgpu-task11.wgsl", { cache: "no-store" })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error("Unable to load ./resources/webgpu-task11.wgsl (" + response.status + ")");
                }
                return response.text();
            })
            .catch(function (error) {
                a1Task11WgslSourcePromise = null;
                throw error;
            });
    }
    return a1Task11WgslSourcePromise;
}

// ----------------------------------------------------------------------------
//*** TODO_A1 : Insert your credentials below ***
var lastname = 'Garcia';
var firstname = 'Miguel';
// ----------------------------------------------------------------------------


// ----------------------------------------------------------------------------
// Minimal WebGPU helpers inlined for Task 1 (DL.v6).
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
function createTriangleGasketGeometry(recursions, lambda) {

    var tpoints = [
        vec2(-0.7, -0.7),
        vec2(0.0, 0.7),
        vec2(0.7, -0.7),
    ];

    var tcolors = [
        vec3(1.0, 0.0, 0.0),
        vec3(0.0, 1.0, 0.0),
        vec3(0.0, 0.0, 1.0),
    ];

    var points = [];
    var colors = [];

    //  Create the Sierpinski Gasket
    divideTriangle(tpoints[0], tpoints[1], tpoints[2], tcolors[0], tcolors[1], tcolors[2], recursions);

    // flatten array
    return flattenArrays(points, colors);


    // ----------------------------------------------------------------------------
    function divideTriangle(a, b, c, ca, cb, cc, count) {

        // check for end of recursion
        if (count == 0) {
            points.push(a, b, c);
            colors.push(ca, cb, cc);            
        }
        else {

            // *** TODO_A1 : Task 1
            // Create a 2d Sierpinski Gasket geometry by calling this function recursively.
            // Use the argument 'recursions' to specify the depth of the recursion. 
            //
            // Use the function mix(a, b, lambda) for both the vertex and color interpolation
            // with lambda = 0.5. What happens if you use a different value for lambda?

            // --- begin code ---

            // We call mix to blend new positions and colors using combonations of our original points.
            // This produces one new value that is the midpoint of the two points we are mixing.
            // Lambda determines how much of who is blended into the resulting mix:
            // so from my understading 0.5 means an equal blend, while 0.25 would mean 25% of the second point and 75% of the first point.
            var corner_ab = mix(a, b, lambda);
            var corner_ac = mix(a, c, lambda);
            var corner_bc = mix(b, c, lambda);

            // vec3 in the math resoruces is a simailr input type as the postions or vec2 just 3d instead of 2d.
            // So when passing the two vec3 colors like color a & b or ca/cb in we get a mix/blend returned of a new vec3 color.
            // so color_ab for example is one single rgb that blends the colors of corner A and corner B.
            // Which means corner_ab and color_ab describe one new corner (position + color),
            var color_ab = mix(ca, cb, lambda);
            var color_ac = mix(ca, cc, lambda);
            var color_bc = mix(cb, cc, lambda);
            
            // So when we call divideTriangle recursively, we get our new triangles
            // by using the original corners and the new blended corners in the arg, 
            // in order make our shape to the Sierpinski Gasket by connecting thse points in order.
            divideTriangle(a, corner_ab, corner_ac, ca, color_ab, color_ac, count - 1); // recursive call for upper left corner triangle
            divideTriangle(corner_ab, b, corner_bc, color_ab, cb, color_bc, count - 1); // ....upper right corner
            divideTriangle(corner_ac, corner_bc, c, color_ac, color_bc, cc, count - 1); // ....bottom corner


            // --- end code ---
        }
    }
}




// ----------------------------------------------------------------------------
// Task 1 WebGPU renderer (flattened into task11.js for DL.v3).
async function createTask11WebGPURenderer(canvas, statusElem) {
    var statusPrefix = "WebGPU Task 1";

    try {
        var init = await a1WgpuInitCanvasContext(canvas, statusElem, statusPrefix);
        if (!init) {
            return null;
        }

        var device = init.device;
        var context = init.context;
        var format = init.format;

        var vertexBuffer = null;
        var vertexCount = 0;
        var disposed = false;

        var uniformData = a1WgpuCreateUniformBuffer(
            device,
            "A1-Task11-Params-UniformBuffer",
            [1.0, 0.0, 0.0, 0.0]
        );
        var params = uniformData.data;
        var uniformBuffer = uniformData.buffer;

        var shaderSource = null;
        try {
            shaderSource = await a1LoadTask11WgslSource();
        } catch (wgslLoadError) {
            a1WgpuSetStatus(statusElem, "WebGPU Task 1 shader load failed: " + wgslLoadError.message, "err");
            console.error("[WebGPU Task 1] WGSL load failed:", wgslLoadError);
            return null;
        }
        var shaderModule = device.createShaderModule({
            label: "A1-Task11-ShaderModule",
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
                a1WgpuSetStatus(statusElem, "WebGPU Task 1 shader compile failed: " + firstError, "err");
                console.error("[WebGPU Task 1] WGSL compile errors:", compileErrors);
                return null;
            }
        }

        var pipeline = device.createRenderPipeline({
            label: "A1-Task11-Pipeline",
            layout: "auto",
            vertex: {
                module: shaderModule,
                entryPoint: "vs_main",
                buffers: [{
                    arrayStride: 5 * Float32Array.BYTES_PER_ELEMENT,
                    attributes: [
                        {
                            shaderLocation: 0,
                            offset: 0,
                            format: "float32x2"
                        },
                        {
                            shaderLocation: 1,
                            offset: 2 * Float32Array.BYTES_PER_ELEMENT,
                            format: "float32x3"
                        }
                    ]
                }]
            },
            fragment: {
                module: shaderModule,
                entryPoint: "fs_main",
                targets: [a1WgpuBlendTarget(format)]
            },
            primitive: {
                topology: "triangle-list"
            }
        });

        var bindGroup = device.createBindGroup({
            label: "A1-Task11-BindGroup",
            layout: pipeline.getBindGroupLayout(0),
            entries: [{
                binding: 0,
                resource: { buffer: uniformBuffer }
            }]
        });

        function renderFrame() {
            if (disposed || !vertexBuffer || vertexCount === 0) {
                return;
            }

            var encoder = device.createCommandEncoder({ label: "A1-Task11-Encoder" });
            var pass = encoder.beginRenderPass({
                colorAttachments: [{
                    view: context.getCurrentTexture().createView(),
                    clearValue: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
                    loadOp: "clear",
                    storeOp: "store"
                }]
            });

            pass.setPipeline(pipeline);
            pass.setVertexBuffer(0, vertexBuffer);
            pass.setBindGroup(0, bindGroup);
            pass.draw(vertexCount, 1, 0, 0);
            pass.end();

            device.queue.submit([encoder.finish()]);
        }

        function setGeometry(interleavedArray) {
            if (disposed || !interleavedArray || interleavedArray.length === 0) {
                return;
            }

            var vertices = a1WgpuToFloat32Array(interleavedArray);
            if (vertices.length % 5 !== 0) {
                a1WgpuSetStatus(statusElem, "WebGPU Task 1: geometry update ignored (stride mismatch).", "err");
                return;
            }

            if (vertexBuffer) {
                vertexBuffer.destroy();
            }

            vertexBuffer = device.createBuffer({
                label: "A1-Task11-VertexBuffer",
                size: vertices.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
            });
            device.queue.writeBuffer(vertexBuffer, 0, vertices);
            vertexCount = vertices.length / 5;

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

        function destroyRenderer() {
            if (disposed) {
                return;
            }
            disposed = true;
            if (vertexBuffer) {
                vertexBuffer.destroy();
                vertexBuffer = null;
            }
        }

        a1WgpuSetStatus(statusElem, "WebGPU Task 1 ready: geometry and alpha updates are active.", "ok");
        return {
            setGeometry: setGeometry,
            setAlpha: setAlpha,
            destroy: destroyRenderer
        };
    } catch (error) {
        a1WgpuSetStatus(statusElem, "WebGPU Task 1 failed: " + error.message, "err");
        return null;
    }
}


// ----------------------------------------------------------------------------
// Main function of the Task11 runtime.
// This task runs as WebGPU-only.
// It contains further functions as nested functions used for rendering.
// This avoids the usage of global variables: all variables can be 
// defined in the main function. 
function main() {
    // ----------------------------------------------------------------------------
    // Geometry and alpha controls directly drive the WebGPU renderer.
    var subdiv = 0;
    var lambda = 0.5;
    var alpha = Number(document.getElementById("alphaSlider").value);
    var geometry = createTriangleGasketGeometry(subdiv, lambda);

    var webgpuPreviewCanvas = document.getElementById("webgpuCanvas");
    var webgpuStatus = document.getElementById("webgpuStatus");
    var task11Renderer = null;

    async function startTask11Renderer() {
        if (!("gpu" in navigator)) {
            a1WgpuSetStatus(webgpuStatus, "WebGPU Task 1: navigator.gpu unavailable.", "err");
            return;
        }

        if (task11Renderer && typeof task11Renderer.destroy === "function") {
            task11Renderer.destroy();
        }
        task11Renderer = null;

        task11Renderer = await createTask11WebGPURenderer(webgpuPreviewCanvas, webgpuStatus);
        if (!task11Renderer) {
            return;
        }

        task11Renderer.setGeometry(geometry);
        task11Renderer.setAlpha(alpha);
    }
    startTask11Renderer().catch(function (error) {
        console.error("WebGPU Task 1 startup failed:", error);
    });


    // ----------------------------------------------------------------------------
    // Register the event for update of recursion depth with the UI slider. 
    document.getElementById("rangeSlider").oninput = function (event) {
        // set subdivision level (global variable)
        subdiv = Number(event.target.value);
        // subdivide geometry
        geometry = createTriangleGasketGeometry(subdiv, lambda);
        // Keep WebGPU geometry in sync with the same input.
        if (task11Renderer) {
            task11Renderer.setGeometry(geometry);
        }
    }

    // Register the event for update of the alpha value with the UI slider. 
    document.getElementById("lambdaSlider").oninput = function (event) {
        // set lambda (global variable)
        lambda = Number(event.target.value);
        // subdivide geometry
        geometry = createTriangleGasketGeometry(subdiv, lambda);
        // Keep WebGPU geometry in sync with the same input.
        if (task11Renderer) {
            task11Renderer.setGeometry(geometry);
        }
    }

    // Register the event for update of the alpha value with the UI slider. 
    document.getElementById("alphaSlider").oninput = function (event) {
        alpha = Number(event.target.value);

        // Keep WebGPU alpha synchronized with the same slider.
        if (task11Renderer) {
            task11Renderer.setAlpha(alpha);
        }
    }
}
