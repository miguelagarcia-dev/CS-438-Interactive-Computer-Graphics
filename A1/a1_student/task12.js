"use strict"

var a1Task12WgslSourcePromise = null;
function a1LoadTask12WgslSource() {
    if (!a1Task12WgslSourcePromise) {
        a1Task12WgslSourcePromise = fetch("./resources/webgpu-task12.wgsl", { cache: "no-store" })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error("Unable to load ./resources/webgpu-task12.wgsl (" + response.status + ")");
                }
                return response.text();
            })
            .catch(function (error) {
                a1Task12WgslSourcePromise = null;
                throw error;
            });
    }
    return a1Task12WgslSourcePromise;
}

// ----------------------------------------------------------------------------
//*** TODO_A1 : Insert your credentials below ***
var lastname = 'Garcia';
var firstname = 'Miguel';
// ----------------------------------------------------------------------------


// ----------------------------------------------------------------------------
// Minimal WebGPU helpers inlined for Task 2 (DL.v6).
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
function createCircleGeometry(radius, segments) {
    var points = [];
    var colors = [];
    
    // *** TODO_A1 : Task 2a
    // Create a circle geometry which can be rendered using a TRIANGLE_FAN. 
    // Use the arguments of the function to specify the radius of the circle 
    // and the number of linear segments to approximate it. 
    //
    // Interpolate the color values on the circle linearly using the HUE of
    // the HSV color-space (function hsvToRgb(.,.,.)). 

    // --- begin code ---

    //Created a point of orgin for the shape to wrap around with white color
    points.push(vec2(0.0, 0.0));
    colors.push(vec3(1.0, 1.0, 1.0));

    // These are the vertices placed around the outer edge of the circle.
    // We go from i = 0 to segments so the final vertex
    // wraps back to the starting angle of 0 to closes the shape.
    // This also keeps the triangle fan connected seamlessly all the way around.
    for (var i = 0; i <= segments; i++) {

        // Divide the full circle (2 * PI radians) evenly by the number of segments,
        // then multiply by i to get the current angle as we move around the circle.
        var angle = (i / segments) * 2 * Math.PI;

        // cos and sin convert that angle into x and y coordinates on the unit circle,
        // and multiplying by radius scales the point outward to the actual circle size.
        points.push(vec2(radius * Math.cos(angle), radius * Math.sin(angle)));

        // i/segments goes from 0 to 1 as we move around the rim,
        // so the hue will smoothly sweeps through the full color spectrum once.
        // hsvToRgb expects hue in [0, 1], not degrees.
        var rgb = hsvToRgb(i / segments, 1.0, 1.0);

        // rgb is already in the range [0,1], so we can push it directly.
        colors.push(vec3(rgb[0], rgb[1], rgb[2]));  
    }   

    // --- end code ---

    return flattenArrays(points, colors);
}


