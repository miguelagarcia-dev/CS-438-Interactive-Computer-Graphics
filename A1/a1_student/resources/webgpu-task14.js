"use strict";

var a1Task14WgslSourcePromise = null;
function a1LoadTask14WgslSource() {
    if (!a1Task14WgslSourcePromise) {
        a1Task14WgslSourcePromise = fetch("./resources/webgpu-task14.wgsl", { cache: "no-store" })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error("Unable to load ./resources/webgpu-task14.wgsl (" + response.status + ")");
                }
                return response.text();
            })
            .catch(function (error) {
                a1Task14WgslSourcePromise = null;
                throw error;
            });
    }
    return a1Task14WgslSourcePromise;
}

// ----------------------------------------------------------------------------
// WebGPU renderer for A1 Task 14.
// Scope:
// - sync visibility toggles (drawSun/drawEarth/drawMoon)
// - sync depth test toggle
// - sync cull mode + front-face winding controls
// - keep speed + camera slider sync
//
// The assignment runtime is now WebGPU-only.
async function runTask14WebGPUPreview(canvas, statusElem, options) {
    var result = {
        ready: false,
        adapter: null,
        device: null,
        context: null,
        format: null,
        indexCount: 0,
        lineIndexCount: 0,
        speed: 10.0,
        rotX: 0.0,
        rotY: 0.0,
        rotZ: 0.0,
        drawSun: true,
        drawEarth: true,
        drawMoon: true,
        depthTestEnabled: true,
        cullMode: "none",
        frontFace: "ccw",
        wireframeEnabled: false,
        setSpeed: null,
        setViewEuler: null,
        setVisibility: null,
        setDepthTest: null,
        setCullMode: null,
        setFrontFace: null,
        setWireframe: null,
        setTask44Enabled: null,
        setColorAlpha: null,
        render: null,
        destroy: null
    };

    var statusPrefix = "WebGPU Task 4";
    var disposed = false;
    var animationHandle = 0;
    var lifecycle = options || {};

    // ------------------------------------------------------------------------
    // Section A: Lifecycle Guard
    // ------------------------------------------------------------------------
    function isPreviewActive() {
        if (disposed) {
            return false;
        }
        if (typeof lifecycle.isActive === "function") {
            return !!lifecycle.isActive();
        }
        return true;
    }

    try {
        // --------------------------------------------------------------------
        // Section B: Early Validation + WebGPU Initialization
        // --------------------------------------------------------------------
        if (!isPreviewActive()) {
            return result;
        }
        if (typeof sphereGeometry !== "function") {
            a1WgpuSetStatus(statusElem, "WebGPU Task 4: sphereGeometry(...) is unavailable.", "err");
            return result;
        }
        if (
            typeof mat4 !== "function" ||
            typeof mult !== "function" ||
            typeof rotateX !== "function" ||
            typeof rotateY !== "function" ||
            typeof rotateZ !== "function" ||
            typeof translate !== "function" ||
            typeof scalem !== "function" ||
            typeof flatten !== "function"
        ) {
            a1WgpuSetStatus(statusElem, "WebGPU Task 4: math helpers are unavailable.", "err");
            return result;
        }

        var init = await a1WgpuInitCanvasContext(canvas, statusElem, statusPrefix);
        if (!init) {
            return result;
        }
        if (!isPreviewActive()) {
            return result;
        }

        var adapter = init.adapter;
        var device = init.device;
        var context = init.context;
        var format = init.format;
        var sampleCount = 4;

        // --------------------------------------------------------------------
        // Section C: Material/Uniform Setup
        // --------------------------------------------------------------------
        var sunColor = (typeof hsvToRgb === "function")
            ? hsvToRgb(0.11, 1.0, 1.0)
            : [1.0, 0.66, 0.0];
        var earthColor = (typeof hsvToRgb === "function")
            ? hsvToRgb(0.6, 1.0, 1.0)
            : [0.0, 0.4, 1.0];
        var moonColor = [0.95, 0.95, 0.95];

        // Shared material layout: vec4(color.rgb, alpha)
        var sunMaterialData = a1WgpuCreateUniformBuffer(
            device,
            "A1-Task14-V11-SunMaterialBuffer",
            [sunColor[0], sunColor[1], sunColor[2], 0.75]
        );
        var sunMaterial = sunMaterialData.data;
        var sunMaterialBuffer = sunMaterialData.buffer;

        var earthMaterialData = a1WgpuCreateUniformBuffer(
            device,
            "A1-Task14-V11-EarthMaterialBuffer",
            [earthColor[0], earthColor[1], earthColor[2], 1.0]
        );
        var earthMaterial = earthMaterialData.data;
        var earthMaterialBuffer = earthMaterialData.buffer;

        var moonMaterialData = a1WgpuCreateUniformBuffer(
            device,
            "A1-Task14-V11-MoonMaterialBuffer",
            [moonColor[0], moonColor[1], moonColor[2], 1.0]
        );
        var moonMaterial = moonMaterialData.data;
        var moonMaterialBuffer = moonMaterialData.buffer;

        // Wireframe line color uses the same shader with dark tint.
        var wireMaterialData = a1WgpuCreateUniformBuffer(
            device,
            "A1-Task14-V11-WireMaterialBuffer",
            [0.1, 0.1, 0.1, 1.0]
        );
        var wireMaterial = wireMaterialData.data;
        var wireMaterialBuffer = wireMaterialData.buffer;

        // Task flags uniform:
        // x: Task 4-4 shading enabled (1.0) / minimal flat color (0.0)
        var taskFlagsData = a1WgpuCreateUniformBuffer(
            device,
            "A1-Task14-V11-TaskFlagsBuffer",
            [1.0, 0.0, 0.0, 0.0]
        );
        var taskFlags = taskFlagsData.data;
        var taskFlagsBuffer = taskFlagsData.buffer;

        // Per-body model-view buffers
        var sunModelViewData = a1WgpuCreateUniformBuffer(
            device,
            "A1-Task14-V11-SunModelViewBuffer",
            flatten(mat4())
        );
        var sunModelViewBuffer = sunModelViewData.buffer;

        var earthModelViewData = a1WgpuCreateUniformBuffer(
            device,
            "A1-Task14-V11-EarthModelViewBuffer",
            flatten(mat4())
        );
        var earthModelViewBuffer = earthModelViewData.buffer;

        var moonModelViewData = a1WgpuCreateUniformBuffer(
            device,
            "A1-Task14-V11-MoonModelViewBuffer",
            flatten(mat4())
        );
        var moonModelViewBuffer = moonModelViewData.buffer;

        // --------------------------------------------------------------------
        // Section D: Shader + Pipeline Setup
        // --------------------------------------------------------------------
        var shaderSource = null;
        try {
            shaderSource = await a1LoadTask14WgslSource();
        } catch (wgslLoadError) {
            a1WgpuSetStatus(statusElem, "WebGPU Task 4 shader load failed: " + wgslLoadError.message, "err");
            console.error("[WebGPU v11] WGSL load failed:", wgslLoadError);
            return result;
        }
        if (!isPreviewActive()) {
            return result;
        }
        var shaderModule = device.createShaderModule({
            label: "A1-Task14-V11-ShaderModule",
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
                a1WgpuSetStatus(statusElem, "WebGPU Task 4 shader compile failed: " + firstError, "err");
                console.error("[WebGPU v11] WGSL compile errors:", compileErrors);
                return result;
            }
        }

        var bindGroupLayout = device.createBindGroupLayout({
            label: "A1-Task14-V11-BindGroupLayout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: "uniform" }
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                }
            ]
        });
        var pipelineLayout = device.createPipelineLayout({
            label: "A1-Task14-V11-PipelineLayout",
            bindGroupLayouts: [bindGroupLayout]
        });

        var pipelineCache = {};
        function getPipeline(depthEnabled, cullMode, frontFace) {
            var depthKey = depthEnabled ? "depthOn" : "depthOff";
            var key = depthKey + "|" + cullMode + "|" + frontFace;
            if (pipelineCache[key]) {
                return pipelineCache[key];
            }

            var pipelineDesc = {
                label: "A1-Task14-V11-" + key,
                layout: pipelineLayout,
                vertex: {
                    module: shaderModule,
                    entryPoint: "vs_main",
                    buffers: [{
                        arrayStride: 6 * Float32Array.BYTES_PER_ELEMENT,
                        attributes: [
                            {
                                shaderLocation: 0,
                                offset: 0,
                                format: "float32x3"
                            },
                            {
                                shaderLocation: 1,
                                offset: 3 * Float32Array.BYTES_PER_ELEMENT,
                                format: "float32x3"
                            }
                        ]
                    }]
                },
                fragment: {
                    module: shaderModule,
                    entryPoint: "fs_main",
                    targets: [{ format: format }]
                },
                primitive: {
                    topology: "triangle-list",
                    cullMode: cullMode,
                    frontFace: frontFace
                },
                multisample: {
                    count: sampleCount
                }
            };

            if (depthEnabled) {
                pipelineDesc.depthStencil = {
                    format: "depth24plus",
                    depthWriteEnabled: true,
                    depthCompare: "less"
                };
            }

            pipelineCache[key] = device.createRenderPipeline(pipelineDesc);
            return pipelineCache[key];
        }

        var linePipelineCache = {};
        function getLinePipeline(depthEnabled) {
            var key = depthEnabled ? "lineDepthOn" : "lineDepthOff";
            if (linePipelineCache[key]) {
                return linePipelineCache[key];
            }

            var pipelineDesc = {
                label: "A1-Task14-V11-" + key,
                layout: pipelineLayout,
                vertex: {
                    module: shaderModule,
                    entryPoint: "vs_main",
                    buffers: [{
                        arrayStride: 6 * Float32Array.BYTES_PER_ELEMENT,
                        attributes: [
                            {
                                shaderLocation: 0,
                                offset: 0,
                                format: "float32x3"
                            },
                            {
                                shaderLocation: 1,
                                offset: 3 * Float32Array.BYTES_PER_ELEMENT,
                                format: "float32x3"
                            }
                        ]
                    }]
                },
                fragment: {
                    module: shaderModule,
                    entryPoint: "fs_main",
                    targets: [{ format: format }]
                },
                primitive: {
                    topology: "line-list"
                },
                multisample: {
                    count: sampleCount
                }
            };

            if (depthEnabled) {
                pipelineDesc.depthStencil = {
                    format: "depth24plus",
                    depthWriteEnabled: true,
                    depthCompare: "less"
                };
            }

            linePipelineCache[key] = device.createRenderPipeline(pipelineDesc);
            return linePipelineCache[key];
        }

        // --------------------------------------------------------------------
        // Section E: Bind Groups
        // --------------------------------------------------------------------
        var sunBindGroup = device.createBindGroup({
            label: "A1-Task14-V11-SunBindGroup",
            layout: bindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: sunMaterialBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: sunModelViewBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: taskFlagsBuffer }
                }
            ]
        });

        var earthBindGroup = device.createBindGroup({
            label: "A1-Task14-V11-EarthBindGroup",
            layout: bindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: earthMaterialBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: earthModelViewBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: taskFlagsBuffer }
                }
            ]
        });

        var moonBindGroup = device.createBindGroup({
            label: "A1-Task14-V11-MoonBindGroup",
            layout: bindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: moonMaterialBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: moonModelViewBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: taskFlagsBuffer }
                }
            ]
        });

        var sunWireBindGroup = device.createBindGroup({
            label: "A1-Task14-V11-SunWireBindGroup",
            layout: bindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: wireMaterialBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: sunModelViewBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: taskFlagsBuffer }
                }
            ]
        });

        var earthWireBindGroup = device.createBindGroup({
            label: "A1-Task14-V11-EarthWireBindGroup",
            layout: bindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: wireMaterialBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: earthModelViewBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: taskFlagsBuffer }
                }
            ]
        });

        var moonWireBindGroup = device.createBindGroup({
            label: "A1-Task14-V11-MoonWireBindGroup",
            layout: bindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: wireMaterialBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: moonModelViewBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: taskFlagsBuffer }
                }
            ]
        });

        // --------------------------------------------------------------------
        // Section F: Geometry/Buffer Resources
        // --------------------------------------------------------------------
        // Match the geometry density used in task14.js.
        var geometry = sphereGeometry(50.0, 100.0);
        if (
            !geometry ||
            !geometry.vertices ||
            !geometry.indices ||
            geometry.vertices.length === 0 ||
            geometry.indices.length === 0
        ) {
            geometry = lifecycle.fallbackGeometry || geometry;
        }
        if (
            !geometry ||
            !geometry.vertices ||
            !geometry.indices ||
            geometry.vertices.length === 0 ||
            geometry.indices.length === 0
        ) {
            a1WgpuSetStatus(
                statusElem,
                "WebGPU Task 4: no sphere geometry available. Implement Task 4-1 or load OBJ fallback.",
                "warn"
            );
            return result;
        }
        var vertices = new Float32Array(geometry.vertices);
        var indices = new Uint16Array(geometry.indices);

        var vertexBuffer = device.createBuffer({
            label: "A1-Task14-V11-VertexBuffer",
            size: vertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(vertexBuffer, 0, vertices);

        var indexBuffer = device.createBuffer({
            label: "A1-Task14-V11-IndexBuffer",
            size: indices.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(indexBuffer, 0, indices);

        var indexCount = indices.length;

        // Build explicit edge indices for wireframe from triangle indices.
        function buildWireIndicesFromTriangles(triangleIndices) {
            var edgeMap = new Map();
            var wire = [];
            function addEdge(i0, i1) {
                var a = Math.min(i0, i1);
                var b = Math.max(i0, i1);
                var key = a + "|" + b;
                if (edgeMap.has(key)) {
                    return;
                }
                edgeMap.set(key, true);
                wire.push(i0, i1);
            }
            for (var i = 0; i + 2 < triangleIndices.length; i += 3) {
                var a = triangleIndices[i + 0];
                var b = triangleIndices[i + 1];
                var c = triangleIndices[i + 2];
                addEdge(a, b);
                addEdge(b, c);
                addEdge(c, a);
            }
            return wire;
        }

        var lineIndices = new Uint16Array(buildWireIndicesFromTriangles(indices));
        var lineIndexCount = lineIndices.length;
        var lineIndexBuffer = device.createBuffer({
            label: "A1-Task14-V11-LineIndexBuffer",
            size: lineIndices.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(lineIndexBuffer, 0, lineIndices);
        var msaaColorTexture = device.createTexture({
            label: "A1-Task14-V11-MsaaColorTexture",
            size: [canvas.width, canvas.height, 1],
            sampleCount: sampleCount,
            format: format,
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        var depthTexture = device.createTexture({
            label: "A1-Task14-V11-DepthTexture",
            size: [canvas.width, canvas.height, 1],
            sampleCount: sampleCount,
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });

        // --------------------------------------------------------------------
        // Section G: Runtime State
        // --------------------------------------------------------------------
        var speedValue = 10.0;
        var rotXValue = 0.0;
        var rotYValue = 0.0;
        var rotZValue = 0.0;

        var thenSec = null;
        var step = 0.0;

        var sundayDeg = 0.0;
        var dayDeg = 0.0;
        var yearDeg = 0.0;
        var monthDeg = 0.0;
        var drawSunFlag = true;
        var drawEarthFlag = true;
        var drawMoonFlag = true;
        var depthEnabled = true;
        var cullModeValue = "none";
        var frontFaceValue = "ccw";
        var wireframeEnabled = false;
        var task44Enabled = true;

        // --------------------------------------------------------------------
        // Section H: Matrix Builders
        // --------------------------------------------------------------------
        function buildViewMatrix() {
            var viewMatrix = mat4([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1]);
            viewMatrix = mult(viewMatrix, rotateX(rotXValue));
            viewMatrix = mult(viewMatrix, rotateY(rotYValue));
            viewMatrix = mult(viewMatrix, rotateZ(rotZValue));
            return viewMatrix;
        }

        function buildSunModelViewFloats(viewMatrix) {
            var modelMatrix = mat4();

            // Sun order:
            // model = I * rotateY(sunday) * scale(0.5, 0.48, 0.5)
            modelMatrix = mult(modelMatrix, rotateY(sundayDeg));
            modelMatrix = mult(modelMatrix, scalem(0.5, 0.48, 0.5));

            return flatten(mult(viewMatrix, modelMatrix));
        }

        function buildEarthModelViewFloats(viewMatrix) {
            var modelMatrix = mat4();

            // *** TODO_A1 : Task 4-2 (8 points)
            // Implement a model matrix for the Earth model using a concatenation of
            // canonical transformations.
            // The Earth should:
            // - be scaled accordingly
            // - rotate around its axis
            // - be tilted by -23.44 degrees wrt its orbit axis
            // - orbit around the Sun
            // Keep the tilt angle constant in the x-y-plane and use proper transform order.
            // Once done, combine with viewMatrix to produce the model-view matrix.
            // Describe the rationale of your implementation in the documentation section.
            // --- begin code ---

            // order matters here - each mult wraps the next transform on the outside,
            // so reading bottom to top is the actual order a point goes through.

            // last thing applied: orbit around the Sun
            modelMatrix = mult(modelMatrix, rotateY(yearDeg));
            // push Earth out from origin - 0.7 keeps it on screen since the view is orthographic
            modelMatrix = mult(modelMatrix, translate(0.7, 0.0, 0.0));
            // tilt the axis -23.44 degrees. putting it here means the tilt stays
            // constant in the x-y plane and doesn't get dragged around by the orbit rotation
            modelMatrix = mult(modelMatrix, rotateZ(-23.44));
            // spin on its own axis
            modelMatrix = mult(modelMatrix, rotateY(dayDeg));
            // scale it down - this is applied first to the unit sphere verts
            modelMatrix = mult(modelMatrix, scalem(0.10, 0.10, 0.10));

            // --- end code ---

            return flatten(mult(viewMatrix, modelMatrix));
        }

        function buildMoonModelViewFloats(viewMatrix) {
            var modelMatrix = mat4();

            // *** TODO_A1 : Task 4-3 (8 points)
            // Implement a model matrix for the Moon model using a concatenation of
            // canonical transformations.
            // The Moon should:
            // - be scaled accordingly
            // - rotate around the Earth
            // - be tilted by -5.14 degrees wrt its orbit axis around the Earth
            // - orbit around the Earth
            // - orbit with the Earth around the Sun
            // Be aware of the proper order of transformations.
            // Once done, combine with viewMatrix to produce the model-view matrix.
            // Describe the rationale of your implementation in the documentation section.
            // --- begin code ---

            // Moon needs everything Earth does, plus its own motion layered on top

            // follow Earth around the Sun first
            modelMatrix = mult(modelMatrix, rotateY(yearDeg));
            // jump to Earth's position in that orbit
            modelMatrix = mult(modelMatrix, translate(0.7, 0.0, 0.0));
            // orbit around Earth
            modelMatrix = mult(modelMatrix, rotateY(monthDeg));
            // set Moon's distance from Earth - 0.18 keeps it on screen
            modelMatrix = mult(modelMatrix, translate(0.18, 0.0, 0.0));
            // tilt Moon's orbit -5.14 degrees, same reasoning as Earth's tilt
            modelMatrix = mult(modelMatrix, rotateZ(-5.14));
            // scale down - Moon is a lot smaller than Earth
            modelMatrix = mult(modelMatrix, scalem(0.04, 0.04, 0.04));

            // --- end code ---

            return flatten(mult(viewMatrix, modelMatrix));
        }

        function updateModelViewUniforms() {
            if (!isPreviewActive()) {
                return;
            }
            var viewMatrix = buildViewMatrix();
            device.queue.writeBuffer(sunModelViewBuffer, 0, buildSunModelViewFloats(viewMatrix));
            device.queue.writeBuffer(earthModelViewBuffer, 0, buildEarthModelViewFloats(viewMatrix));
            device.queue.writeBuffer(moonModelViewBuffer, 0, buildMoonModelViewFloats(viewMatrix));
        }

        // --------------------------------------------------------------------
        // Section I: Render Loop
        // --------------------------------------------------------------------
        function renderFrame() {
            if (!isPreviewActive()) {
                return;
            }
            var encoder = device.createCommandEncoder({
                label: "A1-Task14-V11-Encoder"
            });

            var passDesc = {
                colorAttachments: [{
                    view: msaaColorTexture.createView(),
                    resolveTarget: context.getCurrentTexture().createView(),
                    // Match task14 clear color.
                    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                    loadOp: "clear",
                    storeOp: "store"
                }]
            };

            if (depthEnabled) {
                passDesc.depthStencilAttachment = {
                    view: depthTexture.createView(),
                    depthClearValue: 1.0,
                    depthLoadOp: "clear",
                    depthStoreOp: "store"
                };
            }

            var pass = encoder.beginRenderPass(passDesc);

            var hasVisibleBodies = drawSunFlag || drawEarthFlag || drawMoonFlag;
            if (hasVisibleBodies) {
                // Render intent:
                // - cull/frontFace affect triangle fills.
                // - gl.LINES wireframe pass is not face culled.
                var canDrawFill = cullModeValue !== "both";
                var fillPipeline = canDrawFill
                    ? getPipeline(depthEnabled, cullModeValue, frontFaceValue)
                    : null;
                var linePipeline = wireframeEnabled ? getLinePipeline(depthEnabled) : null;

                pass.setVertexBuffer(0, vertexBuffer);

                if (drawSunFlag) {
                    if (canDrawFill) {
                        pass.setPipeline(fillPipeline);
                        pass.setIndexBuffer(indexBuffer, "uint16");
                        pass.setBindGroup(0, sunBindGroup);
                        pass.drawIndexed(indexCount, 1, 0, 0, 0);
                    }
                    if (wireframeEnabled) {
                        wireMaterial[0] = 0.1;
                        wireMaterial[1] = 0.1;
                        wireMaterial[2] = 0.1;
                        wireMaterial[3] = 1.0;
                        device.queue.writeBuffer(wireMaterialBuffer, 0, wireMaterial);
                        pass.setPipeline(linePipeline);
                        pass.setIndexBuffer(lineIndexBuffer, "uint16");
                        pass.setBindGroup(0, sunWireBindGroup);
                        pass.drawIndexed(lineIndexCount, 1, 0, 0, 0);
                    }
                }

                if (drawEarthFlag) {
                    if (canDrawFill) {
                        pass.setPipeline(fillPipeline);
                        pass.setIndexBuffer(indexBuffer, "uint16");
                        pass.setBindGroup(0, earthBindGroup);
                        pass.drawIndexed(indexCount, 1, 0, 0, 0);
                    }
                    if (wireframeEnabled) {
                        wireMaterial[0] = 0.1;
                        wireMaterial[1] = 0.1;
                        wireMaterial[2] = 0.1;
                        wireMaterial[3] = 1.0;
                        device.queue.writeBuffer(wireMaterialBuffer, 0, wireMaterial);
                        pass.setPipeline(linePipeline);
                        pass.setIndexBuffer(lineIndexBuffer, "uint16");
                        pass.setBindGroup(0, earthWireBindGroup);
                        pass.drawIndexed(lineIndexCount, 1, 0, 0, 0);
                    }
                }

                if (drawMoonFlag) {
                    if (canDrawFill) {
                        pass.setPipeline(fillPipeline);
                        pass.setIndexBuffer(indexBuffer, "uint16");
                        pass.setBindGroup(0, moonBindGroup);
                        pass.drawIndexed(indexCount, 1, 0, 0, 0);
                    }
                    if (wireframeEnabled) {
                        wireMaterial[0] = 0.1;
                        wireMaterial[1] = 0.1;
                        wireMaterial[2] = 0.1;
                        wireMaterial[3] = 1.0;
                        device.queue.writeBuffer(wireMaterialBuffer, 0, wireMaterial);
                        pass.setPipeline(linePipeline);
                        pass.setIndexBuffer(lineIndexBuffer, "uint16");
                        pass.setBindGroup(0, moonWireBindGroup);
                        pass.drawIndexed(lineIndexCount, 1, 0, 0, 0);
                    }
                }
            }

            pass.end();
            device.queue.submit([encoder.finish()]);
        }

        // --------------------------------------------------------------------
        // Section J: Public Update API
        // --------------------------------------------------------------------
        // Keep debug helper API from prior versions.
        // Here it updates Moon material.
        function updateColorAlpha(r, g, b, a) {
            if (!isPreviewActive()) {
                return;
            }
            moonMaterial[0] = a1WgpuClamp01(r);
            moonMaterial[1] = a1WgpuClamp01(g);
            moonMaterial[2] = a1WgpuClamp01(b);
            moonMaterial[3] = a1WgpuClamp01(a);
            device.queue.writeBuffer(moonMaterialBuffer, 0, moonMaterial);
            renderFrame();
        }

        function updateSpeed(speed) {
            if (!isPreviewActive()) {
                return;
            }
            speedValue = Math.max(0.0, Number(speed));
            if (!isFinite(speedValue)) {
                speedValue = 0.0;
            }
            result.speed = speedValue;
        }

        function updateViewEuler(xDeg, yDeg, zDeg) {
            if (!isPreviewActive()) {
                return;
            }
            var rx = Number(xDeg);
            var ry = Number(yDeg);
            var rz = Number(zDeg);

            if (!isFinite(rx)) {
                rx = 0.0;
            }
            if (!isFinite(ry)) {
                ry = 0.0;
            }
            if (!isFinite(rz)) {
                rz = 0.0;
            }

            rotXValue = rx;
            rotYValue = ry;
            rotZValue = rz;

            result.rotX = rx;
            result.rotY = ry;
            result.rotZ = rz;

            updateModelViewUniforms();
            renderFrame();
        }

        function updateVisibility(drawSun, drawEarth, drawMoon) {
            if (!isPreviewActive()) {
                return;
            }
            if (typeof drawSun !== "undefined") {
                drawSunFlag = !!drawSun;
            }
            if (typeof drawEarth !== "undefined") {
                drawEarthFlag = !!drawEarth;
            }
            if (typeof drawMoon !== "undefined") {
                drawMoonFlag = !!drawMoon;
            }

            result.drawSun = drawSunFlag;
            result.drawEarth = drawEarthFlag;
            result.drawMoon = drawMoonFlag;
            renderFrame();
        }

        function updateDepthTest(enabled) {
            if (!isPreviewActive()) {
                return;
            }
            depthEnabled = !!enabled;
            result.depthTestEnabled = depthEnabled;
            renderFrame();
        }

        function updateCullMode(mode) {
            if (!isPreviewActive()) {
                return;
            }
            var value = String(mode || "none").toLowerCase();
            if (value !== "none" && value !== "front" && value !== "back" && value !== "both") {
                value = "none";
            }
            cullModeValue = value;
            result.cullMode = value;
            renderFrame();
        }

        function updateFrontFace(mode) {
            if (!isPreviewActive()) {
                return;
            }
            var value = String(mode || "ccw").toLowerCase();
            if (value !== "ccw" && value !== "cw") {
                value = "ccw";
            }
            frontFaceValue = value;
            result.frontFace = value;
            renderFrame();
        }

        // Wireframe toggle hook used by the shared Task14 UI.
        function updateWireframe(enabled) {
            if (!isPreviewActive()) {
                return;
            }
            wireframeEnabled = !!enabled;
            result.wireframeEnabled = wireframeEnabled;
            renderFrame();
        }

        function updateTask44Enabled(enabled) {
            if (!isPreviewActive()) {
                return;
            }
            task44Enabled = !!enabled;
            taskFlags[0] = task44Enabled ? 1.0 : 0.0;
            device.queue.writeBuffer(taskFlagsBuffer, 0, taskFlags);
            renderFrame();
        }

        // --------------------------------------------------------------------
        // Section K: Cleanup + Animation Driver
        // --------------------------------------------------------------------
        function destroyPreview() {
            if (disposed) {
                return;
            }
            disposed = true;

            if (animationHandle) {
                window.cancelAnimationFrame(animationHandle);
                animationHandle = 0;
            }

            if (vertexBuffer) {
                vertexBuffer.destroy();
                vertexBuffer = null;
            }
            if (indexBuffer) {
                indexBuffer.destroy();
                indexBuffer = null;
            }
            if (lineIndexBuffer) {
                lineIndexBuffer.destroy();
                lineIndexBuffer = null;
            }
            if (sunMaterialBuffer) {
                sunMaterialBuffer.destroy();
                sunMaterialBuffer = null;
            }
            if (earthMaterialBuffer) {
                earthMaterialBuffer.destroy();
                earthMaterialBuffer = null;
            }
            if (moonMaterialBuffer) {
                moonMaterialBuffer.destroy();
                moonMaterialBuffer = null;
            }
            if (wireMaterialBuffer) {
                wireMaterialBuffer.destroy();
                wireMaterialBuffer = null;
            }
            if (taskFlagsBuffer) {
                taskFlagsBuffer.destroy();
                taskFlagsBuffer = null;
            }
            if (sunModelViewBuffer) {
                sunModelViewBuffer.destroy();
                sunModelViewBuffer = null;
            }
            if (earthModelViewBuffer) {
                earthModelViewBuffer.destroy();
                earthModelViewBuffer = null;
            }
            if (moonModelViewBuffer) {
                moonModelViewBuffer.destroy();
                moonModelViewBuffer = null;
            }
            if (msaaColorTexture) {
                msaaColorTexture.destroy();
                msaaColorTexture = null;
            }
            if (depthTexture) {
                depthTexture.destroy();
                depthTexture = null;
            }
        }

        function animationTick(timestampMs) {
            if (!isPreviewActive()) {
                return;
            }
            var now = timestampMs * 0.001;
            if (thenSec === null) {
                thenSec = now;
            }

            var delta = now - thenSec;
            thenSec = now;

            // Match task14.js timing exactly.
            // step += speed * delta;
            // day = 36 * step;
            // sunday = day / 24;
            // year = day / 360;
            // month = day / 30;
            step += speedValue * delta;
            dayDeg = 36.0 * step;
            sundayDeg = dayDeg / 24.0;
            yearDeg = dayDeg / 360.0;
            monthDeg = dayDeg / 30.0;

            updateModelViewUniforms();
            renderFrame();

            animationHandle = window.requestAnimationFrame(animationTick);
        }

        updateSpeed(10.0);
        updateViewEuler(0.0, 0.0, 0.0);
        updateVisibility(true, true, true);
        updateDepthTest(true);
        updateCullMode("none");
        updateFrontFace("ccw");
        updateWireframe(false);
        updateTask44Enabled(typeof lifecycle.task44Enabled === "undefined" ? true : lifecycle.task44Enabled);
        if (isPreviewActive()) {
            animationHandle = window.requestAnimationFrame(animationTick);
        }

        result.ready = true;
        result.adapter = adapter;
        result.device = device;
        result.context = context;
        result.format = format;
        result.indexCount = indexCount;
        result.lineIndexCount = lineIndexCount;
        result.setSpeed = updateSpeed;
        result.setViewEuler = updateViewEuler;
        result.setVisibility = updateVisibility;
        result.setDepthTest = updateDepthTest;
        result.setCullMode = updateCullMode;
        result.setFrontFace = updateFrontFace;
        result.setWireframe = updateWireframe;
        result.setTask44Enabled = updateTask44Enabled;
        result.setColorAlpha = updateColorAlpha;
        result.render = renderFrame;
        result.destroy = destroyPreview;

        a1WgpuSetStatus(statusElem, "WebGPU Task 4 ready: lifecycle guards are active.", "ok");
        return result;
    } catch (error) {
        a1WgpuSetStatus(statusElem, "WebGPU Task 4 failed: " + error.message, "err");
        return result;
    }
}