// ----------------------------------------------------------------------------
// Task 2 WebGPU renderer (flattened into task12.js for DL.v4).
// *** TODO_A1 : Task 2b
// Adapt the rendering pipeline to draw:
// - the filled circle (triangle fan), and
// - a black circle outline (line strip) from the same geometry.
// In this light WebGPU build, implement this in:
//   createTask12WebGPURenderer(...) below.
//
// *** TODO_A1 : Task 2c
// Explain in the documentation why the displayed circle appears non-round
// when shown in a non-square viewport.
async function createTask12WebGPURenderer(canvas, statusElem) {
    var statusPrefix = "WebGPU Task 2";

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
            "A1-Task12-UniformBuffer",
            [1.0, 0.0, 0.0, 0.0]
        );
        var params = uniformData.data;
        var uniformBuffer = uniformData.buffer;

        var shaderSource = null;
        try {
            shaderSource = await a1LoadTask12WgslSource();
        } catch (wgslLoadError) {
            a1WgpuSetStatus(statusElem, "WebGPU Task 2 shader load failed: " + wgslLoadError.message, "err");
            console.error("[WebGPU Task 2] WGSL load failed:", wgslLoadError);
            return null;
        }
        var shaderModule = device.createShaderModule({
            label: "A1-Task12-ShaderModule",
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
                a1WgpuSetStatus(statusElem, "WebGPU Task 2 shader compile failed: " + firstError, "err");
                console.error("[WebGPU Task 2] WGSL compile errors:", compileErrors);
                return null;
            }
        }

        var bindGroupLayout = device.createBindGroupLayout({
            label: "A1-Task12-BindGroupLayout",
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT,
                buffer: { type: "uniform" }
            }]
        });

        var pipelineLayout = device.createPipelineLayout({
            label: "A1-Task12-PipelineLayout",
            bindGroupLayouts: [bindGroupLayout]
        });

        var fillPipeline = device.createRenderPipeline({
            label: "A1-Task12-FillPipeline",
            layout: pipelineLayout,
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

        // This pipeline draws the rim vertices as a continuous line-strip to give the circle a black edge.
        // It uses the same vertex layout as the fill (x, y, r, g, b) and the same shader,
        // but reads from outlineBuffer which has the rim positions with all colors set to black instead of rainbow.
        var outlinePipeline = device.createRenderPipeline({
            label: "A1-Task12-OutlinePipeline",
            layout: pipelineLayout,
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
                // line-strip connects each vertex to the next in order,
                // tracing the rim of the circle as one continuous edge
                topology: "line-strip"
            }
        });

        var bindGroup = device.createBindGroup({
            label: "A1-Task12-BindGroup",
            layout: bindGroupLayout,
            entries: [{
                binding: 0,
                resource: { buffer: uniformBuffer }
            }]
        });

        var fillBuffer = null;
        var fillVertexCount = 0;
        var fillEnabled = true;
        var disposed = false;

        // The index buffer tells the GPU which three vertices to use for each triangle.
        // The pattern goes [0,1,2], [0,2,3], [0,3,4]... where 0 is always the center
        // and i, i+1 are two consecutive rim points, so the center never needs to be stored twice.
        var indexBuffer = null;
        var indexCount = 0;

        // The edge positions on the rim from fillBuffer but with black [0,0,0] colors.
        // Drawn as a line-strip to trace the circle edge.
        var outlineBuffer = null;
        var outlineVertexCount = 0;

        function renderFrame() {
            if (disposed) {
                return;
            }

            var encoder = device.createCommandEncoder({ label: "A1-Task12-Encoder" });
            var pass = encoder.beginRenderPass({
                colorAttachments: [{
                    view: context.getCurrentTexture().createView(),
                    clearValue: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
                    loadOp: "clear",
                    storeOp: "store"
                }]
            });

            // In order to fill, using  the index buffer to draw the fan as a triangle-list.
            // drawIndexed lets the GPU look up vertex indices so the center 
            // is reused for every pie slice without being duplicated in the buffer.
            if (fillEnabled && fillBuffer && indexBuffer && indexCount > 0) {
                pass.setPipeline(fillPipeline);
                pass.setBindGroup(0, bindGroup);
                pass.setVertexBuffer(0, fillBuffer);
                pass.setIndexBuffer(indexBuffer, "uint32");
                pass.drawIndexed(indexCount);
            }

            //  draw the rim as a connected line-strip on top of the fill.
            // outlineBuffer holds the same XY positions as fillBuffer but black colors.
            if (outlineBuffer && outlineVertexCount > 0) {
                pass.setPipeline(outlinePipeline);
                pass.setBindGroup(0, bindGroup);
                pass.setVertexBuffer(0, outlineBuffer);
                pass.draw(outlineVertexCount);
            }

            pass.end();
            device.queue.submit([encoder.finish()]);
        }

        function setGeometry(interleavedArray) {
            if (disposed || !interleavedArray || interleavedArray.length === 0) {
                return;
            }

            var fillVerts = a1WgpuToFloat32Array(interleavedArray);
            if (fillVerts.length % 5 !== 0) {
                a1WgpuSetStatus(statusElem, "WebGPU Task 2: geometry update ignored (stride mismatch).", "err");
                return;
            }
            if (fillVerts.length < 15) {
                return;
            }

            if (fillBuffer) {
                fillBuffer.destroy();
            }

            fillBuffer = device.createBuffer({
                label: "A1-Task12-FillVertexBuffer",
                size: fillVerts.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
            });
            device.queue.writeBuffer(fillBuffer, 0, fillVerts);

            fillVertexCount = fillVerts.length / 5;

            // triangle-fan topology, so we can use triangle-list with indices.
            var fan_indices = [];
            for (var i = 1; i < fillVertexCount - 1; i++) {
                fan_indices.push(0, i, i + 1);
            }
            indexCount = fan_indices.length;

            if (indexBuffer) {
                indexBuffer.destroy();
            }
            var index_data = new Uint32Array(fan_indices);
            indexBuffer = device.createBuffer({
                label: "A1-Task12-IndexBuffer",
                size: index_data.byteLength,
                usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
            });
            device.queue.writeBuffer(indexBuffer, 0, index_data);

            // Skip vertex 0 (the center) and copy only the rim vertices.
            // Each vertex in fillVerts is 5 floats or [x, y, r, g, b].
            // We keep the same XY positions but replace the color with black [0,0,0].
            var outline_verts = [];
            for (var j = 1; j < fillVertexCount; j++) {
                var base = j * 5;
                outline_verts.push(
                    fillVerts[base],      // x — same position as fill
                    fillVerts[base + 1],  // y
                    0.0, 0.0, 0.0         // r,g,b = black
                );
            }
            outlineVertexCount = outline_verts.length / 5;

            if (outlineBuffer) {
                outlineBuffer.destroy();
            }
            var outline_data = new Float32Array(outline_verts);
            outlineBuffer = device.createBuffer({
                label: "A1-Task12-OutlineBuffer",
                size: outline_data.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
            });
            device.queue.writeBuffer(outlineBuffer, 0, outline_data);

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

        function setFillEnabled(enabled) {
            if (disposed) {
                return;
            }
            fillEnabled = !!enabled;
            renderFrame();
        }

        function destroyRenderer() {
            if (disposed) {
                return;
            }
            disposed = true;
            if (fillBuffer) {
                fillBuffer.destroy();
                fillBuffer = null;
            }
        }

        a1WgpuSetStatus(statusElem, "WebGPU Task 2 baseline ready: geometry and alpha controls are active.", "ok");
        return {
            setGeometry: setGeometry,
            setAlpha: setAlpha,
            setFillEnabled: setFillEnabled,
            destroy: destroyRenderer
        };
    } catch (error) {
        a1WgpuSetStatus(statusElem, "WebGPU Task 2 failed: " + error.message, "err");
        return null;
    }
}


// ----------------------------------------------------------------------------
// Main function of the Task12 runtime.
// This task runs as WebGPU-only.
// It contains further functions as nested functions used for rendering.
// This avoids the usage of global variables: all variables can be 
// defined in the main function. 
function main() {
    // ----------------------------------------------------------------------------
    // Task12 runs as WebGPU-only.
    var segments = Number(document.getElementById("rangeSlider").value);
    var alpha = Number(document.getElementById("alphaSlider").value);
    var fillEnabled = document.getElementById("drawCheck").checked;
    var geometry = createCircleGeometry(0.7, segments);

    var webgpuPreviewCanvas = document.getElementById("webgpuCanvas");
    var webgpuStatus = document.getElementById("webgpuStatus");
    var task12Renderer = null;

    async function startTask12Renderer() {

        if (!("gpu" in navigator)) {
            a1WgpuSetStatus(webgpuStatus, "WebGPU Task 2: navigator.gpu unavailable.", "err");
            return;
        }

        if (task12Renderer && typeof task12Renderer.destroy === "function") {
            task12Renderer.destroy();
        }
        task12Renderer = null;

        task12Renderer = await createTask12WebGPURenderer(webgpuPreviewCanvas, webgpuStatus);
        if (!task12Renderer) {
            return;
        }

        task12Renderer.setGeometry(geometry);
        task12Renderer.setAlpha(alpha);
        task12Renderer.setFillEnabled(fillEnabled);
    }
    startTask12Renderer().catch(function (error) {
        console.error("WebGPU Task 2 startup failed:", error);
    });


    // ----------------------------------------------------------------------------
    // Register the event for update of segments with the UI slider.
    document.getElementById("rangeSlider").onchange = function (event) {
        segments = Number(event.target.value);
        geometry = createCircleGeometry(0.7, segments);

        // Keep WebGPU geometry in sync with the same control.
        if (task12Renderer) {
            task12Renderer.setGeometry(geometry);
        }
    }

    // Register the event for update of alpha with the UI slider.
    document.getElementById("alphaSlider").onchange = function (event) {
        alpha = Number(event.target.value);

        // Keep WebGPU preview alpha synchronized with the same control.
        if (task12Renderer) {
            task12Renderer.setAlpha(alpha);
        }
    }

    // Register event for fill-toggle in WebGPU.
    document.getElementById("drawCheck").onchange = function (event) {
        fillEnabled = event.target.checked;
        if (task12Renderer) {
            task12Renderer.setFillEnabled(fillEnabled);
        }
    }
}
